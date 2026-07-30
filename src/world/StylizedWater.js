import * as THREE from 'three';

/**
 * StylizedWater.js — Wind Waker / Dinkum style cartoon water.
 * Uses a custom ShaderMaterial with scrolling noise and gradient colors.
 */

const waterVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    
    // Gentle wave displacement
    float wave1 = sin(worldPos.x * 0.05 + uTime * 1.5) * 0.5;
    float wave2 = cos(worldPos.z * 0.05 + uTime * 1.2) * 0.5;
    worldPos.y += wave1 + wave2;

    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const waterFragmentShader = `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uMidColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  // Simple pseudo-random hash
  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  // Simplex noise approximation
  float noise(vec2 p) {
    const float K1 = 0.366025404; // (sqrt(3)-1)/2;
    const float K2 = 0.211324865; // (3-sqrt(3))/6;

    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    float m = step(a.y, a.x); 
    vec2 o = vec2(m, 1.0 - m);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;

    vec3 h = max(0.5 - vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
    return dot(n, vec3(70.0));
  }

  void main() {
    // Scroll coordinates for moving water
    vec2 uv = vWorldPosition.xz * 0.02;
    vec2 scroll1 = uv + vec2(uTime * 0.05, uTime * 0.08);
    vec2 scroll2 = uv * 2.0 - vec2(uTime * 0.07, uTime * 0.03);

    float n1 = noise(scroll1);
    float n2 = noise(scroll2);
    
    // Combine noise for a fluid ripple effect
    float combinedNoise = (n1 + n2) * 0.5;
    
    // Base gradient (Deep to Mid)
    vec3 baseColor = mix(uDeepColor, uMidColor, smoothstep(-0.5, 0.5, combinedNoise));

    // Foam pattern (Wind Waker style sharp lines)
    // We create sharp edges using step/smoothstep on the noise
    float foamNoise = noise(uv * 3.0 + uTime * 0.1);
    float foamMask = smoothstep(0.4, 0.45, foamNoise * combinedNoise);
    
    vec3 finalColor = mix(baseColor, uFoamColor, foamMask * 0.6);

    gl_FragColor = vec4(finalColor, 0.85); // Slight transparency
  }
`;

export class StylizedWater extends THREE.Mesh {
  constructor(size = 10000) {
    const geometry = new THREE.PlaneGeometry(size, size, 256, 256);
    geometry.rotateX(-Math.PI / 2); // Lay flat

    const material = new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDeepColor:    { value: new THREE.Color('#2E8BFF') },
        uMidColor:     { value: new THREE.Color('#3DB8FF') },
        uShallowColor: { value: new THREE.Color('#5CE1E6') },
        uFoamColor:    { value: new THREE.Color('#FFFFFF') }
      },
      transparent: true,
      depthWrite: false, // Prevents Z-fighting and looks softer
      side: THREE.DoubleSide
    });

    super(geometry, material);
    this.name = "StylizedWater";
  }

  update(dt) {
    this.material.uniforms.uTime.value += dt;
  }
}
