import * as THREE from 'three';
import { BoatConfig } from '../config/BoatConfig.js';
import { PerformanceConfig } from '../config/PerformanceConfig.js';

/**
 * BoatEffects.js — Lightweight water effects for the boat: wake ribbon,
 * propeller bubbles/foam and side splashes. All particles live in ONE shared
 * GPU point pool (no allocations, no instantiation during gameplay).
 *
 *   - Wake:      a world-anchored foam ribbon behind the stern. Appears only
 *                while moving; width and opacity scale with speed.
 *   - Propeller: small bubbles + foam emitted behind the stern, intensity
 *                scales with throttle.
 *   - Splashes:  side spray only during sharp turns at higher speeds.
 *
 * Rebase() keeps the world-anchored wake and live particles glued to the
 * world during the engine's floating-origin shifts.
 */
export class BoatEffects {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    // ── Pooled GPU particles ────────────────────────────────────
    this._pool = null;
    this._points = null;
    this._createPool();

    // ── Wake ribbon (world space) ───────────────────────────────
    const W = BoatConfig.WAKE;
    this._wakePoints = [];
    this._wakeGeom = new THREE.BufferGeometry();
    this._wakeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(W.MAX_POINTS * 2 * 3), 3));
    this._wakeGeom.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(W.MAX_POINTS * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < W.MAX_POINTS - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
    this._wakeGeom.setIndex(idx);
    this._wakeGeom.setDrawRange(0, 0);
    this._wakeMesh = new THREE.Mesh(
      this._wakeGeom,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this._wakeMesh.renderOrder = 5;
    this._wakeMesh.frustumCulled = false;
    this._wakeMesh.visible = false;
    this.scene.add(this._wakeMesh);

    // Scratch vectors reused every frame (zero per-frame allocations).
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._col = new THREE.Color();

    // Emission accumulators (fractional particle budgets across frames).
    this._emitAccP = 0; // propeller
    this._emitAccS = 0; // splashes
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Drive wake + particles every render frame (boat mode only).
   * @param {number} dt
   * @param {THREE.Object3D} boat
   * @param {{speed:number, throttle:number, steer:number, time:number, sampler:object}} ctx
   */
  update(dt, boat, ctx) {
    this._updateWake(dt, boat, ctx);
    this._updateParticles(dt, boat, ctx);
  }

  /** Shift world-anchored effects by -offset (floating-origin rebase). */
  rebase(offset) {
    for (const p of this._wakePoints) p.sub(offset);
    if (this._pool) {
      const pos = this._pool.pos;
      for (let i = 0; i < PerformanceConfig.WATER_EFFECT_PARTICLES; i++) {
        if (this._pool.life[i] > 0) {
          pos[i * 3]     -= offset.x;
          pos[i * 3 + 1] -= offset.y;
          pos[i * 3 + 2] -= offset.z;
        }
      }
    }
  }

  dispose() {
    this.scene.remove(this._wakeMesh);
    this._wakeGeom.dispose();
    this._wakeMesh.material.dispose();
    if (this._points) {
      this.scene.remove(this._points);
      this._poolGeo.dispose();
      this._poolMat.dispose();
    }
  }

  // ── Wake ribbon ────────────────────────────────────────────────

  _updateWake(dt, boat, ctx) {
    const W = BoatConfig.WAKE;
    const speed = Math.abs(ctx.speed);
    const speedFactor = Math.min(1, speed / BoatConfig.MAX_SPEED);

    if (speed < W.THRESHOLD) {
      if (this._wakeMesh.visible) {
        this._wakeMesh.visible = false;
        this._wakePoints.length = 0;
        this._wakeGeom.setDrawRange(0, 0);
      }
      return;
    }
    this._wakeMesh.visible = true;

    // Stern world position (boat forward = local -Z → stern = +Z). Its height
    // follows the sampled wave so the foam sits exactly on the water surface.
    const stern = this._v1.set(0, 0, 1.9).applyQuaternion(boat.quaternion).add(boat.position);
    stern.y = ctx.sampler.getHeight(stern.x, stern.z, ctx.time) + 0.12;

    const last = this._wakePoints[0];
    const spacing = W.POINT_SPACING / (0.6 + 0.4 * speedFactor);
    if (!last || last.distanceTo(stern) > spacing) {
      this._wakePoints.unshift(stern.clone());
      if (this._wakePoints.length > W.MAX_POINTS) this._wakePoints.pop();
    }

    const n = this._wakePoints.length;
    if (n < 2) { this._wakeGeom.setDrawRange(0, 0); return; }

    const halfW = W.WIDTH_MIN + (W.WIDTH_MAX - W.WIDTH_MIN) * speedFactor;
    // Opacity ramps QUADRATICALLY with speed: idle ≈ invisible, slow = small,
    // fast = a big visible wake.
    this._wakeMesh.material.opacity = W.OPACITY_MIN + (W.OPACITY_MAX - W.OPACITY_MIN) * speedFactor * speedFactor;

    const posAttr = this._wakeGeom.attributes.position;
    const colAttr = this._wakeGeom.attributes.color;
    const pos = posAttr.array;
    const col = colAttr.array;

    for (let i = 0; i < n; i++) {
      const p = this._wakePoints[i];
      const nxt = this._wakePoints[Math.min(i + 1, n - 1)];
      this._v2.subVectors(nxt, p);
      this._v3.set(-this._v2.z, 0, this._v2.x);
      if (this._v3.lengthSq() < 1e-6) this._v3.set(1, 0, 0);
      this._v3.normalize().multiplyScalar(halfW);

      const li = i * 6;
      pos[li]     = p.x + this._v3.x; pos[li + 1] = p.y; pos[li + 2]     = p.z + this._v3.z;
      pos[li + 3] = p.x - this._v3.x; pos[li + 4] = p.y; pos[li + 5]     = p.z - this._v3.z;

      // Foam fades from bright white at the stern to dark water-blue at the tail.
      const f = 1 - i / (n - 1);
      this._col.setHSL(0.55, 0.6, 0.18 + 0.82 * f);
      col[li] = col[li + 3] = this._col.r;
      col[li + 1] = col[li + 4] = this._col.g;
      col[li + 2] = col[li + 5] = this._col.b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this._wakeGeom.setDrawRange(0, (n - 1) * 6);
  }

  // ── Particle pool ──────────────────────────────────────────────

  _createPool() {
    const N = PerformanceConfig.WATER_EFFECT_PARTICLES;
    const pos   = new Float32Array(N * 3);
    const vel   = new Float32Array(N * 3);
    const life  = new Float32Array(N);
    const maxLf = new Float32Array(N);
    const size  = new Float32Array(N);
    const type  = new Uint8Array(N); // 0 = bubble, 1 = splash, 2 = foam
    const color = new Float32Array(N * 3);
    this._pool = { pos, vel, life, maxLf, size, type, color, cursor: 0 };

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color',    new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size',     new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha',    new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage));
    this._poolGeo = geo;

    this._poolMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 color;
        attribute float size;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Dead particles must never rasterize a fragment (alpha 0 anyway,
          // but this also zeroes gl_PointSize on strict drivers).
          gl_PointSize = alpha <= 0.001 ? 0.0 : size * (160.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    this._points = new THREE.Points(geo, this._poolMat);
    this._points.frustumCulled = false;
    this._points.renderOrder = 6;
    this.scene.add(this._points);
  }

  _updateParticles(dt, boat, ctx) {
    const N = PerformanceConfig.WATER_EFFECT_PARTICLES;
    const p = this._pool;
    const EF = BoatConfig.EFFECTS;
    const speed = Math.abs(ctx.speed);
    const speedFactor = Math.min(1, speed / BoatConfig.MAX_SPEED);

    // ── Emissions ────────────────────────────────────────────────
    // Propeller bubbles/foam: intensity from throttle (and a little from speed).
    const throttle = Math.max(0, ctx.throttle);
    const propIntensity = Math.max(throttle, speedFactor * 0.35);
    this._emitAccP += EF.PROPELLER_RATE * propIntensity * dt;
    if (this._emitAccP >= 1) {
      const count = Math.floor(this._emitAccP);
      this._emitAccP -= count;
      for (let i = 0; i < count; i++) this._emitPropeller(boat, propIntensity);
    }

    // Side splashes: only on sharp turns at higher speeds.
    const steerMag = Math.abs(ctx.steer);
    const canSplash = speed > EF.SPLASH_MIN_SPEED && steerMag > EF.SPLASH_TURN;
    if (canSplash) {
      this._emitAccS += EF.SPLASH_RATE * dt;
      if (this._emitAccS >= 1) {
        const count = Math.floor(this._emitAccS);
        this._emitAccS -= count;
        for (let i = 0; i < count; i++) this._emitSplash(boat, ctx.steer, speedFactor);
      }
    }

    // ── Integration ──────────────────────────────────────────────
    const posA = p.pos, velA = p.vel, lifeA = p.life, maxA = p.maxLf, sizeA = p.size, typeA = p.type;
    const alphaAttr = this._poolGeo.attributes.alpha;
    const alphaA = alphaAttr.array;

    for (let i = 0; i < N; i++) {
      if (lifeA[i] <= 0) continue;
      lifeA[i] -= dt;
      if (lifeA[i] <= 0) {
        lifeA[i] = 0;
        alphaA[i] = 0;
        sizeA[i] = 0;
        continue;
      }
      const i3 = i * 3;
      // Type-specific behaviour: bubbles rise, splashes fall, foam spreads flat.
      if (typeA[i] === 0) {
        velA[i3 + 1] += 1.4 * dt;
      } else if (typeA[i] === 1) {
        velA[i3 + 1] -= 6.0 * dt;
      } else {
        velA[i3] *= 1 - 0.6 * dt;
        velA[i3 + 2] *= 1 - 0.6 * dt;
      }
      posA[i3]     += velA[i3] * dt;
      posA[i3 + 1] += velA[i3 + 1] * dt;
      posA[i3 + 2] += velA[i3 + 2] * dt;
      // Shrink and fade with remaining life.
      const frac = lifeA[i] / maxA[i];
      sizeA[i] = (0.16 + typeA[i] * 0.06) * frac;
      alphaA[i] = Math.min(1, frac * 2.2) * 0.85;
    }
    this._poolGeo.attributes.position.needsUpdate = true;
    this._poolGeo.attributes.size.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  /** Emit one particle into the ring-buffer pool (overwrites oldest slot). */
  _emit(x, y, z, vx, vy, vz, life, size, type, r, g, b) {
    const N = PerformanceConfig.WATER_EFFECT_PARTICLES;
    const p = this._pool;
    const i = p.cursor;
    p.cursor = (p.cursor + 1) % N;

    const i3 = i * 3;
    p.pos[i3] = x; p.pos[i3 + 1] = y; p.pos[i3 + 2] = z;
    p.vel[i3] = vx; p.vel[i3 + 1] = vy; p.vel[i3 + 2] = vz;
    p.life[i] = life;
    p.maxLf[i] = life;
    p.size[i] = size;
    p.type[i] = type;
    p.color[i3] = r; p.color[i3 + 1] = g; p.color[i3 + 2] = b;
    this._poolGeo.attributes.color.needsUpdate = true;
  }

  _emitPropeller(boat, intensity) {
    // Propeller is at the stern, just below the transom (local +Z).
    const local = this._v1.set(
      (Math.random() - 0.5) * 0.4,
      0.35 + Math.random() * 0.25,
      2.15
    ).applyQuaternion(boat.quaternion).add(boat.position);
    // Water is pushed backward (local +Z); bubbles also rise a little.
    const dir = this._v2.set(0, 0, 1).applyQuaternion(boat.quaternion);
    const spread = 0.9 + Math.random() * 0.9;
    const type = Math.random() < 0.65 ? 0 : 2; // mostly bubbles, some foam
    this._emit(
      local.x, local.y, local.z,
      dir.x * spread + (Math.random() - 0.5) * 0.4,
      0.6 + Math.random() * 0.8,
      dir.z * spread + (Math.random() - 0.5) * 0.4,
      BoatConfig.EFFECTS.BUBBLE_LIFE * (0.7 + Math.random() * 0.6),
      0.14 + Math.random() * 0.12,
      type,
      0.85, 0.97, 1.0
    );
  }

  _emitSplash(boat, steer, speedFactor) {
    // Spray arcs off the OUTSIDE of the turn: turning left (steer > 0) the
    // bow pushes water off the right side, and vice versa.
    const side = steer > 0 ? 1 : -1;
    const local = this._v1.set(side * 1.35, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 1.2)
      .applyQuaternion(boat.quaternion).add(boat.position);
    const outward = this._v2.set(side, 0.15, (Math.random() - 0.5) * 0.6).normalize()
      .applyQuaternion(boat.quaternion);
    const power = (1.6 + Math.random() * 1.6) * (0.6 + 0.8 * speedFactor);
    this._emit(
      local.x, local.y, local.z,
      outward.x * power,
      2.2 + Math.random() * 1.4,
      outward.z * power,
      BoatConfig.EFFECTS.SPLASH_LIFE * (0.7 + Math.random() * 0.5),
      0.16 + Math.random() * 0.14,
      1, // splash type (gravity)
      0.92, 0.99, 1.0
    );
  }
}
