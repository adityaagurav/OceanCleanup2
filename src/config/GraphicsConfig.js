/**
 * GraphicsConfig.js — Renderer, shadow, camera, and post-processing settings.
 */
export const GraphicsConfig = {
  // ── Renderer ───────────────────────────────────────────────────
  ANTIALIAS:       false, // Disabled for performance
  MAX_PIXEL_RATIO: 1,     // Force 1x resolution for light and smooth performance
  SHADOWS_ENABLED: false, // Shadows disabled for massive FPS boost

  // ── Shadow map ─────────────────────────────────────────────────
  SHADOW_MAP_SIZE: 512,   // Reduced in case shadows are turned back on
  SHADOW_NEAR:     0.5,
  SHADOW_FAR:      600,
  SHADOW_EXTENT:   200, // left/right/top/bottom of shadow camera

  // ── Camera ─────────────────────────────────────────────────────
  FOV:       60,
  NEAR:      0.3,
  FAR:       20000,

  // ── Third-person / First-person camera ─────────────────────────
  CAM_DEFAULT_DISTANCE:  5.0,   // 5m behind character (per spec)
  CAM_MIN_DISTANCE:      1.5,
  CAM_MAX_DISTANCE:     14.0,
  CAM_DEFAULT_ELEVATION: 0.45,  // slightly above horizontal
  CAM_MIN_ELEVATION:    -0.2,   // look down
  CAM_MAX_ELEVATION:     1.20,  // look up
  CAM_SPRING_FACTOR:    15,
  CAM_MOUSE_SENSITIVITY: 0.0025,
  CAM_ZOOM_SENSITIVITY:  0.008,
  CAM_LOOK_AT_OFFSET: [0.0, 2.0, 0],  // 2m height (per spec)

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
  SKY_ELEVATION:          25,   // degrees — bright mid-morning sun
  SKY_AZIMUTH:            180, // degrees
};
