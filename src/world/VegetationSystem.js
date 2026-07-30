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
    let sourceMesh = null;
    
    gltf.scene.traverse(child => {
      if (child.isMesh && !sourceMesh) {
        sourceMesh = child;
      }
    });

    if (!sourceMesh) return;

    this._models.set(path, {
      mesh: null,
      geo: sourceMesh.geometry,
      mat: sourceMesh.material,
      capacity: 0
    });
    
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
    const model = this._models.get(path);
    const chunkMap = this._chunkData.get(path);
    if (!model || !chunkMap) return;

    // Count total instances
    let totalInstances = 0;
    for (const matrices of chunkMap.values()) {
      totalInstances += matrices.length;
    }

    // If we need a bigger buffer, recreate the mesh
    if (totalInstances > model.capacity || !model.mesh) {
      if (model.mesh) {
        this.scene.remove(model.mesh);
        model.mesh.dispose(); // dispose old mesh shell (geo/mat are shared)
      }
      
      const newCapacity = Math.max(totalInstances + 500, 1000); // Pad capacity to avoid frequent recreations
      const mesh = new THREE.InstancedMesh(model.geo, model.mat, newCapacity);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // Prevent disappearing when looking away from origin
      
      this.scene.add(mesh);
      model.mesh = mesh;
      model.capacity = newCapacity;
    }

    // Update matrices
    let idx = 0;
    for (const matrices of chunkMap.values()) {
      for (const matrix of matrices) {
        model.mesh.setMatrixAt(idx++, matrix);
      }
    }
    
    // Set actual draw count
    model.mesh.count = totalInstances;
    model.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const model of this._models.values()) {
      if (model.mesh) {
        this.scene.remove(model.mesh);
        model.mesh.dispose();
      }
    }
    this._models.clear();
    this._chunkData.clear();
  }
}
