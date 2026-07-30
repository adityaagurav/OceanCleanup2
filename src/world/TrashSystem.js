import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';
import { WorldConfig }  from '../config/WorldConfig.js';

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

    // Proximity ring indicator
    const ringGeo = new THREE.RingGeometry(1.2, 1.7, 32);
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
      this._ring.position.y = 0.3;
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

    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 3 });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([deckPos, target.position.clone()]);
    const line    = new THREE.Line(lineGeo, lineMat);
    this.scene.add(line);

    this.activeReels.push({ trash: target, line, progress: 0, startPos: target.position.clone() });

    this._ring.visible = false;
    this.nearItem = null;
    this.callbacks.onNearTrash?.(false);
  }

  dispose() {
    this.scene.remove(this._ring);
    this.trashes.forEach(t => this.scene.remove(t));
    this.activeReels.forEach(r => { this.scene.remove(r.line); });
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
        const s = 1 + Math.random() * 1.5;
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
    let geo, mat;
    if (r < 0.4) {
      geo = new THREE.DodecahedronGeometry(0.6, 1);
      mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    } else if (r < 0.7) {
      geo = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8);
      mat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 });
    } else {
      geo = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12);
      mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.4 });
    }
    return new THREE.Mesh(geo, mat);
  }

  _place(obj) {
    const d = WorldConfig.TRASH_MIN_DIST + Math.random() * (WorldConfig.TRASH_MAX_DIST - WorldConfig.TRASH_MIN_DIST);
    const a = Math.random() * Math.PI * 2;
    obj.position.set(Math.cos(a) * d, -0.3, Math.sin(a) * d);
  }
}
