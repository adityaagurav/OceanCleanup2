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
    this.scene = scene;

    // modelPath -> { mesh, geo, mat, capacity }
    this._models = new Map();

    // modelPath -> true for assets that failed to load once. Missing/broken
    // assets are never retried — previously every chunk streaming the same
    // missing model re-fetched it, spamming identical console errors (one per
    // chunk) and wasting network + GC churn on a guaranteed rejection.
    this._failed = new Set();

    // modelPath -> Map<chunkKey, Matrix4[]>
    this._chunkData = new Map();

    // Model paths whose InstancedMesh needs rebuilding (adds/removes are
    // debounced so each model type is rebuilt at most once per frame instead
    // of once per chunk).
    this._dirty = new Set();

    this._dummy = new THREE.Object3D();

    // Scratch objects for the per-rebuild bounding-sphere pass (reused, so
    // rebuilds allocate nothing).
    this._bbox = new THREE.Box3();
    this._bsphere = new THREE.Sphere();
    this._bscratch = new THREE.Vector3();
  }

  /**
   * Pre-load a model so it's ready for instancing.
   */
  async prepareModel(path) {
    if (this._models.has(path) || this._failed.has(path)) return;

    let sourceMesh = null;
    try {
      const gltf = await AssetManager.loadGLTF(path);
      gltf.scene.traverse(child => {
        if (child.isMesh && !sourceMesh) {
          sourceMesh = child;
        }
      });
    } catch (_) {
      this._failed.add(path); // asset missing/unreadable — never retried
      return;
    }

    if (!sourceMesh) {
      this._failed.add(path); // no usable mesh in the file — never retried
      return;
    }

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
   * @param {function(): boolean} [isStillActive] - optional predicate; when the
   *   model takes time to load, the placements are only stored if the chunk is
   *   still active (prevents ghost data for chunks unloaded mid-load).
   */
  async addChunkVegetation(chunkKey, path, placements, isStillActive = null) {
    if (placements.length === 0) return;

    // Ensure model is loaded (known-failed assets are skipped instantly)
    if (this._failed.has(path)) return;
    if (!this._models.has(path)) {
      await this.prepareModel(path);
      if (isStillActive && !isStillActive()) return; // chunk gone while loading
    }
    if (!this._models.has(path)) return; // failed while loading — nothing to place

    // Convert placements to Matrix4 array immediately
    const matrices = placements.map(p => {
      this._dummy.position.copy(p.pos);
      this._dummy.rotation.set(0, p.rotY, 0);
      const s = p.scale ?? 1;
      const sy = p.scaleY ?? s;
      this._dummy.scale.set(s, sy, s);
      this._dummy.updateMatrix();
      return this._dummy.matrix.clone();
    });

    this._chunkData.get(path).set(chunkKey, matrices);
    this._dirty.add(path);
  }

  /**
   * Remove vegetation data for a specific chunk.
   */
  removeChunkVegetation(chunkKey) {
    for (const [path, chunkMap] of this._chunkData.entries()) {
      if (chunkMap.has(chunkKey)) {
        chunkMap.delete(chunkKey);
        this._dirty.add(path);
      }
    }
  }

  /**
   * Rebuild every dirty InstancedMesh exactly once. Called by the chunk
   * manager once per frame after its streaming budget is spent — this keeps
   * the rebuild cost bounded per frame even while many chunks are loading.
   */
  flushRebuilds() {
    if (this._dirty.size === 0) return;
    for (const path of this._dirty) {
      if (this._models.has(path)) this._rebuildInstancedMesh(path);
    }
    this._dirty.clear();
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
      mesh.frustumCulled = true; // culling sphere is computed below

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

    // Recompute the bounding sphere so frustum culling works for the
    // spread-out instances. three r134 has NO InstancedMesh.computeBoundingSphere()
    // (it was added in r157+ — the old call threw and killed the render loop
    // whenever a vegetated chunk streamed in), so compute the world-space
    // sphere manually from the instance matrices. The InstancedMesh sits at
    // the scene root (identity matrixWorld) and this geometry is exclusive to
    // it, so writing the sphere onto the geometry is exactly what
    // Frustum.intersectsObject() reads.
    const box = this._bbox.makeEmpty();
    for (const matrices of chunkMap.values()) {
      for (const m of matrices) {
        box.expandByPoint(this._bscratch.setFromMatrixPosition(m));
      }
    }
    if (!box.isEmpty()) {
      model.geo.computeBoundingSphere?.();
      const sphere = box.getBoundingSphere(this._bsphere);
      // Pad by the base geometry radius × a generous scale factor so scaled
      // instances at the edge stay visible (max placement scale ≈ 2.6).
      sphere.radius += (model.geo.boundingSphere?.radius ?? 1) * 3;
      model.geo.boundingSphere.copy(sphere);
    }
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
