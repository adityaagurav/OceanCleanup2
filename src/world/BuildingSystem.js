import * as THREE from 'three';

/**
 * BuildingSystem.js — Generates and manages interactive buildings.
 * 
 * Procedurally creates a House (for sleeping/eating) and a 
 * Recycle Plant (for selling trash). Registers them with the 
 * InteractionSystem.
 */
export class BuildingSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {InteractionSystem} interactionSystem
   * @param {THREE.Mesh[]} colliders - Array to push building colliders into
   * @param {TerrainGenerator} generator - To get terrain height
   * @param {Object} callbacks - { onInteractHouse, onInteractPlant }
   */
  constructor(scene, interactionSystem, colliders, generator, callbacks) {
    this.scene = scene;
    this.interactionSystem = interactionSystem;
    this.colliders = colliders;
    this.generator = generator;
    this.callbacks = callbacks;
    
    this.house = null;
    this.plant = null;
    
    this._buildHouse();
    this._buildRecyclePlant();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  House (Sleep & Eat)
  // ─────────────────────────────────────────────────────────────────────────
  _buildHouse() {
    this.house = new THREE.Group();
    
    // Materials
    const woodWall = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.9, flatShading: true });
    const woodRoof = new THREE.MeshStandardMaterial({ color: 0x5C3A21, roughness: 0.9, flatShading: true });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x87CEEB, roughness: 0.2, metalness: 0.8 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x4A2F1D, roughness: 0.9 });
    
    // Main Body
    const bodyGeo = new THREE.BoxGeometry(6, 4, 6);
    const body = new THREE.Mesh(bodyGeo, woodWall);
    body.position.y = 2;
    this.house.add(body);
    
    // Roof
    const roofGeo = new THREE.ConeGeometry(5, 3, 4);
    const roof = new THREE.Mesh(roofGeo, woodRoof);
    roof.position.y = 5.5;
    roof.rotation.y = Math.PI / 4;
    this.house.add(roof);
    
    // Door
    const doorGeo = new THREE.BoxGeometry(1.5, 2.5, 0.2);
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 1.25, 3.1);
    this.house.add(door);
    
    // Windows
    const winGeo = new THREE.BoxGeometry(1.2, 1.2, 0.2);
    const win1 = new THREE.Mesh(winGeo, windowMat);
    win1.position.set(-1.8, 2, 3.1);
    this.house.add(win1);
    
    const win2 = new THREE.Mesh(winGeo, windowMat);
    win2.position.set(1.8, 2, 3.1);
    this.house.add(win2);
    
    // Collider
    const colliderGeo = new THREE.BoxGeometry(6.2, 8, 6.2);
    const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
    const collider = new THREE.Mesh(colliderGeo, colliderMat);
    collider.position.y = 4;
    this.house.add(collider);
    
    // Enable shadows
    this.house.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    
    // Position the house on the beach
    const hx = 90;
    const hz = 85;
    const hy = this.generator ? Math.max(2.5, this.generator._getElevation(hx, hz)) : 2.5;
    this.house.position.set(hx, hy, hz);
    // Face the water
    this.house.rotation.y = Math.PI / -4;
    
    this.scene.add(this.house);
    this.colliders.push(collider);
    
    // Register Interaction
    this.interactionSystem.registerInteractable(
      this.house,
      'house',
      () => this.callbacks.onInteractHouse && this.callbacks.onInteractHouse(),
      () => this.house.position.clone(),
      6.0
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Recycle Plant
  // ─────────────────────────────────────────────────────────────────────────
  _buildRecyclePlant() {
    this.plant = new THREE.Group();
    
    // Materials
    const metalWall = new THREE.MeshStandardMaterial({ color: 0x7B8794, roughness: 0.6, metalness: 0.3, flatShading: true });
    const metalRoof = new THREE.MeshStandardMaterial({ color: 0x4F5B66, roughness: 0.7, metalness: 0.4 });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0xA0AAB2, roughness: 0.4, metalness: 0.7 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x10B981, roughness: 0.8 }); // Eco green
    
    // Main Building
    const bodyGeo = new THREE.BoxGeometry(8, 5, 5);
    const body = new THREE.Mesh(bodyGeo, metalWall);
    body.position.y = 2.5;
    this.plant.add(body);
    
    // Flat Roof with slight overhang
    const roofGeo = new THREE.BoxGeometry(8.5, 0.5, 5.5);
    const roof = new THREE.Mesh(roofGeo, metalRoof);
    roof.position.y = 5.25;
    this.plant.add(roof);
    
    // Smokestack / Exhaust Pipe
    const pipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 4, 8);
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.position.set(2.5, 7, -1);
    this.plant.add(pipe);
    
    // Conveyor Belt / Intake
    const conveyorGeo = new THREE.BoxGeometry(2, 1, 4);
    const conveyor = new THREE.Mesh(conveyorGeo, metalWall);
    conveyor.position.set(-2, 0.5, 3.5);
    conveyor.rotation.x = -0.2;
    this.plant.add(conveyor);
    
    // Eco Sign (Green panel)
    const signGeo = new THREE.BoxGeometry(3, 1.5, 0.2);
    const sign = new THREE.Mesh(signGeo, greenMat);
    sign.position.set(0, 3.5, 2.6);
    this.plant.add(sign);
    
    // Collider
    const colliderGeo = new THREE.BoxGeometry(8.2, 8, 5.2);
    const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
    const collider = new THREE.Mesh(colliderGeo, colliderMat);
    collider.position.y = 4;
    this.plant.add(collider);
    
    // Enable shadows
    this.plant.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    
    // Position the plant near the house
    const px = 70;
    const pz = 100;
    const py = this.generator ? Math.max(2.5, this.generator._getElevation(px, pz)) : 2.5;
    this.plant.position.set(px, py, pz);
    this.plant.rotation.y = Math.PI / -6;
    
    this.scene.add(this.plant);
    this.colliders.push(collider);
    
    // Register Interaction
    this.interactionSystem.registerInteractable(
      this.plant,
      'recycle_plant',
      () => this.callbacks.onInteractPlant && this.callbacks.onInteractPlant(),
      () => this.plant.position.clone().add(new THREE.Vector3(-2, 0, 3.5)),
      6.0
    );
  }

  dispose() {
    if (this.house) {
      this.interactionSystem.unregisterInteractable(this.house);
      this.scene.remove(this.house);
    }
    if (this.plant) {
      this.interactionSystem.unregisterInteractable(this.plant);
      this.scene.remove(this.plant);
    }
  }
}
