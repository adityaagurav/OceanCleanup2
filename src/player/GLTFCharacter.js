import * as THREE from 'three';
import { ProceduralCharacter } from './ProceduralCharacter.js';

/**
 * GLTFCharacter.js — Character visual wrapper.
 *
 * Uses ProceduralCharacter for instant-load procedural geometry.
 * Exposes a unified API consumed by CharacterController.
 * Swapping to a GLTF model later only requires changing this file.
 */
export class GLTFCharacter {
  constructor() {
    this._char = new ProceduralCharacter();
    this.root = this._char.root;

    // Expose named parts for camera clipping (hide head in FPS mode)
    this.head = this._char.head;
    this.torso = this._char.torso;
  }

  addTo(scene) { this._char.addTo(scene); }
  removeFrom(scene) { this._char.removeFrom(scene); }

  /**
   * Drive character animation.
   * @param {string} state  — 'Idle'|'Walk'|'Run'|'Sprint'|'Jump'|'Fall'|etc.
   * @param {number} speed  — horizontal speed in m/s
   * @param {number} dt     — frame delta in seconds
   */
  update(state, speed, dt) {
    this._char.update(state, speed, dt);
  }

  /**
   * Set internal animation state time (used by AnimationController).
   * @param {number} time
   */
  setStateTime(time) {
    this._char._stateTime = time;
  }
}
