import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class BoatController {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.boatMesh = null;

    // Position & Yaw Angle
    this.position = new THREE.Vector3(0, -0.6, 0);
    this.group.position.copy(this.position);
    this.yaw = 0; // heading angle in radians

    // Physics parameters
    this.velocity = 0;
    this.maxSpeed = 0.60;
    this.acceleration = 0.02;
    this.drag = 0.94;
    this.rotationSpeed = 0.12; // Smooth turn rate towards input direction

    // Buoyancy / Wave motion
    this.time = 0;
    this.roll = 0;
    this.pitch = 0;

    // Keys
    this.keys = {};

    this.loader = new GLTFLoader();
    this.initModel();
  }

  initModel() {
    this.scene.add(this.group);

    // Fallback boat geometry
    const fallback = this.createFallbackBoat();
    this.group.add(fallback);

    // Load original boat asset from Ocean Cleaner Assets folder
    this.loader.load(
      'assets/boat/scene.gltf',
      (gltf) => {
        this.group.remove(fallback);
        this.boatMesh = gltf.scene;

        this.boatMesh.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(this.boatMesh);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());

        // Center mesh horizontally and lower Y so bottom hull is submerged
        this.boatMesh.position.x = -center.x;
        this.boatMesh.position.y = -bbox.min.y - 0.8; // Submerge bottom hull into water
        this.boatMesh.position.z = -center.z;

        // Scale to ~7 units long
        const targetLength = 7.0;
        const scaleFactor = size.z > 0 ? targetLength / Math.max(size.x, size.z) : 2.5;

        this.boatMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Orient boat model bow forward along +Z axis
        this.boatMesh.rotation.y = 1.5;
        
        this.group.add(this.boatMesh);
      },
      undefined,
      (err) => {
        console.warn('Boat model load fallback:', err);
      }
    );
  }

  createFallbackBoat() {
    const fallbackGroup = new THREE.Group();

    const hullGeo = new THREE.BoxGeometry(3.2, 1.4, 7.5);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x0077be, roughness: 0.3 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = -0.3;
    fallbackGroup.add(hull);

    const cabinGeo = new THREE.BoxGeometry(2.2, 1.8, 2.8);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.2 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.2, -0.8);
    fallbackGroup.add(cabin);

    return fallbackGroup;
  }

  update(camera, delta = 1 / 60) {
    this.time += delta;

    // Get Camera forward and right vectors on XZ plane
    const camForward = new THREE.Vector3();
    if (camera) {
      camera.getWorldDirection(camForward);
      camForward.y = 0;
      camForward.normalize();
    } else {
      camForward.set(0, 0, -1);
    }

    const camRight = new THREE.Vector3();
    camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

    // Calculate movement vector from WASD keys
    const inputVector = new THREE.Vector3(0, 0, 0);

    if (this.keys['w'] || this.keys['arrowup']) {
      inputVector.add(camForward);
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      inputVector.sub(camForward);
    }
    if (this.keys['d'] || this.keys['arrowright']) {
      inputVector.add(camRight);
    }
    if (this.keys['a'] || this.keys['arrowleft']) {
      inputVector.sub(camRight);
    }

    const isMoving = inputVector.lengthSq() > 0;

    if (isMoving) {
      inputVector.normalize();

      // Target yaw angle for turning boat towards movement direction
      const targetYaw = Math.atan2(inputVector.x, inputVector.z);

      // Shortest angle rotation interpolation
      let angleDiff = targetYaw - this.yaw;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      this.yaw += angleDiff * this.rotationSpeed;

      // Accelerate
      this.velocity = Math.min(this.velocity + this.acceleration, this.maxSpeed);
      this.position.addScaledVector(inputVector, this.velocity);
    } else {
      // Friction coasting
      this.velocity *= this.drag;
      if (this.velocity > 0.001) {
        const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.position.addScaledVector(forward, this.velocity);
      } else {
        this.velocity = 0;
      }
    }

    // Water Buoyancy Simulation (Sitting ON water surface at y ≈ -0.6 + bobbing)
    const bobbing = Math.sin(this.time * 2.2) * 0.06;
    const targetRoll = isMoving ? Math.sin(this.time * 3) * 0.03 : 0;
    const targetPitch = (this.velocity / this.maxSpeed) * 0.03;

    this.roll += (targetRoll - this.roll) * 0.1;
    this.pitch += (targetPitch - this.pitch) * 0.1;

    // Position boat hull submerged at waterline
    this.group.position.set(this.position.x, -0.65 + bobbing, this.position.z);
    
    const euler = new THREE.Euler(
      this.pitch + Math.cos(this.time * 1.8) * 0.015,
      this.yaw,
      this.roll + Math.sin(this.time * 1.5) * 0.02,
      'YXZ'
    );
    this.group.quaternion.setFromEuler(euler);
  }

  setKeyDown(key) {
    this.keys[key.toLowerCase()] = true;
  }

  setKeyUp(key) {
    this.keys[key.toLowerCase()] = false;
  }

  getPosition() {
    return this.group.position.clone();
  }

  getDeckPosition() {
    return this.group.position.clone().add(new THREE.Vector3(0, 1.6, 0));
  }
}
