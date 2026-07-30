import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

/**
 * FishingBoat.js — Stylized fishing boat with procedural fallback.
 *
 * Loads fishing_boat.glb async, but shows a procedural boat immediately
 * so the player always sees a boat from the start. The GLB replaces the
 * procedural version once loaded.
 */
export class FishingBoat {
  constructor() {
    this.root = new THREE.Group();
    this.boatMesh = null;
    this.proceduralBoat = null;

    // Animation time accumulator
    this._t      = 0;
    this._state  = 'Idle';
    this._speed  = 0;

    this._buildProcedural(); // Instant visibility
    this._loadGLB();         // Async upgrade
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────────

  addTo(scene) { scene.add(this.root); }
  removeFrom(scene) { scene.remove(this.root); }

  /** Return the deck collider for the character to walk on */
  getCollider() { return this.deckCollider; }

  update(state, speed, dt) {
    this._state = state;
    this._speed = speed;
    this._t    += dt;
    this._animate();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Build procedural boat (instant)
  // ─────────────────────────────────────────────────────────────────────────

  _buildProcedural() {
    const boat = new THREE.Group();

    // Materials
    const woodDark  = new THREE.MeshStandardMaterial({ color: 0x5D3A1A, roughness: 0.9, flatShading: true });
    const woodLight = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.85, flatShading: true });
    const metal     = new THREE.MeshStandardMaterial({ color: 0x7B8794, roughness: 0.4, metalness: 0.6, flatShading: true });
    const white     = new THREE.MeshStandardMaterial({ color: 0xE8E8E8, roughness: 0.7, flatShading: true });
    const red       = new THREE.MeshStandardMaterial({ color: 0xCC3333, roughness: 0.7, flatShading: true });
    const teal      = new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.7, flatShading: true });

    // Hull (main body — tapered box)
    const hullGeo = new THREE.BoxGeometry(2.6, 0.8, 5.5);
    // Taper the front by modifying vertices
    const hullPos = hullGeo.attributes.position;
    for (let i = 0; i < hullPos.count; i++) {
      const z = hullPos.getZ(i);
      const y = hullPos.getY(i);
      // Taper front (positive Z)
      if (z > 1.5) {
        const taper = 1.0 - (z - 1.5) / 4.0 * 0.6;
        hullPos.setX(i, hullPos.getX(i) * taper);
      }
      // Raise bottom edges slightly (V-hull)
      if (y < 0) {
        const vhull = 1.0 - Math.abs(hullPos.getX(i)) / 1.3 * 0.2;
        hullPos.setY(i, y * vhull);
      }
    }
    hullGeo.computeVertexNormals();
    const hull = new THREE.Mesh(hullGeo, woodDark);
    hull.position.y = 0.3;
    boat.add(hull);

    // Deck (flat top)
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.1, 4.5),
      woodLight
    );
    deck.position.y = 0.7;
    boat.add(deck);

    // Railing — port side
    const railGeo = new THREE.BoxGeometry(0.06, 0.35, 4.0);
    const railL = new THREE.Mesh(railGeo, woodDark);
    railL.position.set(-1.15, 1.0, -0.2);
    boat.add(railL);
    // Railing — starboard
    const railR = new THREE.Mesh(railGeo.clone(), woodDark);
    railR.position.set(1.15, 1.0, -0.2);
    boat.add(railR);

    // Stern wall
    const sternWall = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.45, 0.08),
      woodDark
    );
    sternWall.position.set(0, 0.95, -2.3);
    boat.add(sternWall);

    // Cabin / wheelhouse (small box structure)
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.0, 1.2),
      white
    );
    cabin.position.set(0, 1.4, -0.8);
    boat.add(cabin);

    // Cabin roof
    const cabinRoof = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 1.4),
      teal
    );
    cabinRoof.position.set(0, 1.95, -0.8);
    boat.add(cabinRoof);

    // Window (dark cutout on cabin)
    const window1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1B3A4B, roughness: 0.3, flatShading: true })
    );
    window1.position.set(0, 1.55, -0.18);
    boat.add(window1);

    // Mast / pole
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6),
      metal
    );
    mast.position.set(0, 2.2, 0.5);
    boat.add(mast);

    // Flag on mast
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.3),
      red
    );
    flag.material.side = THREE.DoubleSide;
    flag.position.set(0.25, 3.3, 0.5);
    boat.add(flag);

    // Outboard motor (stern)
    const motor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.5, 0.25),
      metal
    );
    motor.position.set(0, 0.4, -2.6);
    boat.add(motor);

    // Motor propeller shaft
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6),
      metal
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0.15, -2.8);
    boat.add(shaft);

    // Rope coils (decorative)
    const ropeGeo = new THREE.TorusGeometry(0.12, 0.03, 6, 10);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xD4A574, roughness: 0.9, flatShading: true });
    const rope1 = new THREE.Mesh(ropeGeo, ropeMat);
    rope1.position.set(0.7, 0.8, 1.0);
    rope1.rotation.x = Math.PI / 2;
    boat.add(rope1);

    // Bucket (for cleanup)
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.10, 0.2, 8),
      teal
    );
    bucket.position.set(-0.6, 0.85, 1.2);
    boat.add(bucket);

    // Enable shadows
    boat.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // Add invisible collision proxy for the deck
    const deckColliderGeo = new THREE.BoxGeometry(2.4, 0.2, 5.0);
    const deckColliderMat = new THREE.MeshBasicMaterial({ visible: false });
    this.deckCollider = new THREE.Mesh(deckColliderGeo, deckColliderMat);
    this.deckCollider.position.set(0, 0.65, 0);
    boat.add(this.deckCollider);

    this.proceduralBoat = boat;
    this.root.add(boat);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Async GLB load (replaces procedural boat when ready)
  // ─────────────────────────────────────────────────────────────────────────

  _loadGLB() {
    AssetManager.loadGLTF('new_assets/fishing_boat.glb').then(gltf => {
      this.boatMesh = gltf.scene.clone();

      this.boatMesh.traverse(obj => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      this.boatMesh.scale.set(1.5, 1.5, 1.5);
      this.boatMesh.rotation.y = Math.PI;

      // Replace procedural boat with GLB
      if (this.proceduralBoat) {
        this.root.remove(this.proceduralBoat);
        this.proceduralBoat = null;
      }
      this.root.add(this.boatMesh);
    }).catch(err => {
      // GLB failed to load — procedural boat stays visible
      console.warn('Fishing boat GLB failed to load, using procedural fallback:', err.message || err);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Animation
  // ─────────────────────────────────────────────────────────────────────────

  _animate() {
    const target = this.boatMesh || this.proceduralBoat;
    if (!target) return;

    const t = this._t;
    const speed = this._speed;

    // Bobbing on water
    const bob = Math.sin(t * 2.0) * 0.1;
    const sway = Math.cos(t * 1.5) * 0.05;

    target.position.y = bob;

    // Speed-based pitch (nose up at speed)
    const targetPitch = speed > 1.0 ? -0.12 : 0;
    if (target.rotation) {
      target.rotation.x = THREE.MathUtils.lerp(target.rotation.x, targetPitch, 0.1);
      target.rotation.z = sway;
    }
  }
}
