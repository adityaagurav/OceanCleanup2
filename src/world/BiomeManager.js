import * as THREE from 'three';
import { WorldConfig } from '../config/WorldConfig.js';

/**
 * BiomeManager.js — Defines vegetation rules and colors for different biomes.
 *
 * Color bands (by elevation):
 *   -∞  to  0.0  → Underwater (hidden by water plane)
 *    0.0 to  1.5  → Wet sand (darker, tide-line)
 *    1.5 to  3.0  → Dry golden sand (beach)
 *    3.0 to  5.0  → Sand → grass blend (coastal)
 *    5.0 to 10.0  → Light tropical grass
 *   10.0 to 16.0  → Dark jungle grass
 *   16.0 to 20.0  → Dirt/soil (high terrain)
 *   20.0+         → Rock
 */
export const Biomes = {
  OCEAN: 'OCEAN',
  BEACH: 'BEACH',
  FOREST: 'FOREST',
  TROPICAL: 'TROPICAL',
  BAMBOO: 'BAMBOO',
  ROCKY: 'ROCKY',
};

const cWetSand  = new THREE.Color();
const cSand     = new THREE.Color();
const cGrassL   = new THREE.Color();
const cGrassD   = new THREE.Color();
const cDirt     = new THREE.Color();
const cRock     = new THREE.Color();

let colorsInitialized = false;

export class BiomeManager {
  /**
   * Determine biome based on height (elevation) and moisture (secondary noise).
   */
  static getBiome(height, moisture) {
    if (height <= 3.0) return Biomes.BEACH;
    
    // Higher up terrain
    if (height > 18.0) return Biomes.ROCKY;
    
    if (moisture > 0.75) return Biomes.BAMBOO;
    if (moisture > 0.55) return Biomes.TROPICAL;
    return Biomes.FOREST;
  }

  /**
   * Get terrain color based on height with smooth blending.
   * Creates a natural tropical island gradient from beach to mountain.
   */
  static getColor(height, moisture, outColor) {
    // Initialize colors from WorldConfig once
    if (!colorsInitialized) {
      cWetSand.setHex(0xC4A46C);  // Darker wet sand near waterline
      cSand.setHex(WorldConfig.SAND_COLOR);
      cGrassL.setHex(WorldConfig.GRASS_LIGHT);
      cGrassD.setHex(WorldConfig.GRASS_DARK);
      cDirt.setHex(WorldConfig.DIRT_COLOR);
      cRock.setHex(WorldConfig.ROCK_COLOR);
      colorsInitialized = true;
    }

    if (height < 0.5) {
      // Underwater / tide line — dark wet sand
      outColor.copy(cWetSand);
    } else if (height < 1.5) {
      // Wet sand → dry sand
      const t = (height - 0.5) / 1.0;
      outColor.lerpColors(cWetSand, cSand, t);
    } else if (height < 3.0) {
      // Dry golden beach sand
      outColor.copy(cSand);
    } else if (height < 5.0) {
      // Sand → light grass (coastal transition)
      const t = (height - 3.0) / 2.0;
      outColor.lerpColors(cSand, cGrassL, t);
    } else if (height < 10.0) {
      // Light tropical grass
      outColor.copy(cGrassL);
      // Add moisture-based variation: wetter = slightly darker
      if (moisture > 0.6) {
        outColor.lerp(cGrassD, (moisture - 0.6) * 0.5);
      }
    } else if (height < 14.0) {
      // Light grass → dark jungle grass
      const t = (height - 10.0) / 4.0;
      outColor.lerpColors(cGrassL, cGrassD, t);
    } else if (height < 18.0) {
      // Dark jungle grass → dirt
      const t = (height - 14.0) / 4.0;
      outColor.lerpColors(cGrassD, cDirt, t);
    } else if (height < 22.0) {
      // Dirt → rock
      const t = (height - 18.0) / 4.0;
      outColor.lerpColors(cDirt, cRock, t);
    } else {
      outColor.copy(cRock);
    }

    // Add subtle random variation for natural look (reduces flat-shading uniformity)
    const variation = THREE.MathUtils.randFloat(0.93, 1.07);
    outColor.multiplyScalar(variation);
  }
}
