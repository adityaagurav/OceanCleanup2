import * as THREE from 'three';
import { TerrainGenerator } from './TerrainGenerator.js';
import { Biomes, BiomeManager } from './BiomeManager.js';
import { PerformanceConfig } from '../config/PerformanceConfig.js';

/**
 * ChunkManager.js — Seamless, time-sliced streaming of 64x64 chunks.
 *
 * Crossing a chunk boundary queues the new ring of chunks and drains a fixed
 * budget per frame (CHUNKS_LOAD_PER_FRAME), so loading is spread across a few
 * frames instead of stalling one frame with up to 7 synchronous chunk builds.
 * Unloading uses a slightly larger hysteresis ring so nothing thrashes.
 */
export class ChunkManager {
  constructor(scene, colliders, vegetation, options = {}) {
    this.scene = scene;
    this.colliders = colliders;
    this.vegetation = vegetation;
    
    this.generator = new TerrainGenerator();
    this.chunkSize = options.chunkSize ?? this.generator.chunkSize;
    
    this.activeChunks = new Map(); // key: "cx,cz" -> mesh

    // Configurable streaming distances (Inspector-equivalent, see PerformanceConfig)
    this.viewDistance    = options.viewDistance    ?? PerformanceConfig.CHUNK_VIEW_DISTANCE;
    this.unloadDistance  = options.unloadDistance  ?? PerformanceConfig.CHUNK_UNLOAD_DISTANCE;
    this.preloadDistance = options.preloadDistance ?? PerformanceConfig.CHUNK_PRELOAD_DISTANCE;
    this._loadsPerFrame    = PerformanceConfig.CHUNKS_LOAD_PER_FRAME;
    this._unloadsPerFrame  = PerformanceConfig.CHUNKS_UNLOAD_PER_FRAME;

    // Work queues — populated when the grid should move, drained a little per
    // frame so no single frame pays for a whole ring of chunk builds.
    this._loadQueue   = [];
    this._unloadQueue = [];

    this._lastChunkX = -999;
    this._lastChunkZ = -999;
    // The chunk the current load/unload queues were built around.
    this._queueCenterX = -999;
    this._queueCenterZ = -999;
  }

  update(playerPosition) {
    const px = playerPosition.x;
    const pz = playerPosition.z;
    
    const cx = Math.floor(px / this.chunkSize);
    const cz = Math.floor(pz / this.chunkSize);

    // Rebuild the required set when the player crosses a chunk boundary, OR
    // when they approach within CHUNK_PRELOAD_DISTANCE chunks of the current
    // grid edge — so the next ring starts streaming before the crossing (the
    // self-limiting condition below means this only fires as the player nears
    // the edge, never every frame).
    const edgeDist = this.viewDistance - Math.max(
      Math.abs(cx - this._queueCenterX),
      Math.abs(cz - this._queueCenterZ)
    );
    const shouldRequeue = edgeDist <= this.preloadDistance;

    if (cx !== this._lastChunkX || cz !== this._lastChunkZ || shouldRequeue) {
      this._lastChunkX = cx;
      this._lastChunkZ = cz;
      this._queueCenterX = cx;
      this._queueCenterZ = cz;
      this._updateQueues(cx, cz);
    }

    // Drain queued work every frame (not just on crossings) so streaming stays
    // smooth and never stalls waiting for the next boundary event.
    this._drainQueues();
  }

  /**
   * Drop every active chunk so the next update() reloads them around the
   * player's NEW (rebased) position. Called by the engine's floating-origin
   * rebase when the boat sails far from the harbour: terrain here is a flat,
   * uniform seabed, so the reload is visually invisible and keeps world
   * coordinates small and precise at any sailing distance.
   */
  rebase() {
    // Abandon pending streaming work — positions have all moved.
    this._loadQueue.length = 0;
    this._unloadQueue.length = 0;

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
    this._queueCenterX = -999;
    this._queueCenterZ = -999;
  }

  /**
   * Recompute what SHOULD be loaded around the player and enqueue the diff.
   * The actual work happens over the next few frames in _drainQueues().
   */
  _updateQueues(centerCx, centerCz) {
    // 1. Enqueue chunks inside the view distance that are not active yet, and
    //    cancel any pending unload for chunks that are back within view.
    for (let x = -this.viewDistance; x <= this.viewDistance; x++) {
      for (let z = -this.viewDistance; z <= this.viewDistance; z++) {
        const cx = centerCx + x;
        const cz = centerCz + z;
        const key = `${cx},${cz}`;

        if (this.activeChunks.has(key)) {
          // Back inside the view ring — retract any queued unload.
          const u = this._unloadQueue.indexOf(key);
          if (u > -1) this._unloadQueue.splice(u, 1);
          continue;
        }
        if (this._loadQueue.includes(key)) continue;
        this._loadQueue.push(key);
      }
    }

    // 1b. Drain the player's own chunk FIRST: sort the pending loads by
    //     distance to the player so the chunk under the boat (and its ring)
    //     loads in the same frame as the crossing. Physics raycasts against
    //     this.colliders (boat depth clamp, character ground) never run on
    //     missing terrain.
    this._loadQueue.sort((a, b) => {
      const da = this._distTo(a, centerCx, centerCz);
      const db = this._distTo(b, centerCx, centerCz);
      return da - db;
    });

    // 2. Enqueue chunks that drifted beyond the (larger) unload ring. Chebyshev
    //    distance keeps the unload ring square like the view ring, and the +1
    //    hysteresis prevents load/unload thrash at the edges.
    for (const [key] of this.activeChunks) {
      if (this._unloadQueue.includes(key)) continue;
      const comma = key.indexOf(',');
      const dx = Number(key.slice(0, comma)) - centerCx;
      const dz = Number(key.slice(comma + 1)) - centerCz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) > this.unloadDistance) {
        this._unloadQueue.push(key);
      }
    }
  }

  /** Squared Euclidean distance (in chunks) from a key to a chunk coordinate. */
  _distTo(key, cx, cz) {
    const comma = key.indexOf(',');
    const dx = Number(key.slice(0, comma)) - cx;
    const dz = Number(key.slice(comma + 1)) - cz;
    return dx * dx + dz * dz;
  }

  /**
   * Process a fixed budget of queued loads/unloads, then flush the vegetation
   * instanced-mesh rebuilds once. Called every frame so streaming always makes
   * progress without ever doing a whole ring of work in a single frame.
   */
  _drainQueues() {
    let loads = 0;
    let unloads = 0;

    while (this._loadQueue.length > 0 && loads < this._loadsPerFrame) {
      const key = this._loadQueue.shift();
      if (this.activeChunks.has(key)) continue;
      const comma = key.indexOf(',');
      this._loadChunk(Number(key.slice(0, comma)), Number(key.slice(comma + 1)), key);
      loads++;
    }

    while (this._unloadQueue.length > 0 && unloads < this._unloadsPerFrame) {
      const key = this._unloadQueue.shift();
      const mesh = this.activeChunks.get(key);
      if (mesh) this._unloadChunk(key, mesh);
      unloads++;
    }

    // One instanced-mesh rebuild pass per frame (debounced per model type).
    this.vegetation.flushRebuilds();
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
    const PALM_TREE = 'assets/landAsset/coconut-palm.glb';

    const TROPICAL_PLANTS = [
      PALM_TREE,
      'nature_kit/Bush with Flowers.glb',
      'nature_kit/Plant Big.glb',
      'nature_kit/Fern.glb',
      'nature_kit/Flower Group.glb',
      'nature_kit/Tall Grass.glb'
    ];

    const FOREST_PLANTS = [
      PALM_TREE,
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
      PALM_TREE,
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
      PALM_TREE,
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
        if (randomModel === PALM_TREE) {
          scale *= 2.2; // Base scale for coconut palm
        } else if (randomModel.includes('Grass') || randomModel.includes('Mushroom') || randomModel.includes('Flower') || randomModel.includes('Clover') || randomModel.includes('Plant') || randomModel.includes('Fern')) {
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

        const isPalm = (randomModel === PALM_TREE);
        placementsByModel.get(randomModel).push({
          pos: new THREE.Vector3(wx, height, wz),
          rotY: Math.random() * Math.PI * 2,
          scale: scale,
          scaleY: isPalm ? scale * 1.35 : scale // Make coconut palm trees longer / taller vertically!
        });
      }
    }
    
    // Pass to vegetation system. The isStillActive predicate guards the async
    // model-load path: if this chunk gets unloaded while a model is still
    // loading, the placements are dropped instead of being stored for a chunk
    // that no longer exists.
    const isChunkActive = () => this.activeChunks.has(key);
    for (const [path, placements] of placementsByModel.entries()) {
      if (placements.length > 0) {
        this.vegetation.addChunkVegetation(key, path, placements, isChunkActive);
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
