import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

export class CompanionSystem {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.currentType = null;
    this.targetPos = new THREE.Vector3();
    
    this.modelPaths = {
      fish: 'new_assets/fish/Fish.glb',
      shark: 'new_assets/fish/Shark.glb',
      dolphin: 'new_assets/fish/Dolphin.glb',
      ray: 'new_assets/fish/Manta ray.glb',
      whale: 'new_assets/fish/Whale.glb'
    };
  }

  async setCompanion(type) {
    if (this.currentType === type) return;
    this.currentType = type;
    
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
    
    if (!type || !this.modelPaths[type]) return;
    
    this.mesh = await AssetManager.cloneScene(this.modelPaths[type]);
    
    let scale = 0.5;
    if (type === 'whale') scale = 1.0; // Whales are huge, scale down a lot for companion
    if (type === 'shark') scale = 0.8;
    if (type === 'dolphin') scale = 0.8;
    
    this.mesh.scale.setScalar(scale);
    
    // Apply a shiny material to signify it's a caught companion (optional visual flair)
    this.mesh.traverse(child => {
      if (child.isMesh && child.material) {
         child.material = child.material.clone();
         child.material.emissive = new THREE.Color(0x3AB9D9);
         child.material.emissiveIntensity = 0.2;
      }
    });

    this.scene.add(this.mesh);
  }

  update(playerPos, playerYaw, dt) {
    if (!this.mesh) return;
    
    // Companion targets a position to the right and slightly behind the player
    const offset = new THREE.Vector3(3, 0, 3);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
    this.targetPos.copy(playerPos).add(offset);
    
    // Float slightly above ground/water
    this.targetPos.y = Math.max(playerPos.y, 0) + 1.0;
    
    // Smooth follow
    this.mesh.position.lerp(this.targetPos, dt * 3.0);
    
    // Smooth rotate to face player
    const lookTarget = playerPos.clone();
    lookTarget.y = this.mesh.position.y;
    
    const currentRot = new THREE.Quaternion().copy(this.mesh.quaternion);
    this.mesh.lookAt(lookTarget);
    const targetRot = new THREE.Quaternion().copy(this.mesh.quaternion);
    
    this.mesh.quaternion.slerpQuaternions(currentRot, targetRot, dt * 5.0);
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
  }
}
