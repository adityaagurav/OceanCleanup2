import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { BiomeManager, Biomes } from './BiomeManager.js';
import { PerformanceConfig } from '../config/PerformanceConfig.js';

/**
 * TerrainGenerator.js — Generates procedural geometry for chunks using Simplex noise.
 */
export class TerrainGenerator {
  constructor() {
    this.noise2D = createNoise2D(); // Random seed by default
    this.moistureNoise2D = createNoise2D();
    
    // Chunk size is owned by PerformanceConfig so the whole world streams on
    // one tunable value (ChunkManager reads it from the generator).
    this.chunkSize = PerformanceConfig.CHUNK_SIZE; // Meters
    this.resolution = 16; // Vertices per chunk edge (lower is faster, higher is smoother)
    this.maxHeight = 12; // Maximum elevation
  }

  /**
   * Generates a single chunk's terrain mesh.
   * @param {number} cx Chunk X coordinate (grid space)
   * @param {number} cz Chunk Z coordinate (grid space)
   * @returns {THREE.Mesh} The terrain mesh
   */
  generateChunk(cx, cz) {
    const segments = this.resolution;
    const geometry = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, segments, segments);
    geometry.rotateX(-Math.PI / 2); // Lay flat on XZ

    const pos = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      // Local position inside the chunk geometry (-32 to 32)
      const lx = pos.getX(i);
      const lz = pos.getZ(i);

      // World position
      const wx = (cx * this.chunkSize) + lx;
      const wz = (cz * this.chunkSize) + lz;

      // Sample noise for elevation
      const height = this._getElevation(wx, wz);

      pos.setY(i, height);

      // Sample noise for moisture
      const moisture = this.moistureNoise2D(wx * 0.005, wz * 0.005) * 0.5 + 0.5;

      // Determine color
      BiomeManager.getColor(height, moisture, color);
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: true // Low-poly aesthetic
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;

    // Position the chunk mesh in world space
    mesh.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);

    // The chunk is a normal positioned mesh, so default frustum culling works
    // correctly — off-screen chunks (most of the 7x7 grid) are skipped instead
    // of being drawn every frame. ChunkManager still handles load/unload.

    return mesh;
  }

  /**
   * Helper: Elevation for a world position.
   *
   * The ocean is fully open and effectively unlimited — the harbour plaza is
   * the ONLY landmass in the game. No procedural islands are generated, so the
   * player can sail in any direction forever without hitting terrain. Future
   * islands/locations (WorldConfig.ISLANDS) can be reintroduced here later;
   * for now every chunk is flat shallow seabed just below the water surface.
   */
  _getElevation(x, z) {
    return -0.125 * this.maxHeight; // flat shallow seabed (=-1.5)
  }

  getMoisture(x, z) {
    return this.moistureNoise2D(x * 0.005, z * 0.005) * 0.5 + 0.5;
  }
}
