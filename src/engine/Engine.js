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
import { BoatConfig }          from '../config/BoatConfig.js';
import { BoatAudioController } from '../audio/BoatAudioController.js';

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
    this.canLeaveBoat = false; // docked at the pier — press E to leave the boat
    this._nightPushed  = false; // last night state pushed to the UI
    this._lastCompass  = null;  // last compass packet pushed to the UI (throttle)

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
    
    // Spawn the player on the harbour pier (the only landmass at the start).
    // _setupHarbor repositions onto the exact pier coordinates once it runs.
    const spawnPos = new THREE.Vector3(0, 3, 73); // falls onto the shore platform
    this.character.setPosition(spawnPos.x, spawnPos.y, spawnPos.z);
    
    // Initialize first chunks around player
    this.chunks.update(spawnPos);

    // Trash
    this.trash = new TrashSystem(this.scene, {
      onCollect:    (newScore, newCount) => { if (this.missionActive) this.callbacks.onCollect?.(newScore, newCount); },
      onNearTrash:  (isNear) => { if (this.missionActive) this.callbacks.onNearTrash?.(isNear); },
    }, {
      ...this.options,
      cullRadius: PerformanceConfig.TRASH_CULL_RADIUS,
    });
    this.trash.start();
  }

  _initEventListeners() {
    this._onResize  = this._onResize.bind(this);
    this._onKeyDown = (e) => {
      // Pick up the nearest trash while in the harbour (on foot) or at sea (on boat)
      if (e.code === 'KeyF' && (GameState.is('HARBOR') || GameState.is('BOAT'))) {
        const isHarbor = GameState.is('HARBOR');
        const entityPos = isHarbor ? this.character.getPosition() : this.boat.position;
        const deckPos = isHarbor
          ? this.character.getDeckPosition()
          : this.boat.position.clone().add(new THREE.Vector3(0, 1.2, 0)); // boat deck
        this.trash.pickupNearest(entityPos, deckPos);
      }

      // One button for both boat interactions:
      //  - HARBOR: board when standing next to the boat
      //  - BOAT:   leave when docked back at the pier
      if (e.code === 'KeyE') {
        if (GameState.is('HARBOR')) {
          if (this.boat && this.dockTrigger) {
            const distance = this.character.getPosition().distanceTo(this.boat.position);
            if (distance < 6) this._boardBoat();
          }
        } else if (GameState.is('BOAT') && this.canLeaveBoat) {
          this._leaveBoat();
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
      // NOTE: moored rocking is now driven by BoatBuoyancy in _render, so the
      // boat floats on the same wave field whether moored or at sea.
    } else if (GameState.is('BOAT')) {
      if (this.boatController) {
        this.boatController.fixedUpdate(this.input, dt);
      }
      this.trash.updateProximity(this.boatController ? this.boatController.physicsPosition : this.boat.position);
      // Update docking status for the "Press E to Leave Boat" prompt
      const atDock = this._isAtDock();
      if (atDock !== this.canLeaveBoat) {
        this.canLeaveBoat = atDock;
        this.callbacks.onDockState?.(atDock);
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
    this.renderer.setSize(
      this.container.clientWidth  || window.innerWidth,
      this.container.clientHeight || window.innerHeight
    );
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
        speedFactor: Math.min(1, Math.abs(speed) / BoatConfig.MAX_SPEED), // FOV
      } : null;
      this.camera_ctrl.update(followPos, boatYaw, this.input, fd, boatFeel);

      // Update trash reels - we need a deck position for the boat
      const deckPos = this.boat ? this.boat.position.clone().add(new THREE.Vector3(0, 1.2, 0)) : new THREE.Vector3();
      this.trash.updateReels(deckPos);
      // Get speed from boat controller and convert to knots
      const speedKnots = speed * 1.94384;
      // Only update HUD and scoring if mission is active
      if (this.missionActive) {
        this.callbacks.onTick?.(speedKnots);
      }
      // Dynamic boat audio: engine/water/wind crossfade + harbour ambience.
      this.boatAudio.update(fd, {
        speed: Math.abs(speed),
        throttle: Math.max(0, throttle),
        harborFactor,
        inBoat: true,
        active: true,
      });
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
    this.cloudSystem?.dispose();
    this.trash.dispose();
    this.harbour?.dispose();
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
    this.character.setPosition(...this.harbour.playerSpawn);

    // A procedural sailboat keeps the gameplay-facing direction and the
    // visible bow in the same local -Z direction.
    this.boat = this._createHarbourBoat();
    this.boat.position.copy(this.harbour.boatSpawn);
    // Point the bow away from the shore so pressing W sails straight out of the
    // harbour into open water. Steering stays unambiguous: A = left, D = right.
    this.boat.rotation.y = Math.PI;
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

    // Headlight casing & lens at the bow (relevant to boat size)
    const headlightCasing = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.35, 8), woodMat));
    headlightCasing.rotation.x = Math.PI / 2;
    headlightCasing.position.set(0, 0.98, -2.5);

    const headlightLens = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), new THREE.MeshBasicMaterial({ color: 0xffeaad })));
    headlightLens.rotation.x = Math.PI / 2;
    headlightLens.position.set(0, 0.98, -2.68);

    // ── Boat headlamp: ONE forward-facing spotlight cone ────────────────
    // A real boat headlight throws a single tight cone ahead of the bow. The
    // spotlight is parented to the boat (so it rotates with it) and its target
    // is a child of the boat too (so it stays aimed straight ahead along -Z).
    // The visible beam cone below exactly matches this spotlight's angle/range
    // so there is NO second light source and nothing is cast behind the stern.
    const HEADLIGHT_ANGLE = 0.30;   // ~17° half-angle — a realistic beam
    const HEADLIGHT_RANGE = 55;     // metres
    const headlight = new THREE.SpotLight(0xfff0c8, 5.0, HEADLIGHT_RANGE, HEADLIGHT_ANGLE, 0.45, 1.1);
    headlight.position.set(0, 1.0, -2.7);
    headlight.castShadow = false; // cheap; no real-time spot shadows on the ocean

    // Aim the cone straight ahead: boat forward is local -Z, so the target
    // sits far ahead on the boat's own axis (parented to the boat = rotates
    // with it, never drags behind).
    const target = new THREE.Object3D();
    target.position.set(0, 0.4, -30.0);
    boat.add(target);
    headlight.target = target;

    boat.add(headlight);
    boat.userData.headlight = headlight;

    // Volumetric beam cone matched to the spotlight's cone (same angle/range)
    // so the visible light and the actual light always line up perfectly.
    const beamLen = HEADLIGHT_RANGE * 0.6;                 // ~33
    const beamRadius = Math.tan(HEADLIGHT_ANGLE) * beamLen; // matches spot cone
    const beamGeom = new THREE.ConeGeometry(beamRadius, beamLen, 16, 1, true);
    beamGeom.translate(0, -beamLen / 2, 0); // translate so origin is at the tip
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c8,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    const beamMesh = new THREE.Mesh(beamGeom, beamMat);
    beamMesh.rotation.x = Math.PI / 2; // point along local -Z (90 degrees around X)
    beamMesh.position.set(0, 1.0, -2.7);
    boat.add(beamMesh);
    boat.userData.headlightBeam = beamMesh;

    return boat;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Mission Control
  // ──────────────────────────────────────────────────────────────────────────

  _startMission() {
    if (this.missionActive) return; // keep the mission alive across a pause/resume cycle
    this.missionActive = true;
    this.trash.start();
    this.callbacks.onMissionState?.('started');
  }

  _stopMission() {
    this.missionActive = false;
    this.callbacks.onMissionState?.('harbour');
  }

  /** Instant board — press E next to the boat to take control immediately. */
  _boardBoat() {
    if (!this.boat || !this.harbour) return;
    this.isNearBoat = false;
    this._wasNearBoat = false;
    this.callbacks.onNearBoat?.(false);
    this.character.group.visible = false;
    this.character.setPosition(this.boat.position.x, this.boat.position.y, this.boat.position.z);
    GameState.transition('BOAT'); // _enterBoat takes over control + starts the mission
  }

  /** Instant leave — press E while docked to step back onto the pier. */
  _leaveBoat() {
    if (!this.boat || !this.harbour) return;
    this.canLeaveBoat = false;
    this.callbacks.onDockState?.(false);
    // Place the character on the nearest safe dock position and hand control
    // straight back to the character (the player keeps exploring the harbour).
    const exit = this.harbour.boardingPoint.clone().add(new THREE.Vector3(-1.2, 0, -1.2));
    this.character.group.visible = true;
    this.character.setPosition(exit.x, exit.y, exit.z);
    this.character.velocity.set(0, 0, 0);
    GameState.transition('HARBOR'); // _exitBoat restores character control
    this._stopMission();
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
    this._setupHarbor();
  }

  _enterBoat() {
    // Disable character controller, enable boat controller
    this.character.enabled = false;
    this.canLeaveBoat = false;
    this.callbacks.onDockState?.(false);
    if (!this.boatController && this.boat) {
      this.boatController = new BoatController(this.boat, this.input, this.colliders);
    }
    if (this.boatController) {
      this.boatController.physicsPosition.copy(this.boat.position);
      this.boatController.physicsRotationY = this.boat.rotation.y;
      this.boatController.prevPosition.copy(this.boat.position);
      this.boatController.prevRotationY = this.boat.rotation.y;
      this.boatController.enabled = true;
    }
    // Start the mission — no time limit, the player can sail as long as they like.
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
    // NOTE: the mission is intentionally NOT stopped here. The mission ends in
    // _leaveBoat (via _stopMission) when the player steps back onto the pier, so
    // pausing the game (which also transitions out of BOAT) keeps the mission
    // alive across a pause/resume cycle.
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
