import * as THREE from 'three';
import { PlayerConfig } from '../config/PlayerConfig.js';

/**
 * InteractionSystem.js — Centralized interaction manager.
 *
 * Handles all E/F key interactions in one place instead of scattered key handlers.
 * Objects register themselves as interactables, and the system finds the nearest
 * one within radius, applies a visual highlight, and fires the callback on interact.
 *
 * Supported interaction types:
 *   'boat', 'trash', 'fishing_spot', 'npc', 'treasure', 'sign', 'building'
 *
 * Usage:
 *   interactionSystem.registerInteractable(boatMesh, 'boat', () => toggleBoat());
 *   interactionSystem.update(playerPos);  // per frame
 *   if (input.consumePress('interact')) interactionSystem.interact();
 */

const { INTERACTION_RADIUS, HIGHLIGHT_PULSE_SPEED } = PlayerConfig;

export class InteractionSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    /** @type {Map<THREE.Object3D, {type: string, onInteract: function, getPosition: function}>} */
    this._interactables = new Map();

    /** Currently nearest interactable info (or null) */
    this._nearest = null;

    /** Highlight ring (reusable, moved to nearest interactable) */
    this._highlight = this._createHighlight();
    this._highlight.visible = false;
    this.scene.add(this._highlight);

    this._time = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Registration
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register an object as interactable.
   * @param {THREE.Object3D} object — the 3D object to interact with
   * @param {string} type — interaction type ('boat', 'trash', etc.)
   * @param {function} onInteract — callback when player interacts
   * @param {function} [getPosition] — optional custom position getter
   */
  registerInteractable(object, type, onInteract, getPosition = null, radius = INTERACTION_RADIUS) {
    this._interactables.set(object, {
      type,
      onInteract,
      radius,
      getPosition: getPosition || (() => {
        const pos = new THREE.Vector3();
        object.getWorldPosition(pos);
        return pos;
      }),
    });
  }

  /**
   * Remove an interactable.
   * @param {THREE.Object3D} object
   */
  unregisterInteractable(object) {
    this._interactables.delete(object);
    if (this._nearest && this._nearest.object === object) {
      this._nearest = null;
      this._highlight.visible = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Per-Frame Update
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find nearest interactable and update highlight. Call every frame.
   * @param {THREE.Vector3} playerPosition
   */
  update(playerPosition, dt = 0.016) {
    this._time += dt;

    if (!playerPosition) return;

    let nearestDist = Infinity;
    let nearestObj = null;
    let nearestData = null;

    for (const [object, data] of this._interactables) {
      // Skip if object was removed from scene
      if (!object.parent) continue;

      const objPos = data.getPosition();
      const dist = playerPosition.distanceTo(objPos);

      if (dist < data.radius && dist < nearestDist) {
        nearestDist = dist;
        nearestObj = object;
        nearestData = data;
      }
    }

    if (nearestObj && nearestData) {
      this._nearest = { object: nearestObj, ...nearestData, distance: nearestDist };

      // Position highlight ring
      const objPos = nearestData.getPosition();
      this._highlight.position.copy(objPos);
      this._highlight.position.y += 0.05; // slightly above ground
      this._highlight.visible = true;

      // Pulse animation
      const pulse = 1.0 + Math.sin(this._time * HIGHLIGHT_PULSE_SPEED) * 0.15;
      this._highlight.scale.set(pulse, pulse, pulse);
      this._highlight.rotation.y = this._time * 0.5;
    } else {
      this._nearest = null;
      this._highlight.visible = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Interaction
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Trigger interaction with nearest interactable.
   * @returns {boolean} true if interaction occurred
   */
  interact() {
    if (this._nearest && this._nearest.onInteract) {
      this._nearest.onInteract();
      return true;
    }
    return false;
  }

  /**
   * Trigger interaction with nearest interactable of a specific type.
   * @param {string} type — 'boat', 'trash', etc.
   * @returns {boolean}
   */
  interactByType(type) {
    if (this._nearest && this._nearest.type === type && this._nearest.onInteract) {
      this._nearest.onInteract();
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Queries
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get nearest interactable info.
   * @returns {{ object: THREE.Object3D, type: string, distance: number } | null}
   */
  getNearestInteractable() {
    return this._nearest;
  }

  /**
   * Check if something is highlighted (within interaction range).
   * @returns {boolean}
   */
  isHighlighted() {
    return this._nearest !== null;
  }

  /**
   * Get the type of nearest interactable.
   * @returns {string|null}
   */
  getNearestType() {
    return this._nearest ? this._nearest.type : null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Visual Highlight
  // ─────────────────────────────────────────────────────────────────────────

  _createHighlight() {
    const group = new THREE.Group();

    // Glowing ring on ground
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,     // cyan highlight
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    // Inner glow circle
    const innerGeo = new THREE.CircleGeometry(0.8, 24);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = -0.01;
    group.add(inner);

    // Floating chevrons (▲)
    const chevronGeo = new THREE.ConeGeometry(0.12, 0.2, 4);
    const chevronMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
    });

    for (let i = 0; i < 3; i++) {
      const chevron = new THREE.Mesh(chevronGeo, chevronMat);
      const angle = (i / 3) * Math.PI * 2;
      chevron.position.set(
        Math.cos(angle) * 0.6,
        1.2 + i * 0.15,
        Math.sin(angle) * 0.6
      );
      chevron.rotation.x = Math.PI; // point down
      group.add(chevron);
    }

    return group;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  dispose() {
    this._interactables.clear();
    if (this._highlight && this._highlight.parent) {
      this._highlight.parent.remove(this._highlight);
    }
  }
}
