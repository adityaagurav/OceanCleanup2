/**
 * PlayerConfig.js — All player movement, physics, and animation constants.
 * Edit here to tune character feel without touching controller logic.
 *
 * Target feel: Raft, Wind Waker, Animal Crossing — responsive, slightly floaty, cozy.
 */
export const PlayerConfig = {
  // ── Movement ───────────────────────────────────────────────────
  WALK_SPEED:    4.5,   // m/s — relaxed walking pace
  RUN_SPEED:     7.5,   // m/s — default movement (no sprint)
  SPRINT_SPEED: 10.0,   // m/s — holding Shift

  // ── Physics ────────────────────────────────────────────────────
  JUMP_FORCE:     8.5,  // tuned for ≈1.2m jump height with current gravity
  GRAVITY:      -18.0,  // slightly floaty, cozy feel
  ACCELERATION:  15,    // m/s² — gradual speed ramp, not instant
  DECELERATION:  25,    // m/s² — gentle stop with slight slide
  TURN_SPEED:    10,    // rad/s — smooth body rotation interpolation

  // ── Air Control ────────────────────────────────────────────────
  AIR_CONTROL:   0.3,   // 30% movement control while airborne

  // ── Swimming ───────────────────────────────────────────────────
  SWIM_SPEED:        3.0,   // m/s — slower in water
  SWIM_ACCEL:        8.0,   // m/s² — sluggish acceleration in water
  SWIM_DECEL:       12.0,   // m/s² — gentle water drag
  WATER_LEVEL:       0.0,   // Y-coordinate of water surface
  SWIM_BOB_SPEED:    2.0,   // bobbing frequency
  SWIM_BOB_AMOUNT:   0.15,  // bobbing amplitude

  // ── Terrain Modifiers ──────────────────────────────────────────
  SAND_SPEED_MODIFIER:  0.9,   // 10% slower on sand
  DOCK_SPEED_MODIFIER:  1.0,   // normal on wooden docks

  // ── Ground detection ───────────────────────────────────────────
  RAY_ORIGIN_OFFSET:  2.0,    // ray starts this far above character feet
  RAY_SNAP_THRESHOLD: 2.05,   // snap to ground if hit within this distance

  // ── Interaction ────────────────────────────────────────────────
  INTERACTION_RADIUS:   2.5,   // meters — press E/F to interact
  BOAT_BOARD_RADIUS:    5.0,   // meters — range to board boat
  HIGHLIGHT_PULSE_SPEED: 3.0,  // highlight animation speed

  // ── Model ──────────────────────────────────────────────────────
  MODEL_PATH:  'character.fbx',
  MODEL_SCALE:  0.015,
  MODEL_ROTATION_Y: Math.PI, // Quaternius characters face away from +Z

  // ── Animation cross-fade ───────────────────────────────────────
  ANIM_CROSSFADE_DURATION: 0.2, // seconds
  ANIM_BLEND_SPEED: 8.0,        // procedural blend interpolation rate
};
