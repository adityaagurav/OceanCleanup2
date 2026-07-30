import * as THREE from 'three';

/**
 * TimeSystem.js — Manages 24-hour day/night cycle.
 *
 * Controls sun position, sky colors, and ambient lighting intensity
 * based on the time of day.
 */

export class TimeSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.DirectionalLight} sunLight
   * @param {THREE.AmbientLight} ambientLight
   * @param {THREE.Object3D} sky - The Sky mesh from three/examples/jsm/objects/Sky.js
   */
  constructor(scene, sunLight, ambientLight, sky) {
    this.scene        = scene;
    this.sunLight     = sunLight;
    this.ambientLight = ambientLight;
    this.sky          = sky;

    // Time state
    this.timeOfDay    = 8;     // Start at 8 AM
    this.timeScale    = 1 / 60; // 1 second real-time = 1 minute game-time (60x speed)
    this.totalDays    = 1;
    // Means 1 full day = 24 minutes real-time.

    // Used for calculating sun position
    this.sunSpherical = new THREE.Spherical(1, 0, 0);
  }

  update(dt, renderer) {
    // Advance time
    this.timeOfDay += (dt * this.timeScale);
    if (this.timeOfDay >= 24) {
      this.timeOfDay -= 24;
      this.totalDays += 1;
    }

    // Calculate Sun position
    // 0 = midnight, 6 = sunrise, 12 = noon, 18 = sunset, 24 = midnight
    // We want elevation to be 0 at sunrise/sunset, high at noon, low at midnight.
    // Map 6..18 to elevation 0..PI
    const timeRatio = (this.timeOfDay - 6) / 12; // 0 at 6am, 1 at 6pm
    const elevation = Math.sin(timeRatio * Math.PI) * Math.PI / 2; // 90 deg at noon
    const azimuth   = (timeRatio * Math.PI) + Math.PI; // sun moves across sky

    // When sun is below horizon, keep it slightly below so sky goes dark but not entirely black
    const clampedElevation = Math.max(-0.2, elevation);

    this.sunSpherical.phi   = Math.PI / 2 - clampedElevation;
    this.sunSpherical.theta = azimuth;

    const sunPos = new THREE.Vector3().setFromSpherical(this.sunSpherical);
    
    // Position directional light far away
    this.sunLight.position.copy(sunPos).multiplyScalar(200);

    // Update sky uniforms
    if (this.sky && this.sky.material.uniforms['sunPosition']) {
      this.sky.material.uniforms['sunPosition'].value.copy(sunPos);
    }

    // Light intensities
    // Smooth transition for sunrise/sunset
    let intensity = 0;
    if (elevation > 0) {
      intensity = Math.min(1.0, elevation / 0.2); // full brightness quickly after sunrise
    }

    this.sunLight.intensity = intensity * 1.6;
    this.ambientLight.intensity = 0.2 + (intensity * 0.6); // Base 0.2 at night, 0.8 day

    // If sun is below horizon, disable shadows to save performance and avoid artifacts
    if (elevation <= 0 && this.sunLight.castShadow) {
      this.sunLight.castShadow = false;
    } else if (elevation > 0 && !this.sunLight.castShadow) {
      this.sunLight.castShadow = true;
    }

    // Optional: Update environment map for PBR materials (water reflection)
    if (renderer && this.sky) {
       // Ideally we'd re-render the PMREM env map here, but doing it every frame is too expensive.
       // We will do it only occasionally or just rely on ambient light changes.
    }
  }
}
