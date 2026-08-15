import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { BiomeManager, Biomes } from './BiomeManager.js';
import { PerformanceConfig } from '../config/PerformanceConfig.js';
import { WorldConfig } from '../config/WorldConfig.js';

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
   * Generates flat seabed near harbour, and tropical island landmasses for WorldConfig.ISLANDS.
   */
  _getElevation(x, z) {
    const hCenter = WorldConfig.HARBOUR_CENTER || [0, 12];
    const hDist = Math.hypot(x - hCenter[0], z - hCenter[1]);
    if (hDist < 260) {
      return -1.5; // flat seabed near harbour
    }

    let islandHeight = -1.5;
    if (WorldConfig.ISLANDS) {
      for (const island of WorldConfig.ISLANDS) {
        const [cx, cy, cz] = island.center;
        const dx = x - cx;
        const dz = z - cz;
        const dist = Math.hypot(dx, dz);
        if (dist < island.radius * 1.5) {
          const t = Math.max(0, 1 - dist / (island.radius * 1.2));
          const n = (this.noise2D(x * 0.02, z * 0.02) + 1) * 0.5;
          const elev = Math.pow(t, 1.5) * 8.0 + n * 1.5;
          if (elev > islandHeight) islandHeight = elev;
        }
      }
    }

    return islandHeight;
  }

  getMoisture(x, z) {
    return this.moistureNoise2D(x * 0.005, z * 0.005) * 0.5 + 0.5;
  }
}
