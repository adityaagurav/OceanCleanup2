/**
 * WorldConfig.js — Island positions, sizes, vegetation density, and world constants.
 */
export const WorldConfig = {
  // ── Ocean ──────────────────────────────────────────────────────
  OCEAN_SIZE: 10000,
  WATER_COLOR: 0x006994,    // Deep tropical ocean blue-teal
  WATER_SHALLOW: 0x40C4CC,  // Shallow turquoise
  WATER_DEEP: 0x1B4F72,     // Deep ocean blue
  DISTORTION_SCALE: 2.5,    // Moderate waves for tropical island feel

  // ── Biome Colors (Vibrant tropical beach palette) ──────────────
  SAND_COLOR:   0xF2D49B,   // Warm golden beach sand
  GRASS_LIGHT:  0x5DBB63,   // Vibrant tropical green
  GRASS_DARK:   0x2E7D32,   // Deep lush jungle green
  DIRT_COLOR:   0x8D6E3F,   // Rich brown soil
  ROCK_COLOR:   0x6B6B6B,   // Medium grey rock

  /** First island is always the spawn island. */
  ISLANDS: [
    { center: [100, 0, 100], radius: 90 },
    { center: [-1200, 0, 600], radius: 70 },
    { center: [1500, 0, -900], radius: 110 },
    { center: [-600, 0, -1500], radius: 80 },
    { center: [900, 0, 1800], radius: 65 },
  ],

  /** Blob count range for organic island shapes [min, max] */
  ISLAND_BLOB_RANGE: [5, 8],

  // ── Vegetation density (multiplied by area ratio) ──────────────
  VEGETATION: [
    // Regular Trees (Very sparse)
    { path: 'nature_kit/Tree.glb', baseCount: 0.4, scale: 2.8 },
    { path: 'nature_kit/Tree-QVOop92WmG.glb', baseCount: 0.2, scale: 2.8 },
    { path: 'nature_kit/Tree-aVOxaHRPWe.glb', baseCount: 0.2, scale: 2.8 },
    { path: 'nature_kit/Tree-qZtx0AHhcy.glb', baseCount: 0.2, scale: 2.8 },
    
    // Twisted Trees
    { path: 'nature_kit/Twisted Tree.glb', baseCount: 0.2, scale: 2.5 },
    { path: 'nature_kit/Twisted Tree-7PDBpElkQr.glb', baseCount: 0.1, scale: 2.5 },
    { path: 'nature_kit/Twisted Tree-8oraKn9m0x.glb', baseCount: 0.1, scale: 2.5 },
    { path: 'nature_kit/Twisted Tree-9aWlx82xUf.glb', baseCount: 0.1, scale: 2.5 },
    { path: 'nature_kit/Twisted Tree-GVTsMmuzv7.glb', baseCount: 0.1, scale: 2.5 },

    // Pine Trees
    { path: 'nature_kit/Pine.glb', baseCount: 0.2, scale: 2.9 },
    { path: 'nature_kit/Pine-699sFuLCN2.glb', baseCount: 0.1, scale: 2.9 },
    { path: 'nature_kit/Pine-79gmlLnweB.glb', baseCount: 0.1, scale: 2.9 },

    // Dead Trees
    { path: 'nature_kit/Dead Tree.glb', baseCount: 0.1, scale: 2.2 },

    // Bamboo (A few patches)
    { path: 'nature_kit/Bamboo_1.fbx', baseCount: 0.3, scale: 0.015 },
    { path: 'nature_kit/Bamboo_2.fbx', baseCount: 0.3, scale: 0.015 },
    { path: 'nature_kit/Bamboo_3.fbx', baseCount: 0.2, scale: 0.015 },
    { path: 'nature_kit/Bamboo_4.fbx', baseCount: 0.2, scale: 0.015 },
    { path: 'nature_kit/Bamboo_Crop.fbx', baseCount: 0.2, scale: 0.015 },

    // Bushes
    { path: 'nature_kit/Bush.glb', baseCount: 8, scale: 1.5 },
    { path: 'nature_kit/Bush with Flowers.glb', baseCount: 6, scale: 1.5 },

    // Plants
    { path: 'nature_kit/Fern.glb', baseCount: 6, scale: 1.3 },
    { path: 'nature_kit/Plant.glb', baseCount: 5, scale: 1.2 },
    { path: 'nature_kit/Plant Big.glb', baseCount: 4, scale: 1.6 },

    // Flowers
    { path: 'nature_kit/Flower Group.glb', baseCount: 6, scale: 1.0 },
    { path: 'nature_kit/Flower Single.glb', baseCount: 5, scale: 1.0 },
    { path: 'nature_kit/Flower Petal.glb', baseCount: 5, scale: 1.0 },

    // Rocks and pebbles
    { path: 'nature_kit/Rock Medium.glb', baseCount: 5, scale: 1.8 },
    { path: 'nature_kit/Rock Path Round Small.glb', baseCount: 6, scale: 1.5 },
    { path: 'nature_kit/Pebble Round.glb', baseCount: 5, scale: 1.2 },

    // Grass & Mushrooms
    { path: 'nature_kit/Tall Grass.glb', baseCount: 12, scale: 0.8 },
    { path: 'nature_kit/Grass Wispy.glb', baseCount: 10, scale: 0.7 },
    { path: 'nature_kit/Mushroom.glb', baseCount: 3, scale: 0.6 },
    { path: 'nature_kit/Mushroom Laetiporus.glb', baseCount: 2, scale: 0.6 }
  ],

  // ── Trash ──────────────────────────────────────────────────────
  TRASH_COUNT: {
    normal: 250,
    high: 400,
    mega: 600,
  },
  TRASH_MIN_DIST: 12,
  TRASH_MAX_DIST: 2000,
  TRASH_PICKUP_RADIUS: 8.0,

  // ── Spawn ──────────────────────────────────────────────────────
  PLAYER_SPAWN_HEIGHT: 4, // above island surface
};
