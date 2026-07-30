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
import { CameraController }    from '../player/CameraController.js';
import { VegetationSystem }    from '../world/VegetationSystem.js';
import { ChunkManager }        from '../world/ChunkManager.js';
import { TimeSystem }          from '../core/TimeSystem.js';
import { WeatherSystem }       from '../core/WeatherSystem.js';
import { TrashSystem }         from '../world/TrashSystem.js';
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

    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._initWorld();
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

    // Character (colliders array passed by reference — filled later by IslandBuilder)
    this.character = new CharacterController(this.scene, this.colliders);

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
    
    // Spawn player at center
    const spawnPos = new THREE.Vector3(0, 5, 0); // High enough to fall onto terrain
    this.character.setPosition(spawnPos.x, spawnPos.y, spawnPos.z);
    
    // Initialize first chunks around player
    this.chunks.update(spawnPos);

    // Trash
    this.trash = new TrashSystem(this.scene, {
      onCollect:    this.callbacks.onCollect,
      onNearTrash:  this.callbacks.onNearTrash,
    }, this.options);
  }

  _initEventListeners() {
    this._onResize  = this._onResize.bind(this);
    this._onKeyDown = (e) => {
      if (e.code === 'KeyF' && GameState.is('PLAYING')) {
        this.trash.pickupNearest(
          this.character.getPosition(),
          this.character.getDeckPosition()
        );
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
    });
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Loop hooks
  // ──────────────────────────────────────────────────────────────────────────

  _fixedUpdate(dt) {
    if (!GameState.is('PLAYING')) return;

    this.character.fixedUpdate(this.input, this.camera_ctrl, dt);
    this.trash.updateProximity(this.character.getPosition());
  }

  _render(alpha, fd) {
    if (!GameState.is('PLAYING')) return;

    if (this.water) {
      this.water.material.uniforms['time'].value += fd;
      // Make water follow camera to appear infinite
      this.water.position.x = this.camera.position.x;
      this.water.position.z = this.camera.position.z;
    }
    
    // Update chunks
    this.chunks.update(this.character.getPosition());
    
    // Update time and weather
    if (this.timeSystem) this.timeSystem.update(fd, this.renderer);
    if (this.weatherSystem) this.weatherSystem.update(fd);

    this.camera_ctrl.update(
      this.character.getPosition(),
      this.character.yaw,
      this.input,
      fd
    );

    this.character.renderUpdate(fd, this.camera_ctrl);
    this.trash.updateReels(this.character.getDeckPosition());

    this.callbacks.onTick?.(this.character.speed);

    this.renderer.render(this.scene, this.camera);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public API (used by App.jsx)
  // ──────────────────────────────────────────────────────────────────────────

  /** Pause the game (physics stops, render continues) */
  pause() { GameState.transition('PAUSED'); }

  /** Resume from pause */
  resume() { GameState.transition('PLAYING'); }

  destroy() {
    this.loop.stop();
    this.input.destroy();
    this.vegetation.dispose();
    this.trash.dispose();
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
