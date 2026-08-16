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

  // Reserved for FUTURE gameplay destinations — NOT generated yet. The ocean
  // is fully open and effectively unlimited: TerrainGenerator produces flat
  // shallow seabed everywhere, so the harbour plaza is the only landmass and
  // the player can sail in any direction without hitting terrain.
  ISLANDS: [
    { center: [380, 0, 380],   radius: 95 },
    { center: [-420, 0, 320],  radius: 85 },
    { center: [520, 0, -380],  radius: 110 },
    { center: [-480, 0, -420], radius: 90 },
    { center: [100, 0, 680],   radius: 100 },
  ],

  // ── Harbour / open ocean ───────────────────────────────────────
  // A large band of guaranteed open water around the harbour. The harbour is
  // the only landmass the player begins on; no terrain islands are generated
  // within this radius, so sailing away feels open, spacious and unobstructed.
  HARBOUR_CENTER: [0, 21.5], // follows the (lengthened) boat dock area
  OCEAN_CLEARING_RADIUS: 700,

  /** Blob count range for organic island shapes [min, max] */
  ISLAND_BLOB_RANGE: [3, 6],

  // ── Vegetation density (multiplied by area ratio) ──────────────
  VEGETATION: [
    { path: 'assets/landAsset/coconut-palm.glb', baseCount: 20, scale: 3.2 },
    { path: 'nature_kit/Rock Medium.glb',        baseCount: 20, scale: 2.0 },
    { path: 'nature_kit/Bush.glb',               baseCount: 30, scale: 1.5 },
    { path: 'nature_kit/Grass.glb',              baseCount: 60, scale: 1.2 },
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
