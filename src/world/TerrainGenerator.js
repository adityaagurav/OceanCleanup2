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
    this.resolution = 16; // Vertices per chunk edge (faster generation, enhances low-poly look)
    this.maxHeight = 25; // Higher max elevation for dramatic cliffs
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
        // Core of the island is flat Y = 2.5 (one terrace height)
        if (distFromCenter < islandRadius - 20) {
          height = Math.max(height, 2.5);
        } else {
          // Smooth blend down to the procedural noise at the edges
          const t = (distFromCenter - (islandRadius - 20)) / 20; // 0 to 1
          const blended = THREE.MathUtils.lerp(2.5, height, t);
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
    mesh.updateMatrixWorld(true); // Force matrix update for immediate physics raycasting
    
    // Disable frustum culling on the chunks to avoid popping if they are just offscreen
    // The ChunkManager handles adding/removing them entirely.
    mesh.frustumCulled = false; 

    return mesh;
  }

  _getElevation(x, z) {
    const scale = 0.0025; 
    
    // Domain warping for more organic, less uniform hill shapes
    let warpX = this.noise2D(x * 0.005, z * 0.005) * 15;
    let warpZ = this.noise2D(z * 0.005, x * 0.005) * 15;
    
    let n1 = this.noise2D((x + warpX) * scale, (z + warpZ) * scale);
    let n2 = this.noise2D(x * scale * 2, z * scale * 2) * 0.5;
    let n3 = this.noise2D(x * scale * 4, z * scale * 4) * 0.25;

    let noiseVal = (n1 + n2 + n3) / 1.75; 
    
    // Shift down to create oceans
    noiseVal -= 0.15;

    if (noiseVal <= 0) {
      // Gentle slope underwater / beach
      return noiseVal * 15.0; 
    }

    // Above water: scale up to max height
    let rawHeight = noiseVal * this.maxHeight;

    // Apply terracing (creates flat plateaus and steep cliffs like Pokémon)
    const terraceHeight = 2.5; 
    const terraces = rawHeight / terraceHeight;
    const hFloor = Math.floor(terraces);
    const hFrac = terraces - hFloor;
    
    // Sharpen the transition to make distinct cliffs
    // Flat for first 30%, flat for last 30%, rapid transition in middle 40%
    const t = Math.max(0, Math.min(1, (hFrac - 0.3) / 0.4)); 
    const smoothFrac = t * t * (3 - 2 * t); // Smoothstep
    
    return (hFloor + smoothFrac) * terraceHeight;
  }

  getMoisture(x, z) {
    return this.moistureNoise2D(x * 0.005, z * 0.005) * 0.5 + 0.5;
  }
}
