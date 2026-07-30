import * as THREE from 'three';

/**
 * BiomeManager.js — Defines vegetation rules and colors for different biomes.
 */
export const Biomes = {
  OCEAN: 'OCEAN',
  BEACH: 'BEACH',
  FOREST: 'FOREST',
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
    if (moisture > 0.4) {
      return Biomes.FOREST;
    } else {
      return Biomes.ROCKY;
    }
  }

  /**
   * Get terrain color based on height/biome.
   */
  static getColor(height, moisture, outColor) {
    const biome = this.getBiome(height, moisture);
    
    switch(biome) {
      case Biomes.OCEAN:
        // Ocean bottom sand (won't be seen much due to water plane)
        outColor.setHex(0xd1c19b);
        break;
      case Biomes.BEACH:
        outColor.setHex(0xe8d8b0); // Sandy
        break;
      case Biomes.FOREST:
        outColor.setHex(0x5a8c3d); // Green grass
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
