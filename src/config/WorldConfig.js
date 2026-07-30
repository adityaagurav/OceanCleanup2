/**
 * WorldConfig.js — Island positions, sizes, vegetation density, and world constants.
 */
export const WorldConfig = {
  // ── Ocean ──────────────────────────────────────────────────────
  OCEAN_SIZE: 10000,
  WATER_COLOR: 0x1da2d8, // Cartoonish tropical blue
  DISTORTION_SCALE: 6.0, // Increase distortion for more wavy cartoon look

  // ── Islands ────────────────────────────────────────────────────
  SAND_COLOR: 0xc9994a,

  /** First island is always the spawn island. */
  ISLANDS: [
    { center: [100,  0,  100], radius: 90  },
    { center: [-400, 0,  200], radius: 70  },
    { center: [500,  0, -300], radius: 110 },
    { center: [-200, 0, -500], radius: 80  },
    { center: [300,  0,  600], radius: 65  },
  ],

  /** Blob count range for organic island shapes [min, max] */
  ISLAND_BLOB_RANGE: [3, 6],

  // ── Vegetation density (multiplied by area ratio) ──────────────
  VEGETATION: [
    { path: 'nature_kit/Pine.glb',        baseCount: 12, scale: 2.5 },
    { path: 'nature_kit/Tree.glb',        baseCount: 8,  scale: 2.5 },
    { path: 'nature_kit/Rock Medium.glb', baseCount: 20, scale: 2.0 },
    { path: 'nature_kit/Bush.glb',        baseCount: 30, scale: 1.5 },
    { path: 'nature_kit/Grass.glb',       baseCount: 60, scale: 1.2 },
  ],

  // ── Trash ──────────────────────────────────────────────────────
  TRASH_COUNT: {
    normal: 250,
    high:   400,
    mega:   600,
  },
  TRASH_MIN_DIST:    12,
  TRASH_MAX_DIST:  2000,
  TRASH_PICKUP_RADIUS: 8.0,

  // ── Spawn ──────────────────────────────────────────────────────
  PLAYER_SPAWN_HEIGHT: 3, // above island surface
};
