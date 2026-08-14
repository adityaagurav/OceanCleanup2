import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * CloudSystem.js — Instanced smooth cumulus clouds, denser + alive.
 *
 * A ring of soft, rounded cumulus clouds floats 260–440 m overhead and follows
 * the camera horizontally exactly like the sky and water do, so the sky stays
 * populated at ANY sailing distance (no cloud desert out at sea). Each cloud is
 * a cluster of smooth-shaded icosahedron puffs merged into ONE geometry, so the
 * whole ring is just 2 instanced draw calls.
 *
 * "More and kinda dynamic":
 *  - ~3x the clouds on a tighter ring, so the sky actually reads as cloudy.
 *  - Each cloud drifts on its own wind vector (mostly +X with some spread),
 *    and recycles through the ring centre when it reaches the edge, so the
 *    density never thins out.
 *  - Every cloud slowly billows: an animated simplex-noise displacement in the
 *    vertex shader (per-instance phase keeps clouds out of sync) churns each
 *    silhouette over ~30–60 s — the classic cumulus "boiling" motion.
 *
 * Per-vertex colours give white crowns and soft blue-grey underbellies, and the
 * shared Lambert material lets the sun (or moon) light them — so sunrise/sunset
 * clouds pick up warm light and night clouds sink into the same navy as the
 * night fog.
 *
 * Perf: 2 draw calls, no shadows, no transparency sorting, ~100 cheap matrix
 * writes per frame, one tiny noise-based vertex displacement.
 */

const CLOUD_COUNT = 100;                // total clouds in the ring (was 30)
const DISC_RADIUS = 1300;               // ring radius around the camera (m) (was 1700)
const ALT_MIN     = 260;                // cloud base altitude (m)
const ALT_MAX     = 440;
const WIND_MIN    = 1.5;                // drift speed (m/s)
const WIND_MAX    = 4.5;
const WIND_SPREAD = 0.55;               // ±radians each cloud's wind can diverge from +X
// Each cluster geometry is ~5 world units wide, so an instance scale of 13–36
// renders clouds ~65–180 m across — big enough to read as clouds from a
// sea-level camera at 260–440 m altitude (the world is in metres; the player
// is ~1.75 m tall).
const SCALE_MIN   = 13;
const SCALE_MAX   = 36;

// Shader morph: displacement = (d1*0.10 + d2*0.05) * MORPH_AMP * normal, where
// d1/d2 are animated simplex-noise samples in [-1, 1]. Pre-scale that is up to
// ~0.3 world units; multiplied by instance scale 13–36 → 4–11 m of billow on a
// 65–180 m cloud — clearly visible churn without the cloud looking wobbly.
const MORPH_AMP   = 2.4;                // billow strength
const MORPH_SPEED = 0.15;               // how fast the billow evolves (s⁻¹)

const DAY_COLOR   = new THREE.Color(0xffffff);
const NIGHT_COLOR = new THREE.Color(0x141d2b); // matches the night fog palette

// Vertex-colour ramp: white crowns → soft blue-grey underbellies (cumulus
// look). The underbelly stays fairly light so the crevices between puffs read
// as gentle shading instead of dark speckles when the sun is high.
const TOP_COLOR    = new THREE.Color(1.0, 1.0, 1.0);
const BOTTOM_COLOR = new THREE.Color(0.87, 0.89, 0.95);

// 3D simplex noise (Ashima Arts / Gustavson) — compact GLSL used by the morph.
const NOISE_GLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

export class CloudSystem {
  constructor(scene) {
    this.scene  = scene;
    this.group  = new THREE.Group();
    this.group.name = 'Clouds';
    this._cloudTime = 0; // accumulates real seconds for the billow shader

    // Two silhouette shapes for variety, each a randomised cumulus cluster.
    const shapes = [this._makeCumulus(), this._makeCumulus()];
    shapes.forEach((geo) => this._shadeCloud(geo));
    this._perShape = Math.ceil(CLOUD_COUNT / shapes.length);

    // Lambert + per-vertex colours: soft, lit, and the sun and moon tint them
    // naturally (sunrise/sunset clouds glow warm). Normals are smooth because
    // the merged geometry is computeVertexNormals()-ed, so no facet edges show.
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      color: 0xffffff,
    });

    // Animated billow: displace each vertex along its normal with simplex noise
    // that scrolls over time. Per-instance aPhase keeps every cloud out of sync.
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uCloudTime = { value: this._cloudTime };
      shader.uniforms.uCloudAmp  = { value: MORPH_AMP };
      this.material.userData.shader = shader; // so update() can advance uCloudTime
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\n' + NOISE_GLSL +
          '\nuniform float uCloudTime;\nuniform float uCloudAmp;\nattribute float aPhase;\n'
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
            float cT = uCloudTime * ${MORPH_SPEED} + aPhase;
            float d1 = snoise(position * 0.9 + vec3(0.0, cT, cT * 0.6));
            float d2 = snoise(position * 2.3 - vec3(cT * 0.8, cT * 0.4, 0.0));
            transformed += normal * (d1 * 0.10 + d2 * 0.05) * uCloudAmp;
          `
        );
    };

    this.meshes = shapes.map((geo) => {
      const mesh = new THREE.InstancedMesh(geo, this.material, this._perShape);
      mesh.frustumCulled = false; // ring wraps around the camera — always relevant
      mesh.castShadow = false;    // cheap: clouds never cast onto the scene
      mesh.receiveShadow = false;
      this.group.add(mesh);
      return mesh;
    });

    // Per-instance state: static spot in the ring + wind drift along +X (with
    // a little per-cloud spread so the whole bank isn't a rigid conveyor).
    this._data = [];
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * DISC_RADIUS; // uniform area fill
      this._data.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: THREE.MathUtils.randFloat(ALT_MIN, ALT_MAX),
        scale: THREE.MathUtils.randFloat(SCALE_MIN, SCALE_MAX),
        rotY: Math.random() * Math.PI * 2,
        speed: THREE.MathUtils.randFloat(WIND_MIN, WIND_MAX),
        dirAngle: THREE.MathUtils.randFloat(-WIND_SPREAD, WIND_SPREAD),
        phase: Math.random() * 100, // billow phase — clouds churn out of sync
      });
    }

    // Per-instance morph phase, one value per instance slot (cloud i → mesh i%2,
    // slot floor(i/2)).
    shapes.forEach((geo, gi) => {
      const phases = new Float32Array(this._perShape);
      for (let k = 0; k < this._perShape; k++) {
        const ci = k * shapes.length + gi;
        phases[k] = ci < this._data.length ? this._data[ci].phase : 0;
      }
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    });

    this._dummy = new THREE.Object3D();
    this.scene.add(this.group);
  }

  /**
   * Build one cumulus cloud: a dense clump of big rounded puffs with smaller
   * flanking puffs breaking up the silhouette. All puffs are smooth-shaded
   * icosahedrons (detail 2), squashed flat like real cumulus, and merged into a
   * single geometry so a whole cloud costs ONE instance.
   */
  _makeCumulus() {
    const puffs = [];

    // Main body — big puffs roughly in a ring, clustered toward the centre.
    const mainCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < mainCount; i++) {
      const a = (i / mainCount) * Math.PI * 2 + Math.random() * 0.6;
      const r = 0.28 + Math.random() * 0.35;
      const puff = new THREE.IcosahedronGeometry(1, 2);
      const s = 0.9 + Math.random() * 0.35;
      puff.scale(s, s * 0.66, s);
      puff.translate(Math.cos(a) * r, 0.10 + Math.random() * 0.18, Math.sin(a) * r);
      puffs.push(puff);
    }

    // Flanks — smaller puffs spread wider and a touch lower, so the cloud reads
    // as a flat-bottomed mound instead of a single blob.
    const flankCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < flankCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.65 + Math.random() * 0.75;
      const puff = new THREE.IcosahedronGeometry(1, 2);
      const s = 0.5 + Math.random() * 0.45;
      puff.scale(s, s * 0.75, s);
      puff.translate(Math.cos(a) * r, -0.15 + Math.random() * 0.3, Math.sin(a) * r * 0.95);
      puffs.push(puff);
    }

    const merged = mergeBufferGeometries(puffs, false);
    puffs.forEach((p) => p.dispose());
    merged.computeVertexNormals(); // smooth normals — no visible facets
    return merged;
  }

  /**
   * Paint white crowns and soft blue-grey underbellies onto a cloud geometry
   * via a vertex-colour attribute, based on local height.
   */
  _shadeCloud(geo) {
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp((pos.getY(i) + 0.9) / 2.1, 0, 1);
      c.copy(BOTTOM_COLOR).lerp(TOP_COLOR, t);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * Called every render frame while playing.
   * @param {number} fd - frame delta (s)
   * @param {number} nightFactor - 0 day → 1 night
   * @param {THREE.Vector3} cameraPos - the ring re-centres on this
   */
  update(fd, nightFactor, cameraPos) {
    // Follow the camera so clouds stay overhead no matter how far we sail.
    this.group.position.x = cameraPos.x;
    this.group.position.z = cameraPos.z;

    // Advance the billow clock; the morph shader reads this uniform.
    this._cloudTime += fd;
    if (this.material.userData.shader) {
      this.material.userData.shader.uniforms.uCloudTime.value = this._cloudTime;
    }

    this._data.forEach((c, i) => {
      // Per-cloud wind: mostly +X, with a little spread so the bank drifts as
      // one loose body instead of a rigid conveyor belt.
      c.x += Math.cos(c.dirAngle) * c.speed * fd;
      c.z += Math.sin(c.dirAngle) * c.speed * fd;

      // Recycle through the centre when a cloud drifts past the ring edge, so
      // the density around the camera never thins out downwind.
      const dist = Math.hypot(c.x, c.z);
      if (dist > DISC_RADIUS) {
        c.x = -c.x * (DISC_RADIUS / dist);
        c.z = -c.z * (DISC_RADIUS / dist);
      }

      this._dummy.position.set(c.x, c.y, c.z);
      this._dummy.rotation.set(0, c.rotY, 0);
      this._dummy.scale.setScalar(c.scale);
      this._dummy.updateMatrix();
      this.meshes[i % this.meshes.length].setMatrixAt(
        Math.floor(i / this.meshes.length),
        this._dummy.matrix
      );
    });
    this.meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });

    // Dusk/night: clouds sink into a cool navy matching the night fog, instead
    // of glowing pale in the dark.
    this.material.color.copy(DAY_COLOR).lerp(NIGHT_COLOR, nightFactor);
  }

  dispose() {
    this.scene.remove(this.group);
    this.meshes.forEach((m) => m.geometry.dispose());
    this.material.dispose();
    this._data.length = 0;
  }
}
