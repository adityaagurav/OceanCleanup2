import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

/**
 * FishingBoat.js — Replaces the ProceduralCharacter with a loaded fishing_boat.glb
 * Implements the same interface so CharacterController works without modifications.
 */
export class FishingBoat {
  constructor() {
    this.root = new THREE.Group();
    this.boatMesh = null;

    // Animation time accumulator
    this._t      = 0;
    this._state  = 'Idle';
    this._speed  = 0;

    this._build();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────────

  /** Add to scene */
  addTo(scene) { scene.add(this.root); }

  /** Remove from scene */
  removeFrom(scene) { scene.remove(this.root); }

  /**
   * Drive animations every render frame.
   * @param {string} state  — 'Idle'|'Walk'|'Run'|'Jump'|'Fall'|'Fish'
   * @param {number} speed  — horizontal speed in m/s
   * @param {number} dt     — frame delta in seconds
   */
  update(state, speed, dt) {
    this._state = state;
    this._speed = speed;
    this._t    += dt;
    this._animate();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Build rig
  // ─────────────────────────────────────────────────────────────────────────

  _build() {
    // Load the GLB asset
    AssetManager.loadGLTF('new_assets/fishing_boat.glb').then(gltf => {
      this.boatMesh = gltf.scene.clone();
      
      // Enable shadows
      this.boatMesh.traverse(obj => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      
      // Adjust scale and position based on the fishing_boat.glb standard
      this.boatMesh.scale.set(1.5, 1.5, 1.5); 
      
      // The boat might be oriented differently (e.g. facing sideways)
      // Usually +Z or -Z is forward. If it's facing X, we can rotate it here.
      // Assuming it faces Z like most models, but if not we can adjust it later.
      this.boatMesh.rotation.y = Math.PI; 
      
      this.root.add(this.boatMesh);
    }).catch(err => {
      console.error('Failed to load fishing boat:', err);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Animation
  // ─────────────────────────────────────────────────────────────────────────

  _animate() {
    if (!this.boatMesh) return;
    
    const t = this._t;
    const speed = this._speed;
    
    // Engine bobbing and swaying on the water
    const bob = Math.sin(t * 2.0) * 0.1;
    const sway = Math.cos(t * 1.5) * 0.05;
    
    this.boatMesh.position.y = bob;
    
    // When moving fast (speed > 0), tilt the boat backwards like a speedboat
    // max tilt is around 0.15 radians
    const targetPitch = speed > 1.0 ? -0.15 : 0;
    this.boatMesh.rotation.x = THREE.MathUtils.lerp(this.boatMesh.rotation.x, targetPitch, 0.1);
    
    // Add side-to-side roll based on turning... (if we had turn speed)
    // For now, just add a natural idle sway
    this.boatMesh.rotation.z = sway;
  }
}
