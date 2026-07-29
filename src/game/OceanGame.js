import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { BoatController } from './BoatController.js';
import { ThirdPersonCameraController } from './ThirdPersonCameraController.js';

export class OceanGame {
  constructor(container, callbacks = {}, options = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.options = options;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.water = null;
    this.sun = null;

    this.boatController = null;
    this.cameraController = null;

    this.trashes = [];
    this.trashCount = 0;
    this.score = 0;
    
    this.isPaused = false;
    this.isRunning = false;

    // Proximity & Reel State
    this.nearTrashItem = null;
    this.activeReels = [];
    this.targetRing = null;

    this.loader = new GLTFLoader();
    this.animId = null;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.container.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 20000);

    // Third Person Camera Controller
    this.cameraController = new ThirdPersonCameraController(this.camera, this.renderer.domElement);

    // Boat Controller (Player Vehicle)
    this.boatController = new BoatController(this.scene);

    // Sun & Sky
    this.sun = new THREE.Vector3();
    const sky = new Sky();
    sky.scale.setScalar(10000);
    this.scene.add(sky);

    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 10;
    skyUniforms['rayleigh'].value = 2;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;

    const parameters = { elevation: 3, azimuth: 180 };
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);

    const updateSun = () => {
      const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
      const theta = THREE.MathUtils.degToRad(parameters.azimuth);

      this.sun.setFromSphericalCoords(1, phi, theta);
      sky.material.uniforms['sunPosition'].value.copy(this.sun);
      if (this.water) this.water.material.uniforms['sunDirection'].value.copy(this.sun).normalize();

      this.scene.environment = pmremGenerator.fromScene(sky).texture;
    };
    updateSun();

    // Water Shader
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    const textureLoader = new THREE.TextureLoader();
    const waterNormals = textureLoader.load('assets/waternormals.jpg', (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });

    this.water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: waterNormals,
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 3.7,
      fog: this.scene.fog !== undefined
    });
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(100, 100, 50);
    this.scene.add(dirLight);

    // Proximity Ring Indicator
    const ringGeo = new THREE.RingGeometry(1.2, 1.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    this.targetRing = new THREE.Mesh(ringGeo, ringMat);
    this.targetRing.rotation.x = Math.PI / 2;
    this.targetRing.visible = false;
    this.scene.add(this.targetRing);

    // Spawn Trash Items
    this.spawnTrashItems();

    // Event Listeners
    this.handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      this.boatController.setKeyDown(key);

      // F Key Trash Pickup
      if ((key === 'f' || e.code === 'KeyF') && !this.isPaused) {
        this.pickupNearbyTrash();
      }
    };

    this.handleKeyUp = (e) => {
      this.boatController.setKeyUp(e.key.toLowerCase());
    };

    this.handleResize = this.onWindowResize.bind(this);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);

    this.isRunning = true;
    this.animate();
  }

  createFallbackTrashMesh() {
    const geometries = [
      new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8),
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.SphereGeometry(0.7, 8, 8)
    ];
    const colors = [0xe74c3c, 0xf1c40f, 0x9b59b6, 0x2ecc71, 0xe67e22];

    const geo = geometries[Math.floor(Math.random() * geometries.length)];
    const mat = new THREE.MeshStandardMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      roughness: 0.4
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.random() * Math.PI;
    mesh.rotation.z = Math.random() * Math.PI;
    return mesh;
  }

  spawnTrashItems() {
    const count = this.options.trashDensity === 'high' ? 800 : this.options.trashDensity === 'mega' ? 1200 : 500;
    
    this.loader.load(
      'assets/trash/scene.gltf',
      (gltf) => {
        const baseScene = gltf.scene;
        baseScene.scale.set(1.5, 1.5, 1.5);

        for (let i = 0; i < count; i++) {
          const clone = baseScene.clone();
          this.positionTrash(clone);
          this.scene.add(clone);
          this.trashes.push(clone);
        }
      },
      undefined,
      () => {
        for (let i = 0; i < count; i++) {
          const mesh = this.createFallbackTrashMesh();
          this.positionTrash(mesh);
          this.scene.add(mesh);
          this.trashes.push(mesh);
        }
      }
    );
  }

  positionTrash(obj) {
    const minD = 12;
    const maxD = 400;
    const distance = minD + Math.random() * (maxD - minD);
    const angle = Math.random() * Math.PI * 2;
    
    obj.position.set(
      Math.cos(angle) * distance,
      0.2,
      Math.sin(angle) * distance
    );
  }

  pickupNearbyTrash() {
    if (!this.nearTrashItem || this.nearTrashItem.isBeingReeled) return;

    const boatPos = this.boatController.getPosition();
    const dist = boatPos.distanceTo(this.nearTrashItem.position);

    // STRICT PICKUP RADIUS CHECK (< 8 units)
    if (dist > 8.0) return;

    const targetTrash = this.nearTrashItem;
    targetTrash.isBeingReeled = true;

    // Create 3D Fishing Line
    const deckPos = this.boatController.getDeckPosition();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 3 });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      deckPos,
      targetTrash.position.clone()
    ]);
    const fishingLine = new THREE.Line(lineGeo, lineMat);
    this.scene.add(fishingLine);

    this.activeReels.push({
      trash: targetTrash,
      line: fishingLine,
      progress: 0,
      startPos: targetTrash.position.clone()
    });

    this.targetRing.visible = false;
    this.nearTrashItem = null;
    if (this.callbacks.onNearTrash) {
      this.callbacks.onNearTrash(false);
    }
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateProximityCheck() {
    if (this.isPaused || this.trashes.length === 0) return;

    const boatPos = this.boatController.getPosition();
    const PICKUP_RADIUS = 8.0; // STRICT PROXIMITY LIMIT (< 8m)

    let closest = null;
    let minDistance = Infinity;

    for (let i = 0; i < this.trashes.length; i++) {
      const trash = this.trashes[i];
      if (trash.isBeingReeled) continue;

      const dist = boatPos.distanceTo(trash.position);
      if (dist <= PICKUP_RADIUS && dist < minDistance) {
        minDistance = dist;
        closest = trash;
      }
    }

    if (closest) {
      this.nearTrashItem = closest;
      this.targetRing.position.copy(closest.position);
      this.targetRing.position.y = 0.3;
      this.targetRing.rotation.z += 0.05;
      this.targetRing.visible = true;

      if (this.callbacks.onNearTrash) {
        this.callbacks.onNearTrash(true);
      }
    } else {
      this.nearTrashItem = null;
      this.targetRing.visible = false;

      if (this.callbacks.onNearTrash) {
        this.callbacks.onNearTrash(false);
      }
    }
  }

  updateFishingReels() {
    const boatDeck = this.boatController.getDeckPosition();

    for (let i = this.activeReels.length - 1; i >= 0; i--) {
      const reel = this.activeReels[i];
      reel.progress += 0.05;

      if (reel.progress >= 1.0) {
        // Arrived at deck
        this.scene.remove(reel.trash);
        this.scene.remove(reel.line);

        const trashIdx = this.trashes.indexOf(reel.trash);
        if (trashIdx !== -1) {
          this.trashes.splice(trashIdx, 1);
        }

        this.activeReels.splice(i, 1);

        this.trashCount += 1;
        this.score += 50;

        if (this.callbacks.onCollect) {
          this.callbacks.onCollect(this.score, this.trashCount);
        }
      } else {
        const currentPos = new THREE.Vector3().lerpVectors(reel.startPos, boatDeck, reel.progress);
        currentPos.y = Math.sin(reel.progress * Math.PI) * 2 + 0.4;
        
        reel.trash.position.copy(currentPos);
        reel.trash.rotation.x += 0.1;
        reel.trash.rotation.y += 0.1;

        const points = [boatDeck, reel.trash.position.clone()];
        reel.line.geometry.setFromPoints(points);
      }
    }
  }

  animate() {
    if (!this.isRunning) return;

    this.animId = requestAnimationFrame(() => this.animate());

    if (this.isPaused) return;

    if (this.water) {
      this.water.material.uniforms['time'].value += 1.0 / 60.0;
    }

    // Update Boat physics (camera-relative directional movement)
    this.boatController.update(this.camera, 1 / 60);

    // Update Camera position tracking boat
    this.cameraController.update(this.boatController.getPosition(), this.boatController.yaw, 1 / 60);

    // Proximity check & reels
    this.updateProximityCheck();
    this.updateFishingReels();

    if (this.callbacks.onTick) {
      this.callbacks.onTick(this.boatController.velocity);
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.isRunning = false;
    if (this.animId) cancelAnimationFrame(this.animId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);

    if (this.cameraController) this.cameraController.destroy();

    if (this.renderer && this.renderer.domElement && this.container) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
