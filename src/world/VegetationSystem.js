import * as THREE from 'three';
import { AssetManager } from '../engine/AssetManager.js';

/**
 * VegetationSystem.js — InstancedMesh-based vegetation renderer (Chunk Aware).
 *
 * Maintains a single InstancedMesh per model type across the ENTIRE world.
 * When chunks load/unload, the matrix buffer is rebuilt. This ensures maximum
 * performance (1 draw call per model type) regardless of how many chunks are loaded.
 */
export class VegetationSystem {
  constructor(scene) {
    this.scene  = scene;

    // modelPath -> { mesh, geo, mat, capacity }
    this._models = new Map();
    
    // modelPath -> Map<chunkKey, Matrix4[]>
    this._chunkData = new Map();
    
    this._dummy = new THREE.Object3D();
  }

  /**
   * Pre-load a model so it's ready for instancing.
   */
  async prepareModel(path) {
    if (this._models.has(path)) return;

    const gltf = await AssetManager.loadGLTF(path);
    const parts = [];
    
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(child => {
      if (child.isMesh) {
        // Clone geometry and bake world transform so multi-mesh parts align correctly
        const geo = child.geometry.clone();
        geo.applyMatrix4(child.matrixWorld);
        
        parts.push({
          mesh: null,
          geo: geo,
          mat: child.material,
          capacity: 0
        });
      }
    });

    if (parts.length === 0) return;

    this._models.set(path, parts);
    this._chunkData.set(path, new Map());
  }

  /**
   * Add vegetation data for a specific chunk.
   * @param {string} chunkKey (e.g., "1,2")
   * @param {string} path 
   * @param {Array<{pos: THREE.Vector3, rotY: number, scale: number}>} placements
   */
  async addChunkVegetation(chunkKey, path, placements) {
    if (placements.length === 0) return;
    
    // Ensure model is loaded
    if (!this._models.has(path)) {
      await this.prepareModel(path);
    }
    
    // Convert placements to Matrix4 array immediately
    const matrices = placements.map(p => {
      this._dummy.position.copy(p.pos);
      this._dummy.rotation.set(0, p.rotY, 0);
      const s = p.scale ?? 1;
      this._dummy.scale.set(s, s, s);
      this._dummy.updateMatrix();
      return this._dummy.matrix.clone();
    });

    this._chunkData.get(path).set(chunkKey, matrices);
    this._rebuildInstancedMesh(path);
  }

  /**
   * Remove vegetation data for a specific chunk.
   */
  removeChunkVegetation(chunkKey) {
    for (const [path, chunkMap] of this._chunkData.entries()) {
      if (chunkMap.has(chunkKey)) {
        chunkMap.delete(chunkKey);
        this._rebuildInstancedMesh(path);
      }
    }
  }

  /**
   * Rebuilds the InstancedMesh for a given model path using all active chunks.
   */
  _rebuildInstancedMesh(path) {
    const parts = this._models.get(path);
    const chunkMap = this._chunkData.get(path);
    if (!parts || !chunkMap) return;

    // Count total instances
    let totalInstances = 0;
    for (const matrices of chunkMap.values()) {
      totalInstances += matrices.length;
    }

    for (const part of parts) {
      // If we need a bigger buffer, recreate the mesh
      if (totalInstances > part.capacity || !part.mesh) {
        if (part.mesh) {
          this.scene.remove(part.mesh);
          part.mesh.dispose(); // dispose old mesh shell
        }
        
        const newCapacity = Math.max(totalInstances + 500, 1000);
        const mesh = new THREE.InstancedMesh(part.geo, part.mat, newCapacity);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // Prevent disappearing when looking away from origin
        
        this.scene.add(mesh);
        part.mesh = mesh;
        part.capacity = newCapacity;
      }

      // Update matrices
      let idx = 0;
      for (const matrices of chunkMap.values()) {
        for (const matrix of matrices) {
          part.mesh.setMatrixAt(idx++, matrix);
        }
      }
      
      // Set actual draw count
      part.mesh.count = totalInstances;
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const parts of this._models.values()) {
      for (const part of parts) {
        if (part.mesh) {
          this.scene.remove(part.mesh);
          part.mesh.dispose();
        }
        part.geo.dispose();
      }
    }
    this._models.clear();
    this._chunkData.clear();
  }
}
