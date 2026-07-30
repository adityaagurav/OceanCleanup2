import * as THREE from 'three';
import { TerrainGenerator } from './TerrainGenerator.js';

/**
 * ChunkManager.js — Handles streaming of 64x64 chunks based on player position.
 */
export class ChunkManager {
  constructor(scene, colliders, vegetation) {
    this.scene = scene;
    this.colliders = colliders;
    this.vegetation = vegetation;
    
    this.generator = new TerrainGenerator();
    this.chunkSize = this.generator.chunkSize;
    
    this.activeChunks = new Map(); // key: "cx,cz" -> mesh
    this.viewDistance = 3; // Load 3 chunks in every direction (7x7 grid)
    
    // To avoid creating a new string every frame
    this._currentChunkKey = '';
    this._lastChunkX = -999;
    this._lastChunkZ = -999;
  }

  update(playerPosition) {
    // Determine which chunk the player is in
    const px = playerPosition.x;
    const pz = playerPosition.z;
    
    const cx = Math.floor(px / this.chunkSize);
    const cz = Math.floor(pz / this.chunkSize);

    // Only update if the player has crossed a chunk boundary
    if (cx === this._lastChunkX && cz === this._lastChunkZ) {
      return;
    }
    
    this._lastChunkX = cx;
    this._lastChunkZ = cz;

    this._updateActiveChunks(cx, cz);
  }

  _updateActiveChunks(centerCx, centerCz) {
    const requiredChunks = new Set();

    // 1. Identify which chunks should be active
    for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
      for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
        const cx = centerCx + x;
        const cz = centerCz + z;
        const key = `${cx},${cz}`;
        requiredChunks.add(key);

        if (!this.activeChunks.has(key)) {
          this._loadChunk(cx, cz, key);
        }
      }
    }

    // 2. Unload chunks that are no longer needed
    for (const [key, mesh] of this.activeChunks.entries()) {
      if (!requiredChunks.has(key)) {
        this._unloadChunk(key, mesh);
      }
    }
  }

  _loadChunk(cx, cz, key) {
    const mesh = this.generator.generateChunk(cx, cz);
    this.scene.add(mesh);
    this.activeChunks.set(key, mesh);
    
    // We add the terrain mesh to the physics colliders so the player can walk on it.
    // Note: In a production game, we'd use a simplified physics mesh or heightfield.
    // For now, raycasting against the visual mesh works.
    this.colliders.push(mesh);
    
    // Generate vegetation for this chunk
    this._generateChunkVegetation(cx, cz, key);
  }

  _generateChunkVegetation(cx, cz, key) {
    // Only spawn vegetation on land (height > 0)
    // We can just use Math.random() for now and check elevation from TerrainGenerator
    const placements = [];
    const treeCount = 10; // Simple density for now
    
    for (let i = 0; i < treeCount; i++) {
      // Random local position
      const lx = (Math.random() - 0.5) * this.chunkSize;
      const lz = (Math.random() - 0.5) * this.chunkSize;
      const wx = (cx * this.chunkSize) + lx;
      const wz = (cz * this.chunkSize) + lz;
      
      const height = this.generator._getElevation(wx, wz);
      
      // If above water and above beach
      if (height > 1.5) {
        placements.push({
          pos: new THREE.Vector3(wx, height, wz),
          rotY: Math.random() * Math.PI * 2,
          scale: 0.8 + Math.random() * 0.4
        });
      }
    }
    
    // Pass to vegetation system (using Pine for now as an example)
    if (placements.length > 0) {
      this.vegetation.addChunkVegetation(key, 'assets/nature_kit/Pine.glb', placements);
    }
  }

  _unloadChunk(key, mesh) {
    this.scene.remove(mesh);
    this.activeChunks.delete(key);

    // Remove from colliders
    const index = this.colliders.indexOf(mesh);
    if (index > -1) {
      this.colliders.splice(index, 1);
    }

    // Free memory
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    
    // Remove vegetation
    this.vegetation.removeChunkVegetation(key);
  }
}
