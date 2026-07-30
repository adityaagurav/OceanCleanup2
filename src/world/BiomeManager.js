import * as THREE from 'three';

/**
 * BiomeManager.js — Defines vegetation rules and colors for different biomes.
 */
export const Biomes = {
  OCEAN: 'OCEAN',
  BEACH: 'BEACH',
  FOREST: 'FOREST',
  TROPICAL: 'TROPICAL',
  BAMBOO: 'BAMBOO',
  ROCKY: 'ROCKY',
};

export class BiomeManager {
  /**
   * Determine biome based on height (elevation) and moisture (secondary noise).
   */
  static getBiome(height, moisture) {
    if (height <= 0.6) return Biomes.OCEAN;
    if (height <= 1.5) return Biomes.BEACH;
    
    // Higher up terrain
    if (moisture > 0.75) return Biomes.BAMBOO;
    if (moisture > 0.55) return Biomes.TROPICAL;
    if (moisture > 0.35) return Biomes.FOREST;
    
    return Biomes.ROCKY;
  }

  /**
   * Get terrain color based on height/biome.
   */
  static getColor(height, moisture, outColor) {
    const biome = this.getBiome(height, moisture);
    
    switch(biome) {
      case Biomes.OCEAN:
        outColor.setHex(0xd1c19b);
        break;
      case Biomes.BEACH:
        outColor.setHex(0xfadca0); // Warm sand
        break;
      case Biomes.FOREST:
        outColor.setHex(0x47d147); // Fresh green
        break;
      case Biomes.TROPICAL:
        outColor.setHex(0x2eb82e); // Deeper lush green
        break;
      case Biomes.BAMBOO:
        outColor.setHex(0x7cb342); // Yellowish green
        break;
      case Biomes.ROCKY:
        outColor.setHex(0x7a7a7a); // Grey rock
        break;
    }
    
    // Add slight noise variation based on exact height for texture
    const variation = (height % 0.2) * 0.1;
    outColor.r += variation;
    outColor.g += variation;
    outColor.b += variation;
  }
}
