import { createNoise2D } from 'simplex-noise';
import { BoatConfig } from '../config/BoatConfig.js';
import { WorldConfig } from '../config/WorldConfig.js';

/**
 * WaveSampler.js — Lightweight analytic wave field for the whole ocean.
 *
 * The three.js Water plane is a flat, normal-mapped surface (no real vertex
 * displacement), so every object that should "float" — the boat's four buoyancy
 * points, the wake ribbon, mission trash, harbour buoys — reads its water
 * height from THIS class instead. Because everyone samples the same field, the
 * boat, its wake and the trash all move in lockstep with the same waves.
 *
 * Design (per the .io perf rules):
 *   - No FFT, no tessellation, no Gerstner vertex shaders, no allocations per
 *     sample: a handful of travelling sines + a Perlin-noise perturbation
 *     (simplex-noise, already a project dependency) = natural, non-repeating
 *     motion for a few dozen CPU cycles per call.
 *   - Harbour vs ocean: a smooth distance ramp (see BoatConfig.WAVES) blends
 *     the calm harbour multiplier into the open-ocean multiplier so there is
 *     NEVER an abrupt change — the same ramp drives the audio ambience.
 */
export class WaveSampler {
  constructor() {
    // Perlin fields — one for the spatial wave shape, one for a slowly
    // rotating "swell direction" so the pattern never visibly repeats.
    this._noise = createNoise2D();

    // Harbour calm centre. Defaults to the world-config harbour; the engine
    // keeps it correct across floating-origin rebases because everything
    // (boat, harbour, sampler input) rebases together.
    this._harborX = WorldConfig.HARBOUR_CENTER[0];
    this._harborZ = WorldConfig.HARBOUR_CENTER[1];
  }

  /**
   * Water surface height at a world-space (x, z).
   * @param {number} x
   * @param {number} z
   * @param {number} time — shared wave clock (seconds)
   * @returns {number} height in metres (0 = static water level)
   */
  getHeight(x, z, time) {
    const W = BoatConfig.WAVES;
    const f = W.FREQUENCY;
    const h = W.HEIGHT;

    // Three directional travelling swells with different speeds/directions.
    let y = Math.sin(x * f * 0.8 + time * W.SPEED) * h * 0.45;
    y += Math.sin(z * f * 1.1 + time * W.SPEED * 1.35) * h * 0.35;
    y += Math.sin((x + z) * f * 0.5 + time * W.SPEED * 0.7 + 2.1) * h * 0.2;

    // Perlin perturbation: the two noise samples multiply a slowly drifting
    // time term, which kills any repeating pattern without extra cost.
    const n1 = this._noise(x * f * 0.9, z * f * 0.9);
    const n2 = this._noise(x * f * 0.6 + time * 0.05, z * f * 0.6 - time * 0.04);
    y += n1 * n2 * h * W.NOISE_AMOUNT * 0.6;

    // Harbour ↔ ocean blend: calm inside the harbour, full ocean outside.
    const mult = this._harborMult(x, z);
    return y * mult * W.STRENGTH;
  }

  /**
   * Smooth harbour factor at (x, z): 1 = full harbour calm, 0 = open ocean.
   * Used by the engine for the camera bob and by the audio for ambience
   * crossfading — everyone agrees on where "harbour" ends.
   * @param {number} x
   * @param {number} z
   * @returns {number} 0..1
   */
  getHarborFactor(x, z) {
    const W = BoatConfig.WAVES;
    const dx = x - this._harborX;
    const dz = z - this._harborZ;
    const d = Math.sqrt(dx * dx + dz * dz);
    const t = (d - W.BLEND_START) / (W.BLEND_END - W.BLEND_START);
    return 1 - Math.max(0, Math.min(1, t));
  }

  /** Wave multiplier combining the harbour/ocean ramp (0 = flat calm). */
  _harborMult(x, z) {
    const W = BoatConfig.WAVES;
    const hf = this.getHarborFactor(x, z);
    return W.HARBOR_MULTIPLIER * hf + W.OCEAN_MULTIPLIER * (1 - hf);
  }

  /**
   * Override the calm centre (used when the harbour is created / rebased).
   * @param {number} x
   * @param {number} z
   */
  setHarborCenter(x, z) {
    this._harborX = x;
    this._harborZ = z;
  }
}
