/**
 * Engine.js — Top-level game orchestrator.
 *
 * This replaces OceanGame.js. It is a thin coordinator:
 *  - Creates scene, renderer, camera
 *  - Wires together all systems (GameLoop, Input, Character, Camera, World)
 *  - Delegates world logic to IslandBuilder and TrashSystem
 *  - Reads all settings from config/ files
 *
 * App.jsx creates: new Engine(container, callbacks, options)
 * API is identical to the old OceanGame so App.jsx needs no changes.
 */

import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky }   from 'three/examples/jsm/objects/Sky.js';

import { GameLoop }            from '../core/GameLoop.js';
import { InputManager }        from '../player/InputManager.js';
import { CharacterController } from '../player/CharacterController.js';
import { BoatController }      from '../player/BoatController.js';
import { CameraController }    from '../player/CameraController.js';
import { VegetationSystem }    from '../world/VegetationSystem.js';
import { ChunkManager }        from '../world/ChunkManager.js';
import { TimeSystem }          from '../core/TimeSystem.js';
import { WeatherSystem }       from '../core/WeatherSystem.js';
import { TrashSystem }         from '../world/TrashSystem.js';
import { HarbourManager }      from '../world/HarbourManager.js';
import { AssetManager }        from './AssetManager.js';
import { GameState }           from './GameStateManager.js';
import { GraphicsConfig }      from '../config/GraphicsConfig.js';
import { WorldConfig }         from '../config/WorldConfig.js';

export class Engine {
  constructor(container, callbacks = {}, options = {}) {
    this.container = container;
     this.callbacks = callbacks;
     this.options   = options;

     this.colliders = []; // shared — IslandBuilder fills, CharacterController reads
      // Harbor/boat related
      this.dock = null;
      this.boat = null;
      this.dockTrigger = null;
      this.boatController = null;
      this.harbour = null;
      this.waterFollowsCamera = true; // default to true for ocean
      this.missionActive = false;
      this.isNearBoat = false;
      this._wasNearBoat = false;
      this.isBoarding = false;
      this.isReturning = false;
      this._boardingProgress = 0;
      this._returnProgress = 0;

    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._initWorld();
    this._initEventListeners();

    // GameState is shared between engine instances (for example after returning
    // to the menu), so start each new game from a known state.
    GameState.reset();
    // Listen for state changes (MUST be registered before transition)
    GameState.onEnter('HARBOR', () => this._enterHarbor());
    GameState.onEnter('BOAT',   () => this._enterBoat());
    GameState.onExit('HARBOR',  () => this._exitHarbor());
    GameState.onExit('BOAT',    () => this._exitBoat());

    GameState.transition('HARBOR');
    this.loop.start();
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Initialisation
  // ──────────────────────────────────────────────────────────────────────────

  _initRenderer() {
    const w = this.container.clientWidth  || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: GraphicsConfig.ANTIALIAS });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GraphicsConfig.MAX_PIXEL_RATIO));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = GraphicsConfig.SHADOWS_ENABLED;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene  = new THREE.Scene();
    const gc = GraphicsConfig;
    this.camera = new THREE.PerspectiveCamera(gc.FOV, this._aspect(), gc.NEAR, gc.FAR);

    this._setupLighting();
    this._setupSky();
    this._setupWater();
  }

  _initSystems() {
    // Input (must come before character + camera)
    this.input = new InputManager();

    // Character and Boat
    this.character = new CharacterController(this.scene, this.colliders);
    this.boat = new BoatController(this.scene, this.colliders);
    this.activeVehicle = 'CHARACTER';

    // Camera
    this.camera_ctrl = new CameraController(this.camera, this.renderer.domElement);

    // Vegetation (InstancedMesh renderer)
    this.vegetation = new VegetationSystem(this.scene);

    // Fixed-timestep game loop
    this.loop = new GameLoop({
      onFixedUpdate: (dt)        => this._fixedUpdate(dt),
      onRender:      (alpha, fd) => this._render(alpha, fd),
    });

    // Time and Weather (Needs sky and lights, initialized after scene setup)
    // We will initialize them in _initWorld or _initScene, actually let's do it in _setupLighting and _setupSky

  }

  _initWorld() {
    // Chunks + vegetation
    this.chunks = new ChunkManager(this.scene, this.colliders, this.vegetation);
    
    // Spawn player near the shore
    const spawnPos = new THREE.Vector3(70, 5, 0); // High enough to fall onto terrain
    this.character.setPosition(spawnPos.x, spawnPos.y, spawnPos.z);
    
    // Spawn boat in the water at the shore
    this.boat.setPosition(75, 0, 0);
    
    // Initialize first chunks around player
    this.chunks.update(spawnPos);

    // Trash
     this.trash = new TrashSystem(this.scene, {
       onCollect:    (newScore, newCount) => { if (this.missionActive) this.callbacks.onCollect?.(newScore, newCount); },
       onNearTrash:  (isNear) => { if (this.missionActive) this.callbacks.onNearTrash?.(isNear); },
     }, this.options);
  }

  _initEventListeners() {
<<<<<<< HEAD
    this._onResize  = this._onResize.bind(this);
    this._onKeyDown = (e) => {
      if (e.code === 'KeyF' && GameState.is('PLAYING')) {
        const activePos = this.activeVehicle === 'CHARACTER' ? this.character.getPosition() : this.boat.getPosition();
        const activeDeck = this.activeVehicle === 'CHARACTER' ? this.character.getDeckPosition() : this.boat.getDeckPosition();
        this.trash.pickupNearest(activePos, activeDeck);
      }
      
      if (e.code === 'KeyE' && GameState.is('PLAYING')) {
        this._toggleVehicle();
      }
    };
    window.addEventListener('resize',  this._onResize);
    window.addEventListener('keydown', this._onKeyDown);
  }
=======
     this._onResize  = this._onResize.bind(this);
     this._onKeyDown = (e) => {
       if (e.code === 'KeyF' && (GameState.is('HARBOR') || GameState.is('BOAT'))) {
         const entityPos = GameState.is('HARBOR') ? this.character.getPosition() : (this.boat ? this.boat.position : new THREE.Vector3());
         const deckPos   = GameState.is('HARBOR') ? this.character.getDeckPosition() : new THREE.Vector3(0, 1.2, 0); // placeholder
         this.trash.pickupNearest(
           entityPos,
           deckPos
         );
       }
       if (e.code === 'KeyE' && GameState.is('HARBOR')) {
         // Check if we are near the boat to board
         if (this.boat && this.dockTrigger) {
           const distance = this.character.getPosition().distanceTo(this.boat.position);
           if (distance < 6) this._beginBoarding();
         }
       }
     };
     window.addEventListener('resize',  this._onResize);
     window.addEventListener('keydown', this._onKeyDown);
   }
>>>>>>> ce7c38d (add harbour boat cleanup gameplay)

  // ──────────────────────────────────────────────────────────────────────────
  //  Scene setup helpers
  // ──────────────────────────────────────────────────────────────────────────

  _setupLighting() {
    const gc = GraphicsConfig;
    this.ambientLight = new THREE.AmbientLight(0xffffff, gc.AMBIENT_INTENSITY);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(gc.SUN_COLOR, gc.SUN_INTENSITY);
    this.sunLight.position.set(...gc.SUN_POSITION);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(gc.SHADOW_MAP_SIZE, gc.SHADOW_MAP_SIZE);
    this.sunLight.shadow.camera.near   = gc.SHADOW_NEAR;
    this.sunLight.shadow.camera.far    = gc.SHADOW_FAR;
    const e = gc.SHADOW_EXTENT;
    this.sunLight.shadow.camera.left   = -e; this.sunLight.shadow.camera.right  = e;
    this.sunLight.shadow.camera.top    =  e; this.sunLight.shadow.camera.bottom = -e;
    this.scene.add(this.sunLight);
  }

  _setupSky() {
    const gc = GraphicsConfig;
    this.sky = new Sky();
    this.sky.scale.setScalar(WorldConfig.OCEAN_SIZE);
    this.scene.add(this.sky);

    const u = this.sky.material.uniforms;
    u['turbidity'].value        = gc.SKY_TURBIDITY;
    u['rayleigh'].value         = gc.SKY_RAYLEIGH;
    u['mieCoefficient'].value   = gc.SKY_MIE_COEFFICIENT;
    u['mieDirectionalG'].value  = gc.SKY_MIE_DIRECTIONAL_G;

    const phi   = THREE.MathUtils.degToRad(90 - gc.SKY_ELEVATION);
    const theta = THREE.MathUtils.degToRad(gc.SKY_AZIMUTH);
    u['sunPosition'].value.setFromSphericalCoords(1, phi, theta);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(this.sky).texture;
    
    // Initialize Time and Weather systems now that lights and sky exist
    this.timeSystem = new TimeSystem(this.scene, this.sunLight, this.ambientLight, this.sky);
    this.weatherSystem = new WeatherSystem(this.scene, this);
  }

  async _setupWater() {
    const geo     = new THREE.PlaneGeometry(WorldConfig.OCEAN_SIZE, WorldConfig.OCEAN_SIZE);
    const normals = await AssetManager.loadTexture('assets/waternormals.jpg', t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });

    this.water = new Water(geo, {
      textureWidth:    512,
      textureHeight:   512,
      waterNormals:    normals,
      sunDirection:    new THREE.Vector3(),
      sunColor:        0xffffff,
      waterColor:      WorldConfig.WATER_COLOR,
      distortionScale: WorldConfig.DISTORTION_SCALE,
      fog:             !!this.scene.fog,
      alpha:           0.8, // Transparent to see fishes underneath
    });
    this.water.material.transparent = true;
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Loop hooks
  // ──────────────────────────────────────────────────────────────────────────

  _toggleVehicle() {
    if (this.activeVehicle === 'CHARACTER') {
      const dist = this.character.getPosition().distanceTo(this.boat.getPosition());
      if (dist < 10) {
        this.activeVehicle = 'BOAT';
        this.character.group.visible = false;
        // Snap character to boat
        this.character.setPosition(this.boat.position.x, this.boat.position.y, this.boat.position.z);
      }
    } else {
      this.activeVehicle = 'CHARACTER';
      this.character.group.visible = true;
      // Disembark slightly to the side
      const disembarkPos = this.boat.getPosition().add(new THREE.Vector3(3, 2, 0));
      this.character.setPosition(disembarkPos.x, disembarkPos.y, disembarkPos.z);
      this.character.velocity.set(0, 0, 0);
    }
  }

  _fixedUpdate(dt) {
     if (!GameState.is('HARBOR') && !GameState.is('BOAT')) return;

<<<<<<< HEAD
    if (this.activeVehicle === 'CHARACTER') {
      this.character.fixedUpdate(this.input, this.camera_ctrl, dt);
      this.boat._detectGround(); // Keep boat floating
    } else {
      this.boat.fixedUpdate(this.input, this.camera_ctrl, dt);
      this.character.setPosition(this.boat.position.x, this.boat.position.y, this.boat.position.z);
    }
    
    const activePos = this.activeVehicle === 'CHARACTER' ? this.character.getPosition() : this.boat.getPosition();
    this.trash.updateProximity(activePos);
  }
=======
     if (GameState.is('HARBOR')) {
       this.character.fixedUpdate(this.input, this.camera_ctrl, dt);
       this.trash.updateProximity(this.character.getPosition());
       // Update near boat status for docking prompt
       if (this.boat) {
         const distanceToBoat = this.character.getPosition().distanceTo(this.boat.position);
         this.isNearBoat = distanceToBoat < 6;
       } else {
         this.isNearBoat = false;
       }
       if (this.isNearBoat !== this._wasNearBoat) {
         this._wasNearBoat = this.isNearBoat;
         this.callbacks.onNearBoat?.(this.isNearBoat);
       }
       if (this.boat) {
         this.boat.position.y = this.harbour.boatSpawn.y + Math.sin(performance.now() * 0.0012) * 0.12;
         this.boat.rotation.z = Math.sin(performance.now() * 0.0009) * 0.025;
       }
     } else if (GameState.is('BOAT')) {
       if (this.boatController && !this.isReturning) {
         this.boatController.fixedUpdate(this.input, dt);
       }
       if (!this.isReturning) this.trash.updateProximity(this.boat.position);
     }
   }
>>>>>>> ce7c38d (add harbour boat cleanup gameplay)

  _render(alpha, fd) {
     if (!GameState.is('HARBOR') && !GameState.is('BOAT')) return;

<<<<<<< HEAD
    if (this.water) {
      this.water.material.uniforms['time'].value += fd;
      // Make water follow camera to appear infinite
      this.water.position.x = this.camera.position.x;
      this.water.position.z = this.camera.position.z;
      // Add a gentle bobbing motion to create waves lapping against the coast
      this.water.position.y = Math.sin(this.water.material.uniforms['time'].value * 1.5) * 0.4;
    }
    
    const activePos = this.activeVehicle === 'CHARACTER' ? this.character.getPosition() : this.boat.getPosition();
    const activeYaw = this.activeVehicle === 'CHARACTER' ? this.character.yaw : this.boat.yaw;
    const activeDeck = this.activeVehicle === 'CHARACTER' ? this.character.getDeckPosition() : this.boat.getDeckPosition();
    
    // Update chunks relative to active vehicle
    this.chunks.update(activePos);
    
    // Update time and weather
    if (this.timeSystem) this.timeSystem.update(fd, this.renderer);
    if (this.weatherSystem) this.weatherSystem.update(fd);

    this.camera_ctrl.update(
      activePos,
      activeYaw,
      this.input,
      fd
    );

    this.character.renderUpdate(fd, this.camera_ctrl);
    this.boat.renderUpdate(fd, this.camera_ctrl);
    this.trash.updateReels(activeDeck);
=======
     if (this.water) {
       this.water.material.uniforms['time'].value += fd;
       if (this.waterFollowsCamera) {
         // Make water follow camera to appear infinite
         this.water.position.x = this.camera.position.x;
         this.water.position.z = this.camera.position.z;
       }
     }
     this.harbour?.update(fd);

     if (this.isBoarding) this._updateBoarding(fd);
     if (this.isReturning) this._updateReturn(fd);

     // Update chunks based on player position (character or boat)
     const playerPos = GameState.is('HARBOR') ? this.character.getPosition() : (this.boat ? this.boat.position : new THREE.Vector3());
     this.chunks.update(playerPos);
>>>>>>> ce7c38d (add harbour boat cleanup gameplay)

     // Update time and weather
     if (this.timeSystem) this.timeSystem.update(fd, this.renderer);
     if (this.weatherSystem) this.weatherSystem.update(fd);

     if (GameState.is('HARBOR')) {
        // Harbor mode: character controls
        this.camera_ctrl.update(
          this.character.getPosition(),
          this.character.yaw,
          this.input,
          fd
        );
        this.character.renderUpdate(fd, this.camera_ctrl);
        this.trash.updateReels(this.character.getDeckPosition());
        if (this.missionActive) {
          this.callbacks.onTick?.(this.character.speed * 1.94384);
        }
      } else if (GameState.is('BOAT')) {
       // Boat mode: boat controls
       // Update camera to follow boat
       const boatYaw = this.boat ? this.boat.rotation.y : 0;
       this.camera_ctrl.update(
         this.boat.position,
         boatYaw,
         this.input,
         fd
       );
        // Update boat visuals
        if (this.boatController) {
          this.boatController.renderUpdate(fd, this.camera_ctrl);
        }
        // Update trash reels - we need a deck position for the boat
        // For now, we'll use the boat's position plus an offset (to be improved)
        const deckPos = this.boat.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        this.trash.updateReels(deckPos);
        // Get speed from boat controller and convert to knots
        const speed = this.boatController ? this.boatController.speed * 1.94384 : 0;
        // Only update HUD and scoring if mission is active
        if (this.missionActive) {
          this.callbacks.onTick?.(speed);
        }
      }

     this.renderer.render(this.scene, this.camera);
   }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public API (used by App.jsx)
  // ──────────────────────────────────────────────────────────────────────────

  /** Pause the game (physics stops, render continues) */
  pause() {
    if (GameState.is('HARBOR') || GameState.is('BOAT')) {
      this._pausedState = GameState.current;
      GameState.transition('PAUSED');
    }
  }

  /** Resume from pause */
  resume() { GameState.transition(this._pausedState || 'HARBOR'); }

  destroy() {
     this.loop.stop();
     this.input.destroy();
     this.vegetation.dispose();
     this.trash.dispose();
     this.harbour?.dispose();
     AssetManager.dispose();
     GameState.dispose();

     window.removeEventListener('resize',  this._onResize);
     window.removeEventListener('keydown', this._onKeyDown);

     if (this.renderer && this.container) {
        this.container.removeChild(this.renderer.domElement);
        this.renderer.dispose();
      }
   }

   // ──────────────────────────────────────────────────────────────────────────
   //  Harbor Setup
   // ──────────────────────────────────────────────────────────────────────────

   _setupHarbor() {
     if (this.harbour) return;
     this.waterFollowsCamera = false;
     this.harbour = new HarbourManager(this.scene, this.colliders);
     this.character.setPosition(...this.harbour.playerSpawn);

     // A procedural sailboat keeps the gameplay-facing direction and the
     // visible bow in the same local -Z direction.
     this.boat = this._createHarbourBoat();
     this.boat.position.copy(this.harbour.boatSpawn);
     // Keep the boat's visual bow and controller's local -Z forward axis aligned.
     // This makes conventional steering unambiguous: A = left, D = right.
     this.boat.rotation.y = 0;
     this.scene.add(this.boat);

     const triggerGeometry = new THREE.BoxGeometry(6, 4, 7);
     this.dockTrigger = new THREE.Mesh(triggerGeometry, new THREE.MeshBasicMaterial({ visible: false }));
     this.dockTrigger.position.copy(this.harbour.boatSpawn);
     this.scene.add(this.dockTrigger);

   }

   _createHarbourBoat() {
     const boat = new THREE.Group();
     boat.name = 'Harbour Sailboat';
     const hullMat = new THREE.MeshStandardMaterial({ color: 0xc86a08, roughness: 0.58 });
     const hullDarkMat = new THREE.MeshStandardMaterial({ color: 0x8e4208, roughness: 0.7 });
     const deckMat = new THREE.MeshStandardMaterial({ color: 0xe9a24a, roughness: 0.72 });
     const woodMat = new THREE.MeshStandardMaterial({ color: 0x71330b, roughness: 0.8 });
     const sailMat = new THREE.MeshStandardMaterial({ color: 0xfff0c5, roughness: 0.9, side: THREE.DoubleSide });
     const ropeMat = new THREE.LineBasicMaterial({ color: 0x62300e });
     const add = (mesh) => {
       mesh.castShadow = true;
       mesh.receiveShadow = true;
       boat.add(mesh);
       return mesh;
     };

     // Low-poly orange hull: squared stern with a pointed bow at local -Z.
     const hull = add(new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.72, 3.8), hullMat));
     hull.position.set(0, 0.35, 0.5);
     const bow = add(new THREE.Mesh(new THREE.ConeGeometry(1.23, 1.45, 8), hullMat));
     bow.rotation.x = -Math.PI / 2;
     bow.position.set(0, 0.35, -2.12);
     const keel = add(new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.28, 3.9), hullDarkMat));
     keel.position.set(0, -0.02, 0.3);
     const deck = add(new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.18, 3.95), deckMat));
     deck.position.set(0, 0.78, 0.22);

     // Deck planking keeps the handmade, game-like look from the reference.
     for (let z = -1.35; z <= 1.75; z += 0.38) {
       const plank = add(new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.025, 0.035), woodMat));
       plank.position.set(0, 0.885, z);
     }

     const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 10), woodMat));
     mast.position.set(0, 3.05, 0.15);
     const boom = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.3, 8), woodMat));
     boom.rotation.z = Math.PI / 2;
     boom.position.set(0, 1.55, -0.15);
     const yard = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.55, 8), woodMat));
     yard.rotation.z = Math.PI / 2;
     yard.position.set(0, 4.45, 0.15);

     const makeSail = (points) => {
       const shape = new THREE.Shape();
       shape.moveTo(points[0][0], points[0][1]);
       points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
       shape.closePath();
       const sail = add(new THREE.Mesh(new THREE.ShapeGeometry(shape), sailMat));
       sail.position.z = -0.025;
       return sail;
     };
     makeSail([[-0.08, 1.65], [-1.16, 1.78], [-1.16, 4.3], [-0.08, 4.38]]);
     makeSail([[0.08, 1.65], [1.16, 1.78], [1.16, 4.3], [0.08, 4.38]]);

     // Rigging, rear motor and small deck cargo complete the working cleanup boat.
     const rig = (from, to) => boat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), ropeMat));
     rig(new THREE.Vector3(0, 4.45, 0.15), new THREE.Vector3(-1.05, 0.95, -1.35));
     rig(new THREE.Vector3(0, 4.45, 0.15), new THREE.Vector3(1.05, 0.95, 1.65));
     const motor = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.42), hullDarkMat));
     motor.position.set(0, 1.08, 2.15);
     const crate = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), woodMat));
     crate.position.set(-0.48, 1.08, 0.9);
     const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 14), sailMat));
     ring.position.set(0.6, 1.08, 0.65);
     ring.rotation.x = Math.PI / 2;
     return boat;
   }

   // ──────────────────────────────────────────────────────────────────────────
   //  Mission Control
   // ──────────────────────────────────────────────────────────────────────────

   _startMission() {
     this.missionActive = true;
     this.trash.start();
     this.callbacks.onMissionState?.('started');
   }

   _stopMission() {
     this.missionActive = false;
     this.callbacks.onMissionState?.('harbour');
   }

   _beginBoarding() {
     if (this.isBoarding || !this.boat || !this.harbour) return;
     this.isBoarding = true;
     this.isNearBoat = false;
     this._wasNearBoat = false;
     this.callbacks.onNearBoat?.(false);
     this._boardingProgress = 0;
     this._boardingFrom = this.character.getPosition();
     this.callbacks.onMissionState?.('boarding');
   }

   _updateBoarding(delta) {
     this._boardingProgress = Math.min(1, this._boardingProgress + delta / 0.85);
     const eased = this._boardingProgress * this._boardingProgress * (3 - 2 * this._boardingProgress);
     const position = this._boardingFrom.clone().lerp(this.harbour.boardingPoint, eased);
     this.character.setPosition(position.x, position.y, position.z);
     this.camera_ctrl.update(position, this.character.yaw, this.input, delta);
     if (this._boardingProgress >= 1) {
       this.isBoarding = false;
       this.character.group.visible = false;
       GameState.transition('BOAT');
     }
   }

   completeMission() {
     if (!this.missionActive || this.isReturning || !this.boat) return;
     this.isReturning = true;
     this._returnProgress = 0;
     this._returnFrom = this.boat.position.clone();
     this.callbacks.onMissionState?.('returning');
   }

   _updateReturn(delta) {
     this._returnProgress = Math.min(1, this._returnProgress + delta / 1.8);
     const eased = this._returnProgress * this._returnProgress * (3 - 2 * this._returnProgress);
     this.boat.position.lerpVectors(this._returnFrom, this.harbour.boatSpawn, eased);
     if (this._returnProgress >= 1) {
       this.isReturning = false;
       GameState.transition('HARBOR');
       this.character.group.visible = true;
       const exit = this.harbour.boardingPoint.clone().add(new THREE.Vector3(-1.2, 0, -1.2));
       this.character.setPosition(exit.x, exit.y, exit.z);
       this.callbacks.onMissionComplete?.();
     }
   }

   // ──────────────────────────────────────────────────────────────────────────
   //  State Handlers
   // ──────────────────────────────────────────────────────────────────────────

   _enterHarbor() {
     // Set up harbor-specific elements (dock, boat, player spawn on dock)
     this.waterFollowsCamera = false; // static water for harbor
     this._setupHarbor();
   }

   _enterBoat() {
     // Disable character controller, enable boat controller
     this.character.enabled = false;
     if (!this.boatController && this.boat) {
       this.boatController = new BoatController(this.boat, this.input);
     }
     if (this.boatController) {
       this.boatController.enabled = true;
     }
     // Start mission timer, enable trash scoring, etc.
     this.waterFollowsCamera = true; // water follows camera for ocean illusion
     this._startMission();
   }

   _exitHarbor() {
     // Clean up harbor-specific elements if needed
     // We'll keep the dock and boat in the scene, but we might want to hide them?
     // For now, we leave them.
   }

   _exitBoat() {
     // Disable boat controller, enable character controller
     if (this.boatController) {
       this.boatController.enabled = false;
     }
     this.character.enabled = true;
     // Stop mission timer
     this._stopMission();
   }

   // ──────────────────────────────────────────────────────────────────────────
   //  Helpers
  _aspect() {
    return (this.container.clientWidth || window.innerWidth) /
           (this.container.clientHeight || window.innerHeight);
  }

  _onResize() {
    const w = this.container.clientWidth  || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
