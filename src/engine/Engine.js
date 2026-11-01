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

import { GameLoop }            from '../core/GameLoop.js';
import { InputManager }        from '../player/InputManager.js';
import { CharacterController } from '../player/CharacterController.js';
import { BoatController }      from '../player/BoatController.js';
import { BoatBuoyancy }        from '../player/BoatBuoyancy.js';
import { BoatEffects }         from '../player/BoatEffects.js';
import { CameraController }    from '../player/CameraController.js';
import { VegetationSystem }    from '../world/VegetationSystem.js';
import { CloudSystem }         from '../world/CloudSystem.js';
import { ChunkManager }        from '../world/ChunkManager.js';
import { TimeSystem }          from '../core/TimeSystem.js';
import { WeatherSystem }       from '../core/WeatherSystem.js';
import { TrashSystem }         from '../world/TrashSystem.js';
import { HarbourManager }      from '../world/HarbourManager.js';
import { WaveSampler }         from '../world/WaveSampler.js';
import { AssetManager }        from './AssetManager.js';
import { GameState }           from './GameStateManager.js';
import { GraphicsConfig }      from '../config/GraphicsConfig.js';
import { WorldConfig }         from '../config/WorldConfig.js';
import { PerformanceConfig }   from '../config/PerformanceConfig.js';
import { ProgressionConfig }   from '../config/ProgressionConfig.js';
import { BoatConfig }          from '../config/BoatConfig.js';
import { BoatAudioController } from '../audio/BoatAudioController.js';
import { FishingSystem }       from '../world/FishingSystem.js';
import { RemotePlayerManager } from '../multiplayer/RemotePlayerManager.js';
import { buildBoatModel }     from '../player/BoatModelBuilder.js';
import { networkManager }      from '../multiplayer/NetworkManager.js';

export class Engine {
  constructor(container, callbacks = {}, options = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.options   = options;

    this.colliders = []; // shared — IslandBuilder fills, CharacterController reads

    // Harbor/boat related
    this.dock = null;
    this.boat = null;
    this.boatLevel = 1;
    this.dockTrigger = null;
    this.boatController = null;
    this.harbour = null;
    this.waterFollowsCamera = true; // default to true for ocean
    this.isNearBoat = false;
    this._wasNearBoat = false;
    this._wasNearUnloadZone = false; // last unload-zone proximity pushed to the UI
    this.isUnloading = false;       // unload action lock — blocks E-spam double rewards
    this._pendingUnload = null;     // { amount } captured at unload start
    this.canLeaveBoat = false; // docked at the pier — press E to leave the boat
    this._nightPushed  = false; // last night state pushed to the UI
    this._lastCompass  = null;  // last compass packet pushed to the UI (throttle)
    this.fishing = null;       // FishingSystem — initialized when harbour + boat are ready
    this.remotePlayers = null; // RemotePlayerManager — Phase 2 multiplayer 3D boats
    this._netTimer = 0;        // 20 Hz network broadcast timer

    this.wallColliders = []; // solid props/buildings — character horizontal blocking

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

    // Quality preset (Settings → Graphics): maps onto the renderer knobs so
    // the choice is applied once at construction — no mid-game changes.
    this._quality = GraphicsConfig.QUALITY_PRESETS[this.options.quality]
      || GraphicsConfig.QUALITY_PRESETS.balanced;
    const q = this._quality;

    // `powerPreference: 'high-performance'` makes dual-GPU laptops (most Macs)
    // pick the discrete GPU instead of the weak integrated one.
    this.renderer = new THREE.WebGLRenderer({
      antialias: q.ANTIALIAS,
      powerPreference: 'high-performance',
    });
    // Adaptive resolution governor: start at 1.0 and let the frame-time meter
    // push the pixel ratio up (fast machines) or down (weak GPUs) so the game
    // stays smooth everywhere instead of lagging at a fixed ratio.
    this._resScale = {
      target: 1.0,
      min: 0.65,
      max: Math.min(window.devicePixelRatio, q.MAX_PIXEL_RATIO),
      acc: 0,
      frames: 0,
    };
    this.renderer.setPixelRatio(this._resScale.target);
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = q.SHADOWS_ENABLED;
    this.renderer.shadowMap.type    = q.SHADOW_TYPE === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene  = new THREE.Scene();
    const gc = GraphicsConfig;
    this.camera = new THREE.PerspectiveCamera(gc.FOV, this._aspect(), gc.NEAR, gc.FAR);

    // Shared floating systems: one wave field everyone samples, the fake
    // buoyancy that floats the hull on it, and the pooled water effects.
    this.waveSampler = new WaveSampler();
    this.buoyancy    = new BoatBuoyancy();
    this.effects     = new BoatEffects(this.scene);

    this._setupLighting();
    this._setupSky();
    this._setupWater();

    // Low-poly cloud layer — follows the camera like the sky/water do, so the
    // sky stays populated at any sailing distance (see CloudSystem.js).
    this.cloudSystem = new CloudSystem(this.scene);
  }

  _initSystems() {
    // Input (must come before character + camera)
    this.input = new InputManager();

    // Character — the harbour boat is created later by _setupHarbor
    this.character = new CharacterController(this.scene, this.colliders, this.wallColliders);

    // Camera
    this.camera_ctrl = new CameraController(this.camera, this.renderer.domElement);

    // Vegetation (InstancedMesh renderer)
    this.vegetation = new VegetationSystem(this.scene);

    // Fixed-timestep game loop
    this.loop = new GameLoop({
      onFixedUpdate: (dt)        => this._fixedUpdate(dt),
      onRender:      (alpha, fd) => this._render(alpha, fd),
    });

    // Dynamic synthesized boat/ambience audio (routes through soundFx master)
    this.boatAudio = new BoatAudioController();

    // Time and Weather (Needs sky and lights, initialized after scene setup)
    // We will initialize them in _initWorld or _initScene, actually let's do it in _setupLighting and _setupSky

  }

  _initWorld() {
    // Chunks + vegetation (streaming distances come from PerformanceConfig)
    this.chunks = new ChunkManager(this.scene, this.colliders, this.vegetation, {
      viewDistance:    PerformanceConfig.CHUNK_VIEW_DISTANCE,
      unloadDistance:  PerformanceConfig.CHUNK_UNLOAD_DISTANCE,
      preloadDistance: PerformanceConfig.CHUNK_PRELOAD_DISTANCE,
    });
    
    // Spawn the player on the harbour's rear base platform.
    // _setupHarbor repositions onto the exact harbour spawn coordinates once it runs.
    const spawnPos = new THREE.Vector3(0, 1.5, -2);
    this.character.setPosition(spawnPos.x, spawnPos.y, spawnPos.z);
    
    // Initialize first chunks around player
    this.chunks.update(spawnPos);

    // Trash
    // Progression note: onCollect receives (boatTrashCount, worldTrash).
    // Nothing auto-completes or pays out here — unloading/coins come later
    // (see ProgressionConfig.js).
    this.trash = new TrashSystem(this.scene, {
      onCollect:    (boatTrashCount, worldTrash) => this.callbacks.onCollect?.(boatTrashCount, worldTrash),
      onNearTrash:  (isNear) => this.callbacks.onNearTrash?.(isNear),
    }, {
      ...this.options,
      cargoCapacity: BoatConfig.LEVELS[0].capacity,
      cullRadius: PerformanceConfig.TRASH_CULL_RADIUS,
    });
    this.trash.start();
  }

  _initEventListeners() {
    this._onResize  = this._onResize.bind(this);
    this._onKeyDown = (e) => {
      if (e.repeat) return; // Prevent OS key-repeat from triggering action loops
      // Pick up the nearest trash while in the harbour (on foot) or at sea (on boat)
      if (e.code === 'KeyF' && (GameState.is('HARBOR') || GameState.is('BOAT'))) {
        // If actively fishing, F stops fishing instead of picking up trash
        if (this.fishing && this.fishing.state !== 'idle' && !this.fishing._justStartedFishing) {
          this.stopFishing();
          if (this.fishing) this.fishing._mustReleaseFBeforeCast = true;
          return;
        }
        const isHarbor = GameState.is('HARBOR');
        const entityPos = isHarbor ? this.character.getPosition() : this.boat.position;
        const deckPos = isHarbor
          ? this.character.getDeckPosition()
          : this.boat.position.clone().add(new THREE.Vector3(0, 1.2, 0)); // boat deck
        const pickupStatus = this.trash.pickupNearest(entityPos, deckPos);
        if (pickupStatus === 'capacity') {
          this.callbacks.onPickupBlocked?.('Cargo hold full');
        }
      }

      // One button for all boat interactions:
      //  - HARBOR: press E when next to boat to open/close Upgrade Boat panel
      //  - BOAT:   leave when docked back at the pier, or unload at the
      //            recycling zone (requires trash aboard — Part 3 makes it
      //            actually move the trash; today it logs for dev testing)
      if (e.code === 'KeyE') {
        if (GameState.is('HARBOR')) {
          if (this.boat && this.dockTrigger) {
            const distance = this.character.getPosition().distanceTo(this.boat.position);
            if (distance < (BoatConfig.INTERACTION_DISTANCE || 6)) {
              this.callbacks.onToggleUpgrade?.();
            }
          }
        } else if (GameState.is('BOAT')) {
          if (this.canLeaveBoat) {
            this._leaveBoat();
          } else {
            this._tryUnload();
          }
        }
      }

      // Enter or B to board the boat while standing next to it at the harbor
      if ((e.code === 'Enter' || e.code === 'KeyB') && GameState.is('HARBOR')) {
        if (this.boat && this.dockTrigger) {
          const distance = this.character.getPosition().distanceTo(this.boat.position);
          if (distance < (BoatConfig.INTERACTION_DISTANCE || 6)) {
            this._boardBoat();
          }
        }
      }

      // Escape closes open upgrade panel at the harbor, or stops active fishing
      if (e.code === 'Escape') {
        if (this.fishing && this.fishing.state !== 'idle') {
          this.stopFishing();
          return;
        }
        if (GameState.is('HARBOR')) {
          this.callbacks.onCloseUpgrade?.();
        }
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
    this.sunLight.shadow.mapSize.set(this._quality.SHADOW_MAP_SIZE, this._quality.SHADOW_MAP_SIZE);
    this.sunLight.shadow.camera.near   = gc.SHADOW_NEAR;
    this.sunLight.shadow.camera.far    = gc.SHADOW_FAR;
    const e = gc.SHADOW_EXTENT;
    this.sunLight.shadow.camera.left   = -e; this.sunLight.shadow.camera.right  = e;
    this.sunLight.shadow.camera.top    =  e; this.sunLight.shadow.camera.bottom = -e;
    this.scene.add(this.sunLight);

    // Cool, dim moon light — the TimeSystem controls its position/intensity
    // so it only illuminates at night. No shadow cast for performance.
    this.moonLight = new THREE.DirectionalLight(0x9fb8ff, 0);
    this.moonLight.castShadow = false;
    this.scene.add(this.moonLight);
  }

  _setupSky() {
    const gc = GraphicsConfig;

    // Custom gradient sky dome. Unlike three's Preetham Sky shader (whose HDR
    // output gets double-exposed by the renderer's tone mapping → washed-out
    // whites), this shader opts out of tone mapping and writes display-ready
    // colours, so it renders exactly the palette below — crisp blue day, warm
    // golden-hour band, dark navy night. The view direction is computed from
    // `cameraPosition` (auto-injected), so the dome follows the camera like
    // the water does at any sailing distance.
    const vertexShader = /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = normalize(wp.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `;
    const fragmentShader = /* glsl */`
      uniform vec3 uSunDir;
      uniform float uNight;
      uniform vec3 uDayZenith;
      uniform vec3 uDayHorizon;
      uniform vec3 uNightZenith;
      uniform vec3 uNightHorizon;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float y = dir.y;

        // vertical gradient: t = 0 at horizon, 1 at zenith
        float t = clamp(y * 1.7 + 0.14, 0.0, 1.0);
        vec3 day   = mix(uDayHorizon,  uDayZenith,  pow(t, 0.72));
        vec3 night = mix(uNightHorizon,uNightZenith, pow(t, 0.8));

        // golden-hour tint: the horizon warms when the sun is low, strongest
        // toward the sun's azimuth and fading away from it
        float sd = clamp(dot(dir, uSunDir), 0.0, 1.0);
        float sunUp = smoothstep(-0.14, 0.02, uSunDir.y);
        float gold = smoothstep(0.18, 0.04, abs(uSunDir.y)) * sunUp;
        float band = exp(-abs(y) * 7.0);
        float side = 0.40 + 0.60 * pow(max(sd, 0.0), 1.2);
        vec3 golden = vec3(1.0, 0.50, 0.18); // display (255,128,46)
        day = mix(day, golden, clamp(band * (0.25 + 0.75 * side) * gold, 0.0, 1.0));
        vec3 col = mix(day, night, uNight);

        // sun: tight halo + crisp disc (fades as the sun dips below the
        // horizon; the halo dies within ~10 deg so the blue sky stays clean)
        float halo = pow(max(sd, 0.0), 56.0);
        float disc = smoothstep(0.9980, 0.9995, sd);
        vec3 sunCol = vec3(1.0, 0.96, 0.86); // display (255,245,219)
        col += sunCol * (disc * 1.0 + halo * 0.32) * sunUp;

        // soft pale haze hugging the horizon by day (fades at golden hour so
        // the sunset's warm band isn't washed toward pink)
        col += vec3(0.62, 0.76, 0.93) * exp(-abs(y) * 7.0) * (1.0 - uNight)
              * (1.0 - gold * band * 0.85) * 0.12; // display (158,194,237)

        // faint moon halo at night (moon sits opposite the sun)
        float md = clamp(dot(dir, -uSunDir), 0.0, 1.0);
        col += vec3(0.55, 0.65, 0.90) * pow(md, 22.0) * uNight * 0.16; // display (140,166,230)

        // pass-through pipeline: write display-ready values, no encoding
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false, // sky writes its own final colours — skip ACES
      uniforms: {
        uSunDir:        { value: new THREE.Vector3(0, 1, 0) },
        uNight:         { value: 0 },
        uDayZenith:     { value: new THREE.Color(gc.SKY_DAY_ZENITH) },
        uDayHorizon:    { value: new THREE.Color(gc.SKY_DAY_HORIZON) },
        uNightZenith:   { value: new THREE.Color(gc.SKY_NIGHT_ZENITH) },
        uNightHorizon:  { value: new THREE.Color(gc.SKY_NIGHT_HORIZON) },
      },
      vertexShader,
      fragmentShader,
    });

    this.sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    this.sky.scale.setScalar(WorldConfig.OCEAN_SIZE);
    this.sky.frustumCulled = false; // dome is huge and always on screen
    this.scene.add(this.sky);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(this.sky).texture;
    
    // Initialize Time and Weather systems now that lights and sky exist.
    // The TimeSystem mirrors the player's local clock (real-time day/night).
    this.timeSystem = new TimeSystem(this.scene, this.sunLight, this.ambientLight, this.sky, this.moonLight);
    this.weatherSystem = new WeatherSystem(this.scene, this);

    // Water tints used to darken the ocean at night
    this._waterDayColor   = new THREE.Color(WorldConfig.WATER_COLOR);
    this._waterNightColor = new THREE.Color(0x0a1e33);
  }

  async _setupWater() {
    const geo     = new THREE.PlaneGeometry(WorldConfig.OCEAN_SIZE, WorldConfig.OCEAN_SIZE);
    const normals = await AssetManager.loadTexture('assets/waternormals.jpg', t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });

    this.water = new Water(geo, {
      textureWidth:    256,
      textureHeight:   256,
      waterNormals:    normals,
      sunDirection:    new THREE.Vector3(0.5, 0.8, 0.3).normalize(),
      sunColor:        0xffffff,
      waterColor:      WorldConfig.WATER_COLOR,
      distortionScale: WorldConfig.DISTORTION_SCALE,
      fog:             !!this.scene.fog,
      alpha:           0.8, // Transparent to see fishes underneath
    });
    this.water.material.transparent = true;
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    // Perf: the Water shader re-renders the ENTIRE scene into a reflection
    // render-target once per frame. Refreshing every Nth frame divides that
    // GPU cost with no visible difference on calm cartoon water (a 1-frame-old
    // reflection is indistinguishable), while the `time` uniform still
    // animates every frame in _render. Set WATER_REFRESH_INTERVAL = 1 to
    // restore the original every-frame behaviour.
    if (PerformanceConfig.WATER_REFRESH_INTERVAL > 1) {
      const origBeforeRender = this.water.onBeforeRender;
      let waterFrame = 0;
      this.water.onBeforeRender = (renderer, scene, camera) => {
        // Always refresh on the first frame (RT starts uninitialized), then
        // every Nth frame. The counter increments on EVERY call so the modulo
        // stays in sync with the real frame cadence.
        const frame = waterFrame++;
        if (frame > 0 && frame % PerformanceConfig.WATER_REFRESH_INTERVAL !== 0) return;
        origBeforeRender(renderer, scene, camera);
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Loop hooks
  // ──────────────────────────────────────────────────────────────────────────

  _fixedUpdate(dt) {
    if (!GameState.is('HARBOR') && !GameState.is('BOAT')) return;

    if (GameState.is('HARBOR')) {
      this.character.fixedUpdate(this.input, this.camera_ctrl, dt);
      this.trash.updateProximity(this.character.getPosition());
      // Update near boat status for upgrade/docking prompt
      if (this.boat) {
        const distanceToBoat = this.character.getPosition().distanceTo(this.boat.position);
        this.isNearBoat = distanceToBoat < (BoatConfig.INTERACTION_DISTANCE || 6);
      } else {
        this.isNearBoat = false;
      }
      if (this.isNearBoat !== this._wasNearBoat) {
        this._wasNearBoat = this.isNearBoat;
        this.callbacks.onNearBoat?.(this.isNearBoat);
      }
      // Fishing system update in HARBOR mode (character on foot at harbor arm endpoints)
      if (this.fishing && this.character) {
        this.fishing.update(dt, this.input, this.character.group, this.character, false);
      }
      // NOTE: moored rocking is now driven by BoatBuoyancy in _render, so the
      // boat floats on the same wave field whether moored or at sea.
    } else if (GameState.is('BOAT')) {
      if (this.boatController) {
        this.boatController.fixedUpdate(this.input, dt);
      }
      // Fishing system update in BOAT mode
      if (this.fishing && this.boat) {
        this.fishing.update(dt, this.input, this.boat, this.boatController, true);
      }
      this.trash.updateProximity(this.boatController ? this.boatController.physicsPosition : this.boat.position);

      // Unload animation (Part 3): advance the arc FX; when it finishes,
      // move the trash out of the boat and pay out exactly once.
      if (this.isUnloading && this.harbour?.unloadZone) {
        const done = this.harbour.unloadZone.updateUnload(dt);
        if (done) {
          const amount = this._pendingUnload?.amount ?? 0;
          this.trash.setBoatTrashCount(this.trash.boatTrashCount - amount); // 6. inventory out
          const reward = amount * ProgressionConfig.COINS_PER_TRASH;                    // 7. reward
          this.callbacks.onUnloadComplete?.(amount, reward);                            // 8-10. coins + HUD + +X
          this._pendingUnload = null;
          this.isUnloading = false;                                                     // 11. unlock
          this.callbacks.onUnloadingChanged?.(false);
        }
      }

      // Update docking status for the "Press E to Leave Boat" prompt
      const atDock = this._isAtDock();
      if (atDock !== this.canLeaveBoat) {
        this.canLeaveBoat = atDock;
        this.callbacks.onDockState?.(atDock);
      }
    }

    // ── High-frequency Multiplayer Movement Sync (20 Hz) ─────────────────────
    this._netTimer = (this._netTimer || 0) + dt;
    if (this._netTimer >= 0.05) {
      this._netTimer = 0;
      if (networkManager.isConnected()) {
        if (GameState.is('HARBOR') && this.character) {
          const pos = this.character.getPosition();
          const yaw = this.character.yaw ?? (this.character.group ? this.character.group.rotation.y : 0);
          const speed = this.character.speed ?? 0;
          const anim = this.character.currentStateName || 'Idle';
          networkManager.sendPlayerMove({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            yaw,
            speed,
            animState: anim,
            state: 'DOCKED',
            boatLevel: this.boatLevel,
          });
        } else if (GameState.is('BOAT') && this.boat) {
          const pos = this.boatController ? this.boatController.physicsPosition : this.boat.position;
          const yaw = this.boatController ? this.boatController.physicsRotationY : this.boat.rotation.y;
          const speed = this.boatController ? this.boatController.speed : 0;
          networkManager.sendPlayerMove({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            yaw,
            speed,
            state: 'ACTIVE',
            boatLevel: this.boatLevel,
          });
        }
      }
    }
  }

  /**
   * Adaptive resolution governor — the "self-tuning" render scale.
   *
   * Samples a rolling ~0.5 s window of real frame times and nudges the pixel
   * ratio one step at a time: drop when frames are slow, raise when there is
   * headroom. This keeps the game smooth on weak GPUs (smaller framebuffer =
   * fewer pixels for the water shader and everything else) while still using
   * full quality on strong machines.
   */
  _applyAdaptiveResolution(frameDelta) {
    const s = this._resScale;
    s.acc += frameDelta;
    s.frames += 1;
    if (s.acc < 0.5) return;

    const avg = s.acc / s.frames;
    s.acc = 0;
    s.frames = 0;

    let next = s.target;
    if (avg > 0.021) {           // under ~47 fps → scale down
      next = Math.max(s.min, s.target - 0.25);
    } else if (avg < 0.014) {    // over ~70 fps → scale up
      next = Math.min(s.max, s.target + 0.25);
    }
    if (next === s.target) return;

    s.target = next;
    this.renderer.setPixelRatio(next);
    const w = this.container.clientWidth  || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (this._lastWidth !== w || this._lastHeight !== h) {
      this._lastWidth = w;
      this._lastHeight = h;
      this.renderer.setSize(w, h);
    }
  }

  _render(alpha, fd) {
    this._waveTime = (this._waveTime || 0) + fd;

    const playing = GameState.is('HARBOR') || GameState.is('BOAT');
    if (!playing) {
      // Paused / menu — fade continuous audio to silence.
      this.boatAudio?.update(fd, { active: false });
      return;
    }

    // Keep the render scale tuned to the machine before drawing this frame.
    this._applyAdaptiveResolution(fd);

    if (this.water) {
      this.water.material.uniforms['time'].value += fd;
      if (this.waterFollowsCamera) {
        // Make water follow camera to appear infinite. The plane stays flat at
        // y=0 — waves are faked by the boat/effects/trash sampling the shared
        // WaveSampler field, so the waterline and the floating objects always
        // agree (no hull clipping through a globally bobbing plane).
        this.water.position.x = this.camera.position.x;
        this.water.position.z = this.camera.position.z;
        // Keep the sky centred on the camera too so the horizon stays intact
        // no matter how far the boat sails (shader patched above).
        this.sky.position.x = this.camera.position.x;
        this.sky.position.z = this.camera.position.z;
      }
    }

    // Floating origin: when the boat sails far from the world origin, rebase
    // every world-space object back toward (0,0) so coordinates never grow
    // large enough to degrade float32 rendering precision — the boat, ocean,
    // terrain, trash and harbour all stay visually synchronized at ANY distance.
    const playerPos = GameState.is('HARBOR') ? this.character.getPosition() : (this.boat ? this.boat.position : new THREE.Vector3());
    this._maybeRebase(playerPos);

    // Update chunks based on player position (character or boat)
    const rebasedPos = GameState.is('HARBOR') ? this.character.getPosition() : (this.boat ? this.boat.position : playerPos);
    this.chunks.update(rebasedPos);

    // Perf: hide trash too far away to matter (pickup radius is 8 m) so those
    // meshes never enter the render list while sailing the open ocean.
    this.trash.updateVisibility(rebasedPos);

    // Update time and weather (real-time local-clock day/night cycle)
    if (this.timeSystem) this.timeSystem.update(fd, this.renderer);
    const nightFactor = this.timeSystem ? this.timeSystem.getNightFactor() : 0.0;
    if (this.weatherSystem) this.weatherSystem.update(fd, nightFactor);

    // Perf: only notify the UI when the day/night bucket actually flips, so
    // the HUD glass theme switches a handful of times, never every frame.
    const isNight = nightFactor > 0.5;
    if (isNight !== this._nightPushed) {
      this._nightPushed = isNight;
      this.callbacks.onNightChange?.(isNight);
    }

    // Compass: push the camera heading + harbour bearing to the HUD. Throttled
    // to whole degrees / 50 m buckets so turning the camera or sailing never
    // floods React with per-frame updates (see _pushCompass).
    this._pushCompass(rebasedPos);

    // Clouds drift overhead and re-centre on the camera each frame (the ring
    // is camera-relative, so floating-origin rebases need no extra handling).
    this.cloudSystem?.update(fd, nightFactor, this.camera.position);

    // Perf: when sailing far from the harbour there is nothing to shadow, yet
    // the whole harbour would otherwise be rendered into the shadow map every
    // frame. Skip the sun's shadow pass entirely out at sea. The TimeSystem
    // still toggles castShadow for the day/night cycle; we only additionally
    // gate it on proximity to the harbour (distance to the rebased harbour).
    if (this.sunLight && this.harbour) {
      const nearHarbour = playerPos.distanceToSquared(this.harbour.root.position) < 550 * 550;
      this.sunLight.castShadow = this.sunLight.castShadow && nearHarbour;
    }

    // Ocean reacts to the sky: point the water's sun specular at the sun (or
    // moon at night) and darken the water color so night sailing reads as night.
    if (this.water && this.timeSystem) {
      const sunDir = this.water.material.uniforms['sunDirection'].value;
      sunDir.copy(this.timeSystem._sunPos).lerp(this.timeSystem._moonPos, nightFactor);
      this.water.material.uniforms['waterColor'].value.copy(this._waterDayColor).lerp(this._waterNightColor, nightFactor);
    }

    // Floating trash rides the same wave field (bob / spin / drift) and gets a
    // gentle outward push when the boat passes close by.
    const boatSpeed = this.boatController ? this.boatController.speed : 0;
    this.trash.updateFloating(fd, this.waveSampler, this._waveTime, boatSpeed, this.boat);

    // Dynamic night lighting modulation (floodlights + headlights)
    if (this.harbour) this.harbour.update(fd, nightFactor, this.camera.position, this.waveSampler);
    if (this.boat && this.boat.userData.headlight) {
      this.boat.userData.headlight.intensity = 5.0 * nightFactor;
    }
    if (this.boat && this.boat.userData.headlightBeam) {
      this.boat.userData.headlightBeam.material.opacity = 0.14 * nightFactor;
      this.boat.userData.headlightBeam.visible = nightFactor > 0.05;
    }

    if (GameState.is('HARBOR')) {
      // Harbor mode: character controls (interpolate character transform first, then update camera)
      this.character.renderUpdate(alpha, fd, this.camera_ctrl);
      this.camera_ctrl.update(
        this.character.getPosition(),
        this.character.yaw,
        this.input,
        fd
      );
      this.trash.updateReels(this.character.getDeckPosition());
      this.callbacks.onTick?.(this.character.speed * 1.94384);

      // The moored boat still floats: same buoyancy, zero speed → gentle
      // Perlin rocking instead of the old sine-wave wobble.
      if (this.boat) {
        this.buoyancy.update(fd, this.boat, {
          speed: 0, throttle: 0, steer: 0,
          time: this._waveTime, sampler: this.waveSampler,
        });
      }
      this.boatAudio.update(fd, { speed: 0, throttle: 0, harborFactor: 1, inBoat: false, active: true });
    } else if (GameState.is('BOAT')) {
      // Boat mode: boat controls
      // 1. Update boat XZ + yaw (interpolated physics), then float the hull on
      //    the wave field (Y + pitch + roll) and drive the wake/particles.
      if (this.boatController) {
        this.boatController.renderUpdate(alpha, this.camera_ctrl);
      }
      const speed    = this.boatController ? this.boatController.speed    : 0;
      const throttle = this.boatController ? this.boatController.throttle : 0;
      const steer    = this.boatController ? this.boatController.steer    : 0;
      const accel    = this.boatController ? this.boatController.accel    : 0;
      if (this.boat) {
        this.buoyancy.update(fd, this.boat, {
          speed, throttle, steer, accel,
          time: this._waveTime, sampler: this.waveSampler,
        });
        this.effects.update(fd, this.boat, {
          speed, throttle, steer,
          time: this._waveTime, sampler: this.waveSampler,
        });
      }

      // 2. Camera feels attached to the heavy hull: follows at its real buoyed
      //    height, rolls slightly into turns, tilts with acceleration, and has
      //    a tiny extra lag. Never parented, never motion-sickness inducing.
      const boatYaw = this.boat ? this.boat.rotation.y : 0;
      const followPos = this.boat ? this.boat.position.clone() : new THREE.Vector3();
      const harborFactor = this.boat
        ? this.waveSampler.getHarborFactor(this.boat.position.x, this.boat.position.z)
        : 1;
      const boatFeel = this.boat ? {
        bob:   Math.sin(this._waveTime * BoatConfig.CAMERA.BOB_SPEED) * BoatConfig.CAMERA.BOB_AMOUNT * (1 - harborFactor),
        roll:  this.boat.rotation.z * BoatConfig.CAMERA.ROLL_AMOUNT,
        pitch: this.boat.rotation.x,
        delay: BoatConfig.CAMERA.DELAY,
        yaw:   boatYaw,   // hull heading — camera trails it during turns
        speedFactor: Math.min(1, Math.abs(speed) / (this.boatController?.maxSpeed ?? BoatConfig.MAX_SPEED)), // FOV
      } : null;
      this.camera_ctrl.update(followPos, boatYaw, this.input, fd, boatFeel);

      // Update trash reels - we need a deck position for the boat
      const deckPos = this.boat ? this.boat.position.clone().add(new THREE.Vector3(0, 1.2, 0)) : new THREE.Vector3();
      this.trash.updateReels(deckPos);
      // Get speed from boat controller and convert to knots
      const speedKnots = speed * 1.94384;
      this.callbacks.onTick?.(speedKnots);

      // Unload-zone proximity (Part 2): detect + push on change only. The
      // zone sits off the right wing's dock edge; nothing auto-unloads here.
      if (this.harbour?.unloadZone) {
        const nearZone = this.harbour.unloadZone.isBoatNear(this.boat.position);
        if (nearZone !== this._wasNearUnloadZone) {
          this._wasNearUnloadZone = nearZone;
          this.callbacks.onUnloadZone?.(nearZone);
        }
      }
      // Dynamic boat audio: engine/water/wind crossfade + harbour ambience.
      this.boatAudio.update(fd, {
        speed: Math.abs(speed),
        throttle: Math.max(0, throttle),
        maxSpeed: this.boatController?.maxSpeed ?? BoatConfig.MAX_SPEED,
        harborFactor,
        inBoat: true,
        active: true,
      });
    }

    // Remote multiplayer boats update (wave bobbing & nametag billboards)
    this.remotePlayers?.update(fd);

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
    this.cloudSystem?.dispose();
    this.trash.dispose();
    this.harbour?.dispose();
    this.fishing?.dispose();
    this.remotePlayers?.dispose();
    this.effects?.dispose();
    this.boatAudio?.dispose();
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
    this.harbour = new HarbourManager(this.scene, this.colliders, this.wallColliders);
    // Keep the wave field's calm centre on the actual harbour.
    this.waveSampler.setHarborCenter(WorldConfig.HARBOUR_CENTER[0], WorldConfig.HARBOUR_CENTER[1]);
    this.character.setPosition(this.harbour.playerSpawn.x, this.harbour.playerSpawn.y, this.harbour.playerSpawn.z);

    // Foundation step: the harbour is only the rear base platform — no boat /
    // pier yet, so there is nothing more to set up (boatSpawn is null).
    if (!this.harbour.boatSpawn) return;

    // A procedural sailboat keeps the gameplay-facing direction and the
    // visible bow in the same local -Z direction.
    this.boatLevel = 1;
    this.boat = this._createHarbourBoat(this.boatLevel);
    this.boat.position.copy(this.harbour.boatSpawn);
    // Point the bow away from the shore so pressing W sails straight out of the
    // harbour into open water. Steering stays unambiguous: A = left, D = right.
    this.boat.rotation.y = Math.PI;
    this.scene.add(this.boat);

    const triggerGeometry = new THREE.BoxGeometry(6, 4, 7);
    this.dockTrigger = new THREE.Mesh(triggerGeometry, new THREE.MeshBasicMaterial({ visible: false }));
    this.dockTrigger.position.copy(this.harbour.boatSpawn);
    this.scene.add(this.dockTrigger);
    this.trash.setCargoCapacity(BoatConfig.LEVELS[this.boatLevel - 1].capacity);
    this.buoyancy.applyBoatScale(BoatConfig.LEVELS[this.boatLevel - 1].modelScale);
    this.callbacks.onBoatUpgrade?.({ level: this.boatLevel });

    // Fishing system — two designated endpoints on the harbor arms
    this.fishing = new FishingSystem(this.scene, this.harbour, this.waveSampler, {
      onNearFishingSpot:    (spot) => this.callbacks.onNearFishingSpot?.(spot),
      onFishingStateChange: (state) => this.callbacks.onFishingStateChange?.(state),
      onCastProgress:       (p) => this.callbacks.onFishingCastProgress?.(p),
      onReelProgress:       (p) => this.callbacks.onFishingReelProgress?.(p),
      onFishTimer:          (t) => this.callbacks.onFishingFishTimer?.(t),
      onFishReady:          (r) => this.callbacks.onFishingFishReady?.(r),
      onPendingCatchesChange: (c) => this.callbacks.onFishingPendingCatches?.(c),
      onFishAlert:          (a) => this.callbacks.onFishingAlert?.(a),
      onFishCaught:         (d) => this.callbacks.onFishCaught?.(d),
      onPromptChange:       (p) => this.callbacks.onFishingPrompt?.(p),
    });

    // Multiplayer remote boats & nametag manager (Phase 2)
    this.remotePlayers = new RemotePlayerManager(this.scene, this.waveSampler);
  }


  _createHarbourBoat(level = 1) {
    return buildBoatModel(level, { isRemote: false });
  }

  /** Buy and apply the next boat tier as one guarded, session-only transaction. */
  tryUpgradeBoat(coins) {
    if (!GameState.is('HARBOR')) return { ok: false, reason: 'not-in-harbor', level: this.boatLevel };
    if (!this.boat || !this.trash) return { ok: false, reason: 'boat-unavailable', level: this.boatLevel };
    if (!Number.isFinite(coins)) return { ok: false, reason: 'invalid-balance', level: this.boatLevel };
    const next = BoatConfig.LEVELS[this.boatLevel];
    if (!next) return { ok: false, reason: 'max-level', level: this.boatLevel };
    if (coins < next.cost) return { ok: false, reason: 'insufficient-coins', level: this.boatLevel, cost: next.cost };

    const oldBoat = this.boat;
    const oldPosition = oldBoat.position.clone();
    const oldRotation = oldBoat.rotation.clone();
    const upgradedBoat = this._createHarbourBoat(next.level);
    upgradedBoat.position.copy(oldPosition);
    upgradedBoat.rotation.copy(oldRotation);
    this.scene.add(upgradedBoat);
    this.scene.remove(oldBoat);
    oldBoat.traverse(child => {
      if (child.userData.headlight) {
        child.userData.headlight.target.parent?.remove(child.userData.headlight.target);
        this.scene.remove(child.userData.headlight.target);
      }
      if (child.geometry && !child.userData.sharedResource) child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
      else child.material?.dispose();
    });

    this.boat = upgradedBoat;
    this.boatLevel = next.level;
    if (this.remotePlayers?.localPlayer) {
      this.remotePlayers.setLocalPlayer(this.remotePlayers.localPlayer, this.boat);
    }
    if (this.boatController) {
      this.boatController.boat = upgradedBoat;
      this.boatController.applyUpgrade(next);
      this.boatController.inertia.maxSpeed = next.speed;
      this.boatController.physicsPosition.copy(oldPosition);
      this.boatController.prevPosition.copy(oldPosition);
      this.boatController.physicsRotationY = oldRotation.y;
      this.boatController.prevRotationY = oldRotation.y;
    }
    this.trash.setCargoCapacity(next.capacity);
    this.buoyancy.applyBoatScale(next.modelScale);
    this.callbacks.onBoatUpgrade?.({ level: next.level });

    // Sync upgraded boat level across multiplayer fleet
    networkManager.sendPlayerState({
      state: GameState.is('BOAT') ? 'ACTIVE' : 'DOCKED',
      boatLevel: next.level,
    });

    return { ok: true, level: next.level, cost: next.cost, coins: coins - next.cost };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Mode transitions (the old mission system was removed — the engine only
  //  reports which mode the player is in; nothing tracks objectives anymore)
  // ──────────────────────────────────────────────────────────────────────────

  // ── Unloading (Part 3) ──────────────────────────────────────────────────

  /**
   * Try to start an unload at the recycling zone. Guards, in order:
   * action lock → zone exists → boat inside zone → trash aboard. Captures the
   * amount up front so the reward is computed from the stored value exactly
   * once, when the animation completes — never per key press.
   */
  _tryUnload() {
    if (this.isUnloading) return; // E E E E — one action at a time
    const zone = this.harbour?.unloadZone;
    if (!zone || !this.boat) return;
    if (!zone.isBoatNear(this.boat.position)) return;      // 1. inside the zone
    const amount = this.trash.boatTrashCount;
    if (amount <= 0) return;                                // 2. has trash
    this.isUnloading = true;                                // 3. lock
    this._pendingUnload = { amount };                       // 4. store amount
    zone.startUnload(this.boat.position, amount);           // 5. animation
    this.callbacks.onUnloadingChanged?.(true);
  }

  /** Public helper to terminate active fishing and restore player movement. */
  stopFishing() {
    if (!this.fishing) return;
    const ctrl = GameState.is('BOAT') ? this.boatController : this.character;
    this.fishing.stopFishing(ctrl);
    // Guarantees character and boat controller states are fully restored
    if (this.character) {
      if (this.character.resetMovement) {
        this.character.resetMovement();
      } else {
        this.character.isFishing = false;
        this.character._fishingLockPos = null;
        this.character.enabled = true;
        if (this.character.currentStateName === 'Fish') {
          this.character.currentStateName = 'Idle';
        }
      }
    }
    if (this.boatController) {
      this.boatController.enabled = true;
    }
  }

  /** Public helper to board boat from UI or key interactions. */
  boardBoat() {
    this._boardBoat();
  }

  // ── Multiplayer Remote Boats (Phase 2) ──────────────────────────

  setLocalMultiplayerPlayer(player) {
    if (this.remotePlayers) {
      this.remotePlayers.setLocalPlayer(player, this.boat);
    }
  }

  spawnRemotePlayer(player) {
    this.remotePlayers?.addPlayer(player);
  }

  removeRemotePlayer(playerId) {
    this.remotePlayers?.removePlayer(playerId);
  }

  syncRemotePlayers(playersList, localPlayerId) {
    this.remotePlayers?.syncPlayers(playersList, localPlayerId);
  }

  handleRemotePlayerMove(data) {
    this.remotePlayers?.handlePlayerMove(data);
  }

  handleRemotePlayerState(data) {
    this.remotePlayers?.handlePlayerState(data);
  }

  /** Instant board — press E next to the boat to take control immediately. */
  _boardBoat() {
    if (!this.boat || !this.harbour) return;
    this.stopFishing();
    this.isNearBoat = false;
    this._wasNearBoat = false;
    this.callbacks.onNearBoat?.(false);
    this.character.group.visible = false;
    this.character.setPosition(this.boat.position.x, this.boat.position.y, this.boat.position.z);
    GameState.transition('BOAT'); // _enterBoat takes over control
  }

  /** Instant leave — press E while docked to step back onto the pier. */
  _leaveBoat() {
    if (!this.boat || !this.harbour) return;
    this.canLeaveBoat = false;
    this.callbacks.onDockState?.(false);
    // Stop any active fishing session before disembarking
    this.stopFishing();
    // Place the character on the nearest safe dock position and hand control
    // straight back to the character (the player keeps exploring the harbour).
    const exit = this.harbour.boardingPoint.clone().add(new THREE.Vector3(-1.2, 0, -1.2));
    this.character.group.visible = true;
    this.character.setPosition(exit.x, exit.y, exit.z);
    this.character.velocity.set(0, 0, 0);
    GameState.transition('HARBOR'); // _exitBoat restores character control
  }

  /** True when the boat is parked back at the pier (valid docking location). */
  _isAtDock() {
    if (!this.boat || !this.dockTrigger) return false;
    return this.boat.position.distanceTo(this.dockTrigger.position) < 5;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  State Handlers
  // ──────────────────────────────────────────────────────────────────────────

  _enterHarbor() {
    // Set up harbor-specific elements (dock, boat, player spawn on dock)
    this.waterFollowsCamera = false; // static water for harbor
    this.canLeaveBoat = false;
    this.callbacks.onDockState?.(false);
    if (this.character) {
      if (this.character.resetMovement) {
        this.character.resetMovement();
      } else {
        this.character.enabled = true;
        this.character.isFishing = false;
        this.character._fishingLockPos = null;
        if (this.character.currentStateName === 'Fish') {
          this.character.currentStateName = 'Idle';
        }
      }
    }
    if (this.boatController) {
      this.boatController.enabled = false;
    }
    this._setupHarbor();
  }

  _enterBoat() {
    // Disable character controller, enable boat controller
    this.character.enabled = false;
    this.canLeaveBoat = false;
    this.callbacks.onDockState?.(false);
    if (!this.boatController && this.boat) {
      this.boatController = new BoatController(this.boat, this.input, this.colliders);
      this.boatController.applyUpgrade(BoatConfig.LEVELS[this.boatLevel - 1]);
    }
    if (this.boatController) {
      this.boatController.physicsPosition.copy(this.boat.position);
      this.boatController.physicsRotationY = this.boat.rotation.y;
      this.boatController.prevPosition.copy(this.boat.position);
      this.boatController.prevRotationY = this.boat.rotation.y;
      this.boatController.enabled = true;
    }
    // Start ocean sailing — no objective system, the player just cleans.
    this.waterFollowsCamera = true; // water follows camera for ocean illusion
    this.callbacks.onGameMode?.('boat');

    // Sync state to multiplayer server: ACTIVE in boat
    const boatPos = this.boatController ? this.boatController.physicsPosition : (this.boat ? this.boat.position : new THREE.Vector3());
    const boatYaw = this.boatController ? this.boatController.physicsRotationY : (this.boat ? this.boat.rotation.y : 0);
    networkManager.sendPlayerState({
      state: 'ACTIVE',
      boatLevel: this.boatLevel,
      transform: {
        x: boatPos.x,
        y: boatPos.y,
        z: boatPos.z,
        yaw: boatYaw,
        speed: 0,
      },
    });
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
    // Safety: leaving the boat mid-unload aborts the action cleanly — the
    // completion path only runs in BOAT mode, so without this the action
    // lock (isUnloading) would wedge for the rest of the session. Trash is
    // NOT deducted and nothing is paid: the unload simply never happened.
    if (this.isUnloading) {
      this.harbour?.unloadZone?.cancelUnload();
      this._pendingUnload = null;
      this.isUnloading = false;
      this.callbacks.onUnloadingChanged?.(false);
    }
    // Mode handoff only — collected trash stays aboard (boatTrashCount) until
    // the future unload mechanic (Part 2). Nothing completes on return.
    this.callbacks.onGameMode?.('harbor');

    // Sync state to multiplayer server: DOCKED on foot
    const charPos = this.character.getPosition();
    const charYaw = this.character.yaw ?? (this.character.group ? this.character.group.rotation.y : 0);
    networkManager.sendPlayerState({
      state: 'DOCKED',
      boatLevel: this.boatLevel,
      transform: {
        x: charPos.x,
        y: charPos.y,
        z: charPos.z,
        yaw: charYaw,
        speed: 0,
        animState: 'Idle',
      },
    });
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

  // ──────────────────────────────────────────────────────────────────────────
  //  HUD compass
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Push a compass packet to the UI: camera heading (deg, 0 = +Z "north"),
   * bearing to the harbour (deg) and straight-line distance (m). Both angles
   * are bucketed to whole degrees and the distance to 50 m, so the React HUD
   * only re-renders when something actually changes — never per frame.
   *
   * Positions are read AFTER the floating-origin rebase, so the bearing stays
   * correct at any sailing distance (player and harbour shift together).
   *
   * @param {THREE.Vector3} playerPos — character or boat position (post-rebase)
   */
  _pushCompass(playerPos) {
    if (!this.harbour || !this.camera_ctrl || !playerPos) return;
    // No boat berth exists on the foundation-only harbour yet.
    if (!this.harbour.boatSpawn) return;
    // Waypoint = the boat berth (where the player docks to sell trash), not
    // the plaza centre — so the pin leads back to the actual goal. The berth
    // is a fixed local offset of the harbour root, so it survives rebases.
    const berth = this.harbour.boatSpawn;
    const hx = this.harbour.root.position.x + berth.x;
    const hz = this.harbour.root.position.z + berth.z;
    const dx = hx - playerPos.x;
    const dz = hz - playerPos.z;

    // Camera forward azimuth: forward = -offset dir = (-sin yaw, -cos yaw).
    // Azimuth convention matches the compass rose (0 = +Z, +90 = +X, CCW+).
    const yaw = this.camera_ctrl.getYaw();
    const fwdAz = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    const harbourAz = Math.atan2(dx, dz);
    const normDeg = (rad) => ((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360;

    const heading = normDeg(fwdAz);
    const harbour = normDeg(harbourAz);
    const dist = Math.round(Math.hypot(dx, dz) / 50) * 50; // 50 m buckets

    const last = this._lastCompass;
    if (last && last.heading === heading && last.harbour === harbour && last.dist === dist) return;
    this._lastCompass = { heading, harbour, dist };
    this.callbacks.onCompass?.({ heading, harbour, dist });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Floating origin
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Rebase the world when the boat sails beyond REBASE_THRESHOLD units from
   * the origin, snapping positions back to a 128 m grid. This keeps every
   * coordinate small (<= ~450 m) so float32 rendering precision never degrades
   * no matter how far the player sails — the boat always moves smoothly and
   * stays visually synchronized with the ocean, terrain, trash and harbour.
   */
  _maybeRebase(playerPos) {
    if (!GameState.is('BOAT') || !this.boat) return;
    const THRESHOLD = 384;
    const GRID = 128;
    const px = playerPos.x, pz = playerPos.z;
    if (Math.abs(px) < THRESHOLD && Math.abs(pz) < THRESHOLD) return;
    const offset = new THREE.Vector3(Math.round(px / GRID) * GRID, 0, Math.round(pz / GRID) * GRID);
    this._rebaseWorld(offset);
  }

  /** Shift the entire world by -offset, keeping relative positions identical. */
  _rebaseWorld(offset) {
    if (this.boat) this.boat.position.sub(offset);
    if (this.boatController) this.boatController.rebase(offset);
    this.character.setPosition(
      this.character.position.x - offset.x,
      this.character.position.y,
      this.character.position.z - offset.z
    );
    this.harbour?.rebase(offset);
    if (this.dockTrigger) this.dockTrigger.position.sub(offset);
    this.trash?.rebase(offset);
    this.chunks?.rebase(); // flat seabed reloads invisibly next chunks.update()
    this.camera_ctrl?.rebase(offset);
    this.effects?.rebase(offset);
    this.fishing?.rebase(offset);
    this.remotePlayers?.rebase(offset);
    // Water and sky follow the camera — sync them to the rebased camera now so
    // the horizon does not lag one frame behind during the rebase.
    if (this.water) { this.water.position.x = this.camera.position.x; this.water.position.z = this.camera.position.z; }
    if (this.sky)   { this.sky.position.x = this.camera.position.x;   this.sky.position.z = this.camera.position.z; }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Boat wake & water effects
  //  Moved to src/player/BoatEffects.js (pooled wake + propeller bubbles +
  //  side splashes). Engine calls effects.update() in the BOAT render path and
  //  effects.rebase() during floating-origin shifts.
  // ──────────────────────────────────────────────────────────────────────────
}
