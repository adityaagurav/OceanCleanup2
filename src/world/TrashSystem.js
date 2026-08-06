import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';
import { WorldConfig }  from '../config/WorldConfig.js';
import { PerformanceConfig } from '../config/PerformanceConfig.js';
import { BoatConfig }   from '../config/BoatConfig.js';

/**
 * TrashSystem.js — Manages trash spawning, proximity detection, and reel pickup.
 *
 * Responsibilities:
 *  - Spawn trash meshes across the ocean
 *  - Track the nearest trash item to the player
 *  - Handle fishing-reel pickup animation
 *  - Emit callbacks: onCollect, onNearTrash
 */
export class TrashSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {{ onCollect?, onNearTrash? }} callbacks
   * @param {{ trashDensity?: string }} options
   */
  constructor(scene, callbacks = {}, options = {}) {
    this.scene     = scene;
    this.callbacks = callbacks;

    this.trashes     = [];
    this.activeReels = [];
    this.nearItem    = null;
    this.score       = 0;
    this.trashCount  = 0;

    // Draw-call cull radius for updateVisibility(): trash beyond this distance
    // never enters the render list. Pickup radius is 8 m, so the default 600 m
    // is far past any gameplay relevance while large enough that items don't
    // visibly pop in through the light fog. Configurable (see PerformanceConfig).
    this._cullRadiusSq = (options.cullRadius ?? PerformanceConfig.TRASH_CULL_RADIUS) ** 2;

    // Shared resources for the procedurally-generated trash — ONE geometry and
    // ONE material per trash type instead of one per item (~150 items used to
    // each create their own). Cuts memory and GPU material state changes with
    // zero visual difference.
    this._procGeo = [
      new THREE.DodecahedronGeometry(0.22, 1),
      new THREE.CylinderGeometry(0.08, 0.08, 0.45, 8),
      new THREE.CylinderGeometry(0.11, 0.11, 0.3, 12),
    ];
    this._procMat = [
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.4 }),
    ];

    // Shared reel-line material — pickups no longer allocate a material each.
    this._lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 3 });

    // Proximity ring indicator (scaled down to match smaller trash)
    const ringGeo = new THREE.RingGeometry(0.45, 0.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.85
    });
    this._ring = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = Math.PI / 2;
    this._ring.visible = false;
    this.scene.add(this._ring);

    const density = options.trashDensity ?? 'normal';
    this._count = WorldConfig.TRASH_COUNT[density] ?? WorldConfig.TRASH_COUNT.normal;

    this._hasSpawned = false;
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Start spawning mission pickups only after the player boards the boat. */
  start() {
    if (this._hasSpawned) return;
    this._hasSpawned = true;
    this._spawn();
  }

  /**
   * Call each fixed physics step.
   * @param {THREE.Vector3} playerPos
   */
  updateProximity(playerPos) {
    let closest = null, minDist = Infinity;
    const R = WorldConfig.TRASH_PICKUP_RADIUS;

    for (const t of this.trashes) {
      if (t.isBeingReeled) continue;
      const d = playerPos.distanceTo(t.position);
      if (d <= R && d < minDist) { minDist = d; closest = t; }
    }

    if (closest) {
      this.nearItem = closest;
      this._ring.position.copy(closest.position);
      this._ring.position.y = closest.position.y + 0.35; // track the bobbed item
      this._ring.rotation.z += 0.05;
      this._ring.visible = true;
      this.callbacks.onNearTrash?.(true);
    } else {
      this.nearItem = null;
      this._ring.visible = false;
      this.callbacks.onNearTrash?.(false);
    }
  }

  /**
   * Perf: toggle mesh visibility so trash beyond CULL_RADIUS never enters the
   * render list. The pickup radius is only 8 m, so culling at 450 m has zero
   * gameplay impact but removes potentially hundreds of draw calls while
   * sailing the open ocean.
   * @param {THREE.Vector3} playerPos
   */
  updateVisibility(playerPos) {
    for (const t of this.trashes) {
      if (t.isBeingReeled) continue; // mid-pickup animation — keep drawing
      t.visible = t.position.distanceToSquared(playerPos) < this._cullRadiusSq;
    }
  }

  /**
   * Floating trash: each item rides the shared wave field with its OWN random
   * Perlin-synced phase, bob speed, spin and a tiny drift, so no two pieces
   * ever move alike. When the boat passes within TRASH_WAKE.RADIUS the item
   * accumulates a small outward push velocity (procedural, no physics) that
   * decays over time — so trash visibly drifts away from the hull and gently
   * settles back.
   * @param {number} dt
   * @param {object} sampler - WaveSampler
   * @param {number} time - shared wave clock (s)
   * @param {number} boatSpeed - signed boat speed (m/s)
   * @param {THREE.Object3D|null} boat - boat group (null in non-boat contexts)
   */
  updateFloating(dt, sampler, time, boatSpeed = 0, boat = null) {
    const TW = BoatConfig.TRASH_WAKE;
    const speedFactor = Math.min(1, Math.abs(boatSpeed) / BoatConfig.MAX_SPEED);
    const radiusSq = TW.RADIUS * TW.RADIUS;
    const decay = Math.exp(-TW.DECAY * dt);

    for (const t of this.trashes) {
      if (t.isBeingReeled || !t.visible) continue;
      const f = t.userData.float;
      if (!f) continue;

      // Wake push: while the boat is close, accumulate outward velocity scaled
      // by proximity (squared falloff) and hull speed.
      if (boat && speedFactor > 0.05) {
        const dx = t.position.x - boat.position.x;
        const dz = t.position.z - boat.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < radiusSq && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const fall = 1 - d / TW.RADIUS;
          const push = fall * fall * speedFactor * TW.STRENGTH;
          f.pushX += (dx / d) * push * dt;
          f.pushZ += (dz / d) * push * dt;
        }
      }

      // Decay the push velocity, then apply it along with the tiny drift.
      f.pushX *= decay;
      f.pushZ *= decay;
      t.position.x += (f.driftX + f.pushX) * dt;
      t.position.z += (f.driftZ + f.pushZ) * dt;
      t.rotation.y += f.rotSpeed * dt;

      // Bob on the shared wave field, plus a unique Perlin-ish sine wobble so
      // items never sit on the same phase.
      const h = sampler.getHeight(t.position.x, t.position.z, time);
      const bob = Math.sin(time * f.bobSpeed + f.phase) * 0.05 * f.amp;
      t.position.y = h - 0.3 + bob;
    }
  }

  /**
   * Call each render frame for reel animation.
   * @param {THREE.Vector3} deckPos
   */
  updateReels(deckPos) {
    for (let i = this.activeReels.length - 1; i >= 0; i--) {
      const reel = this.activeReels[i];
      reel.progress += 0.05;

      if (reel.progress >= 1.0) {
        this.scene.remove(reel.trash);
        this.scene.remove(reel.line);
        // Free the line geometry — each reel allocated its own (the material
        // is shared). Prevents a per-pickup memory leak.
        reel.line.geometry.dispose();
        const idx = this.trashes.indexOf(reel.trash);
        if (idx !== -1) this.trashes.splice(idx, 1);
        this.activeReels.splice(i, 1);

        this.trashCount++;
        this.score += 50;
        this.callbacks.onCollect?.(this.score, this.trashCount);
      } else {
        const cur = new THREE.Vector3().lerpVectors(reel.startPos, deckPos, reel.progress);
        cur.y = Math.sin(reel.progress * Math.PI) * 2 + 0.4;
        reel.trash.position.copy(cur);
        reel.trash.rotation.x += 0.1;
        reel.trash.rotation.y += 0.1;
        reel.line.geometry.setFromPoints([deckPos, cur]);
      }
    }
  }

  /**
   * Attempt to pick up the nearest trash item.
   * @param {THREE.Vector3} playerPos
   * @param {THREE.Vector3} deckPos
   */
  pickupNearest(playerPos, deckPos) {
    if (!this.nearItem || this.nearItem.isBeingReeled) return;
    if (playerPos.distanceTo(this.nearItem.position) > WorldConfig.TRASH_PICKUP_RADIUS) return;

    const target = this.nearItem;
    target.isBeingReeled = true;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([deckPos, target.position.clone()]);
    const line    = new THREE.Line(lineGeo, this._lineMat); // shared material
    this.scene.add(line);

    this.activeReels.push({ trash: target, line, progress: 0, startPos: target.position.clone() });

    this._ring.visible = false;
    this.nearItem = null;
    this.callbacks.onNearTrash?.(false);
  }

  /**
   * Shift every world-anchored trash mesh, the proximity ring, and any active
   * reel by -offset. Keeps trash visually synchronized with the boat when the
   * engine's floating-origin rebase fires far from the harbour.
   */
  rebase(offset) {
    this.trashes.forEach(t => t.position.sub(offset));
    this._ring.position.sub(offset);
    this.activeReels.forEach(r => {
      r.trash.position.sub(offset);
      r.startPos.sub(offset);
    });
  }

  dispose() {
    this.scene.remove(this._ring);
    this.trashes.forEach(t => this.scene.remove(t));
    this.activeReels.forEach(r => { this.scene.remove(r.line); r.line.geometry.dispose(); });
    this._lineMat.dispose();
    this._procGeo.forEach(g => g.dispose());
    this._procMat.forEach(m => m.dispose());
  }

  // ── Private ──────────────────────────────────────────────────────

  async _spawn() {
    let baseScene = null;
    try {
      const gltf = await AssetManager.loadGLTF('assets/trash/scene.gltf');
      baseScene = gltf.scene;
    } catch (_) { /* fall through to procedural trash */ }

    for (let i = 0; i < this._count; i++) {
      let mesh;
      if (baseScene && Math.random() > 0.4) {
        mesh = baseScene.clone();
        const s = 0.35 + Math.random() * 0.45;
        mesh.scale.set(s, s, s);
        mesh.rotation.y = Math.random() * Math.PI * 2;
      } else {
        mesh = this._makeProceduralMesh();
      }
      this._place(mesh);
      this.scene.add(mesh);
      this.trashes.push(mesh);
    }
  }

  _makeProceduralMesh() {
    const r = Math.random();
    const type = r < 0.4 ? 0 : r < 0.7 ? 1 : 2;
    // Geometries/materials are shared per type (see constructor).
    return new THREE.Mesh(this._procGeo[type], this._procMat[type]);
  }

  _place(obj) {
    const isLand = (x, z) => {
      // Harbour landmass: main plaza (x -130..130, z 0..70) + rear yard (z -60..0)
      if (x >= -130 && x <= 130 && z >= -60 && z <= 70) return true;
      // P0 central unloading pier: x -6..6, z 70..150
      if (x >= -6.5 && x <= 6.5 && z >= 70 && z <= 150) return true;
      // P1 east boat pier: x 10..24, z 70..130
      if (x >= 9.5 && x <= 24.5 && z >= 70 && z <= 130) return true;
      // P2 east industrial pier: x 30..42, z 70..140
      if (x >= 29.5 && x <= 42.5 && z >= 70 && z <= 140) return true;
      // P3 west boat pier: x -24..-10, z 70..130
      if (x >= -24.5 && x <= -9.5 && z >= 70 && z <= 130) return true;
      // P4 west maintenance pier: x -42..-30, z 70..140
      if (x >= -42.5 && x <= -29.5 && z >= 70 && z <= 140) return true;
      return false;
    };

    let px = 0, pz = 0;
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      // We want a good density near the harbor, so let's make 25% of the trash spawn closer to the harbor.
      // The harbor center is around (0, 80).
      const spawnNearHarbor = Math.random() < 0.25;

      if (spawnNearHarbor) {
        // Spawn near harbor: center (0, 80), radius 15 to 250
        const d = 15 + Math.random() * 235;
        const a = Math.random() * Math.PI * 2;
        px = Math.cos(a) * d;
        pz = 80 + Math.sin(a) * d;
      } else {
        // Original spawn logic around (0, 0)
        const d = WorldConfig.TRASH_MIN_DIST + Math.random() * (WorldConfig.TRASH_MAX_DIST - WorldConfig.TRASH_MIN_DIST);
        const a = Math.random() * Math.PI * 2;
        px = Math.cos(a) * d;
        pz = Math.sin(a) * d;
      }

      if (!isLand(px, pz)) {
        break;
      }
      attempts++;
    }

    obj.position.set(px, -0.3, pz);

    // Per-item floating personality: unique phase, bob speed, spin, drift and
    // the wake-push velocity the boat's passing adds (decays over time).
    obj.userData.float = {
      phase:    Math.random() * Math.PI * 2,
      bobSpeed: 0.6 + Math.random() * 0.9,
      rotSpeed: (Math.random() - 0.5) * 0.5,
      driftX:   (Math.random() - 0.5) * 0.05,
      driftZ:   (Math.random() - 0.5) * 0.05,
      amp:      0.4 + Math.random() * 0.6,
      pushX:    0,
      pushZ:    0,
    };
  }
}
