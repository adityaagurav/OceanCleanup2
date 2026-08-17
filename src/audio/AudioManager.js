// Synthesized Web Audio API sound effects for zero external asset dependencies!
class SoundController {
  constructor() {
    this.ctx = null;
    this.master = null; // shared master gain — one mute/volume for ALL audio
    this.muted = true;
    this.volume = 0.7;
  }

  init() {
    if (!this.ctx) {
      // Guard for non-browser contexts (tests, SSR) — `window` may not exist.
      const AudioCtx = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext)
        : null;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.ctx.destination);
      }
    }
  }

  /**
   * Shared AudioContext (created lazily). Continuous systems such as the boat
   * audio controller connect their nodes into the master gain so the UI
   * mute/volume toggles affect everything at once.
   * @returns {AudioContext|null}
   */
  getContext() {
    this.init();
    return this.ctx;
  }

  /** Shared master gain node (all audio routes through it). */
  getMaster() {
    this.init();
    return this.master;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  setVolume(vol) {
    this.volume = vol;
    if (this.master && !this.muted) this.master.gain.value = vol;
  }

  playCollectSound() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      gain.gain.setValueAtTime(0.3 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.connect(gain);
      gain.connect(this.master || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      // Audio context policy
    }
  }

  playButtonClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);

      gain.gain.setValueAtTime(0.25 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      osc.connect(gain);
      gain.connect(this.master || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) { }
  }
}

export const soundFx = new SoundController();
