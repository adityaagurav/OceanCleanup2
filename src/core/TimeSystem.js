import * as THREE from 'three';
import { GraphicsConfig } from '../config/GraphicsConfig.js';

/**
 * TimeSystem.js — Real-time day/night cycle synced to the player's LOCAL clock.
 *
 * The environment mirrors the device clock with NO manual time-of-day setting:
 *   - 06:00 – 17:59  → DAY   (bright sun, clear blue sky, warm ambient)
 *   - 18:00 – 05:59  → NIGHT (dark sky, moon light, cool dim ambient, stars)
 *
 * The clock is re-read every frame, so if the real world crosses 06:00 or
 * 18:00 while the game is running, the environment transitions smoothly with
 * no restart required. Everything stays modular: the engine just calls
 * update() and reads getNightFactor(), exactly like before.
 */

export class TimeSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.DirectionalLight} sunLight
   * @param {THREE.AmbientLight} ambientLight
   * @param {THREE.Object3D} sky - The Sky mesh from three/examples/jsm/objects/Sky.js
   * @param {THREE.DirectionalLight} moonLight - dim bluish light used at night
   */
  constructor(scene, sunLight, ambientLight, sky, moonLight) {
    this.scene        = scene;
    this.sunLight     = sunLight;
    this.ambientLight = ambientLight;
    this.sky          = sky;
    this.moonLight    = moonLight || null;

    // The whole system is driven by the player's local time — no drift, no
    // manual time-of-day, no fast-forward.
    this.timeOfDay = this._readLocalTime();

    // Used for calculating sun / moon positions
    this.sunSpherical  = new THREE.Spherical(1, 0, 0);
    this.moonSpherical = new THREE.Spherical(1, 0, 0);

    // Reused scratch vectors (avoid per-frame allocations)
    this._sunPos = new THREE.Vector3();
    this._moonPos = new THREE.Vector3();
    this._dayAmbientColor = new THREE.Color(0xffffff);
    this._nightAmbientColor = new THREE.Color(0x24304d);

    // Night atmosphere: a starfield + a moon disc, both parented to the sky
    // dome so they follow the camera exactly like the sky does.
    this._stars = null;
    this._moonMesh = null;
    this._buildStars();
    this._buildMoonDisc();
  }

  /**
   * Read the device clock into a fractional hour (0..24, e.g. 17.5 = 17:30).
   * @returns {number}
   */
  _readLocalTime() {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  /**
   * Update the environment for the current frame. The time of day always comes
   * straight from the local device clock, so a transition at 06:00 / 18:00
   * happens automatically and smoothly while the game runs.
   * @param {number} dt - frame delta in seconds
   * @param {THREE.WebGLRenderer} renderer - unused, kept for API compatibility
   */
  update(dt, renderer) {
    // Refresh from the device clock every frame.
    this.timeOfDay = this._readLocalTime();

    // Calculate Sun position
    // 0 = midnight, 6 = sunrise, 12 = noon, 18 = sunset, 24 = midnight
    // Elevation is 0 at sunrise/sunset, high at noon, low at midnight.
    const timeRatio = (this.timeOfDay - 6) / 12; // 0 at 6am, 1 at 6pm
    const elevation = Math.sin(timeRatio * Math.PI) * Math.PI / 2; // 90 deg at noon
    const azimuth   = (timeRatio * Math.PI) + Math.PI; // sun moves across sky

    // When the sun is below the horizon, keep it slightly below so the sky
    // goes dark but not entirely black.
    const clampedElevation = Math.max(-0.2, elevation);

    this.sunSpherical.phi   = Math.PI / 2 - clampedElevation;
    this.sunSpherical.theta = azimuth;
    this._sunPos.setFromSpherical(this.sunSpherical);

    // Position the directional light far away
    this.sunLight.position.copy(this._sunPos).multiplyScalar(200);

    // Update the sky shader's sun position
    if (this.sky && this.sky.material.uniforms['sunPosition']) {
      this.sky.material.uniforms['sunPosition'].value.copy(this._sunPos);
    }

    // ── Day / night factor ───────────────────────────────────────────
    // Smooth ramp: full daylight a little after sunrise, dark after sunset.
    let dayIntensity = 0;
    if (elevation > 0) {
      dayIntensity = Math.min(1.0, elevation / 0.2); // full brightness ~1h after sunrise
    }
    const nightFactor = 1.0 - dayIntensity;

    // Sun light: strong and warm by day, completely off at night.
    this.sunLight.intensity = dayIntensity * GraphicsConfig.SUN_INTENSITY;
    this.sunLight.color.setHex(GraphicsConfig.SUN_COLOR);

    // Sun shadows only while the sun is above the horizon.
    if (elevation <= 0 && this.sunLight.castShadow) {
      this.sunLight.castShadow = false;
    } else if (elevation > 0 && !this.sunLight.castShadow) {
      this.sunLight.castShadow = true;
    }

    // ── Moon light (night only) ──────────────────────────────────────
    // Roughly opposite the sun: rises as the sun sets, overhead at midnight.
    // The position is always computed so the engine can read a valid vector
    // for the water's specular direction even if no moonLight was provided.
    const moonElevation = Math.max(0.05, -elevation);
    this.moonSpherical.phi   = Math.PI / 2 - moonElevation;
    this.moonSpherical.theta = azimuth + Math.PI;
    this._moonPos.setFromSpherical(this.moonSpherical);
    if (this.moonLight) {
      this.moonLight.position.copy(this._moonPos).multiplyScalar(200);
      this.moonLight.intensity = nightFactor * 0.5;
    }

    // ── Ambient light ────────────────────────────────────────────────
    // Cool, dim blue at night; warm white in the day.
    this.ambientLight.intensity = 0.08 + (dayIntensity * (GraphicsConfig.AMBIENT_INTENSITY - 0.08));
    this.ambientLight.color.copy(this._dayAmbientColor).lerp(this._nightAmbientColor, nightFactor);

    // ── Night atmosphere: stars + moon disc ──────────────────────────
    if (this._stars) {
      this._starUniform.value = nightFactor;
      this._stars.visible = nightFactor > 0.03;
    }
    if (this._moonMesh) {
      this._moonMesh.visible = nightFactor > 0.1;
      if (this._moonMesh.visible) {
        this._moonMesh.position.copy(this._moonPos).multiplyScalar(0.45);
      }
    }
  }

  /** Returns 0.0 at peak daylight, smoothly transitioning to 1.0 at peak night. */
  getNightFactor() {
    const timeRatio = (this.timeOfDay - 6) / 12;
    const elevation = Math.sin(timeRatio * Math.PI) * Math.PI / 2;
    let dayIntensity = 0;
    if (elevation > 0) {
      dayIntensity = Math.min(1.0, elevation / 0.2);
    }
    return 1.0 - dayIntensity;
  }

  /**
   * Build a simple low-poly starfield parented to the sky dome. The sky is
   * scaled to OCEAN_SIZE, so children use local units (radius ~0.45 → ~4500 m).
   * Parented to the sky means it follows the camera/rebasing automatically.
   */
  _buildStars() {
    if (!this.sky) return;
    const COUNT = 600;
    const positions = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      // Random point on the upper hemisphere (only above the horizon)
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(THREE.MathUtils.randFloat(0.02, 0.55)); // 0..~87deg from +Y
      const r     = 0.44 + Math.random() * 0.03; // just inside the sky dome
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      // Star point size in WORLD units. The points are parented to the sky
      // dome (scaled ×OCEAN_SIZE), so positions render ~4.4 km away — these
      // sizes resolve to roughly 1.5–3 px on a typical viewport (2× on retina).
      sizes[i] = 50 + Math.random() * 70;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom shader material so the stars are always tiny points of light,
    // unaffected by fog / lighting, and scale with the sky dome.
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0,
      uniforms: {
        uOpacity: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        varying float vSize;
        void main() {
          vSize = size;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * 120.0 / -mvPosition.z;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vSize;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * uOpacity;
          gl_FragColor = vec4(vec3(0.9, 0.95, 1.0), a);
        }
      `,
    });

    this._stars = new THREE.Points(geo, mat);
    this._stars.frustumCulled = false;
    this._stars.renderOrder = 999; // drawn over everything (behind nothing)
    this.sky.add(this._stars);

    // Keep the uniform in sync with the material for easy per-frame fading.
    this._starUniform = mat.uniforms.uOpacity;
  }

  /**
   * A soft, low-poly moon disc placed along the moon direction at night.
   */
  _buildMoonDisc() {
    if (!this.sky) return;
    const geo = new THREE.SphereGeometry(0.014, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf2f6ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    });
    this._moonMesh = new THREE.Mesh(geo, mat);
    this._moonMesh.frustumCulled = false;
    this._moonMesh.renderOrder = 998;
    this._moonMesh.visible = false;
    this.sky.add(this._moonMesh);
  }
}
