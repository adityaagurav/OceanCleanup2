/**
 * PlayerConfig.js — All player movement, physics, and animation constants.
 * Edit here to tune character feel without touching controller logic.
 */
export const PlayerConfig = {
  // ── Movement ───────────────────────────────────────────────────
  WALK_SPEED:    3.5,   // m/s
  RUN_SPEED:     6.5,   // m/s
  SPRINT_SPEED:  8.5,   // m/s

  // ── Physics ────────────────────────────────────────────────────
  JUMP_FORCE:    13.5,  // m/s upward impulse → ~1.2m height
  GRAVITY:      -9.81,  // m/s²
  ACCELERATION:  18,    // m/s² — rate of velocity gain
  DECELERATION:  24,    // m/s² — rate of velocity loss
  TURN_SPEED:    12,    // rad/s — body rotation interpolation speed

  // ── Ground detection ───────────────────────────────────────────
  RAY_ORIGIN_OFFSET: 2.0,   // ray starts this far above character feet
  RAY_SNAP_THRESHOLD: 2.05, // snap to ground if hit within this distance

  // ── Model ──────────────────────────────────────────────────────
  MODEL_PATH:  'Adventurer.glb',
  MODEL_SCALE:  1.5,
  MODEL_ROTATION_Y: Math.PI, // Quaternius characters face away from +Z

  // ── Animation cross-fade ───────────────────────────────────────
  ANIM_CROSSFADE_DURATION: 0.2, // seconds
};
