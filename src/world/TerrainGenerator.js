import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { BiomeManager, Biomes } from './BiomeManager.js';

/**
 * TerrainGenerator.js — Generates procedural geometry for chunks using Simplex noise.
 */
export class TerrainGenerator {
  constructor() {
    this.noise2D = createNoise2D(); // Random seed by default
    this.moistureNoise2D = createNoise2D();
    
    this.chunkSize = 64; // Meters
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
      let height = this._getElevation(wx, wz);

      // Force the center area to be a large Main Island
      const distFromCenter = Math.sqrt(wx * wx + wz * wz);
      const islandRadius = 80;
      if (distFromCenter < islandRadius) {
        // Core of the island is flat Y = 2.0
        if (distFromCenter < islandRadius - 20) {
          height = Math.max(height, 2.0);
        } else {
          // Smooth blend down to the procedural noise at the edges
          const t = (distFromCenter - (islandRadius - 20)) / 20; // 0 to 1
          const blended = THREE.MathUtils.lerp(2.0, height, t);
          height = Math.max(height, blended);
        }
      }

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
    
    // Disable frustum culling on the chunks to avoid popping if they are just offscreen
    // The ChunkManager handles adding/removing them entirely.
    mesh.frustumCulled = false; 

    return mesh;
  }

  /**
   * Helper: Multi-octave noise for natural rolling hills.
   */
  _getElevation(x, z) {
    const scale = 0.01;
    
    // Octave 1: Large features
    let n1 = this.noise2D(x * scale, z * scale);
    
    // Octave 2: Smaller details
    let n2 = this.noise2D(x * scale * 2, z * scale * 2) * 0.5;
    
    // Octave 3: Fine bumps
    let n3 = this.noise2D(x * scale * 4, z * scale * 4) * 0.25;

    let noiseVal = (n1 + n2 + n3) / 1.75; // Normalize roughly to -1..1
    
    // We want mostly ocean with scattered islands.
    // Shift noise down so most values are below 0 (underwater)
    noiseVal -= 0.2;

    // If it's above 0, it's an island. Curve it so it rises up sharply like a beach.
    if (noiseVal > 0) {
      // Exponentiate to make hills peak
      noiseVal = Math.pow(noiseVal, 1.2);
    }

    // Multiply by max height
    return noiseVal * this.maxHeight;
  }
}
