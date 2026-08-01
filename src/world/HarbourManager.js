import * as THREE from 'three';

/**
 * Builds and owns the lightweight harbour set dressing. Everything is made from
 * shared low-poly primitives so it remains inexpensive to render and can be
 * disposed as one unit when a game session ends.
 */
export class HarbourManager {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh[]} colliders — ground/large solids (character ground snap + boat collision)
   * @param {THREE.Mesh[]} wallColliders — props/buildings the character cannot walk through
   */
  constructor(scene, colliders, wallColliders = []) {
    this.scene = scene;
    this.colliders = colliders;
    this.wallColliders = wallColliders;
    this.root = new THREE.Group();
    this.root.name = 'Harbour';
    this.scene.add(this.root);

    this.dockEnd = new THREE.Vector3(0, 0.35, 91);
    this.boatSpawn = new THREE.Vector3(3.6, 0.15, 88); // clear of the pier edge
    this.boardingPoint = new THREE.Vector3(1.7, 0.8, 87.5);
    // Start the player ON the concrete plaza behind the pier (the harbour is
    // the only land in the world, and the plaza is its open walking space).
    this.playerSpawn = new THREE.Vector3(0, 2, 55);
    this._lights = [];
    this._gulls = [];
    this._build();
  }

  /** Register a mesh as a solid wall for the character's horizontal collision. */
  _wall(mesh) {
    if (this.wallColliders) this.wallColliders.push(mesh);
    return mesh;
  }

  _build() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x70462a, roughness: 0.88 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3f271b, roughness: 0.92 });
    const rope = new THREE.MeshStandardMaterial({ color: 0xb89a67, roughness: 1 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x28333c, metalness: 0.8, roughness: 0.35 });
    const red = new THREE.MeshStandardMaterial({ color: 0xae3f32, roughness: 0.75 });

    // ── Large concrete harbour plaza ───────────────────────────────────
    // The player's starting and walking space, sitting behind the pier.
    // Deliberately empty (no props/buildings/decorations) — reserved for
    // future development. A raised curb marks a clearly visible, finite
    // boundary all around, with a gap at the front where the wooden shore
    // platform connects so the player can walk plaza → platform → pier.
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8d9196, roughness: 0.95 });
    const concreteCurb = new THREE.MeshStandardMaterial({ color: 0x74787d, roughness: 0.9 });

    // Plaza slab: 80 wide (x) × 54 deep (z), top flush with the shore
    // platform (y = 0.5). Sits slightly deeper than the seabed so its
    // underside never z-fights with the terrain.
    this._box(concrete, 80, 2.3, 54, 0, -0.65, 42, true);

    // Perimeter curb — visible, finite boundary (blocks walking off the
    // edge; low enough to hop over). Also a ground collider.
    const curb = (px, pz, xLen, zLen) =>
      this._wall(this._box(concreteCurb, xLen, 0.45, zLen, px, 0.725, pz, true));
    curb(0, 15, 80, 0.6);     // back edge
    curb(-40, 42, 0.6, 54);   // left edge
    curb(40, 42, 0.6, 54);    // right edge
    curb(-22, 69, 36, 0.6);  // front edge — left of the platform (gap x -4..4)
    curb(22, 69, 36, 0.6);   // front edge — right of the platform

    // Shore platform and long boardwalk. Each support is also a ground collider.
    this._box(wood, 8, 0.5, 8, 0, 0.25, 73, true);
    this._box(wood, 4.2, 0.45, 20, 0, 0.25, 86, true);
    for (let z = 77; z <= 95; z += 2) this._box(darkWood, 4.7, 0.14, 0.12, 0, 0.54, z);
    for (const z of [77, 83, 89, 95]) {
      for (const x of [-1.7, 1.7]) this._cylinder(darkWood, 0.13, 0.13, 2.1, x, -0.55, z);
    }

    // Short railings near the harbour platform, intentionally left open at the boat.
    for (const x of [-3.5, 3.5]) {
      this._wall(this._cylinder(darkWood, 0.1, 0.1, 1.4, x, 1.0, 72));
      this._wall(this._cylinder(darkWood, 0.1, 0.1, 1.4, x, 1.0, 75));
      this._wall(this._box(darkWood, 0.12, 0.12, 3, x, 1.45, 73.5));
    }

    // Bollards, tyres, mooring ropes and harbour hardware.
    for (const z of [78, 86, 93]) {
      this._wall(this._cylinder(metal, 0.22, 0.28, 0.65, -1.55, 0.78, z));
      this._wall(this._cylinder(metal, 0.22, 0.28, 0.65, 1.55, 0.78, z));
    }
    for (const z of [82, 89]) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.14, 8, 16), metal);
      tyre.position.set(-2.15, 0.65, z);
      tyre.rotation.y = Math.PI / 2;
      this.root.add(tyre);
      this._wall(tyre);
    }
    this._rope(new THREE.Vector3(1.55, 0.95, 86), new THREE.Vector3(3.15, 0.55, 86.6), rope);
    this._rope(new THREE.Vector3(1.55, 0.95, 91), new THREE.Vector3(3.15, 0.55, 90.2), rope);

    // A compact office/shack, with a sign, bench, bins and practical supplies.
    this._wall(this._box(wood, 4.3, 2.4, 3.4, -4.8, 1.35, 72.5, true));
    this._box(darkWood, 4.9, 0.22, 4, -4.8, 2.75, 72.5);
    this._box(new THREE.MeshStandardMaterial({ color: 0x9dbbd0, roughness: 0.45 }), 1.1, 0.8, 0.06, -4.8, 1.65, 70.78);
    this._wall(this._box(red, 1.7, 0.65, 0.08, -4.8, 2.25, 70.7));
    this._wall(this._box(darkWood, 2.1, 0.12, 0.45, -1.9, 0.78, 70.5));
    this._box(darkWood, 0.15, 0.65, 0.15, -2.8, 0.42, 70.5);
    this._box(darkWood, 0.15, 0.65, 0.15, -1.0, 0.42, 70.5);

    this._wall(this._crate(-2.4, 0.7, 76, wood));
    this._wall(this._crate(-1.6, 0.7, 77.3, wood));
    this._wall(this._crate(1.0, 0.7, 80.5, wood));
    this._wall(this._barrel(-2.5, 0.7, 79, red));
    this._wall(this._barrel(-2.0, 0.7, 79.2, metal));
    this._wall(this._barrel(1.3, 0.7, 83.5, red));
    this._wall(this._lifeRing(1.9, 1.2, 78.5, red));
    this._net(-1.1, 0.64, 81.5, rope);

    // Warm dock lights and a few distant gull silhouettes sell the arrival scene.
    for (const z of [76, 88]) this._dockLight(-1.65, z, metal);
    for (let i = 0; i < 5; i++) {
      const gull = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 3), new THREE.MeshBasicMaterial({ color: 0xf7f4e8 }));
      gull.rotation.z = Math.PI / 2;
      gull.position.set(-12 + i * 6, 6 + (i % 2), 78 + i * 4);
      this.root.add(gull);
      this._gulls.push({ mesh: gull, phase: i * 1.3 });
    }
  }

  update(delta) {
    const time = performance.now() * 0.001;
    this._lights.forEach(light => { light.intensity = 0.8 + Math.sin(time * 2 + light.position.z) * 0.12; });
    this._gulls.forEach(({ mesh, phase }) => {
      mesh.position.y += Math.sin(time * 1.8 + phase) * delta * 0.35;
      mesh.rotation.y += delta * 0.35;
    });
  }

  dispose() {
    this.scene.remove(this.root);
  }

  _box(material, x, y, z, px, py, pz, collider = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    if (collider) this.colliders.push(mesh);
    return mesh;
  }

  _cylinder(material, top, bottom, height, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 10), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  _crate(x, y, z, material) { return this._box(material, 1, 1, 1, x, y, z); }
  _barrel(x, y, z, material) { return this._cylinder(material, 0.32, 0.36, 0.95, x, y, z); }

  _rope(from, to, material) {
    const points = [from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, -0.35, 0)), to];
    this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: material.color })));
  }

  _lifeRing(x, y, z, material) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 8, 16), material);
    ring.position.set(x, y, z);
    ring.rotation.y = Math.PI / 2;
    this.root.add(ring);
    return ring;
  }

  _net(x, y, z, material) {
    const net = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), new THREE.MeshBasicMaterial({ color: material.color, wireframe: true, transparent: true, opacity: 0.8 }));
    net.position.set(x, y, z);
    net.rotation.x = -Math.PI / 2;
    this.root.add(net);
  }

  _dockLight(x, z, material) {
    this._cylinder(material, 0.08, 0.1, 2.1, x, 1.45, z);
    const light = new THREE.PointLight(0xffc978, 0.9, 12, 2);
    light.position.set(x, 2.4, z);
    this.root.add(light);
    this._lights.push(light);
  }
}
