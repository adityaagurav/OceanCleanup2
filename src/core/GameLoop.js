const _raf = typeof requestAnimationFrame !== 'undefined'
  ? requestAnimationFrame
  : (fn) => setTimeout(fn, 16);
const _caf = typeof cancelAnimationFrame !== 'undefined'
  ? cancelAnimationFrame
  : (id) => clearTimeout(id);

/**
 * GameLoop.js — Fixed-timestep game loop with render interpolation.
 * 
 * Physics runs at a fixed 60 Hz regardless of display refresh rate.
 * Rendering runs as fast as the browser allows (requestAnimationFrame).
 * Delta time is clamped to prevent spiral-of-death on tab focus restore.
 */
export class GameLoop {
  /**
   * @param {object} hooks
   * @param {function(fixedDelta: number): void} hooks.onFixedUpdate  - physics step (60Hz)
   * @param {function(alpha: number, frameDelta: number): void} hooks.onRender - render step (variable FPS)
   */
  constructor({ onFixedUpdate, onRender }) {
    this.onFixedUpdate = onFixedUpdate;
    this.onRender = onRender;

    this.FIXED_DELTA = 1 / 60;       // 60 Hz physics
    this.MAX_FRAME_TIME = 0.1;       // clamp: never simulate more than 100ms in one go

    this._accumulator = 0;
    this._lastTime = null;
    this._rafId = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._tick();
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) {
      _caf(this._rafId);
      this._rafId = null;
    }
  }

  _tick() {
    if (!this._running) return;
    this._rafId = _raf(() => this._tick());

    const now = performance.now();
    let frameDelta = (now - this._lastTime) / 1000; // seconds
    this._lastTime = now;

    // Clamp to avoid death-spiral on tab restore
    if (frameDelta > this.MAX_FRAME_TIME) frameDelta = this.MAX_FRAME_TIME;

    this._accumulator += frameDelta;

    // Run as many fixed physics steps as accumulated time allows
    try {
      while (this._accumulator >= this.FIXED_DELTA) {
        this.onFixedUpdate(this.FIXED_DELTA);
        this._accumulator -= this.FIXED_DELTA;
      }
    } catch (err) {
      console.error('[GameLoop] Error during onFixedUpdate:', err);
      this._accumulator = 0; // prevent runaway accumulation on error
    }

    // Alpha = how far between two physics steps we are (for interpolation)
    const alpha = this._accumulator / this.FIXED_DELTA;
    try {
      this.onRender(alpha, frameDelta);
    } catch (err) {
      console.error('[GameLoop] Error during onRender:', err);
    }
  }
}
