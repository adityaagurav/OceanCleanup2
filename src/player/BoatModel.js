import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

/**
 * BoatModel.js — Stylized boat visual model that supports dynamic upgrading.
 */
export class BoatModel {
  constructor() {
    this.root = new THREE.Group();
    this.boatMesh = null;
    this.proceduralBoat = null;

    // Animation time accumulator
    this._t      = 0;
    this._state  = 'Idle';
    this._speed  = 0;

    // Default collision proxy
    const deckColliderGeo = new THREE.BoxGeometry(2.4, 0.2, 5.0);
    const deckColliderMat = new THREE.MeshBasicMaterial({ visible: false });
    this.deckCollider = new THREE.Mesh(deckColliderGeo, deckColliderMat);
    this.deckCollider.position.set(0, 0.65, 0);
    this.root.add(this.deckCollider);

    this.currentLevel = null;
  }

  addTo(scene) { scene.add(this.root); }
  removeFrom(scene) { scene.remove(this.root); }
  getCollider() { return this.deckCollider; }

  update(state, speed, dt) {
    this._state = state;
    this._speed = speed;
    this._t    += dt;
    this._animate();
  }

  /**
   * Load a new boat configuration.
   * @param {Object} config - { glb, scale, color }
   */
  async loadUpgrade(config) {
    this.currentLevel = config;
    
    // Show procedural boat as a placeholder while loading
    this._buildProcedural(config.color, config.scale);
    
    // Attempt to load GLB
    let gltf;
    try {
      gltf = await AssetManager.loadGLTF(config.glb);
    } catch (err) {
      console.warn(`Boat GLB ${config.glb} failed to load, falling back to procedural.`, err.message);
      this._buildProcedural(config.color, config.scale);
      return;
    }

    // Success — swap mesh
    if (this.boatMesh) this.root.remove(this.boatMesh);
    if (this.proceduralBoat) this.root.remove(this.proceduralBoat);

    this.boatMesh = gltf.scene.clone();
    this.boatMesh.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.boatMesh.scale.set(config.scale, config.scale, config.scale);
    this.boatMesh.rotation.y = Math.PI;

    // Scale the invisible collider based on visual scale
    const scaleRatio = config.scale / 1.5; // base scale was 1.5
    this.deckCollider.scale.set(scaleRatio, 1, scaleRatio);
    this.deckCollider.position.y = 0.65 * scaleRatio;

    this.root.add(this.boatMesh);
  }

  _buildProcedural(hullColorHex, targetScale) {
    if (this.boatMesh) { this.root.remove(this.boatMesh); this.boatMesh = null; }
    if (this.proceduralBoat) { this.root.remove(this.proceduralBoat); }

    const boat = new THREE.Group();

    const woodDark  = new THREE.MeshStandardMaterial({ color: 0x5D3A1A, roughness: 0.9, flatShading: true });
    const woodLight = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.85, flatShading: true });
    const metal     = new THREE.MeshStandardMaterial({ color: 0x7B8794, roughness: 0.4, metalness: 0.6, flatShading: true });
    const hullMat   = new THREE.MeshStandardMaterial({ color: hullColorHex, roughness: 0.7, flatShading: true });
    const teal      = new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.7, flatShading: true });

    // Hull (main body — tapered box)
    const hullGeo = new THREE.BoxGeometry(2.6, 0.8, 5.5);
    const pos = hullGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > 0) { // Front vertices
        pos.setX(i, pos.getX(i) * 0.4);
      }
    }
    hullGeo.computeVertexNormals();
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.4;
    boat.add(hull);

    // Inner deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 4.8), woodLight);
    deck.position.y = 0.75;
    deck.position.z = -0.2;
    boat.add(deck);

    // Cabin / Steering console
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.8), woodDark);
    consoleBox.position.set(0, 1.2, -1.0);
    boat.add(consoleBox);

    // Steering wheel
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12), metal);
    wheel.rotation.x = -Math.PI / 4;
    wheel.position.set(0, 1.4, -0.5);
    boat.add(wheel);

    // Engine
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.25), metal);
    motor.position.set(0, 0.4, -2.6);
    boat.add(motor);

    // Rope coils
    const ropeGeo = new THREE.TorusGeometry(0.12, 0.03, 6, 10);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xD4A574, roughness: 0.9, flatShading: true });
    const rope1 = new THREE.Mesh(ropeGeo, ropeMat);
    rope1.position.set(0.7, 0.8, 1.0);
    rope1.rotation.x = Math.PI / 2;
    boat.add(rope1);

    // Bucket
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.2, 8), teal);
    bucket.position.set(-0.6, 0.85, 1.2);
    boat.add(bucket);

    boat.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const scaleRatio = targetScale / 1.5;
    boat.scale.set(scaleRatio, scaleRatio, scaleRatio);
    this.deckCollider.scale.set(scaleRatio, 1, scaleRatio);
    this.deckCollider.position.y = 0.65 * scaleRatio;

    this.proceduralBoat = boat;
    this.root.add(boat);
  }

  _animate() {
    const target = this.boatMesh || this.proceduralBoat;
    if (!target) return;

    const t = this._t;
    const speed = this._speed;

    const bob = Math.sin(t * 2.0) * 0.1;
    target.position.y = bob;

    const targetPitch = speed > 1.0 ? -0.12 : 0;
    if (target.rotation) {
      target.rotation.x = THREE.MathUtils.lerp(target.rotation.x, targetPitch, 0.1);
    }
  }
}
