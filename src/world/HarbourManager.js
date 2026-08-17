import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

/**
 * HarbourManager.js — The harbour's compact U-shaped starting hub.
 *
 * The layout is a clean U: a large rectangular rear base platform with two
 * narrow concrete arms extending forward (+z, toward the ocean) from its left
 * and right ends. The space between the arms is open water — the central boat
 * channel — with the wooden central pier + T-dock running out from the middle
 * of the rear base (kept as the current boat berth / future central pier).
 *
 * PART 1 — CENTRAL GAMEPLAY AREA (rebuilt as pier → end platform):
 *   - CentralPier: a 5.5 m wide × 27 m long wooden deck (x -2.75..2.75,
 *     z 0..27, top y = 1.2) starting from the middle of the rear base's front
 *     edge (x = 0) and running straight through the open channel, exactly
 *     centered between the two U arms.
 *   - EndPlatform: an 8 m × 8 m × 1.2 m square concrete head (z 27..35) at
 *     the pier's far end — same concrete / thickness / height as the rear
 *     base, overhanging the 5.5 m pier by 1.25 m on each side. Surrounded by
 *     water on all sides except the pier connection behind it; never touches
 *     the arms. BoatDockPoint at (5.75, 0, 31), facing +z out the mouth.
 *
 * PART 2 — LEFT ARM (reshaped to the U):
 *   - LeftArm: an 8 m wide × 27 m long concrete slab (x -25..-17, z 0..27,
 *     top y = 1.2) flush with the rear base's left edge — the U's left side,
 *     bounding the central channel on its -x side. Same concrete material + 
 *     1.2 m thickness as the rear base, so the connection is seamless and the
 *     top surfaces stay flat and level. The inner face (x = -17) is the
 *     future docking edge: fender strip + mooring bollards. The outer edge
 *     and far end carry the safety railing; the far end is clean and
 *     squared-off. Prop clusters sit on the arm surface (moved off the old
 *     inner edge so nothing sits in the channel); the rear-left harbour
 *     crane (crane.glb) stands on the rear base behind it.
 *
 * PART 3 — RIGHT ARM (reshaped; exact mirror of the left around X = 0):
 *   - RightArm: an 8 m wide × 27 m long concrete slab (x 17..25, z 0..27) —
 *     the U's right side. Inner edge at x = +17 matches the left's -17, so
 *     the open channel between the arms is perfectly centered on X = 0.
 *     Mirrored crane (crane.glb), dock edge (fender + bollards), railings,
 *     boundary walls and prop layout (structure mirrored, decoration not).
 *
 * PART 4 — REAR SECTION (kept as-is):
 *   - Main harbour building at the rear-centre of the rear base (x -4..4,
 *     z -37.75..-32.25) on solid ground behind the harbour's rear land, never
 *     in the water. Door + windows face +z (toward the pier / player), so it
 *     reads as the shore-side landmark seen when returning from the boat.
 *     Both harbour cranes (the shared 'landAsset/Crane.glb', replacing the
 *     old procedural placeholders — no duplicates) stand on the rear land at
 *     (x ±21.5, z -33), flanking the building site (CRANE · BUILDING · CRANE)
 *     with their booms reaching inward toward the central water / docking
 *     area. The rear shoreline (berm, rocks, palms) sits behind the platform
 *     (z -44..-40).
 *
 * PART 5 — ENVIRONMENTAL DETAIL (kept, adjusted to the U):
 *   - Detail clusters along both arms (CLUSTER · GAP · CLUSTER rhythm),
 *     moved onto the arm surfaces — nothing sits in the open channel.
 *   - Outer-perimeter boulders along both arm faces + framing the harbour
 *     mouth OUTSIDE the channel (seabed-anchored, never floating); the
 *     central channel stays completely clear.
 *   - Water details: 4 bobbing buoys (visual only) + small floating debris
 *     OUTSIDE the channel / beyond the harbour mouth.
 *
 * Layout (top view, +z = ocean):
 *     OCEAN (+z) — the channel mouth (x -17..17) stays open around the
 *     square end platform; boats enter, turn and dock on either side
 *     LEFT ARM    │ BOAT DOCK → boat (+5.75, +31) facing +z   │ RIGHT ARM
 *     (x -25..-17,│ END PLATFORM (8 × 8 m, z 27..35)          │ (x +17..+25,
 *      z 0..27)   │ CENTRAL PIER (z 0..27, x -2.75..2.75)     │  z 0..27)
 *                 │  future berths along both inner faces (±17)
 *     REAR BASE PLATFORM (x -25..25, z -40..0) — the U's back section
 *        CRANE   MAIN BUILDING (x -4..4, z -37.75..-32.25)   CRANE
 *     (rear-left)          (faces +z)              (rear-right)
 *     REAR SHORELINE (z -44..-40 — berm, rocks, palms)
 */
export class HarbourManager {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh[]} colliders — solids used for character ground snapping
   * @param {THREE.Mesh[]} wallColliders — solids the character cannot walk through
   */
  constructor(scene, colliders, wallColliders = []) {
    this.scene = scene;
    this.colliders = colliders;
    this.wallColliders = wallColliders;
    this.root = new THREE.Group();
    this.root.name = 'Harbour';
    this.scene.add(this.root);

    // PART 1 — central gameplay area spawns.
    // HarborPlayerSpawn: on the land / entrance side (−z), on the platform
    // just behind the central pier's start, facing +z toward the pier and the
    // ocean. Safe ground beneath, open space around, clear camera view — never
    // inside the boat, geometry or water.
    this.playerSpawn = new THREE.Vector3(0, 1.5, -3);
    // BoatDockPoint: the canonical boat position — docked to the RIGHT (+x)
    // side of the square concrete end platform, facing +z out the harbour
    // mouth (the engine sets rotation.y = π so the bow points +z). Clear of
    // the platform, seabed, deck and player, with an unobstructed exit path.
    this.boatSpawn = new THREE.Vector3(5.75, 0, 31);
    // Where the player stands to board — the platform's right edge beside
    // the boat (the engine steps off at boardingPoint + (-1.2, 0, -1.2),
    // which is safely on the platform).
    this.boardingPoint = new THREE.Vector3(4.35, 1.2, 31);
    this.dockEnd = null;

    // Shared materials — ONE set reused by every harbour part (Part 1 + 2)
    // so the harbour stays visually consistent and GPU-cheap (no per-object
    // materials).
    this._mat = {
      concrete:  new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.95 }),                          // main platform
      stone:     new THREE.MeshStandardMaterial({ color: 0x8b8d92, roughness: 0.95 }),                          // wing walkway
      deck:      new THREE.MeshStandardMaterial({ color: 0xa06a3c, roughness: 0.85 }),                          // wooden pier/dock + crates
      plank:     new THREE.MeshStandardMaterial({ color: 0x7a4e28, roughness: 0.9 }),                           // plank seams
      piling:    new THREE.MeshStandardMaterial({ color: 0x5d3a1e, roughness: 1 }),                             // pilings
      sand:      new THREE.MeshStandardMaterial({ color: 0xd8b377, roughness: 1, flatShading: true }),          // beach
      metal:     new THREE.MeshStandardMaterial({ color: 0x3c4043, roughness: 0.55, metalness: 0.45 }),         // railing/fender/crane detail
      crane:     new THREE.MeshStandardMaterial({ color: 0xc1492f, roughness: 0.6 }),                           // crane paint
      rope:      new THREE.MeshStandardMaterial({ color: 0x8a6b3d, roughness: 1 }),
      net:       new THREE.MeshStandardMaterial({ color: 0xb8a887, roughness: 1 }),
      barrel:    new THREE.MeshStandardMaterial({ color: 0x4a6072, roughness: 0.7, metalness: 0.2 }),
      container: new THREE.MeshStandardMaterial({ color: 0x2e6f9e, roughness: 0.6 }),
      bollard:   new THREE.MeshStandardMaterial({ color: 0x6a6e73, roughness: 0.5, metalness: 0.5 }),
      ring:      new THREE.MeshStandardMaterial({ color: 0xd93a2f, roughness: 0.6 }),
      wall:      new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 }),                            // building walls
      roof:      new THREE.MeshStandardMaterial({ color: 0x8a4a30, roughness: 0.8 }),                            // building roof
      glass:     new THREE.MeshStandardMaterial({ color: 0x7fa8b8, roughness: 0.3, metalness: 0.1 }),            // building windows
      // Procedural boulder fallback materials — used ONLY when a rock GLB
      // cannot be loaded (e.g. Git-LFS pointer not smudged). Shared so all
      // fallback rocks render as two instanced draw calls.
      rock:      new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 1, flatShading: true }),
      rockLight: new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughness: 1, flatShading: true }),
      rockDark:  new THREE.MeshStandardMaterial({ color: 0x56595e, roughness: 1, flatShading: true }),
    };

    // Shared geometries — ONE set reused by every part and both arms (Part 5
    // hoists the prop/piling/bollard boxes the wings previously created
    // individually, plus the new buoy/debris shapes) so the harbour never
    // multiplies identical GPU buffers.
    this._geo = {
      crate:     new THREE.BoxGeometry(0.8, 0.8, 0.8),
      barrel:    new THREE.CylinderGeometry(0.34, 0.34, 0.95, 10),
      container: new THREE.BoxGeometry(0.7, 0.45, 0.5),
      coil:      new THREE.TorusGeometry(0.35, 0.045, 6, 14),
      ring:      new THREE.TorusGeometry(0.42, 0.075, 8, 16),
      net:       new THREE.CylinderGeometry(0.28, 0.28, 1.3, 8),
      piling:    new THREE.BoxGeometry(0.16, 0.75, 0.16),
      bollard:   new THREE.CylinderGeometry(0.14, 0.18, 0.55, 8),
      buoy:      new THREE.CylinderGeometry(0.24, 0.3, 0.4, 10),
      buoyBase:  new THREE.CylinderGeometry(0.34, 0.36, 0.14, 10),
      buoyEye:   new THREE.TorusGeometry(0.06, 0.02, 6, 10),
      debris:    new THREE.BoxGeometry(0.22, 0.07, 0.14),
      rock:      new THREE.IcosahedronGeometry(0.5, 0), // procedural boulder fallback
    };

    // Part 5 water details — bobbing buoys (visual only, never in the boat's
    // path; they mark the channel edges and the harbour mouth).
    this._buoys = [];
    this._buoyPhase = 0;

    // Procedural rock fallback queue — rocks whose GLB failed to load are
    // collected here and flushed into InstancedMeshes from update() (once),
    // so the shoreline always has rocks regardless of asset availability.
    this._procRocks = [];

    this._build();
  }

  _build() {
    // ── Rear base platform: 50 m (x) × 40 m (z) × 1.2 m (y) ──────────────
    // One solid slab, top surface at y = 1.2, bottom at the waterline (y = 0)
    // so the full 1.2 m thickness shows as a clean vertical side wall from
    // the water-facing side. Uniform light-grey low-poly concrete. The
    // platform was extended 10 m SOUTH (z -40..0, centre z -20) to give the
    // main building (Part 4) solid rear land BEHIND the harbour's rear edge.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(50, 1.2, 40), this._mat.concrete);
    slab.position.set(0, 0.6, -20); // top at y = 1.2, bottom at y = 0
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.root.add(slab);
    this.colliders.push(slab);

    // ── Invisible edge walls (character collision only) ──────────────────
    // Back / left / right platform edges stay. The front (water-facing) edge
    // has gaps where the central pier (x -2..2) and the two U arms connect
    // (left arm x -25..-17, right arm x 17..25), so the player can walk onto
    // all of them from the platform — but nowhere else into the channel.
    this._invisibleWall(0, -40, 50, 0.2);       // back edge (z -40..-39.8)
    this._invisibleWall(-9.5, 0.1, 15, 0.2);    // front edge, left arm → pier (x -17..-2)
    this._invisibleWall(9.5, 0.1, 15, 0.2);     // front edge, pier → right arm (x 2..17)
    this._invisibleWall(-25, -20, 0.2, 40);     // left edge (z -40..0)
    this._invisibleWall(25, -20, 0.2, 40);      // right edge (z -40..0)

    // PART 1 — central gameplay area (pier, dock, beach shoreline).
    this._buildCentralPier();
    this._buildFrontShoreline();

    // PART 2 + 3 — the two U arms.
    this._buildLeftWing();
    this._buildRightWing();

    // PART 5 — environmental detail: prop clusters on both arms, outer
    // perimeter rocks, water buoys + debris.
    this._buildEnvironmentalDetails();

    // PART 4 — rear section: the main harbour building (on the rear land).
    this._buildRearSection();

    // Natural rocky shoreline along the rear edge (behind the platform).
    this._buildRearShoreline();
  }

  // ────────────────────────────────────────────────────────────────────────
  //  PART 1 — Central wooden pier + square concrete end platform
  // ────────────────────────────────────────────────────────────────────────

  _buildCentralPier() {
    // Materials come from the shared set (this._mat) — see constructor.

    // ── Central pier: 5.5 m wide × 27 m long, z 0..27, top at y = 1.2 ────
    // Starts at the middle of the rear base's front edge (x = 0), exactly
    // centered between the two U arms, and runs straight +z through the open
    // channel to the harbour mouth. The wooden deck connects flush into the
    // square concrete end platform at z = 27.
    const deckGeo = new THREE.BoxGeometry(5.5, 0.4, 27);
    const deck = new THREE.Mesh(deckGeo, this._mat.deck);
    deck.position.set(0, 1.0, 13.5);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.root.add(deck);
    this.colliders.push(deck); // walkable ground
    // Below-deck solid fill (invisible): the boat's collision probe sits at
    // y = 0.3, below the deck's underside — this box spans y 0..0.8 so the
    // boat bumps the pier instead of sailing under it.
    this._invisibleFill(5.5, 0.8, 27, 0, 0.4, 13.5);

    // Plank seams across the deck — visual only, so no per-plank colliders.
    // Kept short of the end platform so no seam pokes above its surface.
    const seamGeo = new THREE.BoxGeometry(0.08, 0.06, 26);
    for (const x of [-1.8, -0.9, 0, 0.9, 1.8]) {
      const seam = new THREE.Mesh(seamGeo, this._mat.plank);
      seam.position.set(x, 1.23, 13);
      this.root.add(seam);
    }

    // ── Square concrete end platform: 8 m × 8 m × 1.2 m, z 27..35 ────────
    // The docking/standing head at the pier's far end, centered on X = 0 and
    // sitting in the open water at the harbour mouth. Same concrete, 1.2 m
    // thickness and 1.2 m top height as the rear base — the wooden pier
    // connects flush into its rear face, its top exactly level with the
    // platform (no gap, no floating geometry). The platform overhangs the
    // 5.5 m pier by 1.25 m on each side and is surrounded by water except
    // where the pier connects behind it — it never touches the U arms.
    const headGeo = new THREE.BoxGeometry(8, 1.2, 8);
    const head = new THREE.Mesh(headGeo, this._mat.concrete);
    head.position.set(0, 0.6, 31);
    head.castShadow = true;
    head.receiveShadow = true;
    this.root.add(head);
    this.colliders.push(head); // walkable ground + stops the boat at its face

    // ── Wooden pilings under the pier (visual only — the deck slab + fill
    //    already block the boat, so the pilings never need collision). ──
    const pilingGeo = this._geo.piling; // shared geometry (Part 5)
    const pilings = [[-2.2, 2.5], [2.2, 2.5], [-2.2, 7.5], [2.2, 7.5],
                     [-2.2, 12.5], [2.2, 12.5], [-2.2, 17.5], [2.2, 17.5],
                     [-2.2, 22.5], [2.2, 22.5]];
    for (const [x, z] of pilings) {
      const p = new THREE.Mesh(pilingGeo, this._mat.piling);
      p.position.set(x, 0.425, z); // rises from the waterline to the deck
      this.root.add(p);
    }

    // ── Character boundary walls: walk the deck + platform, never off them ─
    this._invisibleWall(-2.85, 13.5, 0.2, 27);   // pier left edge (z 0..27)
    this._invisibleWall(2.85, 13.5, 0.2, 27);    // pier right edge (z 0..27)
    this._invisibleWall(-4.05, 31, 0.2, 8);      // platform left edge (z 27..35)
    this._invisibleWall(4.05, 31, 0.2, 8);       // platform right edge (z 27..35)
    this._invisibleWall(0, 35.1, 8, 0.2);        // platform front edge (faces ocean)
    // Platform rear corners beside the pier connection (x ±2.75..4 at z 27).
    this._invisibleWall(-3.375, 27.1, 1.25, 0.2);
    this._invisibleWall(3.375, 27.1, 1.25, 0.2);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  PART 1 — Basic shoreline along the platform's front (quay) edge
  // ────────────────────────────────────────────────────────────────────────

  _buildFrontShoreline() {
    // Low beach strips at the waterline in front of the concrete quay, on
    // either side of the central pier. Colliders, so the boat stops at the
    // beach instead of clipping the quay face; the central water channel
    // itself stays completely open.
    const sandMat = this._mat.sand;
    const makeBeach = (geo, cx) => {
      const sand = new THREE.Mesh(geo, sandMat);
      sand.position.set(cx, 0.35, 0.8);
      sand.receiveShadow = true;
      this.root.add(sand);
      this.colliders.push(sand);
    };
    // Symmetric beaches at the quay, mirroring around X = 0: the LEFT beach
    // (x -10..-2) and RIGHT beach (x 2..10) both end at the arms' inner edges
    // (±10). No loose rocks remain along the quay — the arms define both
    // corners.
    makeBeach(new THREE.BoxGeometry(8, 0.7, 1.6), 6);     // right: x 2..10
    makeBeach(new THREE.BoxGeometry(8, 0.7, 1.6), -6);    // left:  x -10..-2
  }

  // ────────────────────────────────────────────────────────────────────────
  //  PART 2 — Left arm: the U's left side (concrete slab + dock edge + crane)
  // ────────────────────────────────────────────────────────────────────────

  _buildLeftWing() {
    const m = this._mat;
    const g = this._geo;

    // ── Arm: concrete slab, x -25..-17 (8 m wide), z 0..27, top y = 1.2 ────
    // The U's LEFT arm: flush with the rear base's left edge (x = -25) and
    // extending forward (+z) toward the ocean. Same concrete material and
    // 1.2 m thickness as the rear base, so the connection is seamless and the
    // top surfaces stay flat and level. The inner face (x = -17) is the
    // future docking edge; the open channel lies beyond it.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 27), m.concrete);
    slab.position.set(-21, 0.6, 13.5);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.root.add(slab);
    this.colliders.push(slab); // walkable ground + stops the boat at the face

    // Dock edge: dark fender strip along the inner (boat-side) face (x = -17).
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 27), m.metal);
    fender.position.set(-16.94, 0.95, 13.5);
    this.root.add(fender);

    // Mooring bollards along the dock edge (solid — the player walks around).
    const bollardGeo = g.bollard; // shared geometry (Part 5)
    for (const z of [4, 10, 16, 22]) {
      const b = new THREE.Mesh(bollardGeo, m.bollard);
      b.position.set(-17.4, 1.475, z);
      b.castShadow = true;
      this.root.add(b);
      this.wallColliders.push(b);
    }

    // ── Harbour crane — the shared crane.glb asset (left rear side) ──────
    // Replaces the old procedural placeholder: the exact landAsset model,
    // placed near the outer left of the rear area, its boom rotated to reach
    // inward (+x, +z) toward the central water / docking area. Scale 0.38 ≈
    // 17.6 m tall — properly proportioned so human character matches stairs & cabin.
    this._placeCrane(-21.5, -33, -2.705, 0.38); // rotation.y ≈ -155°

    // ── Small believable props near the edges (shared geoms/materials) ──
    // Crates (solid) — on the arm surface (x -25..-17); the old inner-edge
    // props would sit in the open channel now.
    const crateGeo = g.crate; // shared geometry (Part 5)
    const crates = [[-19, 1.6, 1.2, 0], [-20, 1.6, 0.8, 0.4], [-18.6, 2.4, 1.8, 0]];
    for (const [x, y, z, r] of crates) {
      const c = new THREE.Mesh(crateGeo, m.deck);
      c.position.set(x, y, z);
      c.rotation.y = r;
      c.castShadow = true;
      this.root.add(c);
      this.wallColliders.push(c);
    }

    // Barrels (solid) — two standing, one lying on its side.
    const barrelGeo = g.barrel; // shared geometry (Part 5)
    const barrels = [[-22, 1.675, 1.5, 0], [-22, 1.675, 3.2, 0], [-23, 1.54, 2, Math.PI / 2]];
    for (const [x, y, z, r] of barrels) {
      const b = new THREE.Mesh(barrelGeo, m.barrel);
      b.position.set(x, y, z);
      b.rotation.z = r;
      b.castShadow = true;
      this.root.add(b);
      this.wallColliders.push(b);
    }

    // Small containers (solid).
    const containerGeo = g.container; // shared geometry (Part 5)
    const containers = [[-18.2, 1.425, 3.5, 0], [-19, 1.425, 3.8, 0.3]];
    for (const [x, y, z, r] of containers) {
      const c = new THREE.Mesh(containerGeo, m.container);
      c.position.set(x, y, z);
      c.rotation.y = r;
      c.castShadow = true;
      this.root.add(c);
      this.wallColliders.push(c);
    }

    // Rope coils by the mooring bollards (visual only).
    const coilGeo = g.coil; // shared geometry (Part 5)
    for (const z of [5.5, 6.5]) {
      const coil = new THREE.Mesh(coilGeo, m.rope);
      coil.rotation.x = Math.PI / 2; // flat on the deck
      coil.position.set(-18.3, 1.245, z);
      this.root.add(coil);
    }

    // Life ring (visual only).
    const ring = new THREE.Mesh(g.ring, m.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-18.4, 1.275, 12.6);
    this.root.add(ring);

    // Rolled fishing net along the outer area (visual only).
    const net = new THREE.Mesh(g.net, m.net);
    net.rotation.z = Math.PI / 2; // lying along +x
    net.position.set(-18.5, 1.48, 1.5);
    this.root.add(net);

    // ── Safety railing: outer edge (x = -25) + far end (z = 27) ──────────
    // Visual only — the invisible walls below handle the actual collision.
    const postGeo = new THREE.BoxGeometry(0.08, 1.0, 0.08);
    const railOuterGeo = new THREE.BoxGeometry(0.05, 0.06, 27);
    const railEndGeo = new THREE.BoxGeometry(8, 0.06, 0.05);
    for (const z of [0.5, 5.5, 10.5, 15.5, 20.5, 25.5]) {
      const post = new THREE.Mesh(postGeo, m.metal);
      post.position.set(-24.92, 1.7, z);
      this.root.add(post);
    }
    for (const y of [1.5, 1.9]) {
      const rail = new THREE.Mesh(railOuterGeo, m.metal);
      rail.position.set(-24.92, y, 13.5);
      this.root.add(rail);
    }
    for (const x of [-24.9, -22.5, -20.5, -18.5, -17.1]) {
      const post = new THREE.Mesh(postGeo, m.metal);
      post.position.set(x, 1.7, 26.92);
      this.root.add(post);
    }
    for (const y of [1.5, 1.9]) {
      const rail = new THREE.Mesh(railEndGeo, m.metal);
      rail.position.set(-21, y, 26.92);
      this.root.add(rail);
    }

    // ── Character boundary walls: walk the arm, never off it ─────────────
    this._invisibleWall(-24.9, 13.5, 0.2, 27);   // outer edge (x -25..-24.8)
    this._invisibleWall(-17.1, 13.5, 0.2, 27);   // inner dock edge (channel side)
    this._invisibleWall(-21, 27.1, 8, 0.2);      // far end (z 27..27.2)

    // ── Small palm cluster at the wing's outer/rear corner (visual only) ──
    const palms = [[-23, -1.2, 3.0, 1.2], [-21.6, -3.0, 2.6, 1.2], [-24.2, -3.4, 2.4, 1.2]];
    for (const [x, z, s, y] of palms) {
      this._placePalm(x, z, s, y);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  //  PART 3 — Right arm: the U's right side (concrete slab + dock edge + crane)
  // ────────────────────────────────────────────────────────────────────────

  _buildRightWing() {
    const m = this._mat;
    const g = this._geo;

    // ── Arm: concrete slab, x 17..25 (8 m wide), z 0..27, top y = 1.2 ─────
    // EXACT MIRROR of the left arm around X = 0 (RightX = -LeftX): same 8 m
    // width, same 27 m length, same concrete + 1.2 m thickness, flush with
    // the rear base's right edge (x = 25). Inner edge at x = +17 matches the
    // left's -17, so the open channel between the arms is perfectly centered
    // on X = 0.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 27), m.concrete);
    slab.position.set(21, 0.6, 13.5);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.root.add(slab);
    this.colliders.push(slab); // walkable ground + stops the boat at the face

    // Dock edge: dark fender strip along the inner (boat-side) face (x = 17).
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 27), m.metal);
    fender.position.set(16.94, 0.95, 13.5);
    this.root.add(fender);

    // Mooring bollards along the dock edge (solid — walk around them).
    const bollardGeo = g.bollard; // shared geometry (Part 5)
    for (const z of [4, 10, 16, 22]) {
      const b = new THREE.Mesh(bollardGeo, m.bollard);
      b.position.set(17.4, 1.475, z);
      b.castShadow = true;
      this.root.add(b);
      this.wallColliders.push(b);
    }

    // ── Harbour crane — the shared crane.glb asset (right rear side) ─────
    // Replaces the old procedural placeholder: the exact landAsset model,
    // placed near the outer right of the rear area, its boom rotated to reach
    // inward (-x, +z) toward the central water / docking area. Same scale as
    // the left crane (0.38 ≈ 17.6 m).
    this._placeCrane(21.5, -33, 2.705, 0.38); // rotation.y ≈ +155°

    // ── Props — deliberately NOT the exact mirror of the left (Part 5: the
    //    arms keep the same structure but the decorative clusters differ) ──
    // Crates (solid) — only two, at different spots than the left; on the
    // arm surface (x 17..25), clear of the open channel.
    const crateGeo = g.crate; // shared geometry (Part 5)
    const crates = [[19, 1.6, 1.2, 0], [18.6, 2.4, 1.9, 0.3]];
    for (const [x, y, z, r] of crates) {
      const c = new THREE.Mesh(crateGeo, m.deck);
      c.position.set(x, y, z);
      c.rotation.y = r;
      c.castShadow = true;
      this.root.add(c);
      this.wallColliders.push(c);
    }

    // Barrels (solid) — three standing in a row (the left has two + one
    // lying; this side stands all three).
    const barrelGeo = g.barrel; // shared geometry (Part 5)
    const barrels = [[22, 1.675, 1.5, 0], [22, 1.675, 3.2, 0], [23.5, 1.675, 2.4, 0]];
    for (const [x, y, z, r] of barrels) {
      const b = new THREE.Mesh(barrelGeo, m.barrel);
      b.position.set(x, y, z);
      b.rotation.z = r;
      b.castShadow = true;
      this.root.add(b);
      this.wallColliders.push(b);
    }

    // Small containers (solid) — rotated differently than the left pair.
    const containerGeo = g.container; // shared geometry (Part 5)
    const containers = [[18.2, 1.425, 3.5, 0.5], [19.2, 1.425, 3.9, 0]];
    for (const [x, y, z, r] of containers) {
      const c = new THREE.Mesh(containerGeo, m.container);
      c.position.set(x, y, z);
      c.rotation.y = r;
      c.castShadow = true;
      this.root.add(c);
      this.wallColliders.push(c);
    }

    // Rope coils by the mooring bollards (visual only).
    const coilGeo = g.coil; // shared geometry (Part 5)
    for (const z of [5.5, 6.5]) {
      const coil = new THREE.Mesh(coilGeo, m.rope);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(18.3, 1.245, z);
      this.root.add(coil);
    }

    // Life ring (visual only) — hung nearer the dock head than the left's.
    const ring = new THREE.Mesh(g.ring, m.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(18.4, 1.275, 9);
    this.root.add(ring);

    // Rolled fishing net (visual only) — further out along the deck.
    const net = new THREE.Mesh(g.net, m.net);
    net.rotation.z = Math.PI / 2;
    net.position.set(19.5, 1.48, 2.8);
    this.root.add(net);

    // ── Safety railing: outer edge (x = 25) + far end (z = 27) ──────────
    // Mirrored from the left; visual only — walls below do the collision.
    const postGeo = new THREE.BoxGeometry(0.08, 1.0, 0.08);
    const railOuterGeo = new THREE.BoxGeometry(0.05, 0.06, 27);
    const railEndGeo = new THREE.BoxGeometry(8, 0.06, 0.05);
    for (const z of [0.5, 5.5, 10.5, 15.5, 20.5, 25.5]) {
      const post = new THREE.Mesh(postGeo, m.metal);
      post.position.set(24.92, 1.7, z);
      this.root.add(post);
    }
    for (const y of [1.5, 1.9]) {
      const rail = new THREE.Mesh(railOuterGeo, m.metal);
      rail.position.set(24.92, y, 13.5);
      this.root.add(rail);
    }
    for (const x of [24.9, 22.5, 20.5, 18.5, 17.1]) {
      const post = new THREE.Mesh(postGeo, m.metal);
      post.position.set(x, 1.7, 26.92);
      this.root.add(post);
    }
    for (const y of [1.5, 1.9]) {
      const rail = new THREE.Mesh(railEndGeo, m.metal);
      rail.position.set(21, y, 26.92);
      this.root.add(rail);
    }

    // ── Character boundary walls: walk the arm, never off it ─────────────
    this._invisibleWall(24.9, 13.5, 0.2, 27);   // outer edge (x 24.8..25)
    this._invisibleWall(17.1, 13.5, 0.2, 27);   // inner dock edge (channel side)
    this._invisibleWall(21, 27.1, 8, 0.2);      // far end (z 27..27.2)
  }

  // ────────────────────────────────────────────────────────────────────────
  //  PART 5 — Environmental detail (prop rhythm, perimeter, water details)
  // ────────────────────────────────────────────────────────────────────────

  _buildEnvironmentalDetails() {
    const m = this._mat;
    const g = this._geo;

    // ── Detail clusters along the arms — CLUSTER · GAP · CLUSTER rhythm ──
    // The existing southern cluster near the platform end (z 0.8..12.6) is
    // kept; mid (z ~18..22) and far (z ~24..27, inside the 27 m arms)
    // clusters sit mostly toward the OUTER edge, leaving the inner bollard
    // line and the central channel clear. The right arm's clusters are
    // composed differently from the left's — the structure is mirrored,
    // decoration is not (Part 5).

    // ── LEFT arm ─────────────────────────────────────────────────────────
    // Mid cluster: 2-stack of crates + lying barrel + rope coil (outer half).
    for (const [x, y, z] of [[-20.5, 1.6, 19.5], [-20.5, 2.4, 19.5]]) {
      const c = new THREE.Mesh(g.crate, m.deck);
      c.position.set(x, y, z);
      c.castShadow = true;
      this.root.add(c);
      this.wallColliders.push(c);
    }
    const lBarrel = new THREE.Mesh(g.barrel, m.barrel);
    lBarrel.position.set(-22.6, 1.54, 21.2);
    lBarrel.rotation.z = Math.PI / 2;
    lBarrel.castShadow = true;
    this.root.add(lBarrel);
    this.wallColliders.push(lBarrel);
    const lCoil = new THREE.Mesh(g.coil, m.rope);
    lCoil.rotation.x = Math.PI / 2;
    lCoil.position.set(-21.6, 1.245, 18.2);
    this.root.add(lCoil);

    // Far cluster: container + standing barrel + rolled net + life ring
    // (pulled back inside the shorter 27 m arm).
    const lCont = new THREE.Mesh(g.container, m.container);
    lCont.position.set(-19.6, 1.425, 25.5);
    lCont.rotation.y = 0.4;
    lCont.castShadow = true;
    this.root.add(lCont);
    this.wallColliders.push(lCont);
    const lBarrel2 = new THREE.Mesh(g.barrel, m.barrel);
    lBarrel2.position.set(-21.8, 1.675, 26.5);
    lBarrel2.castShadow = true;
    this.root.add(lBarrel2);
    this.wallColliders.push(lBarrel2);
    const lNet = new THREE.Mesh(g.net, m.net);
    lNet.rotation.z = Math.PI / 2;
    lNet.position.set(-23.2, 1.48, 24.6);
    this.root.add(lNet);
    const lRing = new THREE.Mesh(g.ring, m.ring);
    lRing.rotation.x = Math.PI / 2;
    lRing.position.set(-18.4, 1.275, 26.2);
    this.root.add(lRing);

    // ── RIGHT arm — similar but NOT identical clusters ───────────────────
    // Mid cluster: three standing barrels in a row + rolled net (the left
    // has a crate stack + lying barrel + coil here).
    for (const x of [21, 21.8, 22.6]) {
      const b = new THREE.Mesh(g.barrel, m.barrel);
      b.position.set(x, 1.675, 19);
      b.castShadow = true;
      this.root.add(b);
      this.wallColliders.push(b);
    }
    const rNet = new THREE.Mesh(g.net, m.net);
    rNet.rotation.z = Math.PI / 2;
    rNet.position.set(19.8, 1.48, 21.2);
    this.root.add(rNet);

    // Far cluster: 3-high crate stack + rope coil (the left has a container
    // + barrel + net + ring here) — pulled back inside the shorter arm.
    for (const y of [1.6, 2.4, 3.2]) {
      const c = new THREE.Mesh(g.crate, m.deck);
      c.position.set(21.6, y, 25);
      c.castShadow = true;
      this.root.add(c);
      this.wallColliders.push(c);
    }
    const rCoil = new THREE.Mesh(g.coil, m.rope);
    rCoil.rotation.x = Math.PI / 2;
    rCoil.position.set(19.9, 1.245, 26.5);
    this.root.add(rCoil);

    // ── Outer-perimeter rocks: grounded boulders along the wings' outer
    //    faces + framing the harbour mouth. The seabed is at y = -1.5 and
    //    the water is translucent, so each rock's base sits ON the seabed
    //    and its top breaks the surface — nothing floats. Visual only; the
    //    central channel stays completely clear.
    const ROCK = 'nature_kit/Rock Medium.glb';
    const jitter = (a) => (Math.random() - 0.5) * a;
    for (const s of [-1, 1]) { // both outer faces of the U
      for (let z = 4; z <= 36; z += 8) {
        const x = s * (25.8 + Math.random() * 1.6);
        this._placeRock(ROCK, x, z + jitter(1.4), 1.5 + Math.random() * 0.6, { y: -1.3 + Math.random() * 0.15 });
      }
    }
    // A few larger boulders framing the harbour mouth — OUTSIDE the channel
    // (past the arm tips at x ±17), so the boat's entrance path stays clear.
    const mouth = [[-19.5, 42.5, 2.0], [19.5, 42.5, 2.0], [-21.5, 44.5, 1.7], [21.5, 44.5, 1.7], [-19, 44, 1.4], [19, 44, 1.4]];
    for (const [x, z, s] of mouth) {
      this._placeRock(ROCK, x, z, s, { y: -1.25 });
    }

    // ── Water details (visual only — the boat never collides with these) ──
    // Buoys: two flanking the channel's mid-sides + two framing the harbour
    // mouth, all at x ±19.5 — OUTSIDE the arms' inner edges (±17), so they
    // mark the channel without ever sitting inside the boat's route.
    for (const [x, z] of [[-19.5, 28], [19.5, 28], [-19.5, 43], [19.5, 43]]) {
      const buoy = new THREE.Group();
      const body = new THREE.Mesh(g.buoy, m.ring);
      body.position.y = 0.26;
      const base = new THREE.Mesh(g.buoyBase, m.metal);
      base.position.y = 0.02;
      const eye = new THREE.Mesh(g.buoyEye, m.metal);
      eye.position.y = 0.48;
      buoy.add(body, base, eye);
      buoy.position.set(x, 0, z);
      buoy.userData.baseY = 0;
      buoy.userData.phase = Math.random() * Math.PI * 2;
      this.root.add(buoy);
      this._buoys.push(buoy);
    }

    // Small floating debris — driftwood / plastic bits scattered OUTSIDE the
    // channel (beyond the harbour mouth and in the outer sea), so the open
    // water reads alive without ever cluttering the boat's route.
    const debris = [
      [19, 44], [-20, 45.5], [21, 47.5], [-20.5, 48.5],
      [18.5, 42.5], [-19, 43.8], [27.5, 8], [28.5, 20],
      [27, 32], [-27.5, 12], [-28.5, 24], [-27, 34],
    ];
    for (const [x, z] of debris) {
      const piece = new THREE.Mesh(g.debris, Math.random() > 0.5 ? m.deck : m.container);
      piece.position.set(x + jitter(0.6), 0.08 + Math.random() * 0.06, z + jitter(0.6));
      piece.rotation.y = Math.random() * Math.PI * 2;
      piece.rotation.z = jitter(0.15);
      const k = 0.6 + Math.random() * 0.9;
      piece.scale.set(k, k, k);
      this.root.add(piece);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  //  PART 4 — Rear section: main harbour building (the visual anchor)
  // ────────────────────────────────────────────────────────────────────────

  _buildRearSection() {
    const m = this._mat;

    // ── Main building: compact harbour office / warehouse ─────────────────
    // Sits on the extended rear land (the platform now spans z -40..0) at
    // the rear-centre (x -4..4, z -37.75..-32.25, top y = 5.7) — a proper
    // shore-side building BEHIND the harbour's rear land, never inside the
    // water channel. It faces +z (toward the pier / player): the door and
    // windows are on the NORTH face (z = -32.25), so it reads as the
    // landmark seen when returning from the boat. Solid ground beneath it
    // (the platform slab), proper collision (wallCollider), open space all
    // around.
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 5.5), m.wall);
    body.position.set(0, 3.45, -35);
    body.castShadow = true;
    body.receiveShadow = true;
    this.root.add(body);
    this.wallColliders.push(body); // walk around it, never through it

    // Gable roof — two low-poly terracotta slopes meeting at the ridge
    // (apex y = 7.0), with a small overhang beyond the walls.
    const half = 4, rise = 1.3;
    const slopeLen = Math.hypot(half, rise);
    const slopeAngle = Math.atan2(rise, half);
    const slopeGeo = new THREE.BoxGeometry(slopeLen, 0.14, 6.2);
    for (const s of [-1, 1]) {
      const slope = new THREE.Mesh(slopeGeo, m.roof);
      slope.position.set(s * half / 2, 5.7 + rise / 2, -35);
      slope.rotation.z = -s * slopeAngle;
      slope.castShadow = true;
      this.root.add(slope);
    }

    // Door on the north face (faces the pier / player) — dark timber, flush
    // with the wall. Visual only.
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.1), m.plank);
    door.position.set(0, 2.5, -32.2);
    this.root.add(door);

    // Windows: two beside the door (north face) + two per side wall.
    const winGeo = new THREE.BoxGeometry(1.2, 1.0, 0.1);
    for (const x of [-1.9, 1.9]) {
      const w = new THREE.Mesh(winGeo, m.glass);
      w.position.set(x, 3.6, -32.2);
      this.root.add(w);
    }
    const sideWinGeo = new THREE.BoxGeometry(0.1, 1.0, 1.2);
    for (const x of [-4.05, 4.05]) {
      for (const z of [-34, -36.5]) {
        const w = new THREE.Mesh(sideWinGeo, m.glass);
        w.position.set(x, 3.6, z);
        this.root.add(w);
      }
    }

    // ── Palms flanking the building (Part 5) — two, on the open rear land
    //    beside the building (perimeter rule: palms only near corners / the
    //    building / the outer shoreline — never along the arm lengths).
    for (const [x, z] of [[-6.3, -35.2], [6.3, -35.2]]) {
      this._placePalm(x, z, 2.4 + Math.random() * 0.4, 1.2);
    }

    // ── Perimeter palms at the arms' tips (moved from the old 40 m tips to
    //    the new 27 m squared-off ends — the old spots now sit in open water
    //    / the channel mouth). Never in the channel; keeps the tips' inner
    //    faces clear for future docking.
    const palms = [
      [-22.5, 25.5, 2.6, 1.2], [-17.8, 25.6, 2.2, 1.2],
      [22.5, 25.5, 2.6, 1.2], [17.8, 25.6, 2.2, 1.2],
    ];
    for (const [x, z, s, y] of palms) {
      this._placePalm(x, z, s, y);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Rear shoreline: berm + rocks + controlled tree clusters
  // ────────────────────────────────────────────────────────────────────────

  _buildRearShoreline() {
    // Narrow natural land berm directly behind the platform's (extended) rear
    // edge — just enough ground to support the rocks, never another large
    // landmass. 50 m wide × 4 m deep, top at y = 0.7, base on the seabed
    // (-1.5). Moved south with the Part 4 rear land (z -44..-40).
    const sand = new THREE.MeshStandardMaterial({ color: 0xc99f5e, roughness: 1, flatShading: true });
    const berm = new THREE.Mesh(new THREE.BoxGeometry(50, 2.2, 4), sand);
    berm.position.set(0, -0.4, -42);
    berm.castShadow = true;
    berm.receiveShadow = true;
    this.root.add(berm);

    // Existing project land assets — the same models the world vegetation uses.
    const ROCK = 'nature_kit/Rock Medium.glb';
    const STONE = 'nature_kit/Rock Path Round Small.glb';
    const jitter = (a) => (Math.random() - 0.5) * a;

    // ── Corner stone formations: one large broad light-grey stone + smaller
    //    dark rocks around its base + a 3-palm cluster. Mirrored left/right.
    const corner = (s) => { // s = -1 (left) or +1 (right)
      const X = s * 22.5;   // formation centre, near the far rear corner
      const Z = -42.2;      // behind the extended rear land (z < -40)

      // The main feature — a large, broad, light-grey stone (widened and
      // slightly flattened so it reads as a wide shoreline boulder).
      this._placeRock(ROCK, X, Z, 3.4, { broad: true, low: true, tint: 1.35 });
      // A second large stone tucked behind for a layered, broad formation.
      this._placeRock(ROCK, X + s * 1.7, Z - 0.8, 2.4, { tint: 1.2 });
      // Smaller dark rocks clustered around the bottom and sides.
      const darks = [
        [X - s * 1.8, Z + 0.5, 1.4], [X - s * 1.3, Z - 1.2, 1.0],
        [X + s * 1.5, Z + 0.9, 1.2], [X + s * 2.2, Z - 0.9, 0.8],
        [X - s * 2.5, Z - 0.5, 0.9], [X + s * 0.4, Z - 0.8, 0.7],
      ];
      for (const [rx, rz, rs] of darks) {
        this._placeRock(ROCK, rx, rz, rs, { tint: 0.55 });
      }
      // 2–3 palms directly around and slightly behind the formation, at
      // different heights (planting depth) and rotations.
      const palms = [
        [X - s * 2.0, Z + 0.6, 2.9, 0.68],
        [X + s * 1.8, Z - 1.4, 3.3, 0.55],
        [X - s * 0.9, Z - 1.1, 2.5, 0.72],
      ];
      for (const [px, pz, ps, py] of palms) {
        this._placePalm(px, pz, ps, py);
      }
    };
    corner(-1);
    corner(1);

    // ── Low, irregular line of medium + small rocks between the corners ──
    // Medium rocks keep away from the centre (x -9..9 stays open).
    const medium = [
      [-18, -41.8, 1.5], [-14.5, -43.0, 1.3], [-11, -41.6, 1.4],
      [11, -41.7, 1.4], [14.5, -43.1, 1.3], [18, -41.9, 1.5],
    ];
    for (const [x, z, s] of medium) {
      this._placeRock(ROCK, x + jitter(0.7), z + jitter(0.6), s);
    }

    // Small stones hugging the rear perimeter — sparse through the centre.
    const lineX = [-24.5, -21.5, -19, -16.5, -13, -10, -8.5, 8.5, 10, 13, 16.5, 19, 21.5, 24.5];
    for (const x of lineX) {
      this._placeRock(STONE, x + jitter(0.5), -41.0 - Math.random() * 1.6, 0.5 + Math.random() * 0.4);
    }

    // A few small rocks in the background of the middle section only — the
    // centre of the rear edge stays mostly open behind the main building.
    const background = [[-5, -43.6, 0.6], [0, -43.4, 0.5], [5, -43.7, 0.65]];
    for (const [x, z, s] of background) {
      this._placeRock(STONE, x, z, s);
    }
  }

  /** Clone an existing rock asset onto the shoreline (base on the berm top
   * unless opts.y is given). opts: { broad, low } non-uniform scale;
   * { tint } colour multiplier (new material clone — never mutates the
   * shared cached material); { y } base height (water rocks sit on the
   * seabed at y ~ -1.3 so they read as grounded, not floating). */
  _placeRock(path, x, z, scale, opts = {}) {
    AssetManager.loadGLTF(path).then(gltf => {
      const rock = gltf.scene.clone();
      rock.scale.set(opts.broad ? scale * 1.3 : scale, opts.low ? scale * 0.75 : scale, scale);
      rock.position.set(x, opts.y ?? 0.65, z);
      rock.rotation.y = Math.random() * Math.PI * 2;
      rock.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (opts.tint) {
            const mat = Array.isArray(child.material)
              ? child.material.map(m => m.clone())
              : child.material.clone();
            const apply = (m) => { if (m.color) m.color.multiplyScalar(opts.tint); };
            (Array.isArray(mat) ? mat : [mat]).forEach(apply);
            child.material = mat;
          }
        }
      });
      this.root.add(rock);
    }).catch(() => {
      // Asset unavailable (e.g. the .glb is a Git-LFS pointer that was never
      // smudged) — fall back to a low-poly procedural boulder so the
      // shoreline always has rocks. Queued, then flushed into InstancedMeshes.
      this._queueProceduralRock(x, z, scale, opts);
    });
  }

  /** Queue a procedural boulder for the instanced flush (see
   * _flushProceduralRocks). The icosahedron is centered on its origin, so the
   * mesh is lifted by half its scaled height to rest its base on the ground
   * (opts.y ?? 0.65), matching where the GLB rock base would sit. */
  _queueProceduralRock(x, z, scale, opts = {}) {
    const sx = opts.broad ? scale * 1.3 : scale;
    const sy = opts.low ? scale * 0.75 : scale;
    const sz = scale;
    this._procRocks.push({
      x, z,
      y: (opts.y ?? 0.65) + sy * 0.5,
      sx, sy, sz,
      rotY: Math.random() * Math.PI * 2,
      tilt: (Math.random() - 0.5) * 0.3,
      dark: opts.tint !== undefined && opts.tint < 1,
    });
  }

  /** Build all queued procedural rocks into two InstancedMeshes (default /
   * light-grey, dark) — ONE draw call per material for the whole shoreline
   * instead of one per rock. Called lazily from update() so every failed
   * load is collected regardless of async resolution order. */
  _flushProceduralRocks() {
    if (!this._procRocks.length) return;
    const geo = this._geo.rock;
    const light = [];
    const dark = [];
    for (const r of this._procRocks) (r.dark ? dark : light).push(r);
    for (const [list, mat] of [[light, this._mat.rockLight], [dark, this._mat.rockDark]]) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const m4 = new THREE.Matrix4();
      const euler = new THREE.Euler();
      const quat = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      let i = 0;
      for (const r of list) {
        euler.set(r.tilt, r.rotY, 0);
        quat.setFromEuler(euler);
        pos.set(r.x, r.y, r.z);
        scl.set(r.sx, r.sy, r.sz);
        m4.compose(pos, quat, scl);
        mesh.setMatrixAt(i++, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Instances are scattered across the harbour — the default bounding
      // sphere (from the tiny base geometry) would wrongly cull them.
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    this._procRocks = [];
  }

  /** Clone the project's coconut palm onto the shoreline. y varies the
   * planting height so the cluster reads as growing on uneven ground. */
  _placePalm(x, z, scale, y = 0.7) {
    AssetManager.loadGLTF('assets/landAsset/coconut-palm.glb').then(gltf => {
      const palm = gltf.scene.clone();
      palm.scale.set(scale, scale * 1.35, scale); // tropical palms grow taller
      palm.position.set(x, y, z);
      palm.rotation.y = Math.random() * Math.PI * 2;
      palm.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.root.add(palm);
    }).catch(() => { /* asset missing — skip gracefully */ });
  }

  /** Place one of the two harbour cranes — the shared 'landAsset/Crane.glb'
   * model, cloned so both cranes are identical (the old procedural
   * placeholders are gone; this asset is the single source of truth). The
   * model's native ground plane sits at y ≈ -0.07, so each clone is lifted
   * so its base rests exactly on the platform surface (top y = 1.2) — never
   * floating, sinking or intersecting the concrete. rotationY aims the boom
   * (the model's -z axis) toward the central water / docking area. An
   * invisible base wall keeps the player out of the tower footprint. */
  _placeCrane(x, z, rotationY, scale) {
    AssetManager.loadGLTF('landAsset/Crane.glb').then(gltf => {
      const crane = gltf.scene.clone();
      crane.scale.setScalar(scale);
      crane.rotation.y = rotationY;
      crane.position.set(x, 1.2 + 0.07 * scale, z); // base sits on y = 1.2
      crane.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.root.add(crane);
    }).catch(err => {
      // No procedural fallback — the GLB is the required crane model.
      console.error('Harbour crane asset failed to load (landAsset/Crane.glb):', err);
    });
    // Keep the player out of the crane's base footprint — sized with the
    // model (native base AABB ≈ 16 × 15 m) so it tracks the scale.
    const baseSize = 16.2 * scale;
    this._invisibleWall(x, z, baseSize, baseSize);
  }

  _invisibleWall(x, z, xLen, zLen) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(xLen, 3.0, zLen),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    wall.position.set(x, 1.5, z);
    this.root.add(wall);
    if (this.wallColliders) this.wallColliders.push(wall);
    return wall;
  }

  /** Invisible solid for BOAT collision only — sits below the deck line where
   * the character never walks, so the boat bumps harbour structures instead of
   * sailing under their decks (the boat's collision probe is at y = 0.3). */
  _invisibleFill(w, h, d, x, y, z) {
    const fill = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    fill.position.set(x, y, z);
    this.root.add(fill);
    this.colliders.push(fill);
    return fill;
  }

  /** Move the whole harbour (and its spawn points) by -offset — floating
   * origin rebase so the player can sail unlimited distances. */
  rebase(offset) {
    this.root.position.sub(offset);
    if (this.playerSpawn) this.playerSpawn.sub(offset);
    if (this.boatSpawn) this.boatSpawn.sub(offset);
    if (this.boardingPoint) this.boardingPoint.sub(offset);
    if (this.dockEnd) this.dockEnd.sub(offset);
  }

  update(fd = 0.016) {
    // Flush any procedural rocks whose GLB loads failed (collected during
    // construction) — runs once, then the queue is empty.
    if (this._procRocks.length) this._flushProceduralRocks();

    // Gentle bob for the Part 5 harbour buoys — one cheap loop over a few
    // groups, no per-frame geometry or material work. The harbour sits in
    // the wave-calm zone, so this is purely visual life.
    if (this._buoys.length) {
      this._buoyPhase += fd;
      for (const b of this._buoys) {
        b.position.y = b.userData.baseY + Math.sin(this._buoyPhase * 1.8 + b.userData.phase) * 0.07;
      }
    }
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
