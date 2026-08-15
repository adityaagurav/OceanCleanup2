import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

/**
 * HarbourManager.js — The harbour's rear foundation + rear shoreline.
 *
 * CURRENT STEP: build ONLY the large rear base platform. A single clean,
 * perfectly rectangular solid slab of light-grey concrete — 50 m wide (x) ×
 * 30 m deep (z) × 1.2 m tall — with straight 90° corners and a uniform
 * low-poly finish. The whole 50 × 30 m surface is intentionally empty and
 * unobstructed: the main recycling / boat-upgrade building, cargo cranes,
 * containers, the central pier and the U-shaped side sections will be built
 * around it in later steps.
 *
 * Layout (top view, +z faces the future open ocean / central pier):
 *   - Platform spans x -25..25 (50 m), z -30..0 (30 m).
 *   - Front edge at z = 0 → will later connect to the central pier.
 *   - Left / right edges at x = ±25 → will later connect to the U's side
 *     sections.
 *   - Top surface at y = 1.2; the bottom sits at the waterline (y = 0) so the
 *     full 1.2 m thickness reads as one clean vertical wall from the
 *     water-facing side — no slopes, steps, ramps or gaps.
 *   - Invisible edge walls keep the player on the platform until the pier and
 *     side sections exist.
 *
 * REAR SHORELINE (current step): behind the platform's rear edge (−z) a narrow
 * natural berm (50 m wide × 4 m deep, sand top at y = 0.7) supports a low-poly
 * rocky shoreline. The two far rear corners hold the main features — a large,
 * broad, light-grey stone formation ringed by smaller dark rocks, with 2–3
 * coconut palms clustered around and slightly behind it (varied sizes and
 * heights). Between the corners a low, irregular line of medium and small
 * rocks follows the rear edge, staying sparse through the centre so the area
 * behind the future main building stays mostly open. No buildings / cranes /
 * containers / boats / side docks yet.
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

    // Foundation coordinates — spawn on the platform near the front edge,
    // facing the future water-facing side (+z).
    this.playerSpawn = new THREE.Vector3(0, 1.5, -2);
    // No boat / pier / side sections exist yet — the engine must not create
    // a boat (null boatSpawn means "skip the boat setup").
    this.boatSpawn = null;
    this.boardingPoint = null;
    this.dockEnd = null;

    this._build();
  }

  _build() {
    // ── Rear base platform: 50 m (x) × 30 m (z) × 1.2 m (y) ──────────────
    // One solid slab, top surface at y = 1.2, bottom at the waterline (y = 0)
    // so the full 1.2 m thickness shows as a clean vertical side wall from
    // the water-facing side. Uniform light-grey low-poly concrete. The
    // geometry expands evenly from all sides of the previous 40 × 24 m
    // foundation, so the platform stays centred (x 0, z -15) and un-distorted.
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.95 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(50, 1.2, 30), concrete);
    slab.position.set(0, 0.6, -15); // top at y = 1.2, bottom at y = 0
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.root.add(slab);
    this.colliders.push(slab);

    // ── Invisible edge walls (character collision only) ──────────────────
    // Keep the player on the platform until the central pier and side
    // sections are built. Invisible material → skipped by the renderer, yet
    // still fully solid to the character's horizontal collision probes.
    this._invisibleWall(0, -30, 50, 0.2);   // back edge
    this._invisibleWall(0, 0, 50, 0.2);     // front (water-facing) edge
    this._invisibleWall(-25, -15, 0.2, 30); // left edge
    this._invisibleWall(25, -15, 0.2, 30);  // right edge

    // Natural rocky shoreline along the rear edge (behind the platform).
    this._buildRearShoreline();
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Rear shoreline: berm + rocks + controlled tree clusters
  // ────────────────────────────────────────────────────────────────────────

  _buildRearShoreline() {
    // Narrow natural land berm directly behind the platform's rear edge — just
    // enough ground to support the rocks, never another large landmass.
    // 50 m wide × 4 m deep, top at y = 0.7, base on the seabed (-1.5).
    const sand = new THREE.MeshStandardMaterial({ color: 0xc99f5e, roughness: 1, flatShading: true });
    const berm = new THREE.Mesh(new THREE.BoxGeometry(50, 2.2, 4), sand);
    berm.position.set(0, -0.4, -32);
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
      const Z = -32.2;

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
      [-18, -31.8, 1.5], [-14.5, -33.0, 1.3], [-11, -31.6, 1.4],
      [11, -31.7, 1.4], [14.5, -33.1, 1.3], [18, -31.9, 1.5],
    ];
    for (const [x, z, s] of medium) {
      this._placeRock(ROCK, x + jitter(0.7), z + jitter(0.6), s);
    }

    // Small stones hugging the rear perimeter — sparse through the centre.
    const lineX = [-24.5, -21.5, -19, -16.5, -13, -10, -8.5, 8.5, 10, 13, 16.5, 19, 21.5, 24.5];
    for (const x of lineX) {
      this._placeRock(STONE, x + jitter(0.5), -31.0 - Math.random() * 1.6, 0.5 + Math.random() * 0.4);
    }

    // A few small rocks in the background of the middle section only — the
    // centre of the rear edge stays mostly open for the future main building.
    const background = [[-5, -33.6, 0.6], [0, -33.4, 0.5], [5, -33.7, 0.65]];
    for (const [x, z, s] of background) {
      this._placeRock(STONE, x, z, s);
    }
  }

  /** Clone an existing rock asset onto the shoreline (base on the berm top).
   * opts: { broad, low } non-uniform scale; { tint } colour multiplier (new
   * material clone — never mutates the shared cached material). */
  _placeRock(path, x, z, scale, opts = {}) {
    AssetManager.loadGLTF(path).then(gltf => {
      const rock = gltf.scene.clone();
      rock.scale.set(opts.broad ? scale * 1.3 : scale, opts.low ? scale * 0.75 : scale, scale);
      rock.position.set(x, 0.65, z);
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
    }).catch(() => { /* asset missing — skip gracefully */ });
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

  /** Move the whole harbour (and its spawn points) by -offset — floating
   * origin rebase so the player can sail unlimited distances. */
  rebase(offset) {
    this.root.position.sub(offset);
    if (this.playerSpawn) this.playerSpawn.sub(offset);
    if (this.boatSpawn) this.boatSpawn.sub(offset);
    if (this.boardingPoint) this.boardingPoint.sub(offset);
    if (this.dockEnd) this.dockEnd.sub(offset);
  }

  update() {
    // No animated elements in the foundation step.
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
