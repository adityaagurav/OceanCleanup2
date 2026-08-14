import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * HarbourManager.js — Builds and owns the harbour set dressing.
 *
 * The harbour is the player's HOME BASE: a lively industrial marina and the
 * central recycling hub of the game. Everything is made from shared low-poly
 * primitives (boxes/cylinders/cones/canvas-texture signs) so it stays cheap to
 * render, matches the existing stylized art direction, and can be disposed as
 * one unit when a game session ends.
 *
 * Layout (top view, +z faces the open ocean):
 *   - Expanded concrete landmass: main plaza (x -80..80, z 0..70) plus a rear
 *     industrial yard (z -30..0)  →  ~3.5x the previous walkable area.
 *   - Six wooden piers reach into the water from the plaza front edge (z=70):
 *     central unloading dock, east boat pier, west boat pier, east industrial
 *     dock, west cargo dock and a small maintenance slip.
 *   - The Recycling Center (beige warehouse, dark-green gable roof, roller
 *     shutter, big sign) sits in front of the central unloading dock with a
 *     visible conveyor-belt interior.
 *   - Industrial props, containers, forklifts, parked cleanup boats, signs,
 *     vegetation and drifting ocean pollution fill the rest.
 */
export class HarbourManager {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh[]} colliders — ground/large solids (character ground snap + boat collision)
   * @param {THREE.Mesh[]} wallColliders — props/buildings the character cannot walk through
   */
  constructor(scene, colliders, wallColliders = []) {
    this.scene = scene;
    this.colliders = colliders;
    this.wallColliders = wallColliders;
    this.root = new THREE.Group();
    this.root.name = 'Harbour';
    this.scene.add(this.root);

    // The player's boat docks at the END of the central unloading pier, right
    // in front of the Recycling Center, where collected trash is sold.
    this.dockEnd = new THREE.Vector3(7.2, 0.35, 94);
    this.boatSpawn = new THREE.Vector3(7.2, 0.15, 90);    // in the water, tied alongside the unloading pier
    this.boardingPoint = new THREE.Vector3(5.4, 0.8, 90); // on the pier deck, beside the boat
    // Start the player on the unloading apron between the Recycling Center and
    // the pier, facing the building's big "RECYCLING CENTER" sign.
    this.playerSpawn = new THREE.Vector3(0, 2, 56);

    this._lights = [];
    this._lightBeams = [];
    this._gulls = [];
    this._conveyorItems = [];
    this._floating = [];
    this._craneJibs = [];
    this._compactorRam = null;
    this._crusherRoller = null;
    this._marker = null;

    // ── Performance: geometry cache, merged draw calls, distance LOD ───────
    this._geoCache = new Map(); // shared geometry instances keyed by size
    this._sharedGeos = new Set(); // geometries owned by the cache (never dispose)
    this._merged = [];          // merged static meshes (disposed with harbour)
    this._lod = [];             // { obj, x, z, max } distance-culled objects
    this._lodAcc = 0;
    this._shadowOn = false;     // shadow toggle — only major structures cast
    this._build();
  }

  /** Register a mesh as a solid wall for the character's horizontal collision. */
  _wall(mesh) {
    if (this.wallColliders) this.wallColliders.push(mesh);
    return mesh;
  }

  /**
   * An INVISIBLE barrier mesh that still blocks the character.
   * three.js raycasting does not test mesh/material visibility, so a mesh with
   * `visible: false` is skipped by the renderer yet fully solid to the
   * character's horizontal collision probes. These walls ring every water
   * edge of the walkable harbour so the player can NEVER step, walk or jump
   * into the ocean on foot — the boat is the only way out to sea.
   */
  _invisibleWall(x, z, xLen, zLen) {
    const wall = this._box(
      new THREE.MeshBasicMaterial({ visible: false }),
      xLen, 3.0, zLen, x, 1.5, z, false, false
    );
    wall.visible = false;
    return this._wall(wall);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Construction
  // ────────────────────────────────────────────────────────────────────────

  _build() {
    // ── Shared low-poly materials ──────────────────────────────────────────
    // A tiny fixed library of materials. Every prop reuses these instances so
    // the static-geometry merge pass can collapse thousands of meshes into a
    // handful of draw calls (one per material).
    const M = {
      concrete: new THREE.MeshStandardMaterial({ color: 0x8d9196, roughness: 0.95 }),
      curb: new THREE.MeshStandardMaterial({ color: 0x74787d, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x70462a, roughness: 0.88 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x3f271b, roughness: 0.92 }),
      plank: new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.9 }),
      rope: new THREE.MeshStandardMaterial({ color: 0xb89a67, roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x28333c, metalness: 0.8, roughness: 0.35 }),
      red: new THREE.MeshStandardMaterial({ color: 0xae3f32, roughness: 0.75 }),
      beige: new THREE.MeshStandardMaterial({ color: 0xc9bfa4, roughness: 0.9 }),
      roofGreen: new THREE.MeshStandardMaterial({ color: 0x2c5f34, roughness: 0.85 }),
      green: new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 0.7 }),
      blue: new THREE.MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.7 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xd9b13c, roughness: 0.7 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xd97a1f, roughness: 0.65 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7 }),
      gray: new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.55 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9dbbd0, roughness: 0.35 }),
      black: new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.9 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.95 }),
      // Extra shared instances for formerly per-instance props — they let the
      // merge pass group every pallet/container/palm/bush into ONE draw call.
      strip: new THREE.MeshStandardMaterial({ color: 0x8a8e93, roughness: 0.95 }),
      joint: new THREE.MeshStandardMaterial({ color: 0x5f6368, roughness: 0.9 }),
      shutter: new THREE.MeshStandardMaterial({ color: 0x77808a, roughness: 0.6 }),
      shutterRib: new THREE.MeshStandardMaterial({ color: 0x5d666f, roughness: 0.7 }),
      belt: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7 }),
      pallet: new THREE.MeshStandardMaterial({ color: 0x9a6f3e, roughness: 0.85 }),
      bale: new THREE.MeshStandardMaterial({ color: 0xc8d2c8, roughness: 0.9 }),
      binLid: new THREE.MeshStandardMaterial({ color: 0x3d4348, roughness: 0.6 }),
      contDoor: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6 }),
      hullDark: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7 }),
      deck: new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 }),
      barrier: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 }),
      mirror: new THREE.MeshStandardMaterial({ color: 0xbcd4e8, roughness: 0.2, metalness: 0.6 }),
      palmTrunk: new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.9 }),
      palmFrond: new THREE.MeshStandardMaterial({ color: 0x2e7d46, roughness: 0.9, flatShading: true }),
      grass: new THREE.MeshStandardMaterial({ color: 0x4c9a4f, roughness: 1, flatShading: true }),
      bush: new THREE.MeshStandardMaterial({ color: 0x3d8f45, roughness: 1, flatShading: true }),
      pole: new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.8 }),
      bottleGreen: new THREE.MeshStandardMaterial({ color: 0x7fbf7f, transparent: true, opacity: 0.8 }),
      bottleBlue: new THREE.MeshStandardMaterial({ color: 0x4f9fd0, transparent: true, opacity: 0.8 }),
    };
    this.M = M;

    // ── Shadow policy ─────────────────────────────────────────────────────
    // _box/_cylinder only cast shadows while _shadowOn is true. Major
    // structures (ground, piers, buildings, containers, cranes, boats, palm
    // trunks) build under the flag; every small prop (crates, pallets, bins,
    // benches, signs, cones…) builds with it off — so they never enter the
    // sun's shadow pass. One directional light casts; everything else static.
    this._shadowOn = true;
    this._buildGround(M);
    this._buildPiers(M);
    this._buildRecyclingCenter(M);
    this._shadowOn = false;
    this._buildUnloadingZone(M);
    this._shadowOn = true;
    this._buildStorageYard(M);
    this._buildWorkshops(M);
    this._buildMarineServices(M);
    this._buildVehicles(M);
    this._shadowOn = true;
    this._buildOfficesAndExtras(M); // offices are buildings → cast shadows
    this._shadowOn = false;
    this._buildInfrastructure(M);
    this._buildParkedBoats(M);
    this._buildScatter(M);
    this._buildVegetation(M);
    this._buildFloatingTrash(M);
    this._buildSigns(M);
    this._buildAmbient(M);

    // Collapse every static mesh into one geometry per shared material.
    this._mergeStatic();
  }

  // ── Landmass ────────────────────────────────────────────────────────────

  _buildGround(M) {
    // Main plaza slab: 260 wide (x) × 70 deep (z), top flush at y = 0.5.
    this._box(M.concrete, 260, 2.3, 70, 0, -0.65, 35, true);
    // Rear industrial yard: 260 × 60, seamlessly joined behind the plaza.
    this._box(M.concrete, 260, 2.3, 60, 0, -0.65, -30, true);

    // Subtle surface tint strips so the big plaza reads as poured concrete
    // sections rather than one flat slab (visual only, just above the surface).
    const strip = (x, z, xLen, zLen) =>
      this._box(M.strip, xLen, 0.05, zLen, x, 0.526, z, false, false);
    for (const x of [-100, -60, -20, 20, 60, 100]) strip(x, 35, 40, 0.12);
    for (const z of [10, 30, 50]) strip(0, z, 0.12, 20);
    for (const x of [-100, -60, -20, 20, 60, 100]) strip(x, -30, 40, 0.12);
    for (const z of [-45, -15]) strip(0, z, 0.12, 30);

    // Perimeter curb — visible, finite boundary (blocks walking off the edge).
    const curb = (px, pz, xLen, zLen) =>
      this._wall(this._box(M.curb, xLen, 0.45, zLen, px, 0.725, pz, true));
    curb(0, -60, 260, 0.6);            // rear yard back edge
    curb(-130, -30, 0.6, 60);           // rear yard left
    curb(130, -30, 0.6, 60);            // rear yard right
    curb(-130, 35, 0.6, 70);            // plaza left
    curb(130, 35, 0.6, 70);             // plaza right
    // Front edge of the plaza (z=70) — leave the five pier approaches open:
    //   P4 x -42..-30, P3 x -24..-10, P0 x -6..6, P1 x 10..24, P2 x 30..42
    const frontSegs = [
      { cx: -86, len: 88 },    // x -130..-42
      { cx: -27, len: 6 },     // x -30..-24
      { cx: -8, len: 4 },      // x -10..-6
      { cx: 8, len: 4 },       // x 6..10
      { cx: 27, len: 6 },      // x 24..30
      { cx: 86, len: 88 },     // x 42..130
    ];
    for (const seg of frontSegs) curb(seg.cx, 70, seg.len, 0.6);

    // ── Invisible shoreline walls ─────────────────────────────────────────
    this._invisibleWall(0, -60.3, 260, 0.2);   // rear yard back edge
    this._invisibleWall(-130.3, -30, 0.2, 60); // rear yard left
    this._invisibleWall(130.3, -30, 0.2, 60);  // rear yard right
    this._invisibleWall(-130.3, 35, 0.2, 70);  // plaza left
    this._invisibleWall(130.3, 35, 0.2, 70);   // plaza right
    // Plaza front gaps (pier approaches stay open).
    for (const seg of frontSegs) this._invisibleWall(seg.cx, 70.3, seg.len, 0.2);

    // ── Waterfront safety railings along the plaza's front solid sections ──
    this._railing(-130, 70, -42, 70, M);
    this._railing(-30, 70, -24, 70, M);
    this._railing(-10, 70, -6, 70, M);
    this._railing(6, 70, 10, 70, M);
    this._railing(24, 70, 30, 70, M);
    this._railing(42, 70, 130, 70, M);
  }

  // ── Piers ───────────────────────────────────────────────────────────────

  _buildPiers(M) {
    // Five large concrete piers reach into the ocean from the plaza front
    // (z=70). Each is 12m wide and 60–80m long, built to a real 1.75m
    // character scale: steel bollards ~1m tall, rubber tyres ~1m, lifebuoys,
    // ladders into the water, 6m light poles and heavy mooring ropes.
    //
    //   P0  x -6..6   central UNLOADING pier (boat berth at the tip)
    //   P1  x 10..24  east boat pier        (parked cleanup boats)
    //   P2  x 30..42  east industrial pier  (cargo crane + containers)
    //   P3  x -24..-10 west boat pier       (parked cleanup boats)
    //   P4  x -42..-30 west maintenance pier (boat lift + fuel station)

    const concretePier = (cx, cz, xLen, zLen, name) => {
      this._box(M.concrete, xLen, 1.1, zLen, cx, 0.25, cz, true);
      // Yellow safety edge markings along both long edges.
      const edge = (ex) => this._box(M.yellow, 0.35, 0.06, zLen, ex, 0.525, cz, false, false);
      edge(cx - xLen / 2 + 0.55);
      edge(cx + xLen / 2 - 0.55);
      // Expansion joints every 8m across the deck.
      for (let z = cz - zLen / 2 + 4; z < cz + zLen / 2; z += 8) {
        this._box(M.joint, xLen - 1.4, 0.04, 0.22, cx, 0.53, z, false, false);
      }
      // Side invisible walls (full pier length, blocks walking off the edge).
      this._invisibleWall(cx - xLen / 2 - 0.1, cz, 0.2, zLen);
      this._invisibleWall(cx + xLen / 2 + 0.1, cz, 0.2, zLen);
      return { x: cx, z: cz, xLen, zLen, name };
    };

    // ── P0: Central unloading pier (80m long) ────────────────────────────
    const unload = concretePier(0, 110, 12, 80, 'unload');
    // Bollards every ~6m along both edges (1m tall steel).
    this._bollardsAlong(unload, 1.6, [...Array(12)].map((_, i) => 74 + i * 6));
    // Rubber fender tyres along the berth side (east edge, z 88..120).
    this._tyresAlong(unload, 1.6, [86, 92, 98, 104, 110, 116]);
    // Ladders down to the water every 16m.
    for (const z of [80, 96, 112, 128]) this._ladder(0, z, 4.6, M);
    // Lifebuoys on brackets every 24m (alternating sides).
    for (const [i, z] of [[0, 82], [1, 106], [0, 130]]) {
      this._lifebuoyBracket(i === 0 ? -4.6 : 4.6, z, M);
    }
    // 6m dock lighting poles every ~16m.
    for (const z of [78, 94, 110, 126]) this._lightPole(z > 108 ? 4.8 : -4.8, z, M);

    // ── P1: East boat pier (60m) ──────────────────────────────────────────
    const eastBoat = concretePier(17, 100, 14, 60, 'eastBoat');
    this._bollardsAlong(eastBoat, 1.8, [...Array(10)].map((_, i) => 72 + i * 6));
    this._tyresAlong(eastBoat, 1.8, [76, 84, 92, 100, 108, 116, 124]);
    for (const z of [76, 92, 108, 124]) this._ladder(17, z, 5.2, M);
    this._lifebuoyBracket(12.6, 78, M);
    this._lifebuoyBracket(21.4, 104, M);
    for (const z of [78, 96, 114]) this._lightPole(z > 102 ? 21 : 13, z, M);

    // ── P2: East industrial pier (70m) — cargo crane + container staging ──
    const indEast = concretePier(36, 105, 12, 70, 'indEast');
    this._bollardsAlong(indEast, 1.6, [...Array(11)].map((_, i) => 72 + i * 6));
    this._tyresAlong(indEast, 1.6, [80, 90, 100, 110, 120]);
    for (const z of [80, 96, 112, 128]) this._ladder(36, z, 4.6, M);
    this._lifebuoyBracket(31.4, 84, M);
    this._lifebuoyBracket(40.6, 110, M);
    for (const z of [78, 96, 114, 132]) this._lightPole(z > 108 ? 40.6 : 31.4, z, M);
    // Big cargo crane dominating the pier skyline + staged containers.
    this._crane(30, 76, 0.6, M);
    this._container(38, 0, 86, M.blue, 0);
    this._container(34, 0, 92, M.red, 0);
    this._container(38, 2.6, 92, M.gray, 0);
    this._container(36, 0, 100, M.green, 0);
    this._bale(33, 118, M); this._bale(34.2, 118, M); this._bale(35.4, 118, M);
    this._pallet(33, 122, 0, M); this._pallet(34.2, 122, 0, M);
    this._crateStack(29, 76, M, 2);

    // ── P3: West boat pier (60m) ──────────────────────────────────────────
    const westBoat = concretePier(-17, 100, 14, 60, 'westBoat');
    this._bollardsAlong(westBoat, 1.8, [...Array(10)].map((_, i) => 72 + i * 6));
    this._tyresAlong(westBoat, 1.8, [76, 84, 92, 100, 108, 116, 124]);
    for (const z of [76, 92, 108, 124]) this._ladder(-17, z, 5.2, M);
    this._lifebuoyBracket(-12.6, 78, M);
    this._lifebuoyBracket(-21.4, 104, M);
    for (const z of [78, 96, 114]) this._lightPole(z > 102 ? -21 : -13, z, M);

    // ── P4: West maintenance pier (70m) — boat lift + fuel station ────────
    const westMaint = concretePier(-36, 105, 12, 70, 'westMaint');
    this._bollardsAlong(westMaint, 1.6, [...Array(11)].map((_, i) => 72 + i * 6));
    this._tyresAlong(westMaint, 1.6, [80, 90, 100, 110, 120]);
    for (const z of [80, 96, 112, 128]) this._ladder(-36, z, 4.6, M);
    this._lifebuoyBracket(-31.4, 84, M);
    this._lifebuoyBracket(-40.6, 110, M);
    for (const z of [78, 96, 114, 132]) this._lightPole(z > 108 ? -40.6 : -31.4, z, M);

    // Parked cleanup boats along the boat piers (different sizes).
    this._parkedBoat(15, 80, Math.PI, M.blue, 0.85, { cabin: true });
    this._parkedBoat(15, 98, Math.PI, M.white, 1.15, { cabin: true });
    this._parkedBoat(15, 118, Math.PI, M.red, 0.7, {});
    this._parkedBoat(-15, 82, Math.PI, M.green, 0.9, { cabin: true });
    this._parkedBoat(-15, 100, Math.PI, M.orange, 0.75, {});
    this._parkedBoat(-15, 118, Math.PI, M.blue, 1.3, { cabin: true, crane: true });

    // Mooring ropes tying the parked boats to their bollards.
    for (const [bx, bz] of [[15, 80], [15, 98], [15, 118], [-15, 82], [-15, 100], [-15, 118]]) {
      this._rope(new THREE.Vector3(bx + 1.1, 1.1, bz), new THREE.Vector3(bx + 1.1, 0.6, bz + 1.2), M.rope);
    }
  }

  /** Steel ladder descending into the water from a pier edge. */
  _ladder(x, z, edgeX, M) {
    const side = Math.sign(x - edgeX) || 1;
    const g = new THREE.Group();
    const railMat = M.metal;
    for (const off of [-0.25, 0.25]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), railMat);
      rail.position.set(x + off * side, 0.3, z);
      g.add(rail);
    }
    for (let i = 0; i < 6; i++) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.05), railMat);
      rung.position.set(x, 1.15 - i * 0.4, z);
      g.add(rung);
    }
    g.position.x = edgeX - x + 0.35;
    this.root.add(g);
  }

  /** Bright orange lifebuoy mounted on a bracket at the pier edge. */
  _lifebuoyBracket(x, z, M) {
    const g = new THREE.Group();
    const pole = this._cylinder(M.metal, 0.05, 0.06, 1.7, x, 0.85, z, false);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 16), M.orange);
    ring.position.set(x, 1.55, z);
    ring.rotation.y = Math.PI / 2;
    g.add(pole, ring);
    this.root.add(g);
  }

  /** Heavy mooring bollard (~1m tall steel post with head). */
  _bollardsAlong(pier, edgeOffset, zPositions) {
    for (const z of zPositions) {
      for (const side of [-1, 1]) {
        const bx = pier.x + side * (pier.xLen / 2 - edgeOffset);
        const g = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.05, 10), this.M.metal);
        post.position.y = 0.52;
        g.add(post);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.18, 10), this.M.gray);
        head.position.y = 1.05;
        g.add(head);
        g.position.set(bx, 0.5, z);
        this.root.add(g);
      }
    }
  }

  /** Rubber tyres hanging off the dock edges. */
  _tyresAlong(pier, edgeOffset, zPositions) {
    for (const z of zPositions) {
      for (const side of [-1, 1]) {
        const tyre = new THREE.Mesh(this._geo('torus', 0.42, 0.13, 8, 16), this.M.tire);
        tyre.position.set(pier.x + side * (pier.xLen / 2 - edgeOffset), 0.62, z);
        tyre.rotation.y = Math.PI / 2;
        this.root.add(tyre);
      }
    }
  }

  /** Simple low safety railing: posts + top rail along a line. */
  _railing(x1, z1, x2, z2, M) {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(x2 - x1, z2 - z1);
    const count = Math.max(2, Math.round(len / 3.5));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      this._wall(this._cylinder(M.darkWood, 0.07, 0.09, 1.3, x1 + (x2 - x1) * t, 1.0, z1 + (z2 - z1) * t));
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.1, 0.1), M.darkWood);
    rail.position.set(cx, 1.3, cz);
    rail.rotation.y = -ang;
    this.root.add(rail);
    this._wall(rail);
  }

  /** Sloped wooden ramp from a dock edge down to the waterline. */
  _slopedRamp(x, z, M) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 6), M.wood);
    ramp.position.set(x, 0.2, z);
    ramp.rotation.x = 0.1;
    this.root.add(ramp);
    this._wall(ramp);
  }

  // ── Recycling Center ─────────────────────────────────────────────────────

  _buildRecyclingCenter(M) {
    // Building footprint: x ∈ [-15,15], z ∈ [25,45], walls 8m high, front
    // (z=45) faces the unloading pier. Beige concrete walls, dark-green
    // gable roof. Three industrial loading bays along the front with big
    // roller shutters, hazard striping, bumpers, cameras and canopies.
    const WALL_H = 8;
    const FRONT = 45;

    // ── Front wall segments around the three loading-bay openings ────────
    // Opening centres at x = -8, 0, 8; each bay is 6m wide (4..6m spec).
    // Openings -11..-5, -3..3, 5..11; every other span below the lintel band
    // (y < 5.4) is solid wall so the player can't walk in beside the shutters.
    const bayW = 6;
    const BAY_H = 5.4;   // opening height — band above fills to the roof
    const solid = (x0, x1) => {
      const w = x1 - x0;
      if (w <= 0) return;
      const wall = this._box(M.beige, w, BAY_H, 0.4, (x0 + x1) / 2, BAY_H / 2, FRONT, false);
      this._wall(wall);
    };
    solid(-15, -11); solid(-5, -3); solid(3, 5); solid(11, 12);
    // Personnel door opening at x 12.5..14.7 — keep solid piers either side.
    solid(12, 12.5); solid(14.7, 15);
    // Centre pier columns between bay2's two shutter halves (visual mullions).
    // Slim and at the very opening edges (±2.9, outside the 5.7m shutter span
    // of -2.85..2.85) so neither the conveyor nor the shutter is obscured.
    this._wall(this._box(M.beige, 0.2, BAY_H, 0.4, -2.9, BAY_H / 2, FRONT, false));
    this._wall(this._box(M.beige, 0.2, BAY_H, 0.4, 2.9, BAY_H / 2, FRONT, false));
    // Band above the shutter openings (full width above bay height, no
    // overlap with the pier walls below).
    const band = this._box(M.beige, 30, WALL_H - BAY_H, 0.4, 0, (WALL_H + BAY_H) / 2, FRONT, false);
    this._wall(band);

    // ── Side walls ────────────────────────────────────────────────────────
    const wallL = this._box(M.beige, 0.4, WALL_H, 20, -15, WALL_H / 2, 35, false);
    this._wall(wallL);
    const wallR = this._box(M.beige, 0.4, WALL_H, 20, 15, WALL_H / 2, 35, false);
    this._wall(wallR);

    // ── Back wall with a plain doorway (visual) ───────────────────────────
    const back = this._box(M.beige, 30, WALL_H, 0.4, 0, WALL_H / 2, 25, false);
    this._wall(back);
    this._box(M.darkWood, 2, 2.6, 0.2, -5, 1.3, 24.75, false);

    // ── Loading bays: roller shutters + hazard trim + canopies ────────────
    for (const cx of [-8, 0, 8]) {
      // Rolled-up shutter panel covering the top of each opening.
      const panel = this._box(new THREE.MeshStandardMaterial({ color: 0x77808a, roughness: 0.6 }),
        bayW - 0.3, 1.8, 0.18, cx, 4.7, FRONT - 0.05, false);
      for (let i = 0; i < 7; i++) {
        this._box(new THREE.MeshStandardMaterial({ color: 0x5d666f, roughness: 0.7 }),
          bayW - 0.3, 0.04, 0.06, cx, 5.0 - i * 0.24, FRONT + 0.02, false, false);
      }
      void panel;
      // Drum cylinder above each opening.
      this._cylinder(M.gray, 0.34, 0.34, bayW + 0.5, cx, 5.9, FRONT, true);
      // Hazard striped trim around the door frame.
      this._hazardStripes(cx - bayW / 2 - 0.15, FRONT, 0.3, 5.4, 0, M, 2.7);
      this._hazardStripes(cx + bayW / 2 + 0.15, FRONT, 0.3, 5.4, 0, M, 2.7);
      this._hazardStripes(cx, FRONT, bayW + 0.3, 0.3, 0, M, 5.5);  // lintel at the top of the opening
      this._hazardStripes(cx, FRONT, bayW + 0.3, 0.3, 0, M, 0.62); // sill at the deck
      // Rubber loading bumper blocks on the deck in front of the bay.
      for (const bx of [-2.2, 0, 2.2]) {
        this._box(M.tire, 0.5, 0.4, 0.5, cx + bx, 0.45, FRONT + 0.5, false, false);
      }
      // Metal canopy extending ~2m out over the loading zone (overhead trim —
      // no collision; the character walks under it).
      this._box(M.gray, bayW + 1, 0.12, 2.4, cx, 5.55, FRONT + 1.1, false);
      this._wall(this._cylinder(M.gray, 0.09, 0.09, 5.4, cx - bayW / 2 - 0.4, 2.7, FRONT - 0.4));
      this._wall(this._cylinder(M.gray, 0.09, 0.09, 5.4, cx + bayW / 2 + 0.4, 2.7, FRONT - 0.4));
      // Warning light + security camera above each bay (decorative — no wall).
      const warn = new THREE.Mesh(this._geo('sphere', 0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
      warn.position.set(cx - 0.9, 5.85, FRONT - 0.3);
      this.root.add(warn);
      this._box(M.black, 0.28, 0.2, 0.4, cx + 0.9, 6.1, FRONT - 0.25, false, false);
      // Floodlight washing the loading zone at night.
      const flood = new THREE.SpotLight(0xffeaad, 3.0, 40, Math.PI / 3.2, 0.6, 1.4);
      flood.position.set(cx, 5.5, FRONT + 0.6);
      flood.target.position.set(cx, 0.3, FRONT + 4);
      this.root.add(flood.target);
      flood.userData.base = 3.0;
      this.root.add(flood);
      this._lights.push(flood);
      // Painted 6×8m unloading zone in front of each bay.
      const zoneTex = this._textureCanvas(256, 256, (g, w, h) => {
        g.fillStyle = '#1d5c37'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#ffe066'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
      });
      this._floorDecal(cx, FRONT + 6, 6, 8, zoneTex, 0);
    }

    // ── Big sign above the bays ───────────────────────────────────────────
    const signTex = this._recyclingSignTexture();
    this._signPlane(0, 7.1, FRONT + 0.25, 16, 1.9, signTex, Math.PI);

    // ── Personnel entrance (green canopy + door + small windows) ──────────
    this._box(M.green, 2.2, 2.8, 0.15, 13.6, 1.4, FRONT + 0.2, false);
    this._box(M.green, 3.2, 0.14, 1.7, 13.6, 4.2, FRONT - 0.1, false);
    this._wall(this._cylinder(M.green, 0.08, 0.08, 2.8, 12.5, 2.2, FRONT - 0.3));
    this._wall(this._cylinder(M.green, 0.08, 0.08, 2.8, 14.7, 2.2, FRONT - 0.3));
    // Small windows on the front wall — left one only, since the right side
    // is the personnel door opening (a pane at x=13 would float in mid-air).
    this._box(M.glass, 1.4, 1, 0.06, -13, 2.8, FRONT + 0.2, false, false);
    this._box(M.glass, 0.8, 0.9, 0.06, 11.5, 2.8, FRONT + 0.2, false, false);
    // Side wall industrial windows.
    for (const wz of [30, 35, 40]) {
      this._box(M.glass, 0.06, 1.2, 0.9, -15.26, 3.4, wz, false, false);
      this._box(M.glass, 0.06, 1.2, 0.9, 15.26, 3.4, wz, false, false);
    }

    // ── Roof: dark-green gable (ridge along x at z=35) ────────────────────
    const RISE = 0.9, HALF = 13.5;              // eaves overhang the walls
    const ang = Math.atan2(RISE, HALF);
    const roofLen = Math.hypot(HALF, RISE);
    const panel1 = new THREE.Mesh(new THREE.BoxGeometry(32, 0.16, roofLen), M.roofGreen);
    panel1.position.set(0, 8.55, 35 - HALF / 2); // back slope (ridge → back eave)
    panel1.rotation.x = -ang;
    this.root.add(panel1);
    const panel2 = new THREE.Mesh(new THREE.BoxGeometry(32, 0.16, roofLen), M.roofGreen);
    panel2.position.set(0, 8.55, 35 + HALF / 2); // front slope (ridge → front eave)
    panel2.rotation.x = ang;
    this.root.add(panel2);
    // Ridge cap, vents, exhaust pipes, gutters.
    this._box(M.roofGreen, 32.2, 0.22, 0.6, 0, 9.05, 35, false, false);
    for (const vx of [-10, 0, 10]) {
      this._box(M.metal, 1.1, 0.55, 1.1, vx, 9.4, 35, false, false);
    }
    for (const px of [-4, 4]) {
      this._cylinder(M.metal, 0.16, 0.16, 1.6, px, 9.3, 35, false, false);
    }
    this._box(M.metal, 30, 0.18, 0.18, 0, 8.0, FRONT + 0.6, false, false);
    this._box(M.metal, 30, 0.18, 0.18, 0, 8.0, 24.4, false, false);
    for (const cx of [-14.8, 14.8]) {
      this._cylinder(M.metal, 0.1, 0.1, 2.6, cx, 6.9, FRONT + 0.6, false, false);
    }

    // ── Interior: conveyor belt + sorting machinery (visible via bay 2) ──
    this._box(M.belt, 2.6, 0.32, 15, 0, 1.2, 36, false);
    for (let z = 30; z <= 43; z += 3) {
      this._box(M.gray, 0.15, 0.7, 0.15, -0.9, 0.85, z, false, false);
      this._box(M.gray, 0.15, 0.7, 0.15, 0.9, 0.85, z, false, false);
    }
    for (let z = 30; z <= 43; z += 4) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.4, 8), M.metal);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(0, 1.07, z);
      this.root.add(roller);
    }
    // Trash items riding the belt into the building (animated — excluded
    // from the static merge pass via userData.noMerge).
    const itemMats = [M.green, M.blue, M.yellow, M.red, M.gray];
    for (let i = 0; i < 5; i++) {
      const geo = i % 3 === 0
        ? this._geo('cyl', 0.15, 0.15, 0.45, 8)
        : this._geo('box', 0.34, 0.3, 0.34);
      const item = new THREE.Mesh(geo, itemMats[i % itemMats.length]);
      item.position.set((i % 2 === 0 ? -1 : 1) * 0.6, 1.5, 43 - i * 2.4);
      item.userData.noMerge = true;
      this.root.add(item);
      this._conveyorItems.push({ mesh: item, progress: i / 5, speed: 0.012 + i * 0.001 });
    }

    // Sorting station at the belt end: 3 colour bins.
    for (const [i, c] of [[-1, M.green], [0, M.blue], [1, M.yellow]]) {
      this._box(c, 0.9, 0.75, 0.9, i * 1.2, 0.9, 28.6, false, false);
    }

    // Compactor (big machine with an animated pressing ram — noMerge).
    this._box(M.green, 2.6, 2.6, 2.8, 5.5, 2.2, 33, false);
    this._box(M.gray, 0.55, 1.1, 0.9, 5.5, 2.8, 31.5, false, false);
    this._compactorRam = this._box(M.yellow, 1.6, 0.55, 1.6, 5.5, 3.8, 33, false, false);
    this._compactorRam.userData.noMerge = true;

    // Crusher machine with a rotating roller + feed funnel (roller noMerge).
    this._box(M.gray, 2.6, 2.4, 2.8, -5.5, 2.1, 33, false);
    this._crusherRoller = new THREE.Mesh(this._geo('cyl', 0.5, 0.5, 2, 12), M.metal);
    this._crusherRoller.position.set(-5.5, 3.4, 33);
    this._crusherRoller.rotation.z = Math.PI / 2;
    this._crusherRoller.userData.noMerge = true;
    this.root.add(this._crusherRoller);
    const funnel = new THREE.Mesh(this._geo('cone', 1, 1, 8), M.gray);
    funnel.position.set(-5.5, 4.5, 33);
    this.root.add(funnel);

    // Stacked storage containers inside the back corners.
    this._stackCrates(11, 39.5, M, 2);
    this._stackCrates(-11, 40.5, M, 2);

    // Interior warm light.
    const light = new THREE.PointLight(0xffd9a0, 0.9, 16, 2);
    light.position.set(0, 4.6, 36);
    this.root.add(light);
    this._lights.push(light);
  }

  /** Yellow/black diagonal hazard stripes on a thin box (door trim).
   * y is the vertical CENTRE of the stripe box (defaults to mid-height 2.7). */
  _hazardStripes(x, z, w, h, rotY, M, y = 2.7) {
    const tex = this._textureCanvas(64, 64, (g, cw, ch) => {
      g.fillStyle = '#c9a227';
      g.fillRect(0, 0, cw, ch);
      g.strokeStyle = '#1c1c1c';
      g.lineWidth = 14;
      for (let i = -2; i < 3; i++) {
        g.beginPath();
        g.moveTo(i * 32, ch);
        g.lineTo(i * 32 + 32, 0);
        g.stroke();
      }
    });
    const stripe = this._box(new THREE.MeshBasicMaterial({ map: tex }), w, h, 0.06, x, y, z, false, false);
    stripe.rotation.y = rotY;
  }

  _stackCrates(x, z, M, count) {
    for (let i = 0; i < count; i++) {
      this._box(M.wood, 1.1, 1.1, 1.1, x, 0.5 + 0.55 + i * 1.1, z, false, false);
    }
  }

  // ── Unloading zone (in front of the Recycling Center) ───────────────────

  _buildUnloadingZone(M) {
    // Glowing circular interaction marker embedded in the pier deck where the
    // player's boat docks to sell collected trash.
    const ring = new THREE.Mesh(
      this._geo('ring', 0.85, 1.3, 28),
      new THREE.MeshBasicMaterial({ color: 0x2bff88, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(4.8, 0.53, 90);
    ring.userData.noMerge = true;
    this.root.add(ring);

    const torus = new THREE.Mesh(this._geo('torus', 1.3, 0.12, 6, 24), M.green);
    torus.rotation.x = -Math.PI / 2;
    torus.position.set(4.8, 0.55, 90);
    torus.userData.noMerge = true;
    this.root.add(torus);
    this._marker = { ring, torus, base: 1, pulse: 0 };

    // Glow point light.
    const glow = new THREE.PointLight(0x2bff88, 1.1, 10, 2);
    glow.position.set(5.5, 1.6, 90);
    this.root.add(glow);
    this._lights.push(glow);

    // Painted "UNLOAD HERE" floor decal + arrow on the deck toward the berth.
    const decal = this._textureCanvas(512, 128, (g, w, h) => {
      g.fillStyle = '#0e5c33'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.font = 'bold 56px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('UNLOAD HERE', w / 2, h / 2);
    });
    this._floorDecal(4.6, 88.5, 4.4, 1.1, decal, 0);
    const arrowTex = this._textureCanvas(256, 128, (g, w, h) => {
      g.fillStyle = '#0e5c33'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      this._drawArrow(g, w / 2, h / 2, 72, false);
    });
    this._floorDecal(4.6, 86.5, 1.8, 0.9, arrowTex, -Math.PI / 2);  // +z → the boat berth
    // Painted directional arrows on the plaza guiding players toward the center.
    this._floorDecal(-55, 40, 2.2, 1.1, arrowTex, 0);               // +x → center
    this._floorDecal(55, 40, 2.2, 1.1, arrowTex, Math.PI);          // −x → center

    // "TURN TRASH INTO CASH" scoreboard beside the unloading apron.
    const scoreTex = this._textureCanvas(1024, 256, (g, w, h) => {
      g.fillStyle = '#123b26'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2bff88'; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#2bff88';
      this._fitText(g, 'TURN TRASH INTO CASH', w / 2, h / 2, w - 80, 110);
    });
    this._signBoard(8, 0, 60, 6.5, 1.7, scoreTex, -Math.PI / 2);

    // A few stacked recycling bins waiting to be processed + bags nearby.
    this._binStation(-3.1, 63, M);
    this._garbageBag(-1.5, 64);
    this._garbageBag(-0.8, 63.2);
    this._barrel(4.5, 63, M.metal);
  }

  // ── Outdoor storage yard (large fenced container + bale yard) ───────────

  _buildStorageYard(M) {
    // Big fenced yard on the east rear extension: x 30..115, z -55..-8.
    const fence = (x1, z1, x2, z2) => this._fence(x1, z1, x2, z2, M);
    fence(30, -55, 115, -55);
    fence(115, -55, 115, -8);
    fence(30, -55, 30, -8);
    fence(30, -8, 60, -8);   // gate gap x 60..90
    fence(90, -8, 115, -8);
    this._gateSign(92, -7.5, M);
    this._gateSign(57, -7.5, M);
    // Invisible walls along the yard fence (gate gap x 60..90 on the front).
    this._invisibleWall(72.5, -55.3, 85, 0.2);  // back edge
    this._invisibleWall(115.3, -31.5, 0.2, 47); // right edge
    this._invisibleWall(29.7, -31.5, 0.2, 47);  // left edge
    this._invisibleWall(45, -8.3, 30, 0.2);     // front (x 30..60)
    this._invisibleWall(102.5, -8.3, 25, 0.2);  // front (x 90..115)

    // Sliding security gate frame at the entrance.
    this._slidingGate(75, -8, M);

    // Painted forklift lanes through the yard.
    const laneTex = this._textureCanvas(512, 64, (g, w, h) => {
      g.fillStyle = '#c9a227'; g.fillRect(0, 0, w, h);
      g.setLineDash([24, 18]);
      g.strokeStyle = '#3d3d3d'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
    });
    this._floorDecal(72.5, -20, 36, 2.4, laneTex, Math.PI / 2);
    this._floorDecal(72.5, -40, 36, 2.4, laneTex, Math.PI / 2);

    // Container rows (6m long, 2.6m tall, max 2 high) in organized bays.
    const colors = [M.blue, M.green, M.red, M.gray, M.yellow, M.orange];
    const rows = [
      { z: -45, xs: [38, 48, 58, 68, 78, 88, 98, 108] },
      { z: -33, xs: [38, 48, 58, 68, 78, 88, 98, 108] },
      { z: -21, xs: [38, 48, 58, 68, 78, 88, 98, 108] },
      { z: -12, xs: [40, 52, 64, 76, 88, 100] },
    ];
    for (const row of rows) {
      for (const x of row.xs) {
        this._container(x, 0, row.z, colors[Math.floor(Math.random() * colors.length)], 0);
        if (Math.random() < 0.5) {
          this._container(x + 0.1, 2.6, row.z - 0.1,
            colors[Math.floor(Math.random() * colors.length)], 0);
        }
      }
    }

    // Wrapped recycling bale stacks (colour-coded) + pallet stacks.
    for (let i = 0; i < 4; i++) this._bale(44 + i * 3.2, -50, M);
    for (let i = 0; i < 3; i++) this._bale(44 + i * 3.2, -46, M);
    this._palletStack(64, -50, M, 3);
    this._palletStack(66, -51, M, 3);
    this._cableSpool(100, -50, M);
    this._cableSpool(101.4, -50, M);
    this._crate(100, -44, M);
    this._barrelCluster(96, -48, M, [M.red, M.metal]);
  }

  /** Steel sliding security gate frame (visual) at a yard entrance. */
  _slidingGate(x, z, M) {
    const g = new THREE.Group();
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), M.metal);
    post1.position.set(-3.5, 1.3, 0);
    g.add(post1);
    const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), M.metal);
    post2.position.set(3.5, 1.3, 0);
    g.add(post2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.2, 0.2), M.metal);
    top.position.y = 2.55;
    g.add(top);
    // Corrugated sliding panel pulled half-open.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.6 }));
    panel.position.set(-1.5, 1.15, 0);
    g.add(panel);
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 0.16), M.gray);
      rib.position.set(-1.5, 0.4 + i * 0.38, 0);
      g.add(rib);
    }
    g.position.set(x, 0.5, z);
    this.root.add(g);
    this._wall(panel);
  }

  // ── Maintenance workshops + covered sheds (west rear yard) ───────────────

  _buildWorkshops(M) {
    // Workshop 1: large boat repair workshop (24m wide × 14m deep).
    this._workshop(-95, -40, 24, 14, M, { door: true });
    // Workshop 2: engine + machinery workshop.
    this._workshop(-65, -40, 18, 14, M, { door: true });
    // Fuel depot between the workshops (fenced, tanks + pumps).
    this._fuelTank(-44, -34, M);
    this._fuelTank(-50, -34, M);
    this._fuelPump(-37, -34, M);
    const fence = (x1, z1, x2, z2) => this._fence(x1, z1, x2, z2, M);
    fence(-56, -42, -34, -42);
    fence(-56, -42, -56, -30);
    fence(-34, -42, -34, -30);
    fence(-56, -30, -47, -30);   // front fence — gate gap x -47..-34
    this._invisibleWall(-45, -42.3, 22, 0.2);
    this._invisibleWall(-56.3, -36, 0.2, 12);
    this._invisibleWall(-34.3, -36, 0.2, 12);
    this._invisibleWall(-51.5, -30.3, 9, 0.2);
    this._gateSign(-46, -30.5, M);

    // Covered equipment sheds along the rear wall.
    this._coveredShed(-110, -20, 10, 8, M);
    this._coveredShed(-96, -20, 10, 8, M);
    this._coveredShed(-110, -8, 10, 8, M);
    this._coveredShed(-96, -8, 10, 8, M);

    // Repair equipment outside the workshops (spare prop, engines, welder).
    this._spareProp(-84, -30, M);
    this._spareEngine(-76, -30, M);
    this._spareEngine(-78, -31.4, M);
    this._weldingCart(-58, -20, M);
    this._airCompressor(-54, -22, M);
    this._barrelCluster(-52, -18, M, [M.red, M.metal]);
    this._trafficCone(-87, -25, M);
    this._trafficCone(-85, -25.6, M);
    this._pallet(-90, -22, 0, M);
    this._pallet(-89, -23, 0.5, M);
    this._cableSpool(-82, -24, M);
  }

  /** Large maintenance workshop: beige walls, green roof, big open door so the
   * interior equipment is visible from the yard (real opening, not a slab). */
  _workshop(x, z, w, d, M, opts = {}) {
    const h = 6.2;
    const front = z + d / 2;
    const doorW = Math.min(w * 0.5, 9);
    // Front wall = two solid sections either side of the door opening.
    const leftW = (w - doorW) / 2;
    if (leftW > 0.4) {
      const fl = this._box(M.beige, leftW, h, 0.4, x - (doorW + leftW) / 2, h / 2, front, false);
      this._wall(fl);
      const fr = this._box(M.beige, leftW, h, 0.4, x + (doorW + leftW) / 2, h / 2, front, false);
      this._wall(fr);
    }
    // Band above the door opening.
    if (h - 3.8 > 0.4) {
      const band = this._box(M.beige, doorW, h - 3.8, 0.4, x, (h + 3.8) / 2, front, false);
      this._wall(band);
    }
    // Side + back walls.
    for (const sx of [-1, 1]) {
      const side = this._box(M.beige, 0.4, h, d, x + sx * w / 2, h / 2, z, false);
      this._wall(side);
    }
    const back = this._box(M.beige, w, h, 0.4, x, h / 2, z - d / 2, false);
    this._wall(back);
    // Skylights along the roof ridge.
    const ang = Math.atan2(0.9, d / 2);
    const roofLen = Math.hypot(d / 2, 0.9);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.18, roofLen), M.roofGreen);
      p.position.set(x, h + 0.45, z + side * d / 4);
      p.rotation.x = side * ang;
      this.root.add(p);
    }
    this._box(M.roofGreen, w + 1.2, 0.24, 0.6, x, h + 1.15, z, false, false);
    for (const sx of [-w / 4, 0, w / 4]) {
      this._box(M.glass, 1.4, 0.25, 1.4, x + sx, h + 1.2, z, false, false);
    }
    // Hazard lintel + door frame.
    this._hazardStripes(x, front - 0.05, doorW + 0.4, 0.3, 0, M, 3.95);
    this._hazardStripes(x - doorW / 2 - 0.1, front - 0.05, 0.3, 3.8, 0, M, 1.9);
    this._hazardStripes(x + doorW / 2 + 0.1, front - 0.05, 0.3, 3.8, 0, M, 1.9);
    // Rolled-up shutter panel at the top of the opening.
    this._box(M.gray, doorW - 0.3, 1.2, 0.16, x, 3.25, front - 0.04, false, false);
    this._cylinder(M.gray, 0.3, 0.3, doorW + 0.4, x, 4.15, front - 0.05, false);
    // Tool rack + workbench VISIBLE through the open door (no collision —
    // it's decorative interior clutter, keeps the raycast list short).
    this._box(M.darkWood, 3.2, 2.2, 0.3, x - 2.6, 1.1, z - d / 2 + 1.2, false, false);
    for (let i = 0; i < 4; i++) {
      this._box(M.metal, 0.08, 0.5, 0.1, x - 2.6 + i * 0.75, 2.5, z - d / 2 + 1.2, false, false);
    }
    this._box(M.wood, 4.2, 0.12, 1.5, x + 1.6, 0.8, z - d / 2 + 2, false, false);
    this._barrel(x + 3.2, z - d / 2 + 3, M.red);
  }

  /** Open-sided equipment shed on steel columns. */
  _coveredShed(x, z, w, d, M) {
    // Roof is 3.9 m up — well above the 1.75 m character's horizontal probes,
    // so it doesn't need to be a wall collider (only the columns block).
    this._box(M.gray, w, 0.16, d, x, 3.9, z, false);
    const cols = [
      [x - w / 2 + 0.4, z - d / 2 + 0.4], [x + w / 2 - 0.4, z - d / 2 + 0.4],
      [x - w / 2 + 0.4, z + d / 2 - 0.4], [x + w / 2 - 0.4, z + d / 2 - 0.4],
      [x, z],
    ];
    for (const [cx, cz] of cols) {
      this._wall(this._cylinder(M.gray, 0.12, 0.12, 3.9, cx, 1.95, cz));
    }
    // Equipment inside: pallet jack / generator / compressor / tool cabinet.
    this._palletJack(x - 1.5, z, M);
    this._generator(x + 1.5, z - 1, M);
    this._toolCabinet(x + 0.5, z + 1.5, M);
  }

  /** Big bronze/steel spare propeller on a stand. */
  _spareProp(x, z, M) {
    const hub = new THREE.Mesh(this._geo('cyl', 0.22, 0.22, 0.5, 8), M.metal);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 1.15, z);
    this.root.add(hub);
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.4), M.yellow);
      blade.position.set(x, 1.15, z);
      blade.rotation.y = (i / 3) * Math.PI * 2;
      blade.rotation.z = 0.5;
      this.root.add(blade);
    }
  }

  /** Spare boat engine block on the ground. */
  _spareEngine(x, z, M) {
    this._box(M.gray, 1.1, 0.7, 0.9, x, 0.35, z, false, false);
    this._box(M.darkWood, 1.2, 0.25, 1.0, x, 0.13, z, false, false);
  }

  /** Welding cart with gas bottles. */
  _weldingCart(x, z, M) {
    this._box(M.red, 0.9, 0.6, 0.5, x, 0.3, z, false, false);
    this._cylinder(M.metal, 0.16, 0.16, 1.1, x - 0.25, 0.85, z, false);
    this._cylinder(M.red, 0.16, 0.16, 1.1, x + 0.25, 0.85, z, false);
  }

  /** Portable air compressor. */
  _airCompressor(x, z, M) {
    this._box(M.yellow, 1.3, 0.8, 0.8, x, 0.5, z, false, false);
    this._cylinder(M.gray, 0.28, 0.28, 0.9, x, 0.9, z, false);
    this._cylinder(M.metal, 0.08, 0.08, 0.8, x, 1.55, z);
  }

  /** Small diesel generator. */
  _generator(x, z, M) {
    this._box(M.green, 1.2, 0.7, 0.7, x, 0.4, z, false, false);
    this._box(M.gray, 0.4, 0.3, 0.5, x, 0.6, z, false, false);
    this._cylinder(M.metal, 0.07, 0.07, 0.5, x, 1.1, z);
  }

  /** Rolling tool cabinet. */
  _toolCabinet(x, z, M) {
    this._box(M.metal, 0.8, 1.0, 0.6, x, 0.5, z, false, false);
    for (let i = 0; i < 3; i++) {
      this._box(M.gray, 0.82, 0.06, 0.62, x, 0.3 + i * 0.32, z, false, false);
    }
    this._cylinder(M.metal, 0.06, 0.06, 0.7, x, 1.2, z);
  }

  // ── Marine services: boat lift + sloped ramp + fuel station ─────────────

  _buildMarineServices(M) {
    // Marine fuel station at the head of the west maintenance pier (P4).
    this._fuelStation(-36, 76, M);

    // Boat travel lift straddling the maintenance pier with a boat hoisted.
    this._travelLift(-36, 118, M);

    // Sloped concrete boat ramp descending into the water at the pier end.
    this._boatRamp(-36, 138, M);

    // Cargo crane dominating the west maintenance pier skyline.
    this._crane(-30, 78, -0.6, M);
  }

  /** Marine fuel station: 2 pumps, canopy, containment, kiosk, sign. */
  _fuelStation(x, z, M) {
    // Painted fueling zone.
    const zoneTex = this._textureCanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#1d3a5c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    });
    this._floorDecal(x, z, 10, 7, zoneTex, 0);
    // Spill containment curb.
    this._box(M.yellow, 10.6, 0.2, 7.6, x, 0.42, z, false, false);

    // Two fuel pumps (~2m tall) + hose reels.
    for (const px of [-1.6, 1.6]) {
      const pump = this._box(M.yellow, 0.8, 2.0, 0.7, x + px, 1.0, z - 1, false, false);
      this._wall(pump);
      this._box(M.glass, 0.5, 0.4, 0.1, x + px, 1.5, z - 0.63, false, false);
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 12), M.tire);
      hose.position.set(x + px, 1.35, z - 0.2);
      this.root.add(hose);
    }
    // Canopy ~5m high on steel posts (overhead — no collision, posts only).
    for (const [ox, oz] of [[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]]) {
      this._wall(this._cylinder(M.gray, 0.14, 0.14, 4.8, x + ox, 2.4, z + oz));
    }
    this._box(M.gray, 11, 0.2, 8, x, 4.9, z, false);
    this._box(M.blue, 11, 0.12, 8, x, 4.85, z, false, false);
    // Payment kiosk booth.
    this._wall(this._box(M.white, 1.6, 2.3, 1.6, x + 6, 1.15, z + 1, false, false));
    this._box(M.glass, 1.3, 0.7, 0.08, x + 6, 1.6, z + 0.25, false, false);
    // Emergency shutoff + fire extinguisher + pricing board.
    this._box(M.red, 0.5, 0.5, 0.15, x - 6, 1.25, z - 2, false, false);
    this._cylinder(M.red, 0.09, 0.11, 0.55, x - 6.8, 0.9, z - 2, false);
    const priceTex = this._textureCanvas(256, 128, (g, w, h) => {
      g.fillStyle = '#123b26'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2bff88'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('MARINE FUEL', w / 2, 30);
      g.font = 'bold 30px Arial'; g.fillStyle = '#ffffff';
      g.fillText('$ 1.99 / L', w / 2, 78);
    });
    // Faces −z toward the plaza/pier approach (players never approach from the sea).
    this._signPlane(x, 3.9, z + 5, 2.4, 1.2, priceTex, Math.PI);
  }

  /** Large boat travel lift gantry (10–12m tall) with a hoisted boat. */
  _travelLift(x, z, M) {
    const g = new THREE.Group();
    const LEG_H = 8.5;
    // Two A-frame legs spanning the pier (12m track).
    for (const side of [-5.2, 5.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, LEG_H, 1.1), M.yellow);
      leg.position.set(side, LEG_H / 2, 0);
      g.add(leg);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.9), M.gray);
      beam.position.set(side, LEG_H - 0.5, 0);
      g.add(beam);
    }
    // Top cross beam + operator cab.
    const top = new THREE.Mesh(new THREE.BoxGeometry(13.5, 1.0, 1.4), M.yellow);
    top.position.set(0, LEG_H + 0.2, 0);
    g.add(top);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 1.8), M.gray);
    cab.position.set(-2, LEG_H + 1.4, 0);
    g.add(cab);
    const cabWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.1), M.glass);
    cabWin.position.set(-2, LEG_H + 1.5, -0.95);
    g.add(cabWin);
    // Lifting straps hanging down to the suspended boat hull (full 7 m run
    // from the cross beam so the boat reads as genuinely hoisted).
    for (const [sx, sz] of [[-2.2, 0], [2.2, 0]]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6.5, 0.18), M.black);
      strap.position.set(sx, 4.7, sz);
      g.add(strap);
    }
    // Hoisted boat hull suspended between the straps.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 6), M.green);
    hull.position.set(0, 1.9, 0);
    g.add(hull);
    const hullStrap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 5.9), M.black);
    hullStrap.position.set(0, 1.4, 0);
    g.add(hullStrap);
    // Oversized rubber tires.
    for (const [tx, tz] of [[-5.2, 2.6], [5.2, 2.6], [-5.2, -2.6], [5.2, -2.6]]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 12), M.tire);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(tx, 0.8, tz);
      g.add(tire);
    }
    // Warning beacon.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    beacon.position.set(0, LEG_H + 1.2, 1.2);
    g.add(beacon);
    // Warning sign at the lift base.
    const warnTex = this._textureCanvas(128, 128, (g, w, h) => {
      g.fillStyle = '#c9a227'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1c1c1c'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('CAUTION', w / 2, h / 2);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: warnTex }));
    sign.position.set(-6.4, 2.2, 0);
    g.add(sign);
    g.position.set(x, 0.5, z);
    this.root.add(g);
    // No _wall on the top beam: it is ~8.7 m up and unreachable by the
    // character's horizontal probes — only the legs/hull at ground level block.
  }

  /** Sloped concrete boat ramp with traction grooves + side rails. */
  _boatRamp(x, z, M) {
    // Main sloping slab from deck height (y 0.5) down into the water.
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.35, 14), M.concrete);
    ramp.position.set(x, 0.05, z + 3);
    ramp.rotation.x = -0.12;
    ramp.receiveShadow = true;
    this.root.add(ramp);
    this.colliders.push(ramp);
    this._wall(ramp);
    // Traction grooves (visual ribs).
    for (let i = 0; i < 7; i++) {
      this._box(M.curb, 6.6, 0.05, 0.18, x, 0.28, z + 2.4 + i * 1.8, false, false);
    }
    // Concrete side walls.
    this._box(M.concrete, 0.5, 0.6, 14, x - 4.2, 0.35, z + 3, false, false);
    this._box(M.concrete, 0.5, 0.6, 14, x + 4.2, 0.35, z + 3, false, false);
    // Drainage channel at the top.
    this._box(M.curb, 7, 0.12, 0.5, x, 0.52, z - 4.5, false, false);
    this._trafficCone(x - 3.4, z - 2, M);
    this._trafficCone(x + 3.4, z - 2, M);
  }

  // ── Parked industrial vehicles (forklifts, trucks, carts) ───────────────

  _buildVehicles(M) {
    // Forklift parking zone near the Recycling Center.
    this._forklift(20, 34, Math.PI / 2, M);
    this._forklift(27, 40, -Math.PI / 2, M);
    this._forklift(20, 46, Math.PI / 2, M);
    // Forklifts working around the storage yard.
    this._forklift(62, -20, Math.PI, M);
    this._forklift(100, -30, 0, M);
    // Utility pickup trucks.
    this._pickupTruck(-45, 42, M);
    this._pickupTruck(85, 20, M);
    // Electric maintenance carts.
    this._electricCart(62, 28, M);
    this._electricCart(-58, 28, M);
    // Pallet jack + pallets beside the forklifts.
    this._palletJack(16, 40, M);
    for (const [px, pz, rot] of [[30, 30, 0], [31.2, 30, 0.35], [32.4, 30, 0.7]]) {
      this._pallet(px, pz, rot, M);
    }
    this._pallet(96, -44, 0, M);
    this._pallet(97.2, -44, 0.3, M);
    this._barrelCluster(18, 36, M, [M.red, M.metal]);
    this._crate(28, 36, M.wood);
    this._container(33, 0, 28, M.blue, 0);
    this._container(40, 0, 28, M.green, 0);
    this._container(33, 2.6, 28, M.gray, 0);
    this._container(47, 0, 32, M.red, 0);
  }

  /** Small electric maintenance cart (~2.5m long). */
  _electricCart(x, z, M) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 2.0), M.white);
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), M.green);
    bin.position.set(0, 1.0, -0.4);
    g.add(bin);
    for (const px of [-0.5, 0.5]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), M.tire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(px, 0.18, -0.7);
      g.add(wheel);
      const wheel2 = wheel.clone();
      wheel2.position.z = 0.7;
      g.add(wheel2);
    }
    g.position.set(x, 0.1, z);
    g.rotation.y = Math.random() > 0.5 ? Math.PI : 0;
    this.root.add(g);
    this._wall(body);
  }

  // ── Offices, light poles, utilities ─────────────────────────────────────

  _buildOfficesAndExtras(M) {
    // Harbour office building (west plaza) with windows + AC unit.
    const office = this._box(M.beige, 12, 4.2, 8, -60, 2.1, 52, false);
    this._wall(office);
    this._box(M.roofGreen, 12.8, 0.24, 8.8, -60, 4.4, 52, false, false);
    for (const wx of [-64, -56]) {
      this._box(M.glass, 1.8, 1.3, 0.1, wx, 2.4, 56.05, false, false);
    }
    this._box(M.darkWood, 1.4, 2.6, 0.12, -60, 1.3, 48.1, false, false);
    this._box(M.white, 2.2, 0.7, 0.7, -64, 4.7, 50, false, false);

    // Second small office / weigh station near the storage yard gate.
    const office2 = this._box(M.beige, 8, 3.4, 6, 62, 1.7, -4, false);
    this._wall(office2);
    this._box(M.roofGreen, 8.6, 0.2, 6.6, 62, 3.6, -4, false, false);
    this._box(M.glass, 1.4, 1, 0.1, 62, 2.0, -0.95, false, false);

    // Utility poles with crossarms + electrical boxes along the rear.
    for (const px of [-110, -80, -20, 20, 80, 110]) this._utilityPole(px, -50, M);
    for (const px of [-90, -40, 10, 40, 90]) this._utilityPole(px, -25, M);
    this._electricalBox(10, -22, M);
    this._electricalBox(-80, -15, M);

    // Light poles along the waterfront and rear yard (6–8m industrial).
    for (const lx of [-110, -80, -50, -20, 20, 50, 80, 110]) this._lightPole(lx, 68, M);
    for (const lx of [-100, -60, -20, 20, 60, 100]) this._lightPole(lx, -30, M);

    // Traffic cones + warning signs near industrial edges.
    this._trafficCone(-16, 2, M);
    this._trafficCone(-14, 1, M);
    this._trafficCone(16, 2, M);
    this._trafficCone(18, 1, M);
  }

  // ── Harbour infrastructure: transformers, hydrants, mirrors, crossings ──

  _buildInfrastructure(M) {
    // Electrical transformers on pads.
    this._transformer(8, -30, M);
    this._transformer(-20, -28, M);
    this._transformer(70, -34, M);
    // Fire hydrants.
    this._hydrant(-30, 6, M);
    this._hydrant(30, 6, M);
    this._hydrant(-60, -26, M);
    this._hydrant(60, -26, M);
    this._hydrant(0, -50, M);
    // Drainage grates + stormwater channels (visual decals).
    const grateTex = this._textureCanvas(128, 64, (g, w, h) => {
      g.fillStyle = '#5f6368'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#23252a';
      for (let i = 0; i < 6; i++) g.fillRect(4 + i * 20, 4, 6, h - 8);
    });
    for (const [gx, gz] of [[-10, 40], [10, 40], [-10, 55], [10, 55], [50, 30], [-50, 30], [90, -30], [-90, -30]]) {
      this._floorDecal(gx, gz, 1.8, 0.9, grateTex, 0);
    }
    // Concrete barriers along plaza edges.
    this._concreteBarrier(-126, 30, 0, M);
    this._concreteBarrier(126, 30, 0, M);
    this._concreteBarrier(-126, -45, 0, M);
    this._concreteBarrier(126, -45, 0, M);
    // Traffic mirrors at yard corners.
    this._trafficMirror(29, -8, M);
    this._trafficMirror(115, -8, M);
    // Pedestrian crossing + painted forklift lanes near the office.
    const crossTex = this._textureCanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#5f6368'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) g.fillRect(i * 28 + 10, 30, 14, h - 60);
    });
    this._floorDecal(-60, 44, 8, 4, crossTex, 0);
    const laneTex = this._textureCanvas(256, 64, (g, w, h) => {
      g.fillStyle = '#3d3d3d'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c9a227'; g.lineWidth = 5;
      g.strokeRect(5, 5, w - 10, h - 10);
    });
    this._floorDecal(20, 32, 6, 14, laneTex, Math.PI / 2);
    // Painted vehicle parking spaces.
    const spotTex = this._textureCanvas(128, 256, (g, w, h) => {
      g.fillStyle = '#5f6368'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 6;
      g.strokeRect(6, 6, w - 12, h - 12);
    });
    for (const [px, pz] of [[-70, 40], [-66, 40], [56, 20], [60, 20]]) {
      this._floorDecal(px, pz, 2.8, 5, spotTex, 0);
    }
  }

  /** Pad-mounted electrical transformer with tank + bushings. */
  _transformer(x, z, M) {
    const pad = this._box(M.concrete, 2.4, 0.3, 1.8, x, 0.15, z, false, false);
    const tank = this._box(M.gray, 1.7, 1.5, 1.2, x, 1.0, z, false, false);
    this._wall(tank);
    for (let i = 0; i < 3; i++) {
      this._cylinder(M.gray, 0.05, 0.05, 0.5, x - 0.4 + i * 0.4, 1.9, z, false);
    }
    this._box(M.green, 1.7, 0.1, 1.2, x, 0.35, z, false, false);
    void pad;
  }

  /** Red fire hydrant (~1m tall). */
  _hydrant(x, z, M) {
    const base = this._cylinder(M.red, 0.16, 0.2, 0.7, x, 0.35, z, false);
    const cap = this._cylinder(M.red, 0.12, 0.14, 0.4, x, 0.85, z, false);
    void cap;
  }

  /** Jersey concrete barrier. */
  _concreteBarrier(x, z, rotY, M) {
    const barrier = this._box(M.concrete, 2.2, 0.85, 0.55, x, 0.42, z, false, false);
    this._wall(barrier);
    barrier.rotation.y = rotY;
    this._box(M.yellow, 2.2, 0.12, 0.57, x, 0.72, z, false, false);
  }

  /** Convex traffic mirror on a pole. */
  _trafficMirror(x, z, M) {
    this._cylinder(M.metal, 0.06, 0.08, 3.2, x, 1.6, z, false);
    const mirror = new THREE.Mesh(this._geo('sphere', 0.32, 10, 8), M.mirror);
    mirror.position.set(x, 3.1, z + 0.3);
    this.root.add(mirror);
  }

  // ── Parked cleanup boats (decorative, hinting at future upgrades) ───────

  _buildParkedBoats(M) {
    // Parked boats live on the boat piers (see _buildPiers) so they read as
    // docked alongside their berths with mooring ropes.
  }

  // ── Scattered marina props (life rings, anchors, nets, equipment) ───────

  _buildScatter(M) {
    this._lifeRing(1.6, 1.1, 74, M.red);
    this._lifeRing(-1.6, 1.1, 74, M.red);
    this._lifeRing(30.5, 1.1, 92, M.red);
    this._lifeRing(-30.5, 1.1, 92, M.red);
    this._lifeRing(11, 1.1, 120, M.red);
    this._lifeRing(-11, 1.1, 120, M.red);

    this._anchor(35, 74, M);
    this._anchor(-35, 74, M);
    this._anchor(42, 120, M);
    this._anchor(-42, 120, M);

    this._net(-1, 0.62, 79, M.rope);
    this._net(1.2, 0.62, 80.5, M.rope);
    this._net(36.5, 0.62, 78, M.rope);
    this._net(13, 0.62, 112, M.rope);
    this._net(-13, 0.62, 112, M.rope);

    // Floating buoys bobbing in the water off the piers.
    this._floatingBuoy(8.5, 84, M);
    this._floatingBuoy(-8.5, 86, M);
    this._floatingBuoy(26, 76, M);
    this._floatingBuoy(-26, 76, M);
    this._floatingBuoy(44, 90, M);
    this._floatingBuoy(-44, 92, M);
    this._floatingBuoy(45, 120, M);
    this._floatingBuoy(-45, 120, M);

    // Fishing crates + maintenance equipment on the piers.
    this._fishCrate(1.5, 76, M);
    this._fishCrate(2.4, 76.4, M);
    this._fishCrate(-1.2, 78, M);
    this._fishCrate(35, 84, M);
    this._fishCrate(36, 84.5, M);
    this._fishCrate(17.5, 84, M);
    this._fishCrate(-17.5, 84, M);
    this._crate(-35, 80, M);
    // Plastic bottle piles near the recycling center (land-based pollution).
    this._bottlePile(10, 62, M);
    this._bottlePile(-5.2, 64, M);
    this._cableSpool(-33, 84, M);
    this._barrelCluster(1.8, 79.5, M, [M.metal, M.red]);
  }

  // ── Vegetation & landscaping ────────────────────────────────────────────

  _buildVegetation(M) {
    // Palm trees along the plaza edges, near the office and green areas.
    const palms = [[-126, 12], [126, 12], [-126, 55], [126, 55], [-110, 20], [110, 20],
    [-98, 58], [98, 58], [-70, 58], [70, 58], [-52, 62], [52, 62], [-110, 62], [110, 62],
    [22, 8], [-22, 8], [66, 6], [-66, 6], [30, 62], [-30, 62], [80, -52], [-80, -52]];
    for (const [x, z] of palms) this._palmTree(x, z, (1 + (Math.abs(x) % 3) * 0.08) * 2.2, M);

    // Grass patches growing through the concrete.
    const grass = [[-38, 40], [-36, 41], [38, 40], [36, 41], [-12, 10], [12, 10],
    [26, 44], [-26, 44], [54, 50], [-54, 50], [70, 50], [-70, 50], [0, -12], [4, -14],
    [96, 8], [-96, 8], [110, -20], [-110, -20], [16, -40], [-16, -40]];
    for (const [x, z] of grass) this._grassPatch(x, z, M);

    // Shrubs + flowers near the office and the recycling center.
    this._bush(-66, 55, M);
    this._bush(-54, 55, M);
    this._bush(8, 48, M);
    this._bush(-8, 48, M);
    this._bush(14, 26, M);
    this._bush(-14, 26, M);
    for (const [fx, fz, color] of [[-68, 57, M.red], [-67, 58, M.yellow], [-55, 56, M.blue],
    [-54, 57, M.red], [10, 49, M.yellow], [-10, 49, M.blue], [12, 27, M.red], [-12, 27, M.yellow]]) {
      this._flower(fx, fz, color, M);
    }

    // Benches, trash cans, lamp posts.
    this._bench(28, 64, 0, M);
    this._bench(-28, 64, 0, M);
    this._bench(55, 10, Math.PI / 2, M);
    this._bench(-55, 10, Math.PI / 2, M);
    this._bench(64, 60, 0, M);
    this._bench(-64, 60, 0, M);
    this._trashCan(32, 66, M);
    this._trashCan(-32, 66, M);
    this._trashCan(0, 14, M);
    this._trashCan(0, -20, M);
    this._trashCan(50, 14, M);
    this._trashCan(-50, 14, M);
  }

  // ── Drifting ocean pollution around the harbour ─────────────────────────

  _buildFloatingTrash(M) {
    // Moderate density — enough to communicate the cleanup goal near home.
    const spots = [
      // Off the central pier + boat channels.
      [8.5, 76], [9.5, 80], [-8.5, 78], [-9.5, 83], [10, 90], [-10, 92],
      [7.5, 140], [-7.5, 142], [8, 120], [-8, 122],
      // Between piers (east).
      [26, 74], [27, 80], [27.5, 86], [44, 76], [45, 82], [44.5, 95], [46, 100],
      [25, 120], [43, 118], [26, 140], [44, 138],
      // Between piers (west).
      [-26, 74], [-27, 80], [-27.5, 86], [-44, 76], [-45, 82], [-44.5, 95],
      [-25, 120], [-43, 118], [-26, 140], [-44, 138],
      // Beyond the pier tips.
      [53, 75], [53.5, 82], [72, 78], [72.5, 84], [73, 90],
      [52, 125], [72, 120], [53, 140], [73, 142],
      // Further out, a loose "patch" band (kept in open channels / beyond tips).
      [25, 100], [26, 104], [-25, 100], [-26, 104], [50, 100], [-50, 100],
      [0, 150], [0, 156], [20, 150], [-20, 150],
    ];
    for (const [x, z] of spots) {
      // Skip any spot that ends up on a pier deck (channels shift with layout).
      if (x >= -6.5 && x <= 6.5 && z >= 70 && z <= 150) continue;
      if (x >= 9.5 && x <= 24.5 && z >= 70 && z <= 130) continue;
      if (x >= 29.5 && x <= 42.5 && z >= 70 && z <= 140) continue;
      if (x >= -24.5 && x <= -9.5 && z >= 70 && z <= 130) continue;
      if (x >= -42.5 && x <= -29.5 && z >= 70 && z <= 140) continue;
      this._floatingTrash(x, z, M);
    }
  }

  // ── Educational signs ───────────────────────────────────────────────────

  _buildSigns(M) {
    const sign = (x, z, text, rotY, bg, fg, w, h, postColor) => {
      const tex = this._textureCanvas(512, 128, (g, cw, ch) => {
        g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
        g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(6, 6, cw - 12, ch - 12);
        g.fillStyle = fg;
        this._fitText(g, text, cw / 2, ch / 2, cw - 60, 40);
      });
      this._signBoard(x, 0, z, w || 3.4, h || 0.95, tex, rotY, postColor);
    };

    // Educational / story signs. All face −z (toward the plaza/player).
    sign(14, 66, 'Recycle Here', Math.PI, '#1d5c37', '#ffffff', 2.6, 0.9, M.darkWood);
    sign(-14, 66, 'Ocean Cleanup Zone', Math.PI, '#174d7c', '#ffffff', 3.2, 0.95, M.darkWood);
    sign(34, 66, 'Protect Marine Life', Math.PI, '#174d7c', '#ffffff', 3.2, 0.95, M.darkWood);
    sign(-34, 66, 'Keep Our Oceans Clean', Math.PI, '#174d7c', '#ffffff', 3.2, 0.95, M.darkWood);
    sign(0, -6, 'Reduce, Reuse, Recycle', Math.PI, '#1d5c37', '#ffffff', 3.4, 0.95, M.darkWood);
    sign(66, -6, 'Recycling Education', Math.PI, '#1d5c37', '#ffffff', 3.4, 0.95, M.darkWood);
    sign(-66, -6, 'Sort Your Waste', Math.PI, '#1d5c37', '#ffffff', 3.0, 0.95, M.darkWood);
    sign(0, -54, 'Emergency Assembly Point', Math.PI, '#ae3f32', '#ffffff', 4.2, 1.0, M.metal);

    // Caution signs (face the approaching player).
    sign(4.5, 29, 'CAUTION', Math.PI, '#c9a227', '#1c1c1c', 2.6, 0.85, M.metal);
    sign(-4.5, 29, 'CAUTION', Math.PI, '#c9a227', '#1c1c1c', 2.6, 0.85, M.metal);
    sign(-22, -13, 'FUEL', Math.PI, '#c9a227', '#1c1c1c', 2.4, 0.8, M.metal);
    sign(44, 4, 'RESTRICTED', Math.PI, '#c9a227', '#1c1c1c', 2.6, 0.8, M.metal);
    sign(30, -50, 'SPEED LIMIT 10', Math.PI, '#c9a227', '#1c1c1c', 2.6, 0.8, M.metal);
    sign(-30, -50, 'NO ENTRY', Math.PI, '#c9a227', '#1c1c1c', 2.4, 0.8, M.metal);

    // Directional arrows toward the Recycling Center (drawn polygon arrows —
    // no emoji glyphs — so the flat low-poly sign style stays consistent).
    const westDir = this._textureCanvas(512, 128, (g, w, h) => {
      g.fillStyle = '#1d5c37'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffffff';
      this._drawArrow(g, w * 0.1, h / 2, 42, true);   // left → points toward +x world
      this._fitText(g, 'RECYCLING CENTER', w * 0.62, h / 2, w * 0.6, 34);
    });
    this._signBoard(-90, 0, 64, 4.0, 1.0, westDir, Math.PI, M.darkWood);
    this._signBoard(-90, 0, -30, 4.0, 1.0, westDir, Math.PI, M.darkWood);
    const eastDir = this._textureCanvas(512, 128, (g, w, h) => {
      g.fillStyle = '#1d5c37'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffffff';
      this._fitText(g, 'RECYCLING CENTER', w * 0.38, h / 2, w * 0.6, 34);
      this._drawArrow(g, w * 0.9, h / 2, 42, false);  // right → points toward −x world
    });
    this._signBoard(90, 0, 64, 4.0, 1.0, eastDir, Math.PI, M.darkWood);
    this._signBoard(90, 0, -30, 4.0, 1.0, eastDir, Math.PI, M.darkWood);
  }

  // ── Ambient: gulls + dock lights ────────────────────────────────────────

  _buildAmbient(M) {
    // Real lights only where the player actually docks (berth + unloading
    // pier); the distant posts are emissive fakes — see _dockLight.
    for (const z of [75, 88]) this._dockLight(-5.6, z, M.metal, true);
    this._dockLight(34, 74, M.metal);
    this._dockLight(-34, 74, M.metal);
    this._dockLight(0, 100, M.metal, true);
    this._dockLight(0, 120, M.metal);
    this._dockLight(0, 140, M.metal);
    for (let i = 0; i < 12; i++) {
      const gull = new THREE.Mesh(this._geo('cone', 0.1, 0.9, 3),
        new THREE.MeshBasicMaterial({ color: 0xf7f4e8 }));
      gull.rotation.z = Math.PI / 2;
      gull.position.set(-30 + i * 6, 6 + (i % 2), 50 + i * 5);
      gull.userData.noMerge = true; // animated — skip static merge
      this.root.add(gull);
      this._lod.push({ obj: gull, x: -30 + i * 6, z: 50 + i * 5, max: 95 });
      this._gulls.push({ mesh: gull, phase: i * 1.3 });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Public API
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Move the whole harbour (and every collider/prop inside it) by -offset.
   * Used by the engine's floating-origin rebase so the boat can sail
   * unlimited distances while world coordinates stay small and precise.
   */
  rebase(offset) {
    this.root.position.sub(offset);
    this.dockEnd.sub(offset);
    this.boatSpawn.sub(offset);
    this.boardingPoint.sub(offset);
    this.playerSpawn.sub(offset);
  }

  update(delta, nightFactor = 1.0, cameraPos = null, waveSampler = null) {
    const time = performance.now() * 0.001;

    // ── Distance LOD ────────────────────────────────────────────────────────
    // Hide far-away decorative clusters (gulls, floating trash, buoys, parked
    // boats) so their meshes AND per-frame animations cost nothing when the
    // player is on the other side of the harbour.
    if (cameraPos && this._lod.length) {
      this._lodAcc += delta;
      if (this._lodAcc >= 0.25) {
        this._lodAcc = 0;
        const rx = this.root.position.x, rz = this.root.position.z;
        const cx = cameraPos.x - rx, cz = cameraPos.z - rz;
        for (const e of this._lod) {
          const dx = e.x - cx, dz = e.z - cz;
          e.obj.visible = dx * dx + dz * dz <= e.max * e.max;
        }
      }
    }

    // Conveyor belt: trash rides into the building and loops.
    for (const item of this._conveyorItems) {
      item.progress += item.speed * delta * 60;
      if (item.progress >= 1) item.progress = 0;
      const z = 42 - item.progress * 12;
      item.mesh.position.z = z;
      item.mesh.rotation.y += delta * 0.8;
    }

    // Compactor ram presses up and down.
    if (this._compactorRam) {
      this._compactorRam.position.y = 3.55 + Math.sin(time * 2.2) * 0.12;
    }

    // Crusher roller spins.
    if (this._crusherRoller) {
      this._crusherRoller.rotation.x += delta * 1.5;
    }

    // Unloading marker pulses.
    if (this._marker) {
      const s = 1 + Math.sin(time * 3) * 0.08;
      this._marker.ring.scale.set(s, s, 1);
      this._marker.ring.material.opacity = 0.75 + Math.sin(time * 3) * 0.2;
      this._marker.torus.scale.set(s, s, 1);
    }

    // Dock cranes sweep slowly.
    for (const jib of this._craneJibs) {
      jib.rotation.y = Math.sin(time * (jib.userData.speed || 0.3) + jib.userData.phase) * 0.6;
    }

    // Drifting trash bobs and spins on the water (skip LOD-hidden items).
    // When a shared WaveSampler is provided the items ride the SAME field as
    // the player's boat, so harbour buoys and trash move with the real water.
    for (const f of this._floating) {
      if (!f.mesh.visible) continue;
      if (waveSampler) {
        const h = waveSampler.getHeight(f.x, f.z, time);
        f.mesh.position.y = h + f.baseY + Math.sin(time * f.speed + f.phase) * 0.05;
      } else {
        f.mesh.position.y = f.baseY + Math.sin(time * f.speed + f.phase) * 0.07;
      }
      f.mesh.rotation.y += delta * 0.5;
    }

    // Warm dock lights flicker gently and dim during daytime. Lights are
    // also hidden entirely by day — with `visible=false` three.js skips all
    // their per-fragment lighting cost.
    this._lights.forEach(light => {
      light.visible = nightFactor > 0.05;
      if (!light.visible) return;
      const base = light.userData.base || (light instanceof THREE.SpotLight ? 3.5 : 0.9);
      light.intensity = base * nightFactor * (0.88 + Math.sin(time * 2 + light.position.z) * 0.12);
    });

    // Modulate volumetric light beams
    this._lightBeams.forEach(beam => {
      beam.material.opacity = 0.12 * nightFactor;
      beam.visible = nightFactor > 0.05;
    });

    // Seagulls circle lazily (skip LOD-hidden birds).
    this._gulls.forEach(({ mesh, phase }) => {
      if (!mesh.visible) return;
      mesh.position.y += Math.sin(time * 1.8 + phase) * delta * 0.35;
      mesh.rotation.y += delta * 0.35;
    });
  }

  dispose() {
    for (const mesh of this._merged) {
      if (mesh.geometry) mesh.geometry.dispose();
    }
    this._merged = [];
    this._geoCache.forEach(g => g.dispose());
    this._geoCache.clear();
    this._sharedGeos.clear();
    this.scene.remove(this.root);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Primitive helpers
  // ────────────────────────────────────────────────────────────────────────

  _box(material, x, y, z, px, py, pz, collider = false, castShadow = false) {
    const mesh = new THREE.Mesh(this._geo('box', x, y, z), material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = castShadow || this._shadowOn;
    mesh.receiveShadow = collider || this._shadowOn;
    this.root.add(mesh);
    if (collider) this.colliders.push(mesh);
    return mesh;
  }

  _cylinder(material, top, bottom, height, x, y, z, castShadow = false) {
    const mesh = new THREE.Mesh(this._geo('cyl', top, bottom, height, 10), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow || this._shadowOn;
    mesh.receiveShadow = this._shadowOn;
    this.root.add(mesh);
    return mesh;
  }

  /** Return a cached geometry instance so identical props share one buffer. */
  _geo(kind, ...args) {
    const key = kind + args.join(',');
    let g = this._geoCache.get(key);
    if (!g) {
      if (kind === 'box')       g = new THREE.BoxGeometry(...args);
      else if (kind === 'cyl')  g = new THREE.CylinderGeometry(...args);
      else if (kind === 'cone') g = new THREE.ConeGeometry(...args);
      else if (kind === 'sphere') g = new THREE.SphereGeometry(...args);
      else if (kind === 'torus')  g = new THREE.TorusGeometry(...args);
      else if (kind === 'ring')   g = new THREE.RingGeometry(...args);
      else if (kind === 'circle') g = new THREE.CircleGeometry(...args);
      else if (kind === 'plane')  g = new THREE.PlaneGeometry(...args);
      else if (kind === 'ico')    g = new THREE.IcosahedronGeometry(...args);
      this._geoCache.set(key, g);
      this._sharedGeos.add(g);
    }
    return g;
  }

  /**
   * Collapse every STATIC mesh into a single geometry per shared material.
   * This turns ~1500 draw calls into a few dozen (one per material).
   *
   * Skipped (kept as individual meshes):
   *  - collider / wallCollider meshes (they must stay separately raycastable)
   *  - animated meshes (userData.noMerge — conveyor, ram, roller, jibs,
   *    floating trash, buoys, gulls, marker, light beams)
   *  - textured materials (signs/decals carry unique canvas textures)
   */
  _mergeStatic() {
    // Two buckets:
    //  - groups:          decorative meshes that are NOT colliders — merged and
    //                     then removed from the scene (current behaviour).
    //  - colliderGroups:  collider / wallCollider meshes (fences, railings,
    //                     curbs, workshop walls, ground…) — these are also
    //                     merged into one render mesh per shared material, and
    //                     the ORIGINALS are hidden instead of removed. Physics
    //                     raycasts ignore `visible`, so the collider arrays
    //                     keep working; only the render cost collapses from
    //                     hundreds of draw calls down to a handful.
    const groups = new Map();         // material.uuid -> { material, geoms, cast, receive }
    const colliderGroups = new Map();
    const remove = [];
    const visit = (obj) => {
      if (obj.userData && obj.userData.noMerge) return; // animated groups/meshes
      if (obj.isGroup) { obj.children.forEach(visit); return; }
      if (!obj.isMesh) return;                 // lines, lights, targets, …
      if (obj.visible === false) return;       // invisible physics walls — nothing to render
      const mat = obj.material;
      if (!mat || mat.map || mat.wireframe || mat.transparent) return;
      const isCollider = this.colliders.includes(obj) || this.wallColliders.includes(obj);
      const bucket = isCollider ? colliderGroups : groups;
      let g = bucket.get(mat.uuid);
      if (!g) {
        g = { material: mat, geoms: [], cast: false, receive: false };
        bucket.set(mat.uuid, g);
      }
      const geo = obj.geometry.clone();
      geo.applyMatrix4(obj.matrixWorld);
      g.geoms.push(geo);
      g.cast = g.cast || obj.castShadow;
      g.receive = g.receive || obj.receiveShadow;
      if (isCollider) {
        // Keep it in the collider arrays for raycasting (which ignores
        // `visible`), but stop drawing the original — the merged copy renders.
        obj.visible = false;
      } else {
        remove.push(obj);
      }
    };
    this.root.updateMatrixWorld(true);
    this.root.children.forEach(visit);

    const bake = (entries) => {
      for (const { material, geoms, cast, receive } of entries) {
        if (geoms.length < 2) { geoms.forEach(g => g.dispose()); continue; }
        let merged = null;
        try {
          merged = mergeBufferGeometries(geoms, false);
        } catch (e) {
          geoms.forEach(g => g.dispose());
          continue;
        }
        if (!merged) { geoms.forEach(g => g.dispose()); continue; }
        geoms.forEach(g => g.dispose());
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        this.root.add(mesh);
        this._merged.push(mesh);
      }
    };
    bake(groups.values());
    bake(colliderGroups.values());

    // Remove the non-collider source meshes (rendered by the merged mesh now).
    for (const obj of remove) {
      if (!this._sharedGeos.has(obj.geometry)) obj.geometry.dispose();
      obj.parent.remove(obj);
    }
  }

  _crate(x, y, z, material) { return this._box(material, 1, 1, 1, x, y, z, false, false); }
  _barrel(x, y, z, material) { return this._cylinder(material, 0.32, 0.36, 0.95, x, y, z, false); }

  /** Shared cluster builders — each cluster is a handful of meshes that the
   * static merge pass later fuses into one geometry, so dozens of scattered
   * crates/pallets/barrels cost a single draw call each group. */
  _palletStack(x, z, M, n = 2, rotY = 0) {
    for (let i = 0; i < n; i++) {
      this._pallet(x + (i % 2) * 0.6, z + Math.floor(i / 2) * 0.8, rotY + i * 0.1, M);
    }
  }

  _crateStack(x, z, M, n = 2) {
    for (let i = 0; i < n; i++) {
      this._crate(x, 0.55 + i * 1.05, z, M.wood);
    }
  }

  _barrelCluster(x, z, M, colors = null) {
    const cs = colors || [M.red, M.metal, M.blue];
    for (let i = 0; i < cs.length; i++) {
      this._barrel(x + (i % 2) * 0.55, z + Math.floor(i / 2) * 0.6, cs[i]);
    }
  }

  _binStation(x, z, M) {
    this._bin(x - 0.95, z, M.green);
    this._bin(x, z, M.blue);
    this._bin(x + 0.95, z, M.yellow);
    this._garbageBag(x + 1.3, z + 0.4);
  }

  _rope(from, to, material) {
    const points = [from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, -0.35, 0)), to];
    this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: material.color })));
  }

  _lifeRing(x, y, z, material) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 8, 16), material);
    ring.position.set(x, y, z);
    ring.rotation.y = Math.PI / 2;
    this.root.add(ring);
    return ring;
  }

  _net(x, y, z, material) {
    const net = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12),
      new THREE.MeshBasicMaterial({ color: material.color, wireframe: true, transparent: true, opacity: 0.8 }));
    net.position.set(x, y, z);
    net.rotation.x = -Math.PI / 2;
    this.root.add(net);
  }

  /**
   * Low pier-edge light post (5 m tall).
   *
   * Perf: every real THREE light multiplies the per-fragment cost of every
   * harbour surface (three.js compiles the shader to loop over ALL visible
   * lights). So `real` lights are only created where the warm pool actually
   * matters — the few posts right beside the boat berth. Everywhere else the
   * lamp is a cheap emissive bulb that fakes the glow with ZERO lighting cost.
   */
  _dockLight(x, z, material, real = false) {
    this._cylinder(material, 0.09, 0.12, 4.6, x, 2.3, z, false);
    const fixture = new THREE.Mesh(this._geo('box', 0.4, 0.2, 0.3), this.M.gray);
    fixture.position.set(x, 4.7, z - 0.4);
    this.root.add(fixture);
    if (real) {
      const light = new THREE.PointLight(0xffc978, 0.9, 14, 2);
      light.position.set(x, 4.6, z - 0.4);
      light.userData.base = 0.9;
      this.root.add(light);
      this._lights.push(light);
    } else {
      // Fake glow: an emissive bulb so the lamp reads as lit at night. Opaque
      // and static, so the merge pass folds it into the shared draw calls.
      const bulb = new THREE.Mesh(this._geo('sphere', 0.13, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
      bulb.position.set(x, 4.6, z - 0.4);
      this.root.add(bulb);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Prop builders
  // ────────────────────────────────────────────────────────────────────────

  _bin(x, z, color) {
    const bin = new THREE.Mesh(this._geo('box', 0.85, 1.0, 0.85), color);
    bin.position.set(x, 0.5, z);
    this.root.add(bin);
    const lid = new THREE.Mesh(this._geo('box', 0.9, 0.08, 0.9), this.M.binLid);
    lid.position.set(x, 1.05, z);
    this.root.add(lid);
  }

  _garbageBag(x, z) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), this.M.black);
    bag.position.set(x, 0.35, z);
    bag.scale.set(1, 0.85, 0.8);
    bag.rotation.y = Math.random();
    this.root.add(bag);
  }

  /** A small cluster of plastic bottles lying on the ground. */
  _bottlePile(x, z, M) {
    const mats = [M.bottleGreen, M.bottleBlue];
    for (let i = 0; i < 6; i++) {
      const bottle = new THREE.Mesh(this._geo('cyl', 0.07, 0.07, 0.34, 6), mats[i % 2]);
      bottle.position.set(x + (i % 3) * 0.22 - 0.22, 0.12, z + Math.floor(i / 3) * 0.2);
      bottle.rotation.x = Math.PI / 2;
      bottle.rotation.z = Math.random() * 0.6 - 0.3;
      bottle.rotation.y = Math.random() * Math.PI;
      this.root.add(bottle);
    }
  }

  _pallet(x, z, rotY, M) {
    // Realistic 1.2 × 1.2 m pallet.
    const g = new THREE.Group();
    const plankMat = M.pallet;
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.Mesh(this._geo('box', 1.2, 0.06, 0.16), plankMat);
      p.position.set(0, 0.09, i * 0.36);
      g.add(p);
    }
    for (const i of [-0.42, 0.42]) {
      const r = new THREE.Mesh(this._geo('box', 0.14, 0.16, 1.05), plankMat);
      r.position.set(i, 0.03, 0);
      g.add(r);
    }
    g.position.set(x, 0.07, z);
    g.rotation.y = rotY;
    this.root.add(g);
  }

  _bale(x, z, M) {
    // Compressed recycling bale ~1.5 m cube with steel straps.
    const bale = new THREE.Mesh(this._geo('box', 1.5, 1.3, 1.5), M.bale);
    bale.position.set(x, 0.65, z);
    bale.rotation.y = Math.random();
    this.root.add(bale);
    for (let i = 0; i < 3; i++) {
      const strap = new THREE.Mesh(this._geo('box', 1.52, 1.32, 0.07), M.gray);
      strap.position.set(x, 0.65, z - 0.45 + i * 0.45);
      strap.rotation.y = bale.rotation.y;
      this.root.add(strap);
    }
  }

  _container(x, y, z, color, rotY) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this._geo('box', 2.5, 2.6, 6), color);
    body.position.y = 1.3;
    body.castShadow = true;
    g.add(body);
    // Corner posts + roof ribs.
    for (const [cx, cz] of [[-1.2, -2.9], [1.2, -2.9], [-1.2, 2.9], [1.2, 2.9]]) {
      const post = new THREE.Mesh(this._geo('box', 0.18, 2.6, 0.18), this.M.gray);
      post.position.set(cx, 1.3, cz);
      g.add(post);
    }
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(this._geo('box', 2.56, 0.05, 0.08), this.M.gray);
      rib.position.set(0, 2.62, -2.5 + i * 1.25);
      g.add(rib);
    }
    // Door end (front face at -z local).
    const door = new THREE.Mesh(this._geo('box', 2.3, 2.3, 0.06), this.M.contDoor);
    door.position.set(0, 1.3, -3.02);
    g.add(door);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.root.add(g);
    this._wall(body);
    return g;
  }

  _forklift(x, z, yaw, M) {
    // Realistic 3 m long, 2 m tall bright-yellow forklift.
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.9), M.yellow);
    body.position.y = 0.7;
    body.castShadow = true;
    g.add(body);
    // Overhead guard + seat.
    const guard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.5), M.gray);
    guard.position.set(0, 1.85, 0.1);
    g.add(guard);
    for (const px of [-0.5, 0.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.25, 0.08), M.gray);
      post.position.set(px, 1.2, 0.65);
      g.add(post);
    }
    // Mast + black forks at the front.
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.7, 0.14), M.gray);
    mast.position.set(0, 1.55, -0.85);
    g.add(mast);
    const forks = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 1.3), M.black);
    forks.position.set(0, 0.55, -1.45);
    g.add(forks);
    const forks2 = forks.clone();
    forks2.position.x = 0.5;
    g.add(forks2);
    // Warning beacon on the guard.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
    beacon.position.set(0, 2.1, 0.4);
    g.add(beacon);
    // Wheels.
    for (const [px, py, pz] of [[-0.55, 0.3, 0.7], [0.55, 0.3, 0.7], [-0.55, 0.3, -0.7], [0.55, 0.3, -0.7]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 10), M.tire);
      wheel.position.set(px, py, pz);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
    g.position.set(x, 0.5, z);
    g.rotation.y = yaw;
    this.root.add(g);
    this._wall(body);
  }

  _palletJack(x, z, M) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.1), M.gray);
    body.position.y = 0.28;
    g.add(body);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), M.metal);
    handle.position.set(0, 1.1, 0.55);
    handle.rotation.x = 0.4;
    g.add(handle);
    for (const px of [-0.2, 0.2]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), M.tire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(px, 0.12, -0.4);
      g.add(wheel);
    }
    g.position.set(x, 0.12, z);
    this.root.add(g);
  }

  _cableSpool(x, z, M) {
    const spool = new THREE.Mesh(this._geo('cyl', 0.9, 0.9, 0.5, 12), M.wood);
    spool.position.set(x, 0.62, z);
    spool.rotation.z = Math.PI / 2;
    this.root.add(spool);
    const core = new THREE.Mesh(this._geo('cyl', 0.25, 0.25, 0.62, 8), M.metal);
    core.position.set(x, 0.62, z);
    core.rotation.z = Math.PI / 2;
    this.root.add(core);
  }

  _barrier(x, z, rotY, M) {
    const g = new THREE.Group();
    const legMat = M.yellow;
    const plankMat = M.barrier;
    const leg1 = new THREE.Mesh(this._geo('box', 0.14, 0.6, 0.9), legMat);
    leg1.position.set(-0.55, 0.3, 0);
    leg1.rotation.z = 0.35;
    g.add(leg1);
    const leg2 = new THREE.Mesh(this._geo('box', 0.14, 0.6, 0.9), legMat);
    leg2.position.set(0.55, 0.3, 0);
    leg2.rotation.z = -0.35;
    g.add(leg2);
    const plank = new THREE.Mesh(this._geo('box', 1.4, 0.35, 0.1), plankMat);
    plank.position.y = 0.65;
    g.add(plank);
    // Stripe.
    const stripe = new THREE.Mesh(this._geo('box', 0.5, 0.37, 0.12), M.yellow);
    stripe.position.set(-0.1, 0.65, 0);
    g.add(stripe);
    g.position.set(x, 0.25, z);
    g.rotation.y = rotY;
    this.root.add(g);
  }

  _trafficCone(x, z, M) {
    const cone = new THREE.Mesh(this._geo('cone', 0.28, 0.6, 8), M.orange);
    cone.position.set(x, 0.3, z);
    this.root.add(cone);
    const band = new THREE.Mesh(this._geo('cyl', 0.18, 0.22, 0.14, 8), M.white);
    band.position.set(x, 0.3, z);
    this.root.add(band);
  }

  /** Industrial chain-link fence, 2.5 m tall steel posts + rails. */
  _fence(x1, z1, x2, z2, M) {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(x2 - x1, z2 - z1);
    const posts = Math.max(2, Math.round(len / 4));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 6), M.metal);
      post.position.set(x1 + (x2 - x1) * t, 1.25, z1 + (z2 - z1) * t);
      this.root.add(post);
      this._wall(post);
    }
    for (const [hy, thickness] of [[2.15, 0.07], [1.35, 0.07], [0.55, 0.07]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, thickness, 0.05), M.metal);
      rail.position.set(cx, hy, cz);
      rail.rotation.y = -ang;
      this.root.add(rail);
      this._wall(rail);
    }
  }

  _gateSign(x, z, M) {
    const signTex = this._textureCanvas(256, 128, (g, w, h) => {
      g.fillStyle = '#c9a227'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1c1c1c'; g.font = 'bold 56px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('GATE', w / 2, h / 2);
    });
    this._signBoard(x, 0, z, 2.0, 0.9, signTex, Math.PI, M.metal);
  }

  _fuelTank(x, z, M) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 3.4, 12), M.white);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(x, 1.4, z);
    this.root.add(tank);
    this._wall(tank);
    // End caps + legs.
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 12), M.gray);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x + side * 1.7, 1.4, z);
      this.root.add(cap);
      for (const px of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), M.metal);
        leg.position.set(x + side * 1.4, 0.55, z + px);
        this.root.add(leg);
      }
    }
  }

  _fuelPump(x, z, M) {
    const pump = this._box(M.yellow, 0.9, 2.0, 0.8, x, 1.0, z, false, false);
    this._wall(pump);
    this._box(M.glass, 0.6, 0.5, 0.1, x, 1.6, z - 0.35, false, false);
    this._cylinder(M.gray, 0.1, 0.1, 1.5, x, 2.2, z + 0.4);
  }

  _warehouse(x, z, w, d, M) {
    // Simple box warehouse with a gable roof.
    const h = 4.2;
    const body = this._box(M.beige, w, h, d, x, h / 2, z);
    this._wall(body);
    const ang = Math.atan2(0.8, d / 2);
    const roofLen = Math.hypot(d / 2, 0.8);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.16, roofLen), M.roofGreen);
      p.position.set(x, h + 0.4, z + side * d / 4);
      p.rotation.x = side * ang;
      this.root.add(p);
    }
    this._box(M.roofGreen, w + 1, 0.2, 0.5, x, h + 1.0, z, false, false);
    // Big door on the -z face.
    this._box(M.metal, 0.2, 3.2, 3.4, x, 1.6, z - d / 2 - 0.05, false, false);
    // Window stripe.
    this._box(M.glass, w - 1, 0.8, 0.08, x, h * 0.6, z - d / 2 - 0.08, false, false);
  }

  _pickupTruck(x, z, M) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.4), M.blue);
    body.position.y = 0.75;
    body.castShadow = true;
    g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 1.4), M.white);
    cab.position.set(0, 1.25, 1.3);
    g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.06), M.glass);
    win.position.set(0, 1.3, 0.65);
    g.add(win);
    for (const px of [-0.8, 0.8]) {
      for (const [pz, r] of [[1.4, 0.35], [-1.4, 0.35]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 10), M.tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(px, 0.35, pz);
        g.add(wheel);
      }
    }
    g.position.set(x, 0.12, z);
    g.rotation.y = Math.PI;
    this.root.add(g);
    this._wall(body);
  }

  /** Low-poly quay crane with a slowly sweeping jib. */
  /** Large harbour dock crane (≈16 m tall) dominating the pier skyline. */
  _crane(x, z, rotY, M) {
    const g = new THREE.Group();
    // Wide concrete/steel base.
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 2.4), M.yellow);
    base.position.y = 1.6;
    base.castShadow = true;
    g.add(base);
    // Hazard stripes around the base (group-local, yellow/black).
    const hazardTex = this._textureCanvas(64, 32, (g, w, h) => {
      g.fillStyle = '#c9a227'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1c1c1c';
      for (let i = -1; i < 3; i++) g.fillRect(i * 22 + 8, 0, 10, h);
    });
    const hazardBand = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6),
      new THREE.MeshBasicMaterial({ map: hazardTex }));
    hazardBand.position.y = 0.7;
    g.add(hazardBand);
    // Rotating jib assembly (13 m mast + 9 m boom).
    const jib = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.34, 6.5, 0.34), M.yellow);
    mast.position.y = 6.5;
    jib.add(mast);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 9), M.red);
    boom.position.set(0, 10.2, 4.4);
    jib.add(boom);
    // Boom stay cable.
    const stay = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 13, 0.8), new THREE.Vector3(0, 10.3, 7)]),
      new THREE.LineBasicMaterial({ color: 0x8a8a8a }));
    jib.add(stay);
    // Hoist cable + oversize hook.
    const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 10, 8.6), new THREE.Vector3(0, 4.2, 8.6)]),
      new THREE.LineBasicMaterial({ color: 0x8a8a8a }));
    jib.add(cable);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), M.metal);
    hook.position.set(0, 3.9, 8.6);
    jib.add(hook);
    // Operator cabin with tinted windows at the mast base.
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 1.0), M.gray);
    cabin.position.set(0, 1.6, 1.1);
    jib.add(cabin);
    const cabinWin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.08), M.glass);
    cabinWin.position.set(0, 1.7, 1.62);
    jib.add(cabinWin);
    // Warning beacon on the jib top.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    beacon.position.set(0, 13.6, 0);
    jib.add(beacon);
    jib.position.y = 3.2;
    jib.userData.phase = Math.random() * 6;
    jib.userData.speed = 0.25 + Math.random() * 0.15;
    jib.userData.noMerge = true; // animated group — skip static merge
    g.add(jib);
    this._craneJibs.push(jib);
    // Counterweight block.
    const cw = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.8), M.gray);
    cw.position.set(0, 3.5, -0.8);
    g.add(cw);
    g.position.set(x, 0.5, z);
    g.rotation.y = rotY;
    this.root.add(g);
    this._wall(base);
  }

  _parkedBoat(x, z, yaw, color, scale, opts = {}) {
    const g = new THREE.Group();
    const hullMat = color;
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6 * scale, 0.8 * scale, 7 * scale), hullMat);
    hull.position.y = 0.4 * scale;
    hull.castShadow = true;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.3 * scale, 1.6 * scale, 6), hullMat);
    bow.rotation.x = -Math.PI / 2;
    bow.position.set(0, 0.4 * scale, -3.8 * scale);
    g.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2 * scale, 0.06 * scale, 6.4 * scale), deckMat);
    deck.position.y = 0.82 * scale;
    g.add(deck);
    if (opts.cabin) {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7 * scale, 1.1 * scale, 2 * scale), this.M.white);
      cabin.position.set(0, 1.45 * scale, 0.4 * scale);
      g.add(cabin);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5 * scale, 0.45 * scale, 0.05), this.M.glass);
      win.position.set(0, 1.5 * scale, -0.65 * scale);
      g.add(win);
    }
    if (opts.crane) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 2.2 * scale, 6), this.M.metal);
      mast.position.set(0, 2.0 * scale, 2.6 * scale);
      g.add(mast);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(0.06 * scale, 0.06 * scale, 1.6 * scale), this.M.metal);
      jib.position.set(0, 3.0 * scale, 2.4 * scale);
      jib.rotation.x = 0.4;
      g.add(jib);
    }
    g.position.set(x, 0.12, z);
    g.rotation.y = yaw;
    g.userData.noMerge = true; // parked boat stays a single logical object
    this.root.add(g);
    // No LOD for parked boats: their hulls are wallColliders, and raycasting
    // ignores `visible` — hiding them would leave invisible walls behind.
    // Only six boats exist, all static — they cost nothing.
    hull.userData.parkedBoat = true;
    this._wall(hull);
    return g;
  }

  _anchor(x, z, M) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(this._geo('box', 0.08, 1.2, 0.5), M.metal);
    a.position.y = 0.6;
    g.add(a);
    const arm = new THREE.Mesh(this._geo('box', 0.6, 0.08, 0.3), M.metal);
    arm.position.y = 1.15;
    g.add(arm);
    const fluke = new THREE.Mesh(this._geo('box', 0.08, 0.3, 0.8), M.metal);
    fluke.position.y = 0.25;
    g.add(fluke);
    g.position.set(x, 0.1, z);
    g.rotation.z = 0.2;
    this.root.add(g);
  }

  _fishCrate(x, z, M) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), M.blue);
    crate.position.set(x, 0.18, z);
    this.root.add(crate);
    for (let i = 0; i < 2; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), M.gray);
      slat.position.set(x, 0.38, z - 0.2 + i * 0.4);
      this.root.add(slat);
    }
  }

  _floatingBuoy(x, z, M) {
    const g = new THREE.Group();
    const buoy = new THREE.Mesh(this._geo('sphere', 0.4, 8, 6), M.red);
    g.add(buoy);
    const top = new THREE.Mesh(this._geo('sphere', 0.28, 8, 6), M.white);
    top.position.y = 0.35;
    g.add(top);
    g.position.set(x, 0.15, z);
    g.userData.noMerge = true; // bobs on the water — skip static merge
    this.root.add(g);
    this._lod.push({ obj: g, x, z, max: 110 });
    this._floating.push({ mesh: g, x, z, baseY: 0.15, phase: Math.random() * 6, speed: 1 + Math.random() });
  }

  _floatingTrash(x, z, M) {
    const r = Math.random();
    let mesh;
    if (r < 0.2) {
      // Plastic bottle.
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 6),
        new THREE.MeshStandardMaterial({ color: 0x7fbf7f, transparent: true, opacity: 0.75 }));
      mesh.rotation.z = Math.random() > 0.5 ? 0 : Math.PI / 2;
    } else if (r < 0.35) {
      // Plastic bag.
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.35), this.M.white);
      mesh.rotation.y = Math.random();
    } else if (r < 0.5) {
      // Broken crate.
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.6), this.M.wood);
      mesh.rotation.y = Math.random();
    } else if (r < 0.6) {
      // Tire.
      mesh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 12), this.M.tire);
      mesh.rotation.x = Math.PI / 2;
    } else if (r < 0.7) {
      // Driftwood.
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.18), this.M.darkWood);
      mesh.rotation.y = Math.random();
    } else if (r < 0.8) {
      // Oil barrel (floating on its side).
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 8), M.red);
      mesh.rotation.z = Math.PI / 2;
    } else if (r < 0.9) {
      // Fishing net tangle.
      mesh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10),
        new THREE.MeshBasicMaterial({ color: 0xb89a67, wireframe: true, transparent: true, opacity: 0.7 }));
      mesh.rotation.x = -Math.PI / 2;
    } else {
      // Garbage patch: cluster of tiny debris.
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const bit = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.14),
          [M.red, M.blue, M.green, this.M.white][i % 4]);
        bit.position.set((i % 3) * 0.24 - 0.24, 0.05, Math.floor(i / 3) * 0.22 - 0.11);
        bit.rotation.y = Math.random();
        g.add(bit);
      }
      mesh = g;
    }
    mesh.position.set(x, 0.1, z);
    mesh.userData.noMerge = true; // drifts on the water — skip static merge
    this.root.add(mesh);
    this._lod.push({ obj: mesh, x, z, max: 85 });
    this._floating.push({ mesh, x, z, baseY: 0.12, phase: Math.random() * 6, speed: 0.8 + Math.random() });
  }

  _palmTree(x, z, scale, M) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(this._geo('cyl', 0.18 * scale, 0.28 * scale, 3.2 * scale, 7), M.palmTrunk);
    trunk.position.y = 1.6 * scale;
    trunk.rotation.z = 0.06;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(this._geo('sphere', 1.05 * scale, 5, 4), M.palmFrond);
      frond.scale.set(0.45, 0.12, 1);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 0.9 * scale, 3.2 * scale, Math.sin(a) * 0.9 * scale);
      frond.rotation.y = -a;
      frond.rotation.z = 0.5;
      g.add(frond);
    }
    const core = new THREE.Mesh(this._geo('sphere', 0.22 * scale, 5, 4), M.green);
    core.position.y = 3.25 * scale;
    g.add(core);
    g.position.set(x, 0.5, z);
    this.root.add(g);
    this._wall(trunk);
  }

  _grassPatch(x, z, M) {
    const patch = new THREE.Mesh(this._geo('sphere', 0.6, 6, 4), M.grass);
    patch.scale.set(1, 0.12, 0.8);
    patch.position.set(x, 0.54, z);
    this.root.add(patch);
  }

  _bush(x, z, M) {
    const bush = new THREE.Mesh(this._geo('ico', 0.55, 0), M.bush);
    bush.position.set(x, 0.62, z);
    bush.scale.y = 0.85;
    this.root.add(bush);
  }

  _flower(x, z, color, M) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), M.green);
    stem.position.set(x, 0.35, z);
    this.root.add(stem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), color);
    head.position.set(x, 0.52, z);
    this.root.add(head);
  }

  _bench(x, z, rotY, M) {
    const g = new THREE.Group();
    // Realistic ~1.8 m park bench.
    const seat = new THREE.Mesh(this._geo('box', 1.8, 0.08, 0.5), M.darkWood);
    seat.position.y = 0.48;
    g.add(seat);
    const back = new THREE.Mesh(this._geo('box', 1.8, 0.5, 0.06), M.darkWood);
    back.position.set(0, 0.83, -0.22);
    g.add(back);
    for (const px of [-0.72, 0.72]) {
      for (const [pz, ph] of [[-0.15, 0.48], [0.15, 0.48]]) {
        const leg = new THREE.Mesh(this._geo('box', 0.08, ph, 0.08), M.metal);
        leg.position.set(px, ph / 2, pz);
        g.add(leg);
      }
    }
    g.position.set(x, 0.5, z);
    g.rotation.y = rotY;
    this.root.add(g);
  }

  _trashCan(x, z, M) {
    const can = new THREE.Mesh(this._geo('cyl', 0.22, 0.28, 0.6, 8), M.metal);
    can.position.set(x, 0.3, z);
    this.root.add(can);
    const lid = new THREE.Mesh(this._geo('cyl', 0.24, 0.24, 0.06, 8), M.gray);
    lid.position.set(x, 0.64, z);
    this.root.add(lid);
  }

  /**
   * Industrial lamp post (7 m tall, matte dark grey, warm LED head).
   *
   * Perf: NO real light here. The harbour has dozens of these posts; each
   * SpotLight would be evaluated per-fragment by every surface in view at
   * night, which is the #1 cause of night-time frame drops. The emissive
   * bulb + additive beam cone below fake the glow for free.
   */
  _lightPole(x, z, M) {
    const poleMat = M.pole;
    this._cylinder(poleMat, 0.1, 0.16, 6.4, x, 3.2, z);
    const arm = new THREE.Mesh(this._geo('box', 0.08, 0.08, 1.7), poleMat);
    arm.position.set(x, 6.2, z - 0.8);
    this.root.add(arm);
    const fixture = new THREE.Mesh(this._geo('box', 0.5, 0.22, 0.35), M.gray);
    fixture.position.set(x, 6.25, z - 1.55);
    this.root.add(fixture);
    const bulb = new THREE.Mesh(this._geo('sphere', 0.16, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    bulb.position.set(x, 6.1, z - 1.55);
    this.root.add(bulb);

    // Volumetric floodlight beam cone
    const beamGeom = new THREE.ConeGeometry(3.0, 7.0, 16, 1, true);
    beamGeom.translate(0, -3.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffeaad,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const beamMesh = new THREE.Mesh(beamGeom, beamMat);
    beamMesh.position.set(x, 6.1, z - 1.55);
    beamMesh.userData.noMerge = true; // animated opacity — skip static merge
    this.root.add(beamMesh);
    this._lightBeams.push(beamMesh);
  }

  _utilityPole(x, z, M) {
    this._cylinder(M.darkWood, 0.12, 0.16, 8, x, 4, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.1), M.darkWood);
    arm.position.set(x, 7.0, z);
    this.root.add(arm);
    for (const side of [-1, 1]) {
      this._box(M.gray, 0.12, 0.3, 0.12, x + side * 0.9, 6.8, z, false, false);
    }
  }

  _electricalBox(x, z, M) {
    this._box(M.gray, 0.7, 1.5, 0.5, x, 0.75, z, false, false);
    this._cylinder(M.gray, 0.08, 0.08, 0.7, x, 0.35, z, false);
    this._box(M.yellow, 0.74, 0.12, 0.54, x, 1.5, z, false, false);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Canvas-texture helpers (signs, decals, logos)
  // ────────────────────────────────────────────────────────────────────────

  /** Draws a clean low-poly arrow glyph on a canvas context (no emoji fonts). */
  _drawArrow(g, cx, cy, s, flip) {
    g.save();
    g.translate(cx, cy);
    if (flip) g.scale(-1, 1);
    g.beginPath();
    g.rect(-s * 0.5, -s * 0.14, s * 0.8, s * 0.28);
    g.moveTo(s * 0.25, -s * 0.45);
    g.lineTo(s * 0.62, 0);
    g.lineTo(s * 0.25, s * 0.45);
    g.closePath();
    g.fill();
    g.restore();
  }

  /** Fits a centered canvas label into maxWidth by shrinking the font. */
  _fitText(g, text, x, y, maxWidth, startSize) {
    let size = startSize;
    g.font = `bold ${size}px Arial`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    while (size > 10 && g.measureText(text).width > maxWidth) {
      size -= 2;
      g.font = `bold ${size}px Arial`;
    }
    g.fillText(text, x, y);
  }

  _textureCanvas(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /** A board (box backing + textured face) optionally on legs. */
  _signBoard(x, y, z, w, h, texture, rotY = 0, postColor = null) {
    const g = new THREE.Group();
    const backing = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), this.M.beige);
    backing.position.y = h / 2;
    g.add(backing);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.1),
      new THREE.MeshBasicMaterial({ map: texture }));
    face.position.set(0, h / 2, 0.065);
    g.add(face);
    if (postColor) {
      const post = new THREE.Mesh(this._geo('cyl', 0.07, 0.09, 1.6, 8), postColor);
      post.position.y = 0.3;
      g.add(post);
    }
    g.position.set(x, y + 0.2, z);
    g.rotation.y = rotY;
    this.root.add(g);
    return g;
  }

  /** A flat sign plane (no backing) — used on building facades. */
  _signPlane(x, y, z, w, h, texture, rotY) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture }));
    face.position.set(x, y, z);
    face.rotation.y = rotY;
    this.root.add(face);
    return face;
  }

  /** Flat painted decal lying on the ground. */
  _floorDecal(x, z, w, h, texture, rotY) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = rotY;
    decal.position.set(x, 0.525, z);
    this.root.add(decal);
  }

  /** The big "RECYCLING CENTER" logo sign (triangle arrows + bold text). */
  _recyclingSignTexture() {
    return this._textureCanvas(1024, 192, (g, w, h) => {
      g.fillStyle = '#1d5c37'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2bff88'; g.lineWidth = 8; g.strokeRect(5, 5, w - 10, h - 10);
      // Recycling triangle (three arrows) on the left.
      const cx = 96, cy = h / 2, r = 52;
      for (let i = 0; i < 3; i++) {
        g.save();
        g.translate(cx, cy);
        g.rotate((i * 2 * Math.PI) / 3);
        g.fillStyle = '#2bff88';
        g.beginPath();
        g.moveTo(0, -r);
        g.lineTo(r * 0.5, r * 0.35);
        g.lineTo(r * 0.18, r * 0.6);
        g.lineTo(0, r * 0.25);
        g.lineTo(-r * 0.18, r * 0.6);
        g.lineTo(-r * 0.5, r * 0.35);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.fillStyle = '#ffffff';
      g.font = 'bold 84px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('RECYCLING CENTER', w / 2 + 40, h / 2);
    });
  }
}
