import * as THREE from 'three';
import { TerrainGenerator } from './TerrainGenerator.js';
import { Biomes, BiomeManager } from './BiomeManager.js';

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

  /**
   * Drop every active chunk so the next update() reloads them around the
   * player's NEW (rebased) position. Called by the engine's floating-origin
   * rebase when the boat sails far from the harbour: terrain here is a flat,
   * uniform seabed, so the reload is visually invisible and keeps world
   * coordinates small and precise at any sailing distance.
   */
  rebase() {
    for (const [key, mesh] of this.activeChunks) {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      this.vegetation.removeChunkVegetation(key);
      const index = this.colliders.indexOf(mesh);
      if (index > -1) this.colliders.splice(index, 1);
    }
    this.activeChunks.clear();
    this._lastChunkX = -999;
    this._lastChunkZ = -999;
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
    const TROPICAL_PLANTS = [
      'nature_kit/Tree.glb',
      'nature_kit/Bush with Flowers.glb',
      'nature_kit/Plant Big.glb',
      'nature_kit/Fern.glb',
      'nature_kit/Flower Group.glb',
      'nature_kit/Tall Grass.glb'
    ];

    const FOREST_PLANTS = [
      'nature_kit/Pine.glb',
      'nature_kit/Tree.glb',
      'nature_kit/Bush.glb',
      'nature_kit/Mushroom.glb',
      'nature_kit/Mushroom Laetiporus.glb',
      'nature_kit/Clover.glb',
      'nature_kit/Grass.glb',
      'wooden_kit/Wood Fence 1.glb',
      'wooden_kit/Wood Tent 1.glb',
      'new_assets/survuval kit/Campfire.glb'
    ];

    const ROCKY_PLANTS = [
      'nature_kit/Dead Tree.glb',
      'nature_kit/Twisted Tree.glb',
      'nature_kit/Rock Medium.glb',
      'nature_kit/Pebble Round.glb',
      'nature_kit/Rock Path Round Small.glb',
      'nature_kit/Grass Wispy.glb',
      'wooden_kit/Wood Tent 2.glb',
      'new_assets/survuval kit/Chest.glb',
      'new_assets/survuval kit/Barrel.glb'
    ];
    
    const BAMBOO_PLANTS = [
      'nature_kit/Bamboo_1.fbx',
      'nature_kit/Bamboo_2.fbx',
      'nature_kit/Bamboo_3.fbx',
      'nature_kit/Bamboo_4.fbx',
      'nature_kit/Bamboo_Crop.fbx',
      'nature_kit/Tall Grass.glb',
      'nature_kit/Flower Single.glb',
      'new_assets/survuval kit/Workbench.glb'
    ];

    const BEACH_PLANTS = [
      'nature_kit/Plant.glb',
      'nature_kit/Pebble Round.glb',
      'nature_kit/Grass Wispy.glb'
    ];

    const ALL_PLANTS = [
      ...TROPICAL_PLANTS, ...FOREST_PLANTS, ...ROCKY_PLANTS, ...BAMBOO_PLANTS, ...BEACH_PLANTS
    ];

    const placementsByModel = new Map();
    for (const path of ALL_PLANTS) {
      if (!placementsByModel.has(path)) {
        placementsByModel.set(path, []);
      }
    }

    const itemDensity = 60; // Increased density for better looking land
    
    for (let i = 0; i < itemDensity; i++) {
      const lx = (Math.random() - 0.5) * this.chunkSize;
      const lz = (Math.random() - 0.5) * this.chunkSize;
      const wx = (cx * this.chunkSize) + lx;
      const wz = (cz * this.chunkSize) + lz;
      
      const height = this.generator._getElevation(wx, wz);
      
      if (height > 1.5) {
        const moisture = this.generator.getMoisture(wx, wz);
        const biome = BiomeManager.getBiome(height, moisture);
        
        let pool = FOREST_PLANTS;
        if (biome === Biomes.TROPICAL) pool = TROPICAL_PLANTS;
        else if (biome === Biomes.ROCKY) pool = ROCKY_PLANTS;
        else if (biome === Biomes.BAMBOO) pool = BAMBOO_PLANTS;
        else if (biome === Biomes.BEACH) pool = BEACH_PLANTS;

        const randomModel = pool[Math.floor(Math.random() * pool.length)];
        let scale = 0.8 + Math.random() * 0.4;
        
        // Adjust scale based on what it is so grass isn't huge and rocks aren't tiny
        if (randomModel.includes('Grass') || randomModel.includes('Mushroom') || randomModel.includes('Flower') || randomModel.includes('Clover') || randomModel.includes('Plant') || randomModel.includes('Fern')) {
          scale *= 0.5;
        } else if (randomModel.includes('Rock') || randomModel.includes('Pebble')) {
          scale *= 0.6;
        } else if (randomModel.includes('Bamboo')) {
          scale *= 0.015; // fbxs often come in 100x larger
        } else if (randomModel.includes('Campfire') || randomModel.includes('Chest') || randomModel.includes('Barrel')) {
          scale *= 0.8;
        } else if (randomModel.includes('Wood Fence')) {
          scale *= 1.2;
        }

        placementsByModel.get(randomModel).push({
          pos: new THREE.Vector3(wx, height, wz),
          rotY: Math.random() * Math.PI * 2,
          scale: scale
        });
      }
    }
    
    // Pass to vegetation system
    for (const [path, placements] of placementsByModel.entries()) {
      if (placements.length > 0) {
        this.vegetation.addChunkVegetation(key, path, placements);
      }
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
