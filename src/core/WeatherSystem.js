import * as THREE from 'three';

/**
 * WeatherSystem.js — Dynamic weather and fog manager.
 *
 * Handles transitions between weather states (Clear, Foggy, Rain).
 * Modifies scene fog, lighting color/intensity overrides, and particle effects.
 */
export class WeatherSystem {
  constructor(scene, engine) {
    this.scene  = scene;
    this.engine = engine; // access to water/sky

    this.currentWeather = 'Clear';
    this.targetFogDensity = 0.001;
    this.currentFogDensity = 0.001;

    // Day/night fog tints — night fog takes on a deep navy so the horizon
    // fades into darkness instead of staying pastel blue.
    this.dayFogColor   = new THREE.Color(0xcce0ff);
    this.nightFogColor = new THREE.Color(0x0a1526);

    // We use exponential squared fog for realistic atmospheric depth
    this.scene.fog = new THREE.FogExp2(0xcce0ff, this.currentFogDensity);
  }

  setWeather(type) {
    this.currentWeather = type;
    switch(type) {
      case 'Clear':
        this.targetFogDensity = 0.001;
        break;
      case 'Foggy':
        this.targetFogDensity = 0.015;
        break;
      case 'Rain':
        this.targetFogDensity = 0.008;
        // Future: trigger rain particles here
        break;
    }
  }

  update(dt, nightFactor = 0) {
    // Smoothly interpolate fog density
    if (Math.abs(this.currentFogDensity - this.targetFogDensity) > 0.0001) {
      this.currentFogDensity += (this.targetFogDensity - this.currentFogDensity) * dt * 0.1;
      this.scene.fog.density = this.currentFogDensity;
    }

    // Fog color follows the day/night cycle (0 = day, 1 = night)
    this.scene.fog.color.copy(this.dayFogColor).lerp(this.nightFogColor, nightFactor);
  }
}
