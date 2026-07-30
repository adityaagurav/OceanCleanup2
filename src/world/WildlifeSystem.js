import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

export class WildlifeSystem {
  constructor(scene) {
    this.scene = scene;
    this.animals = [];
    this.spawnDistance = 150; // Max distance to spawn from player
    this.despawnDistance = 250; // Distance to despawn
    this.maxAnimals = 30; // Max animals alive at once

    this.animalTypes = [
      { path: 'new_assets/fish/Fish.glb',          type: 'fish',   speed: 2.0, scale: 0.5, yOffset: -2 },
      { path: 'new_assets/fish/Fish-BEcU9rjiAq.glb', type: 'fish', speed: 2.5, scale: 0.5, yOffset: -3 },
      { path: 'new_assets/fish/Shark.glb',         type: 'shark',  speed: 1.5, scale: 1.5, yOffset: -4 },
      { path: 'new_assets/fish/Dolphin.glb',       type: 'dolphin',speed: 3.0, scale: 1.2, yOffset: -1.5 },
      { path: 'new_assets/fish/Manta ray.glb',     type: 'ray',    speed: 1.0, scale: 2.0, yOffset: -5 },
      { path: 'new_assets/fish/Whale.glb',         type: 'whale',  speed: 0.8, scale: 6.0, yOffset: -10 },
    ];
  }

  update(playerPos, dt) {
    // 1. Despawn animals too far away
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];
      const dist = animal.mesh.position.distanceTo(playerPos);
      if (dist > this.despawnDistance) {
        this.scene.remove(animal.mesh);
        this.animals.splice(i, 1);
      }
    }

    // 2. Spawn new animals if under limit
    if (this.animals.length < this.maxAnimals && Math.random() < 0.1) {
      this._spawnAnimal(playerPos);
    }

    // 3. Move animals
    for (const animal of this.animals) {
      // Move forward based on its local Z or X (assuming models face a specific direction, let's say +Z)
      
      // Some animals like dolphins can jump
      if (animal.config.type === 'dolphin') {
         animal.jumpTime += dt * 2.0;
         animal.mesh.position.y = animal.config.yOffset + Math.sin(animal.jumpTime) * 3;
         // Pitch up and down
         animal.mesh.rotation.x = Math.cos(animal.jumpTime) * 0.5;
      }
      
      // Move forward (using yaw)
      animal.mesh.position.x += Math.sin(animal.yaw) * animal.config.speed * dt * 10;
      animal.mesh.position.z += Math.cos(animal.yaw) * animal.config.speed * dt * 10;
      
      // Slowly turn randomly
      animal.yaw += (Math.random() - 0.5) * 0.05;
      animal.mesh.rotation.y = animal.yaw;
    }
  }

  async _spawnAnimal(playerPos) {
    // Pick random type
    const config = this.animalTypes[Math.floor(Math.random() * this.animalTypes.length)];
    
    // Spawn in a radius around player, but not too close
    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * (this.spawnDistance - 80);
    
    const x = playerPos.x + Math.sin(angle) * distance;
    const z = playerPos.z + Math.cos(angle) * distance;

    const mesh = await AssetManager.cloneScene(config.path);
    
    // Some models might have their own rotations, reset them
    mesh.scale.setScalar(config.scale);
    
    const yaw = Math.random() * Math.PI * 2;
    mesh.position.set(x, config.yOffset, z);
    mesh.rotation.set(0, yaw, 0);

    // Apply a blue fog tint to underwater meshes so they blend with water
    mesh.traverse(child => {
      if (child.isMesh) {
        if (child.material) {
           child.material = child.material.clone();
           // make them slightly transparent and bluish if deep
           child.material.color.lerp(new THREE.Color(0x3AB9D9), 0.5);
        }
      }
    });

    this.scene.add(mesh);
    this.animals.push({
      mesh,
      config,
      yaw,
      jumpTime: Math.random() * Math.PI * 2
    });
  }

  dispose() {
    for (const animal of this.animals) {
      this.scene.remove(animal.mesh);
    }
    this.animals = [];
  }
}
