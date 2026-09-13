import * as THREE from 'three';

/**
 * UnloadZone.js — Small harbour recycling/unloading station (Part 2).
 *
 * A compact low-poly waste-collection point on the right wing deck's inner
 * edge (x 10..15, z 6..10), facing the central channel:
 *   - concrete pad with two skips (blue + aqua), a crate and a barrel,
 *   - a "RECYCLING" sign on posts at the dock edge, readable from the deck
 *     and from an approaching boat,
 *   - rope coil + life ring dressing, all reusing HarbourManager's shared
 *     materials/geometries (two new materials total: the aqua accent and the
 *     sign texture — one small canvas, drawn once).
 *
 * The boat interaction zone is a rebase-safe anchor point in the water just
 * off the dock edge (x ~7, z 8): `isBoatNear(boatPos)` is a cheap XZ distance
 * check the Engine runs once per frame. Nothing is awarded or unloaded here —
 * Part 3 adds the actual unload + coin flow (see ProgressionConfig.js).
 *
 * Collision: the skips/crate/barrel/sign block the character (wallColliders,
 * walk-around); the pad is walkable (colliders). NO new colliders are placed
 * in the water — the wing's existing below-deck fill already stops the boat
 * at the dock face, so the boat can approach, hold position, and leave freely.
 */
export class UnloadZone {
  /**
   * @param {THREE.Object3D} parent   — harbour root (so rebase moves the zone)
   * @param {object} mats             — HarbourManager shared materials
   * @param {object} geo              — HarbourManager shared geometries
   * @param {THREE.Mesh[]} wallColliders — character blockers (walk-around)
   */
  constructor(parent, mats, geo, wallColliders = []) {
    this.root = new THREE.Group();
    this.root.name = 'UnloadZone';
    parent.add(this.root);

    // Boat interaction anchor — a child of the harbour root so floating-origin
    // rebases move it together with the harbour. Sits in the water alongside
    // the station; slightly larger radius than the station so the interaction
    // feels reliable without blocking the channel.
    this._anchor = new THREE.Object3D();
    this._anchor.position.set(7.0, 0, 8);
    parent.add(this._anchor);
    this.triggerRadius = 7.5;
    this._tmp = new THREE.Vector3();

    // New shared materials (the only ones this zone adds).
    this._accentMat = new THREE.MeshStandardMaterial({ color: 0x19b89a, roughness: 0.65 });
    this._signMat = this._makeSignMaterial();

    // Unload-animation resources (Part 3): two shared materials + one shared
    // geometry for the flying trash batches — zero per-spawn allocations.
    this._fxGeo = new THREE.BoxGeometry(0.34, 0.26, 0.3);
    this._fxMatA = new THREE.MeshStandardMaterial({ color: 0x4a6072, roughness: 0.85, flatShading: true });
    this._fxMatB = new THREE.MeshStandardMaterial({ color: 0xd93a2f, roughness: 0.85, flatShading: true });
    this._arcs = [];        // { mesh, t, delay, start(Vector3 local), apex, end, spin }
    this._unloadActive = false;
    this._pulse = 0;        // aqua skip "receives trash" scale pulse

    this._build(mats, geo, wallColliders);
  }

  /** Cheap per-frame boat proximity test (XZ distance to the anchor). */
  isBoatNear(boatPos) {
    this._anchor.getWorldPosition(this._tmp);
    const dx = boatPos.x - this._tmp.x;
    const dz = boatPos.z - this._tmp.z;
    return dx * dx + dz * dz < this.triggerRadius * this.triggerRadius;
  }

  /** Textures/materials created by this zone (meshes die with harbour.root). */
  dispose() {
    this._signMat?.map?.dispose();
    this._signMat?.dispose();
    this._accentMat?.dispose();
    this._fxGeo?.dispose();
    this._fxMatA?.dispose();
    this._fxMatB?.dispose();
  }

  // ── Unload animation (Part 3) ───────────────────────────────────────────

  /**
   * Start the unload feedback: trash batches arc from the boat into the aqua
   * skip. Lightweight by design — at most MAX_BATCH shared meshes on pre-set
   * bezier paths, no physics, no per-frame allocations.
   * @param {THREE.Vector3} boatWorldPos
   * @param {number} count — items being unloaded (batches are capped)
   */
  startUnload(boatWorldPos, count) {
    this._clearArcs();
    const batch = Math.max(1, Math.min(count, 6));
    // Start point in harbour-local space (the FX group lives under the
    // harbour root, which floating-origin rebase may have offset).
    const startLocal = this.root.worldToLocal(boatWorldPos.clone());
    startLocal.y += 1.1;
    const endLocal = this._skipAqua.position.clone();
    endLocal.y += 1.5;

    for (let i = 0; i < batch; i++) {
      const mesh = new THREE.Mesh(this._fxGeo, i % 2 ? this._fxMatB : this._fxMatA);
      mesh.visible = false;
      mesh.castShadow = false;
      this.root.add(mesh);
      this._arcs.push({
        mesh,
        t: 0,
        delay: i * 0.1,
        start: startLocal.clone(),
        end: endLocal.clone(),
        spin: 2.5 + Math.random() * 2,
      });
    }
    this._unloadActive = true;
  }

  /**
   * Advance the unload animation.
   * @param {number} dt seconds
   * @returns {boolean} true when the animation has fully finished
   */
  updateUnload(dt) {
    if (!this._unloadActive) return true;
    let allDone = true;
    for (const a of this._arcs) {
      if (a.t >= 1) continue;
      if (a.delay > 0) { a.delay -= dt; allDone = false; continue; }
      a.t = Math.min(1, a.t + dt / 0.55);
      allDone = false;
      // Quadratic bezier: start → raised apex → skip mouth.
      const u = a.t;
      const mx = (a.start.x + a.end.x) / 2;
      const mz = (a.start.z + a.end.z) / 2;
      const apexY = Math.max(a.start.y, a.end.y) + 1.6;
      const x = (1 - u) * (1 - u) * a.start.x + 2 * (1 - u) * u * mx + u * u * a.end.x;
      const y = (1 - u) * (1 - u) * a.start.y + 2 * (1 - u) * u * apexY + u * u * a.end.y;
      const z = (1 - u) * (1 - u) * a.start.z + 2 * (1 - u) * u * mz + u * u * a.end.z;
      a.mesh.position.set(x, y, z);
      a.mesh.rotation.x += a.spin * dt;
      a.mesh.rotation.y += a.spin * 0.7 * dt;
      a.mesh.visible = true;
      if (a.t >= 1) {
        a.mesh.visible = false;
        this._pulse = 1; // the skip "receives" each landing batch
      }
    }

    // Skip receive-pulse (cheap scale spring back to 1).
    if (this._pulse > 0) {
      this._pulse = Math.max(0, this._pulse - dt * 3);
      const s = 1 + 0.06 * this._pulse;
      this._skipAqua.scale.set(s, s, s);
    }

    if (allDone) {
      this._skipAqua.scale.set(1, 1, 1);
      this._pulse = 0;
      this._unloadActive = false;
      this._clearArcs();
    }
    return allDone;
  }

  isUnloading() {
    return this._unloadActive;
  }

  /**
   * Abort an in-flight unload (e.g. the player left the boat mid-animation).
   * Clears the FX and resets the skip; the Engine keeps the inventory intact
   * (nothing was deducted yet — deduction happens at completion).
   */
  cancelUnload() {
    this._clearArcs();
    this._unloadActive = false;
    this._pulse = 0;
    this._skipAqua?.scale.set(1, 1, 1);
  }

  _clearArcs() {
    for (const a of this._arcs) this.root.remove(a.mesh);
    this._arcs.length = 0;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** "RECYCLING" sign face — one 512×192 canvas, drawn once at construction. */
  _makeSignMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#19b89a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 10;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 96px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RECYCLING', canvas.width / 2, canvas.height / 2 + 6);

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x147f68, roughness: 0.75 });
    // Box faces: [+x, -x, +y, -y, +z, -z] — the big faces are ±x (board is
    // thin in x), so the text reads from the water side (-x) where both the
    // approaching boat and the player on the dock edge look at it.
    return [face, face, edge, edge, edge, edge];
  }

  _build(mats, geo, wallColliders) {
    const add = (mesh, opts = {}) => {
      mesh.castShadow = opts.cast ?? true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      if (opts.block) wallColliders.push(mesh);
      if (opts.walkable) walkable.push(mesh);
      return mesh;
    };
    const walkable = [];

    // ── Concrete pad on the wing deck (walkable step-up, top y ≈ 1.44) ──
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.24, 3.6), mats.concrete);
    pad.position.set(13.0, 1.32, 8);
    add(pad, { cast: false, walkable: true });

    // ── Two skips (recycling containers) — blue + aqua, slightly rotated ──
    const skipGeo = new THREE.BoxGeometry(1.7, 1.1, 1.15);
    const lidGeo = new THREE.BoxGeometry(1.76, 0.09, 1.21);
    const skip1 = new THREE.Mesh(skipGeo, mats.container);
    skip1.position.set(12.1, 1.99, 7.3);
    skip1.rotation.y = 0.08;
    add(skip1, { block: true });
    const lid1 = new THREE.Mesh(lidGeo, mats.metal);
    lid1.position.set(12.1, 2.58, 7.3);
    lid1.rotation.y = 0.08;
    lid1.rotation.z = 0.1; // ajar
    add(lid1, { cast: false });

    const skip2 = new THREE.Mesh(skipGeo, this._accentMat);
    skip2.position.set(13.9, 1.99, 8.7);
    skip2.rotation.y = -0.12;
    add(skip2, { block: true });
    const lid2 = new THREE.Mesh(lidGeo, mats.metal);
    lid2.position.set(13.9, 2.58, 8.7);
    lid2.rotation.y = -0.12;
    add(lid2, { cast: false });
    this._skipAqua = skip2; // the receiving container for unload arcs

    // ── Sorting crate + barrel + rope coil (dressing, all shared assets) ──
    const crate = new THREE.Mesh(geo.crate, mats.deck);
    crate.position.set(14.5, 1.84, 7.0);
    crate.rotation.y = 0.35;
    add(crate, { block: true });

    const barrel = new THREE.Mesh(geo.barrel, mats.barrel);
    barrel.position.set(14.4, 1.92, 9.2);
    add(barrel, { block: true });

    const coil = new THREE.Mesh(geo.coil, mats.rope);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(12.0, 1.47, 9.3);
    add(coil, { cast: false });

    // ── RECYCLING sign at the dock edge (readable from boat + deck edge) ──
    const postGeo = new THREE.BoxGeometry(0.12, 1.5, 0.12);
    for (const z of [7.2, 8.8]) {
      const post = new THREE.Mesh(postGeo, mats.piling);
      post.position.set(10.1, 1.95, z);
      add(post, { block: true });
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 3.0), this._signMat);
    board.position.set(10.1, 2.85, 8);
    add(board, { block: true });

    // Life ring hung on the sign post (visual only — matches harbour dressing).
    const ring = new THREE.Mesh(geo.ring, mats.ring);
    ring.position.set(10.1, 2.35, 7.0);
    add(ring, { cast: false });

    // The pad is walkable ground — expose it so HarbourManager can register
    // it with its character-ground colliders.
    this.walkableColliders = walkable;
  }
}
