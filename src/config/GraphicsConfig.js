/**
 * GraphicsConfig.js — Renderer, shadow, camera, and post-processing settings.
 */
export const GraphicsConfig = {
  // ── Renderer ───────────────────────────────────────────────────
  ANTIALIAS:       true,
  // Cap the pixel ratio at 1.5: on Retina displays (DPR 2) this cuts the
  // framebuffer from 4x to ~2.25x the CSS pixels — the single biggest GPU
  // win with an almost imperceptible sharpness change.
  MAX_PIXEL_RATIO: 1.5,
  SHADOWS_ENABLED: true,

  // ── Shadow map ─────────────────────────────────────────────────
  // 'pcf' (cheap, softer edges) vs 'soft' (PCFSoftShadowMap — blur pass,
  // noticeably more expensive). 1024 over the 400 m harbour is plenty.
  SHADOW_TYPE:     'pcf',
  SHADOW_MAP_SIZE: 1024,
  SHADOW_NEAR:     0.5,
  SHADOW_FAR:      600,
  SHADOW_EXTENT:   200, // left/right/top/bottom of shadow camera

  // ── Camera ─────────────────────────────────────────────────────
  FOV:       60,
  NEAR:      0.3,
  // 8000 instead of 20000: fog (density 0.001) makes everything past ~1500 m
  // invisible anyway, and the smaller far plane greatly improves depth-buffer
  // precision and near-field fill rate.
  FAR:       8000,

  // ── Third-person / First-person camera ─────────────────────────
  // Framed for a ~1.75 m player character: closer orbit + eye-height look-at
  // so the harbour's realistic scale reads correctly.
  CAM_DEFAULT_DISTANCE:  5.5,
  CAM_MIN_DISTANCE:      1.8,
  CAM_MAX_DISTANCE:     12.0,
  CAM_DEFAULT_ELEVATION: 0.4,
  CAM_MIN_ELEVATION:    -0.2, // Look down
  CAM_MAX_ELEVATION:     1.20, // Look up
  CAM_SPRING_FACTOR:    15,
  CAM_MOUSE_SENSITIVITY: 0.0025,
  CAM_ZOOM_SENSITIVITY:  0.008,
  CAM_LOOK_AT_OFFSET: [0.0, 1.55, 0],

  // ── Lighting ───────────────────────────────────────────────────
  AMBIENT_INTENSITY: 0.8,
  SUN_INTENSITY:     1.6,
  SUN_COLOR:         0xfff4e0,
  SUN_POSITION:      [150, 200, 100],

  // ── Sky ────────────────────────────────────────────────────────
  SKY_TURBIDITY:          10,
  SKY_RAYLEIGH:           2,
  SKY_MIE_COEFFICIENT:    0.005,
  SKY_MIE_DIRECTIONAL_G:  0.8,
  SKY_ELEVATION:          3,   // degrees
  SKY_AZIMUTH:            180, // degrees
};
