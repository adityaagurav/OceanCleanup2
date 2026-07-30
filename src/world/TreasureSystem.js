import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

export class TreasureSystem {
  constructor(scene, terrainGenerator, callbacks = {}) {
    this.scene = scene;
    this.terrain = terrainGenerator;
    this.callbacks = callbacks;

    this.chests = [];
    this.nearChest = null;
    this.spawnDistance = 200;
    this.maxChests = 15;
    
    // Proximity ring indicator for chests
    const ringGeo = new THREE.RingGeometry(1.5, 2.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd700, side: THREE.DoubleSide, transparent: true, opacity: 0.85
    });
    this._ring = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = Math.PI / 2;
    this._ring.visible = false;
    this.scene.add(this._ring);
  }

  update(playerPos, dt) {
    // 1. Despawn chests too far away
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const chest = this.chests[i];
      if (chest.position.distanceTo(playerPos) > this.spawnDistance + 50) {
        this.scene.remove(chest);
        if (chest.campGroup) this.scene.remove(chest.campGroup);
        this.chests.splice(i, 1);
      }
    }

    // 2. Spawn new chests if under limit
    if (this.chests.length < this.maxChests && Math.random() < 0.05) {
      this._spawnChest(playerPos);
    }

    // 3. Proximity check for opening
    let closest = null, minDist = Infinity;
    const R = 4.0; // Pickup radius

    for (const c of this.chests) {
      if (c.isOpen) continue;
      const d = playerPos.distanceTo(c.position);
      if (d <= R && d < minDist) { minDist = d; closest = c; }
    }

    if (closest) {
      this.nearChest = closest;
      this._ring.position.copy(closest.position);
      // Place ring slightly above terrain
      this._ring.position.y = closest.position.y + 0.1;
      this._ring.rotation.z += 0.05;
      this._ring.visible = true;
      this.callbacks.onNearTreasure?.(true);
    } else {
      this.nearChest = null;
      this._ring.visible = false;
      this.callbacks.onNearTreasure?.(false);
    }
  }

  async _spawnChest(playerPos) {
    // Try to find a valid land position
    let validPos = null;
    for (let attempts = 0; attempts < 10; attempts++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * (this.spawnDistance - 50);
      
      const x = playerPos.x + Math.sin(angle) * distance;
      const z = playerPos.z + Math.cos(angle) * distance;
      
      const elevation = this.terrain._getElevation(x, z);
      
      // We want it on land (elevation > 0), preferably on the beach or flat areas
      if (elevation > 0.5 && elevation < 15) {
        validPos = new THREE.Vector3(x, elevation, z);
        break;
      }
    }

    if (!validPos) return;

    try {
      const gltf = await AssetManager.loadGLTF('new_assets/survuval kit/Chest.glb');
      const mesh = gltf.scene.clone();
      
      // Scale and position
      mesh.scale.setScalar(2.0); // Make it a bit bigger and more visible
      mesh.position.copy(validPos);
      
      // Random rotation
      mesh.rotation.y = Math.random() * Math.PI * 2;
      
      // Give it a golden glow to make it stand out
      const light = new THREE.PointLight(0xffd700, 1.0, 10);
      light.position.set(0, 2, 0);
      mesh.add(light);

      mesh.isOpen = false;
      this.scene.add(mesh);
      this.chests.push(mesh);
      
      // Spawn pirate camp props (50% chance)
      if (Math.random() < 0.5) {
        mesh.campGroup = await this._spawnPirateCamp(validPos);
        if (mesh.campGroup) this.scene.add(mesh.campGroup);
      }
    } catch (e) {
      console.warn("Failed to load Chest.glb", e);
    }
  }

  async _spawnPirateCamp(centerPos) {
    const campGroup = new THREE.Group();
    try {
      // Add a tent
      const tentGltf = await AssetManager.loadGLTF('wooden_kit/Wood Tent 1.glb');
      const tent = tentGltf.scene.clone();
      tent.position.set(centerPos.x + 3, centerPos.y, centerPos.z);
      tent.rotation.y = Math.random() * Math.PI;
      campGroup.add(tent);
      
      // Add a barrel
      const barrelGltf = await AssetManager.loadGLTF('wooden_kit/Barrel.glb'); // Assuming Barrel exists in wooden kit or we can use another asset if it fails
      const barrel = barrelGltf.scene.clone();
      barrel.position.set(centerPos.x + 1, centerPos.y, centerPos.z - 2);
      campGroup.add(barrel);
      
    } catch (e) {
      // It's okay if some assets fail to load
    }
    return campGroup;
  }

  openNearest() {
    if (!this.nearChest || this.nearChest.isOpen) return;

    const chest = this.nearChest;
    chest.isOpen = true;
    
    // Animate opening (if it has parts, this is hard without knowing the hierarchy, 
    // but we can just pop it out of existence and spawn gold particles)
    this.scene.remove(chest);
    
    const idx = this.chests.indexOf(chest);
    if (idx !== -1) {
      if (chest.campGroup) this.scene.remove(chest.campGroup);
      this.chests.splice(idx, 1);
    }
    
    this._ring.visible = false;
    this.nearChest = null;
    this.callbacks.onNearTreasure?.(false);

    // Reward random gold between 10 and 50
    const amount = 10 + Math.floor(Math.random() * 41);
    this.callbacks.onCollectTreasure?.(amount);
  }

  dispose() {
    this.scene.remove(this._ring);
    this.chests.forEach(c => {
      this.scene.remove(c);
      if (c.campGroup) this.scene.remove(c.campGroup);
    });
    this.chests = [];
  }
}
