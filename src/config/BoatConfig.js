/**
 * BoatConfig.js — Configuration constants for the boat controller and its
 * floating systems. This is the web-game equivalent of a Unity Inspector panel:
 * every number the boat feel depends on lives here (inertia, waves, buoyancy,
 * lean, wake, effects, camera, audio) so it can be tuned without touching code.
 *
 * The boat is intentionally NOT a realistic physics simulation — it is a small
 * set of layered procedural systems tuned to FEEL heavy, so the player reads
 * weight / momentum / water resistance instantly while staying at 60+ FPS.
 */
export const BoatConfig = {
  // ── Top speed / reverse (shared by every system) ──────────────
  MAX_SPEED:     8.0,  // m/s (~18 knots)
  REVERSE_SPEED: 3.0,  // m/s
  TURN_SPEED:    1.7,  // rad/s of yaw rate at max speed (slower = heavier hull)

  // ── Momentum & inertia (BoatInertia) ──────────────────────────
  // The "heavy" layer: throttle is a smooth progressive ramp (never a hard
  // 0→100%), acceleration pushes the hull through water, and releasing the
  // throttle leaves ONLY quadratic water drag so the boat coasts and slowly
  // settles instead of stopping instantly. Pressing S never snaps the velocity
  // to zero — it brakes with a speed-scaled deceleration, settles cleanly to a
  // stop inside a dead zone, and only then (after a short engage beat) allows
  // the hull to creep backward while S stays held.
  INERTIA: {
    THROTTLE_RAMP:  2.2,   // throttle smoothing (1/s) — progressive 0→100%
    ACCELERATION:   4.2,   // m/s² full-throttle thrust — pushes through water
    DRAG_LINEAR:    0.10,  // linear water drag (1/s) — kills low-speed creep
    DRAG_QUAD:      0.045, // quadratic water drag (1/m) — the heavy coast feel

    // Braking (S while moving forward): the hull digs in against its motion.
    // Stronger than plain water drag (S clearly brakes) but far gentler than an
    // instant stop — from max speed (~8 m/s) the boat comes to rest in roughly
    // 1.3 s, and the speed scale makes high-speed stops take more distance and
    // time than low-speed ones, so the hull feels heavier the faster it goes.
    BRAKE_FORCE:        3.2,   // m/s² base braking deceleration
    BRAKE_SPEED_SCALE:  0.35,  // extra m/s² per m/s of speed (heavier at speed)

    // Zero-velocity handling: braking never flips the hull across zero. Once
    // the speed drops inside DEAD_ZONE the boat settles smoothly to a stop
    // (kills sign-flip jitter at a standstill), and if reverse is still held it
    // waits REVERSE_ENGAGE_DELAY before creeping backward, so the sequence
    // reads brake → stop → pause → reverse.
    DEAD_ZONE:            0.40, // m/s — braking settles to a full stop below this
    REVERSE_ENGAGE_DELAY: 0.28, // s — held at a stop before reverse engages
    COAST_STOP:     0.15,  // m/s below which coasting settles to a full stop

    // Steering inertia: the helm (wheel) angle is smoothed, and the yaw RATE
    // itself is springy — so the hull starts turning, keeps rotating from
    // inertia, and gradually straightens when the input is released.
    HELM_RATE:     3.2,    // helm angle smoothing (1/s)
    YAW_RESPONSE:  2.6,    // yaw-rate inertia (1/s) — lower = more laggy
  },

  // ── Waves (WaveSampler) ────────────────────────────────────────
  // Analytic wave field: travelling sines + Perlin perturbation so nothing
  // ever visibly repeats. Harbour ↔ ocean blend is a smooth distance ramp.
  WAVES: {
    HEIGHT:          0.45,  // base wave amplitude (m) — lively open ocean
    SPEED:           1.10,  // wave travel speed multiplier
    FREQUENCY:       0.22,  // spatial frequency (rad/m) — lower = longer swells
    STRENGTH:        1.15,  // global intensity multiplier
    NOISE_AMOUNT:    0.5,   // how much Perlin perturbation is mixed in
    HARBOR_MULTIPLIER: 0.20, // calm inside the harbour (~0.2x the ocean)
    OCEAN_MULTIPLIER:  1.0,
    BLEND_START: 140,       // harbour calm zone radius (m)
    BLEND_END:   420,       // beyond this the ocean is at full strength
  },

  // ── Fake buoyancy (BoatBuoyancy) ───────────────────────────────
  BUOYANCY: {
    FLOAT_HALF_X: 0.95,   // float-point half-width (m)
    FLOAT_FRONT: -1.65,   // local-Z of the front float points (bow)
    FLOAT_BACK:   1.55,   // local-Z of the back float points (stern)
    DRAFT:        0.10,   // how high the hull rides above the wave surface (m)
    RESPONSE:     6.0,    // vertical smoothing stiffness (1/s) — suspension
    SPEED_WAVE_BOOST: 0.65, // how much faster the hull reacts to waves at speed
                             // (1.0× at idle → 1.65× at full speed)

    // Idle floating — layered Perlin, never repetitive sine motion.
    IDLE_BOB_AMOUNT: 0.05,  // m
    IDLE_PITCH:      0.018, // rad (~1°)
    IDLE_ROLL:       0.018, // rad (~1°)
    IDLE_BOB_SPEED:  0.9,   // Perlin time scale for idle motion
    IDLE_THRESHOLD:  0.5,   // speed (m/s) below which idle bobbing is fully active
  },

  // ── Speed reaction + turning lean ──────────────────────────────
  // Pitch is driven by the boat's SIGNED acceleration (m/s²), so the bow
  // lifts under throttle, dips when braking, and EASES BACK TO NEUTRAL the
  // moment speed stabilises at cruise — exactly how a real motorboat sits.
  LEAN: {
    MAX_LEAN_DEG:    5.5,  // maximum banking roll (degrees)
    LEAN_SPEED:      2.8,  // how fast the roll builds / eases back (1/s)
    LEAN_MIN_SPEED:  1.5,  // below this speed the lean fades out entirely
    PITCH_PER_ACCEL: 0.018, // rad of bow pitch per m/s² of signed acceleration
    PITCH_RESPONSE:  2.2,   // slower = heavier bow rise/settle (1/s)
  },

  // ── Wake ribbon (BoatEffects) ──────────────────────────────────
  // Idle: invisible. Slow: small. Fast: large. Opacity ramps quadratically
  // with speed so the contrast between idle/slow/fast reads clearly.
  WAKE: {
    THRESHOLD:    0.4,   // speed (m/s) below which no wake is drawn
    WIDTH_MIN:    0.35,  // ribbon half-width at slow speeds (m)
    WIDTH_MAX:    1.30,  // ribbon half-width at full speed (m)
    OPACITY_MIN:  0.12,
    OPACITY_MAX:  0.78,
    MAX_POINTS:   80,    // trailing ribbon length
    POINT_SPACING: 0.35, // min gap between ribbon samples (m)
  },

  // ── Water effects (BoatEffects) ────────────────────────────────
  EFFECTS: {
    PROPELLER_RATE: 26,   // particles per second at full throttle
    BUBBLE_LIFE:    1.6,  // seconds
    SPLASH_MIN_SPEED: 5.0, // speed (m/s) before sharp turns splash
    SPLASH_TURN:    0.45, // |steer| beyond which we splash
    SPLASH_RATE:    14,   // particles per second while splashing
    SPLASH_LIFE:    0.9,  // seconds
  },

  // ── Trash wake reaction (TrashSystem) ──────────────────────────
  // No physics: when the boat passes within RADIUS, trash accumulates a small
  // outward push velocity that decays over time, so pieces visibly drift away
  // from the hull and gently settle back.
  TRASH_WAKE: {
    RADIUS:    30,    // metres around the boat
    STRENGTH:  2.4,   // outward push acceleration at full speed, at the hull (m/s²)
    DECAY:     0.7,   // how fast the push velocity fades (1/s)
  },

  // ── Camera (CameraController + Engine) ─────────────────────────
  // Never parented; spring-follows the boat and adds a small feel layer:
  // wave bob, roll into turns, pitch from acceleration, tiny delayed follow.
  CAMERA: {
    BOB_AMOUNT:    0.05,  // wave bob height (m)
    BOB_SPEED:     1.4,   // rad/s
    ROLL_AMOUNT:   0.45,  // fraction of the boat's lean mirrored to the camera
    ROLL_RESPONSE: 3.0,   // camera roll smoothing (1/s)
    PITCH_AMOUNT:  0.35,  // fraction of the boat's pitch as look-at offset
    DELAY:         0.82,  // spring stiffness multiplier — subtle extra lag

    // Yaw trail: while the hull turns, the camera's orbit angle eases toward
    // the boat's heading (partially, and slowly) so it trails the turn instead
    // of staying glued to the mouse. Mouse input still wins when used.
    YAW_LAG_AMOUNT:   0.55,  // fraction of the heading change the camera follows
    YAW_LAG_RESPONSE: 1.6,   // how fast the camera drifts to the new heading (1/s)

    // Speed FOV: the view subtly widens at full throttle (boat mode only).
    FOV_BOOST:    8.0,   // extra degrees at max speed
    FOV_RESPONSE: 3.0,   // FOV easing (1/s)
  },

  // ── Audio (BoatAudioController) ────────────────────────────────
  AUDIO: {
    ENGINE_IDLE_FREQ: 52, // Hz at idle
    ENGINE_MAX_FREQ:  88, // Hz at full throttle
    ENGINE_IDLE_GAIN: 0.05,
    ENGINE_MAX_GAIN:  0.13,
    ENGINE_HARMONIC_GAIN: 0.03, // quiet square sub-layer
    WATER_MAX_GAIN:   0.18,  // wake/water rush at full speed
    HULL_MIN_SPEED:   2.0,   // speed (m/s) where the water sound starts
    WIND_MAX_GAIN:    0.10,  // wind at full speed
    OCEAN_AMBI_GAIN:  0.07,  // open-ocean swell ambience
    HARBOR_AMBI_GAIN: 0.05,  // gentle harbour lapping
    GULL_GAIN:        0.035, // seagull chirp peak
  },
};
