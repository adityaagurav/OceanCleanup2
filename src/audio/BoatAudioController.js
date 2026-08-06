import { BoatConfig } from '../config/BoatConfig.js';
import { soundFx } from './AudioManager.js';

/**
 * BoatAudioController.js — Dynamic, fully-synthesized boat audio (no assets).
 *
 * Layers (all generated with Web Audio primitives, all crossfaded smoothly):
 *   - Engine:   sawtooth + quiet square sub-oscillator. Pitch and gain track
 *               throttle, so idle hum vs full-throttle roar never pops.
 *   - Water:    filtered white noise that swells with speed (wake/hull rush).
 *   - Wind:     high-passed noise, appears only at higher speeds.
 *   - Ambience: harbour lapping (low noise + slow LFO) blends with open-ocean
 *               swell based on the SAME harbour factor the waves use, so audio
 *               and visuals always agree. Seagull chirps play near the harbour.
 *
 * Everything routes through AudioManager's master gain, so the UI mute/volume
 * toggles apply to boat audio too. Nodes are created lazily and only when the
 * AudioContext actually exists (autoplay policy safe).
 */
export class BoatAudioController {
  constructor() {
    this._ctx = null;
    this._nodes = null;
    this._nextGullTime = 0;
    this._noiseBuffer = null;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Call every render frame.
   * @param {number} dt
   * @param {{speed?:number, throttle?:number, harborFactor?:number, active:boolean}} state
   */
  update(dt, state) {
    const ctx = soundFx.getContext();
    if (!ctx) return;
    this._ensure(ctx);
    if (!this._nodes) return; // context exists but master node failed — no-op

    const A = BoatConfig.AUDIO;
    const now = ctx.currentTime;

    if (!state.active) {
      // Paused / transitioning — fade every layer to silence.
      this._fade(this._nodes.engineGain, 0, now);
      this._fade(this._nodes.engine2Gain, 0, now);
      this._fade(this._nodes.wakeGain, 0, now);
      this._fade(this._nodes.windGain, 0, now);
      this._fade(this._nodes.oceanGain, 0, now);
      this._fade(this._nodes.harborGain, 0, now);
      if (this._gullGain) this._fade(this._gullGain, 0, now);
      return;
    }

    const speed = Math.abs(state.speed || 0);
    const throttle = Math.max(0, state.throttle || 0);
    const speedFactor = Math.min(1, speed / BoatConfig.MAX_SPEED);
    const hf = Math.max(0, Math.min(1, state.harborFactor ?? 1));
    const inBoat = !!state.inBoat;

    if (inBoat) {
      // ── Engine: pitch + gain follow throttle ───────────────────
      const engineFreq = A.ENGINE_IDLE_FREQ + (A.ENGINE_MAX_FREQ - A.ENGINE_IDLE_FREQ) * throttle;
      this._nodes.engineOsc.frequency.setTargetAtTime(engineFreq, now, 0.08);
      this._nodes.engine2Osc.frequency.setTargetAtTime(engineFreq * 1.5, now, 0.08);
      this._fade(this._nodes.engineGain, A.ENGINE_IDLE_GAIN + (A.ENGINE_MAX_GAIN - A.ENGINE_IDLE_GAIN) * throttle, now);
      this._fade(this._nodes.engine2Gain, throttle * A.ENGINE_HARMONIC_GAIN, now);

      // ── Water wake rush: only once the hull is moving, and it swells
      //    quadratically with speed — idle is silent, cruise is audible,
      //    full speed is a loud wake.
      const wakeOn = speed > A.HULL_MIN_SPEED ? speedFactor * speedFactor : 0;
      this._fade(this._nodes.wakeGain, wakeOn * A.WATER_MAX_GAIN, now);
      this._nodes.wakeFilter.frequency.setTargetAtTime(500 + 900 * speedFactor, now, 0.1);

      // ── Wind: quadratic so it only appears at real speed ───────
      this._fade(this._nodes.windGain, speedFactor * speedFactor * A.WIND_MAX_GAIN, now);
    } else {
      // Walking the harbour: no engine, wake or wind — just ambience.
      this._fade(this._nodes.engineGain, 0, now);
      this._fade(this._nodes.engine2Gain, 0, now);
      this._fade(this._nodes.wakeGain, 0, now);
      this._fade(this._nodes.windGain, 0, now);
    }

    // ── Harbour ↔ ocean ambience crossfade ───────────────────────
    this._fade(this._nodes.oceanGain, (1 - hf) * A.OCEAN_AMBI_GAIN, now);
    this._fade(this._nodes.harborGain, hf * A.HARBOR_AMBI_GAIN, now);
    this._fade(this._gullGain, hf > 0.4 ? 1 : 0, now);

    // ── Seagulls near the harbour ────────────────────────────────
    if (hf > 0.4 && now > this._nextGullTime) {
      this._nextGullTime = now + 2.5 + Math.random() * 5;
      this._chirp(now);
    }
  }

  /** Stop all continuous nodes (engine teardown). */
  dispose() {
    const n = this._nodes;
    if (!n) return;
    try {
      n.engineOsc.stop(); n.engineOsc.disconnect();
      n.engine2Osc.stop(); n.engine2Osc.disconnect();
      n.wakeSrc.stop(); n.wakeSrc.disconnect();
      n.windSrc.stop(); n.windSrc.disconnect();
      n.oceanSrc.stop(); n.oceanSrc.disconnect();
      n.oceanLfo.stop(); n.oceanLfo.disconnect();
      n.harborSrc.stop(); n.harborSrc.disconnect();
      n.harborLfo.stop(); n.harborLfo.disconnect();
    } catch (e) { /* already stopped */ }
    this._nodes = null;
  }

  // ── Private ────────────────────────────────────────────────────

  _fade(gainNode, target, now) {
    gainNode.gain.setTargetAtTime(target, now, 0.08);
  }

  _makeNoise(ctx) {
    if (this._noiseBuffer) return this._noiseBuffer;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  }

  _ensure(ctx) {
    if (this._nodes) return;
    this._ctx = ctx;
    const master = soundFx.getMaster();
    if (!master) return;
    const n = (this._nodes = {});
    const A = BoatConfig.AUDIO;
    const noise = this._makeNoise(ctx);
    const loopNoise = () => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.start();
      return s;
    };

    // Engine: sawtooth through a lowpass + a quiet square sub-layer.
    n.engineOsc = ctx.createOscillator();
    n.engineOsc.type = 'sawtooth';
    n.engineOsc.frequency.value = A.ENGINE_IDLE_FREQ;
    n.engineFilter = ctx.createBiquadFilter();
    n.engineFilter.type = 'lowpass';
    n.engineFilter.frequency.value = 520;
    n.engineGain = ctx.createGain();
    n.engineGain.gain.value = 0;
    n.engineOsc.connect(n.engineFilter);
    n.engineFilter.connect(n.engineGain);
    n.engineGain.connect(master);
    n.engineOsc.start();

    n.engine2Osc = ctx.createOscillator();
    n.engine2Osc.type = 'square';
    n.engine2Osc.frequency.value = A.ENGINE_IDLE_FREQ * 1.5;
    n.engine2Gain = ctx.createGain();
    n.engine2Gain.gain.value = 0;
    n.engine2Osc.connect(n.engine2Gain);
    n.engine2Gain.connect(master);
    n.engine2Osc.start();

    // Wake/water rush: band-passed noise.
    n.wakeSrc = loopNoise();
    n.wakeFilter = ctx.createBiquadFilter();
    n.wakeFilter.type = 'bandpass';
    n.wakeFilter.frequency.value = 900;
    n.wakeFilter.Q.value = 0.8;
    n.wakeGain = ctx.createGain();
    n.wakeGain.gain.value = 0;
    n.wakeSrc.connect(n.wakeFilter);
    n.wakeFilter.connect(n.wakeGain);
    n.wakeGain.connect(master);

    // Wind: high-passed noise.
    n.windSrc = loopNoise();
    n.windFilter = ctx.createBiquadFilter();
    n.windFilter.type = 'highpass';
    n.windFilter.frequency.value = 1200;
    n.windGain = ctx.createGain();
    n.windGain.gain.value = 0;
    n.windSrc.connect(n.windFilter);
    n.windFilter.connect(n.windGain);
    n.windGain.connect(master);

    // Open-ocean swell: low noise with a slow amplitude LFO.
    n.oceanSrc = loopNoise();
    n.oceanFilter = ctx.createBiquadFilter();
    n.oceanFilter.type = 'lowpass';
    n.oceanFilter.frequency.value = 300;
    n.oceanGain = ctx.createGain();
    n.oceanGain.gain.value = 0;
    n.oceanLfo = ctx.createOscillator();
    n.oceanLfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    n.oceanLfo.connect(lfoGain);
    lfoGain.connect(n.oceanGain.gain);
    n.oceanLfo.start();
    n.oceanSrc.connect(n.oceanFilter);
    n.oceanFilter.connect(n.oceanGain);
    n.oceanGain.connect(master);

    // Harbour lapping: low noise with a faster LFO.
    n.harborSrc = loopNoise();
    n.harborFilter = ctx.createBiquadFilter();
    n.harborFilter.type = 'lowpass';
    n.harborFilter.frequency.value = 220;
    n.harborGain = ctx.createGain();
    n.harborGain.gain.value = 0;
    n.harborLfo = ctx.createOscillator();
    n.harborLfo.frequency.value = 0.5;
    const hLfoGain = ctx.createGain();
    hLfoGain.gain.value = 0.22;
    n.harborLfo.connect(hLfoGain);
    hLfoGain.connect(n.harborGain.gain);
    n.harborLfo.start();
    n.harborSrc.connect(n.harborFilter);
    n.harborFilter.connect(n.harborGain);
    n.harborGain.connect(master);

    // Seagull chirps share a gain that gates on harbour proximity.
    this._gullGain = ctx.createGain();
    this._gullGain.gain.value = 0;
    this._gullGain.connect(master);
  }

  /** One gull "kek-kek" chirp (two quick frequency sweeps). */
  _chirp(now) {
    const ctx = this._ctx || soundFx.getContext();
    const n = this._nodes;
    if (!ctx || !n || soundFx.muted) return;

    const base = 900 + Math.random() * 400;
    for (let k = 0; k < 2; k++) {
      const t = now + k * 0.16;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.8, t + 0.07);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(BoatConfig.AUDIO.GULL_GAIN, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      g.connect(this._gullGain);
      o.start(t);
      o.stop(t + 0.2);
    }
  }
}
