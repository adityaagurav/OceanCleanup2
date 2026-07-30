/**
 * Engine.js — Top-level game orchestrator.
 *
 * This replaces OceanGame.js. It is a thin coordinator:
 *  - Creates scene, renderer, camera
 *  - Wires together all systems (GameLoop, Input, Character, Camera, World)
 *  - Delegates world logic to IslandBuilder and TrashSystem
 *  - Reads all settings from config/ files
 *  - Uses InteractionSystem for unified E/F key handling
 *
 * App.jsx creates: new Engine(container, callbacks, options)
 * API is identical to the old OceanGame so App.jsx needs no changes.
 */

import * as THREE from 'three';
import { Sky }   from 'three/examples/jsm/objects/Sky.js';
import { StylizedWater } from '../world/StylizedWater.js';

import { GameLoop }            from '../core/GameLoop.js';
import { InputManager }        from '../player/InputManager.js';
import { CharacterController } from '../player/CharacterController.js';
import { BoatController }      from '../player/BoatController.js';
import { CameraController }    from '../player/CameraController.js';
import { InteractionSystem }   from '../player/InteractionSystem.js';
import { VegetationSystem }    from '../world/VegetationSystem.js';
import { ChunkManager }        from '../world/ChunkManager.js';
import { TimeSystem }          from '../core/TimeSystem.js';
import { WeatherSystem }       from '../core/WeatherSystem.js';
import { TrashSystem }         from '../world/TrashSystem.js';
import { BuildingSystem }      from '../world/BuildingSystem.js';
import { UnderwaterSystem }    from '../world/UnderwaterSystem.js';
import { FishSystem }          from '../world/FishSystem.js';
import { WildlifeSystem }      from '../world/WildlifeSystem.js';
import { CatchSystem }         from '../world/CatchSystem.js';
import { CompanionSystem }     from '../world/CompanionSystem.js';
import { TreasureSystem }      from '../world/TreasureSystem.js';
import { BoatManager }         from '../player/BoatManager.js';
import { AssetManager }        from './AssetManager.js';
import { GameState }           from './GameStateManager.js';
import { GraphicsConfig }      from '../config/GraphicsConfig.js';
import { WorldConfig }         from '../config/WorldConfig.js';
import { PlayerConfig }        from '../config/PlayerConfig.js';

export class Engine {
  constructor(container, callbacks = {}, options = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.options   = options;

    this.terrainColliders = []; 
    this.boatColliders = [];

    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._initWorld();
    this._initInteractions();
    this._initEventListeners();

    GameState.transition('PLAYING');
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
    this.character = new CharacterController(this.scene, this.terrainColliders, this.boatColliders);
    this.boat = new BoatController(this.scene, this.terrainColliders);
    this.activeVehicle = 'CHARACTER';

    // Camera
    this.camera_ctrl = new CameraController(this.camera, this.renderer.domElement);

    // Interaction System
    this.interactionSystem = new InteractionSystem(this.scene);

    // Vegetation (InstancedMesh renderer)
    this.vegetation = new VegetationSystem(this.scene);

    // Fixed-timestep game loop
    this.loop = new GameLoop({
      onFixedUpdate: (dt)        => this._fixedUpdate(dt),
      onRender:      (alpha, fd) => this._render(alpha, fd),
    });
  }

  _initWorld() {
    // Chunks + vegetation
    this.chunks = new ChunkManager(this.scene, this.terrainColliders, this.vegetation);
    
    // Spawn player safely above terrain
    const savedPos = this.options.initialData?.playerPos;
    let spawnX = 70;
    let spawnZ = 0;
    
    if (savedPos) {
      spawnX = savedPos.x;
      spawnZ = savedPos.z;
    }
    
    const spawnY = savedPos ? savedPos.y : this.chunks.generator._getElevation(spawnX, spawnZ) + 5;
    const spawnPos = new THREE.Vector3(spawnX, spawnY, spawnZ);
    this.character.setPosition(spawnPos.x, spawnPos.y, spawnPos.z);
    
    // Spawn boat in the water near the player
    // If we loaded a save, just put the boat right next to them
    const boatX = savedPos ? spawnX + 5 : 75;
    const boatZ = savedPos ? spawnZ : 0;
    this.boat.setPosition(boatX, Math.max(0, this.chunks.generator._getElevation(boatX, boatZ)), boatZ);
    
    // Initialize first chunks around player
    this.chunks.update(spawnPos);

    // Trash
    this.trash = new TrashSystem(this.scene, {
      onCollect: (score, count) => {
        if (this.callbacks.onCollect) this.callbacks.onCollect(score, count);
        if (this.boatManager) this.boatManager.onTrashCollected(count);
      },
      onNearTrash:  this.callbacks.onNearTrash,
    }, this.options);

    // Fish
    this.fish = new FishSystem(this.scene, {
      onFishCollect: this.callbacks.onFishCollect,
    });

    // Wildlife
    this.wildlife = new WildlifeSystem(this.scene);

    // Catch System
    this.catchSystem = new CatchSystem(this.scene, this.wildlife, (config) => {
      this.callbacks.onCatch?.(config);
    });

    // Companion System
    this.companionSystem = new CompanionSystem(this.scene);

    // Treasure System
    this.treasureSystem = new TreasureSystem(this.scene, this.chunks.generator, {
      onNearTreasure: (isNear) => this.callbacks.onNearTreasure?.(isNear),
      onCollectTreasure: (amount) => this.callbacks.onCollectTreasure?.(amount)
    });

    // Boat Progression Manager
    this.boatManager = new BoatManager(this);

    // Building System (House & Recycle Plant)
    this.buildingSystem = new BuildingSystem(
      this.scene, 
      this.interactionSystem, 
      this.terrainColliders, 
      this.chunks.generator,
      {
        onInteractHouse: () => this.callbacks.onInteractHouse?.(),
        onInteractPlant: () => this.callbacks.onInteractPlant?.()
      }
    );

    // Underwater Environment (Seaweed, Rocks)
    this.underwaterSystem = new UnderwaterSystem(this.scene, this.chunks.generator);

    // Set up camera anti-clip with terrain colliders
    this.camera_ctrl.setClipColliders(this.terrainColliders);
  }

  /**
   * Register all interactable objects with the InteractionSystem.
   */
  _initInteractions() {
    // Register boat as interactable
    this.interactionSystem.registerInteractable(
      this.boat.getBoatGroup(),
      'boat',
      () => this._toggleVehicle(),
      () => this.boat.getPosition(),
      5.0 // Boat radius
    );
  }

  _initEventListeners() {
    this._onResize  = this._onResize.bind(this);
    this._onKeyDown = (e) => {
      if (e.code === 'KeyF' && GameState.is('PLAYING')) {
        // F key: pickup items (trash, fish, treasure)
        const activePos = this.activeVehicle === 'CHARACTER' ? this.character.getPosition() : this.boat.getPosition();
        const activeDeck = this.activeVehicle === 'CHARACTER' ? this.character.getDeckPosition() : this.boat.getDeckPosition();

        const caughtFish = this.fish.pickupNearest(activePos, activeDeck);
        if (!caughtFish) {
          this.trash.pickupNearest(activePos, activeDeck);
          if (this.treasureSystem) this.treasureSystem.openNearest();
        }
      }
      
      if (e.code === 'KeyE' && GameState.is('PLAYING')) {
        // E key: interact with nearest interactable (boat, etc.)
        if (!this.interactionSystem.interact()) {
          // Fallback: if InteractionSystem didn't handle it, try vehicle toggle directly
          // (for when boat is in range but not yet registered)
          this._toggleVehicle();
        }
      }
      
      if (e.code === 'KeyC' && GameState.is('PLAYING')) {
        const activePos = this.activeVehicle === 'CHARACTER' ? this.character.getPosition() : this.boat.getPosition();
        const yaw = this.activeVehicle === 'CHARACTER' ? this.character.yaw : this.boat.yaw;
        const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
        
        const origin = activePos.clone().add(new THREE.Vector3(0, 2, 0));
        this.catchSystem.throwBall(origin, forward);
      }
    };
    window.addEventListener('resize',  this._onResize);
    window.addEventListener('keydown', this._onKeyDown);
  }

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
    this.water = new StylizedWater(WorldConfig.OCEAN_SIZE);
    this.water.position.y = 0; // Ensure it's at sea level
    this.scene.add(this.water);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Loop hooks
  // ──────────────────────────────────────────────────────────────────────────

  _toggleVehicle() {
    if (this.activeVehicle === 'CHARACTER') {
      const dist = this.character.getPosition().distanceTo(this.boat.getPosition());
      if (dist < PlayerConfig.BOAT_BOARD_RADIUS) {
        this.activeVehicle = 'BOAT';
        // Character enters sit animation
        const animCtrl = this.character.getAnimationController();
        if (animCtrl) {
          animCtrl.setState('BoardBoat', { lockDuration: 0.5, onComplete: () => {
            animCtrl.setState('Sit');
          }});
        }
        this.callbacks.onVehicleChange?.(this.activeVehicle);
        this.camera_ctrl.setVehicleType('BOAT');
      }
    } else {
      this.activeVehicle = 'CHARACTER';
      // Disembark beside the boat
      const disembarkPos = this.boat.getDisembarkPosition();
      this.character.setPosition(disembarkPos.x, disembarkPos.y, disembarkPos.z);
      this.character.velocity.set(0, 0, 0);

      // Play leave boat animation
      const animCtrl = this.character.getAnimationController();
      if (animCtrl) {
        animCtrl.setState('LeaveBoat', { lockDuration: 0.4, onComplete: () => {
          animCtrl.setState('Idle');
        }});
      }

      this.callbacks.onVehicleChange?.(this.activeVehicle);
      this.camera_ctrl.setVehicleType('CHARACTER');
    }
  }

  _fixedUpdate(dt) {
    if (!GameState.is('PLAYING')) return;
    
    // Poll gamepad
    this.input.pollGamepad();

    // Lazily add the boat deck collider once it's loaded
    const deck = this.boat._boat?.getCollider?.();
    if (deck && !this.boatColliders.includes(deck)) {
      this.boatColliders.push(deck);
    }

    if (this.activeVehicle === 'CHARACTER') {
      this.character.fixedUpdate(this.input, this.camera_ctrl, dt);
      this.boat._detectGround(); // Keep boat floating
      
      // Update camera swimming state
      this.camera_ctrl.setSwimming(this.character.isSwimming);

      // Near-boat proximity check (for HUD prompt)
      const distToBoat = this.character.getPosition().distanceTo(this.boat.getPosition());
      const isNear = distToBoat < PlayerConfig.BOAT_BOARD_RADIUS;
      if (isNear !== this._wasNearBoat) {
        this.callbacks.onNearBoat?.(isNear);
        this._wasNearBoat = isNear;
      }
    } else {
      this.boat.fixedUpdate(this.input, this.camera_ctrl, dt);
      
      // Seat character in cockpit
      const cockpitPos = this.boat.getCockpitPosition();
      this.character.setPosition(cockpitPos.x, cockpitPos.y, cockpitPos.z);
      this.character.yaw = this.boat.yaw;
      this.character.group.rotation.y = this.character.yaw;
      this.character.currentStateName = 'Sit';
      
      this.camera_ctrl.setSwimming(false);

      if (this._wasNearBoat !== false) {
        this.callbacks.onNearBoat?.(false);
        this._wasNearBoat = false;
      }
    }
    
    const activePos = this.activeVehicle === 'CHARACTER' ? this.character.getPosition() : this.boat.getPosition();
    this.trash.updateProximity(activePos);
    this.fish.updateProximity(activePos);

    // Clear one-shot presses at end of physics tick
    this.input.clearPresses();
  }

  _render(alpha, fd) {
    if (!GameState.is('PLAYING')) return;

    if (this.water) {
      if (this.water.update) {
        this.water.update(fd);
      }
      this.underwaterSystem.update(fd);
      // Make water follow camera to appear infinite
      this.water.position.x = this.camera.position.x;
      this.water.position.z = this.camera.position.z;
    }
    
    const activePos = this.activeVehicle === 'CHARACTER' ? this.character.getPosition() : this.boat.getPosition();
    const activeYaw = this.activeVehicle === 'CHARACTER' ? this.character.yaw : this.boat.yaw;
    const activeDeck = this.activeVehicle === 'CHARACTER' ? this.character.getDeckPosition() : this.boat.getDeckPosition();
    
    // Update chunks relative to active vehicle
    this.chunks.update(activePos);
    
    // Update time and weather
    if (this.timeSystem) this.timeSystem.update(fd, this.renderer);
    if (this.weatherSystem) this.weatherSystem.update(fd);
    if (this.wildlife) this.wildlife.update(activePos, fd);
    if (this.catchSystem) this.catchSystem.update(fd);
    if (this.companionSystem) this.companionSystem.update(activePos, activeYaw, fd);
    if (this.treasureSystem) this.treasureSystem.update(activePos, fd);

    // Update InteractionSystem
    this.interactionSystem.update(activePos, fd);

    this.camera_ctrl.update(
      activePos,
      activeYaw,
      this.input,
      fd
    );

    this.character.renderUpdate(fd, this.camera_ctrl);
    this.boat.renderUpdate(fd, this.camera_ctrl);
    
    if (this.boatManager) this.boatManager.update(fd);

    this.trash.update(fd);
    this.trash.updateReels(activeDeck);
    this.fish.update(fd, activePos);

    this.callbacks.onTick?.({
      speed: this.activeVehicle === 'CHARACTER' ? this.character.velocity.length() : this.boat.speed,
      timeOfDay: this.timeSystem ? this.timeSystem.timeOfDay : 8,
      day: this.timeSystem ? this.timeSystem.totalDays : 1,
      playerPos: activePos,
      playerYaw: activeYaw
    });

    this.renderer.render(this.scene, this.camera);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public API (used by App.jsx)
  // ──────────────────────────────────────────────────────────────────────────

  /** Pause the game (physics stops, render continues) */
  pause() { GameState.transition('PAUSED'); }

  /** Resume from pause */
  resume() { GameState.transition('PLAYING'); }

  /** Set active companion creature */
  setCompanion(type) {
    if (this.companionSystem) this.companionSystem.setCompanion(type);
  }

  destroy() {
    this.loop.stop();
    this.input.destroy();
    this.vegetation.dispose();
    this.trash.dispose();
    this.fish.dispose();
    if (this.wildlife) this.wildlife.dispose();
    if (this.catchSystem) this.catchSystem.dispose();
    if (this.companionSystem) this.companionSystem.dispose();
    if (this.treasureSystem) this.treasureSystem.dispose();
    if (this.buildingSystem) this.buildingSystem.dispose();
    if (this.interactionSystem) this.interactionSystem.dispose();
    AssetManager.dispose();
    GameState.dispose();

    window.removeEventListener('resize',  this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);

    if (this.renderer && this.container) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────
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
