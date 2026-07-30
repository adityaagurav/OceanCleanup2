import * as THREE from 'three';

/**
 * UnderwaterSystem.js — Generates procedural underwater flora (Seaweed) and rocks.
 * Uses InstancedMesh for massive performance scaling.
 */
export class UnderwaterSystem {
  constructor(scene, terrainGenerator) {
    this.scene = scene;
    this.generator = terrainGenerator;
    
    this.time = 0;
    this.seaweedMesh = null;
    this.rockMesh = null;
    
    this._initSeaweed();
    this._initRocks();
  }
  
  _initSeaweed() {
    // A simple tall plane for seaweed
    const geo = new THREE.PlaneGeometry(1, 4, 2, 4);
    geo.translate(0, 2, 0); // Pivot at the bottom
    
    // Custom shader for swaying
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#228B22') }
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 pos = position;
          
          // Sway based on height (uv.y is 1 at top, 0 at bottom)
          float sway = sin(uTime * 1.5 + (instanceMatrix[3][0] * 0.1)) * 0.5 * uv.y;
          pos.x += sway;
          
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          // Darken at the bottom
          vec3 col = mix(uColor * 0.4, uColor, vUv.y);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true, // Allow alpha if we use a texture later
    });

    const count = 1000;
    this.seaweedMesh = new THREE.InstancedMesh(geo, mat, count);
    
    const dummy = new THREE.Object3D();
    let idx = 0;
    
    // Distribute seaweed around the ocean, but only where it's deep enough
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 600;
      const z = (Math.random() - 0.5) * 600;
      const y = this.generator ? this.generator._getElevation(x, z) : -10;
      
      // Only spawn underwater and not too deep
      if (y < -2 && y > -30) {
        dummy.position.set(x, y, z);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        
        // Randomize scale
        const s = 0.5 + Math.random();
        dummy.scale.set(s, s, s);
        
        dummy.updateMatrix();
        this.seaweedMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    
    this.seaweedMesh.count = idx;
    this.scene.add(this.seaweedMesh);
  }

  _initRocks() {
    const geo = new THREE.DodecahedronGeometry(1.5, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x556677,
      roughness: 0.9,
      flatShading: true
    });

    const count = 500;
    this.rockMesh = new THREE.InstancedMesh(geo, mat, count);
    
    const dummy = new THREE.Object3D();
    let idx = 0;
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 600;
      const z = (Math.random() - 0.5) * 600;
      const y = this.generator ? this.generator._getElevation(x, z) : -10;
      
      if (y < -1 && y > -40) {
        dummy.position.set(x, y + 0.5, z); // Embedded slightly
        dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        
        const sx = 0.5 + Math.random() * 2;
        const sy = 0.5 + Math.random() * 1.5;
        const sz = 0.5 + Math.random() * 2;
        dummy.scale.set(sx, sy, sz);
        
        dummy.updateMatrix();
        this.rockMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    
    this.rockMesh.count = idx;
    this.scene.add(this.rockMesh);
  }

  update(dt) {
    this.time += dt;
    if (this.seaweedMesh) {
      this.seaweedMesh.material.uniforms.uTime.value = this.time;
    }
  }
}
