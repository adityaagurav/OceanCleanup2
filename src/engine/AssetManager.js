import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

/**
 * AssetManager.js — Singleton asset cache.
 *
 * Guarantees each GLB/texture is loaded exactly once.
 * All subsequent requests for the same path return the cached result.
 *
 * Usage:
 *   const gltf = await AssetManager.loadGLTF('nature_kit/Pine.glb');
 *   const tex  = await AssetManager.loadTexture('assets/waternormals.jpg');
 */
class AssetManagerClass {
  constructor() {
    this._gltfCache    = new Map(); // path → Promise<GLTF>
    this._textureCache = new Map(); // path → Promise<Texture>
    this._gltfLoader   = new GLTFLoader();
    this._texLoader    = new THREE.TextureLoader();
  }

  /**
   * Load a GLB/GLTF file. Returns cached result if already loaded.
   * @param {string} path
   * @returns {Promise<GLTF>}
   */
  loadGLTF(path) {
    if (!this._gltfCache.has(path)) {
      const promise = new Promise((resolve, reject) => {
        this._gltfLoader.load(path, resolve, undefined, reject);
      });
      this._gltfCache.set(path, promise);
    }
    return this._gltfCache.get(path);
  }

  /**
   * Load a texture. Returns cached result if already loaded.
   * @param {string} path
   * @param {function} [onLoad] — optional callback after first load
   * @returns {Promise<THREE.Texture>}
   */
  loadTexture(path, onLoad) {
    if (!this._textureCache.has(path)) {
      const promise = new Promise((resolve, reject) => {
        this._texLoader.load(
          path,
          (tex) => { if (onLoad) onLoad(tex); resolve(tex); },
          undefined,
          reject
        );
      });
      this._textureCache.set(path, promise);
    }
    return this._textureCache.get(path);
  }

  /**
   * Clone a cached GLTF scene for instancing.
   * Throws if the asset hasn't been loaded yet.
   * @param {string} path
   * @returns {Promise<THREE.Group>}
   */
  async cloneScene(path) {
    const gltf = await this.loadGLTF(path);
    return gltf.scene.clone();
  }

  /** How many assets are currently cached */
  get cachedCount() {
    return this._gltfCache.size + this._textureCache.size;
  }

  /** Clear all caches (call on game destroy) */
  dispose() {
    this._gltfCache.clear();
    this._textureCache.clear();
  }
}

// Singleton export — import anywhere without passing instances around
export const AssetManager = new AssetManagerClass();
