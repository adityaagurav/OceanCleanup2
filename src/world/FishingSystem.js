import * as THREE from 'three';
import { soundFx } from '../audio/AudioManager.js';

/**
 * FishingSystem.js — Optional Fishing Feature for OceanCleanup.io.
 *
 * Requirements:
 *  - Two designated endpoints of the harbor:
 *      * LEFT end:  (-21.0, 0, 29.5)
 *      * RIGHT end: ( 21.0, 0, 29.5)
 *  - Fishing is NOT allowed anywhere else (central entry/exit, remaining harbor, open ocean).
 *  - Player navigates boat to either endpoint.
 *  - Long-press F for 2 seconds to start fishing.
 *  - Boat remains stationary; normal movement controls disabled while fishing.
 *  - 3D visual fishing rod, floating wave-bobbing bobber, and bucket on boat deck.
 *  - Fish becomes available every 30 seconds (does NOT automatically enter bucket).
 *  - Long-press R for 3-4 seconds to retrieve the available fish.
 *  - Visible progress indicators for holding F and R.
 *  - Leaping 3D fish retrieval animation into the bucket; updates bucket fish count.
 *  - Awards points/coins (less rewarding than collecting & recycling ocean waste).
 */
export class FishingSystem {
  static LEFT_ENDPOINT  = new THREE.Vector3(-21.0, 0, 29.5);
  static RIGHT_ENDPOINT = new THREE.Vector3( 21.0, 0, 29.5);
  static ZONE_RADIUS = 8.5;

  static F_HOLD_DURATION = 2.0;       // seconds holding F to cast line
  static R_HOLD_DURATION = 3.2;       // seconds holding R to reel in (3-4s requirement)
  static FISH_INTERVAL   = 20.0;      // seconds between fish bites (20s requirement)
  static POINTS_PER_FISH = 3;         // points / coins per catch (less than 5/trash)

  constructor(scene, harbour, waveSampler, callbacks = {}) {
    this.scene = scene;
    this.harbour = harbour;
    this.waveSampler = waveSampler;
    this.callbacks = callbacks;

    // State machine: 'idle' | 'casting' | 'fishing' | 'fish_ready' | 'reeling' | 'caught'
    this.state = 'idle';
    this.currentSpot = null; // 'left' | 'right' | null
    this._wasNearSpot = null;

    // Timers & hold accumulators
    this.castHoldTimer = 0;   // 0 .. 2.0s
    this.fishTimer = 0;       // 0 .. 20.0s (independent repeating cycle)
    this.reelHoldTimer = 0;   // 0 .. 3.2s
    this.pendingCatches = 0;  // available fish waiting to be retrieved
    this.fishCount = 0;       // caught fish in bucket
    this._castKeyActive = false;
    this._justStartedFishing = false;
    this._needReelRelease = false;
    this._mustReleaseFBeforeStop = false;
    this._mustReleaseFBeforeCast = false;
    this._attachedController = null;
    this._lastReportedFishTimerSec = null;
    this._lastReportedCastProgress = 0;
    this._lastReportedReelProgress = 0;
    this._lastFishReady = null;
    this._lastReportedState = null;

    // 3D Objects root
    this.root = new THREE.Group();
    this.root.name = 'FishingSystem';
    if (this.scene) this.scene.add(this.root);

    // Anchors for floating-origin rebase safety
    this._leftAnchor = new THREE.Object3D();
    this._leftAnchor.position.copy(FishingSystem.LEFT_ENDPOINT);
    this._rightAnchor = new THREE.Object3D();
    this._rightAnchor.position.copy(FishingSystem.RIGHT_ENDPOINT);
    if (this.harbour?.root) {
      this.harbour.root.add(this._leftAnchor);
      this.harbour.root.add(this._rightAnchor);
    } else {
      this.root.add(this._leftAnchor);
      this.root.add(this._rightAnchor);
    }
    this._leftAnchor.updateMatrixWorld(true);
    this._rightAnchor.updateMatrixWorld(true);

    this._tmpLeft = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
    this._bobberWorldPos = new THREE.Vector3();

    // Shared materials
    this._initMaterials();
    this._buildSpotMarkers();
    this._buildFishingGear();

    // Fish jump animation state
    this._leapingFish = null; // { mesh, start, end, apexY, t, duration }
  }

  _initMaterials() {
    this._mat = {
      rodWood: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }),
      rodBlank: new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.8 }),
      bobberRed: new THREE.MeshStandardMaterial({ color: 0xd93a2f, roughness: 0.4 }),
      bobberWhite: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }),
      bobberPin: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 }),
      bucketBody: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5, metalness: 0.3 }),
      bucketWater: new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.1, transparent: true, opacity: 0.85 }),
      fishOrange: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 }),
      fishSilver: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.5 }),
      line: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
      markerAqua: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
      signWood: new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 }),
    };
  }

  /** Build visual markers at the two endpoints so players can easily identify them. */
  _buildSpotMarkers() {
    const makeMarker = (anchor, label) => {
      const g = new THREE.Group();

      // Floating aqua zone ring on water
      const ringGeo = new THREE.RingGeometry(6.5, 7.2, 32);
      const ring = new THREE.Mesh(ringGeo, this._mat.markerAqua);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      g.add(ring);

      // Wooden buoy with a fish symbol sign
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 2.2, 8), this._mat.rodWood);
      post.position.set(0, 0.8, 0);
      g.add(post);

      const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.12), this._mat.signWood);
      signBoard.position.set(0, 1.7, 0);
      g.add(signBoard);

      // Fish sign face texture (if running in browser with DOM canvas)
      if (typeof document !== 'undefined' && document.createElement) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext ? canvas.getContext('2d') : null;
        if (ctx) {
          ctx.fillStyle = '#b45309';
          ctx.fillRect(0, 0, 256, 128);
          ctx.strokeStyle = '#fde68a';
          ctx.lineWidth = 6;
          ctx.strokeRect(8, 8, 240, 112);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🐟 FISHING', 128, 50);
          ctx.font = 'bold 22px sans-serif';
          ctx.fillText(label, 128, 92);
          const tex = new THREE.CanvasTexture(canvas);
          const signFace = new THREE.MeshBasicMaterial({ map: tex });
          const signFront = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.65), signFace);
          signFront.position.set(0, 1.7, 0.07);
          g.add(signFront);
          const signBack = signFront.clone();
          signBack.rotation.y = Math.PI;
          signBack.position.set(0, 1.7, -0.07);
          g.add(signBack);
        }
      }

      anchor.add(g);
    };

    makeMarker(this._leftAnchor, 'LEFT END');
    makeMarker(this._rightAnchor, 'RIGHT END');
  }

  /** Build fishing rod, bobber, line, bucket, and fish models. */
  _buildFishingGear() {
    // ── 1. Fishing Rod (attached to boat when fishing) ─────────────────
    this.rodGroup = new THREE.Group();
    this.rodGroup.name = 'FishingRod';

    // Handle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.55, 8), this._mat.rodWood);
    handle.position.y = 0.275;
    this.rodGroup.add(handle);

    // Reel
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.09, 10), this._mat.metal);
    reel.rotation.x = Math.PI / 2;
    reel.position.set(0.06, 0.42, 0);
    this.rodGroup.add(reel);

    // Blank (tapered flexible rod)
    const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, 2.4, 8), this._mat.rodBlank);
    blank.position.y = 1.65;
    this.rodGroup.add(blank);

    // Tip ring
    const tipRing = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 8), this._mat.metal);
    tipRing.position.y = 2.85;
    this.rodGroup.add(tipRing);

    // Angle the rod forward and starboard
    this.rodGroup.rotation.z = -0.55;
    this.rodGroup.rotation.x = -0.25;
    this.rodGroup.visible = false;

    // ── 2. Bucket (attached to boat deck) ─────────────────────────────
    this.bucketGroup = new THREE.Group();
    this.bucketGroup.name = 'FishingBucket';

    const bucketGeo = new THREE.CylinderGeometry(0.25, 0.19, 0.38, 12, 1, true);
    const bucketMesh = new THREE.Mesh(bucketGeo, this._mat.bucketBody);
    bucketMesh.position.y = 0.19;
    this.bucketGroup.add(bucketMesh);

    const bottomGeo = new THREE.CircleGeometry(0.19, 12);
    const bottomMesh = new THREE.Mesh(bottomGeo, this._mat.bucketBody);
    bottomMesh.rotation.x = Math.PI / 2;
    this.bucketGroup.add(bottomMesh);

    const waterGeo = new THREE.CircleGeometry(0.23, 12);
    const waterMesh = new THREE.Mesh(waterGeo, this._mat.bucketWater);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 0.28;
    this.bucketGroup.add(waterMesh);

    const handleGeo = new THREE.TorusGeometry(0.24, 0.015, 6, 12, Math.PI);
    const handleMesh = new THREE.Mesh(handleGeo, this._mat.metal);
    handleMesh.rotation.z = Math.PI;
    handleMesh.position.y = 0.38;
    this.bucketGroup.add(handleMesh);

    // Small fish models inside the bucket (populated as fish are caught)
    this._bucketFishes = [];
    for (let i = 0; i < 6; i++) {
      const f = this._createSmallFishModel();
      f.scale.setScalar(0.4);
      f.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      f.rotation.z = Math.random() * Math.PI * 2;
      f.position.set((Math.random() - 0.5) * 0.15, 0.29 + i * 0.015, (Math.random() - 0.5) * 0.15);
      f.visible = false;
      this.bucketGroup.add(f);
      this._bucketFishes.push(f);
    }

    this.bucketGroup.visible = false;

    // ── 3. Bobber (world object that floats on water) ─────────────────
    this.bobberGroup = new THREE.Group();
    this.bobberGroup.name = 'FishingBobber';

    const topGeo = new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const topMesh = new THREE.Mesh(topGeo, this._mat.bobberRed);
    this.bobberGroup.add(topMesh);

    const botGeo = new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const botMesh = new THREE.Mesh(botGeo, this._mat.bobberWhite);
    this.bobberGroup.add(botMesh);

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6), this._mat.bobberPin);
    pin.position.y = 0.12;
    this.bobberGroup.add(pin);

    // Splash ripple ring for bite feedback
    const splashGeo = new THREE.RingGeometry(0.14, 0.4, 16);
    this._bobberRipple = new THREE.Mesh(splashGeo, this._mat.markerAqua);
    this._bobberRipple.rotation.x = -Math.PI / 2;
    this._bobberRipple.position.y = 0.02;
    this._bobberRipple.visible = false;
    this.bobberGroup.add(this._bobberRipple);

    this.bobberGroup.visible = false;
    this.root.add(this.bobberGroup);

    // ── 4. Fishing Line ──────────────────────────────────────────────
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    this.lineMesh = new THREE.Line(lineGeo, this._mat.line);
    this.lineMesh.visible = false;
    this.root.add(this.lineMesh);

    this._attachedBoat = null;
  }

  _createSmallFishModel() {
    const fish = new THREE.Group();
    // Body (streamlined ellipsoid)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), this._mat.fishOrange);
    body.scale.set(1.4, 0.65, 0.4);
    fish.add(body);
    // Tail
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), this._mat.fishSilver);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.36;
    fish.add(tail);
    return fish;
  }

  /**
   * Check whether a given boat position is inside either designated fishing endpoint.
   * Returns 'left' | 'right' | null.
   */
  checkFishingSpot(boatPos) {
    if (!boatPos) return null;
    this._leftAnchor.updateMatrixWorld(true);
    this._rightAnchor.updateMatrixWorld(true);
    this._leftAnchor.getWorldPosition(this._tmpLeft);
    this._rightAnchor.getWorldPosition(this._tmpRight);

    const dxL = boatPos.x - this._tmpLeft.x;
    const dzL = boatPos.z - this._tmpLeft.z;
    if (dxL * dxL + dzL * dzL <= FishingSystem.ZONE_RADIUS * FishingSystem.ZONE_RADIUS) {
      return 'left';
    }

    const dxR = boatPos.x - this._tmpRight.x;
    const dzR = boatPos.z - this._tmpRight.z;
    if (dxR * dxR + dzR * dzR <= FishingSystem.ZONE_RADIUS * FishingSystem.ZONE_RADIUS) {
      return 'right';
    }

    return null;
  }

  /** Start fishing session at current spot. */
  startFishing(entity, controller, isBoat = true) {
    if (this.state !== 'idle' && this.state !== 'casting') return;
    this.state = 'fishing';
    this.fishTimer = 0;
    this.reelHoldTimer = 0;
    this.castHoldTimer = 0;
    this.pendingCatches = 0;
    this._justStartedFishing = true;
    this._castKeyActive = true;
    this._needReelRelease = false;
    this._mustReleaseFBeforeStop = true; // Player MUST release F before pressing/holding F can stop
    this._mustReleaseFBeforeCast = true;
    this._attachedController = controller;
    this._lastReportedFishTimerSec = null;
    this._lastReportedCastProgress = 0;
    this._lastReportedReelProgress = 0;
    this._lastFishReady = false;
    this.callbacks.onCastProgress?.(0);
    this.callbacks.onFishReady?.(false);
    this.callbacks.onPendingCatchesChange?.(0);

    // Freeze movement while keeping character animation and physics pipeline active
    if (controller) {
      if (isBoat) {
        controller.enabled = false;
        controller.speed = 0;
        if (controller.inertia?.halt) controller.inertia.halt();
      } else {
        if (controller.setFishing) {
          controller.setFishing(true);
        } else {
          controller.isFishing = true;
        }
        controller.enabled = true; // Kept enabled so ground snap and camera remain active
        if (controller.velocity?.set) controller.velocity.set(0, 0, 0);
        controller.currentStateName = 'Fish';
      }
    }

    // Attach gear
    this._attachGear(entity, isBoat);

    soundFx.playCastSound();
    this._lastReportedState = this.state;
    this.callbacks.onFishingStateChange?.(this.state);
    this.callbacks.onPromptChange?.({
      text: 'Fishing active · Waiting for next bite...',
      action: null,
      sub: 'Press or hold [F] or [Esc] to stop',
    });
  }

  /** Stop fishing session and restore normal movement. */
  stopFishing(controller) {
    if (this.state === 'idle') return;
    this.state = 'idle';
    this.castHoldTimer = 0;
    this.fishTimer = 0;
    this.reelHoldTimer = 0;
    this.pendingCatches = 0;
    this._castKeyActive = false;
    this._justStartedFishing = false;
    this._needReelRelease = false;
    this._mustReleaseFBeforeStop = false;
    this._mustReleaseFBeforeCast = false;
    this._lastReportedFishTimerSec = null;
    this._lastReportedCastProgress = 0;
    this._lastReportedReelProgress = 0;
    this._lastFishReady = false;
    this._lastReportedState = 'idle';

    // Hide gear
    if (this.rodGroup) this.rodGroup.visible = false;
    if (this.bucketGroup) this.bucketGroup.visible = false;
    if (this.bobberGroup) this.bobberGroup.visible = false;
    if (this.lineMesh) this.lineMesh.visible = false;
    if (this._bobberRipple) this._bobberRipple.visible = false;

    const ctrl = controller || this._attachedController;
    // Re-enable movement and reset character state
    if (ctrl) {
      ctrl.enabled = true;
      if (ctrl.resetMovement) {
        ctrl.resetMovement();
      } else {
        if (ctrl.setFishing) {
          ctrl.setFishing(false);
        } else if (ctrl.isFishing !== undefined) {
          ctrl.isFishing = false;
          if (ctrl._fishingLockPos) ctrl._fishingLockPos = null;
        }
        if (ctrl.boat) {
          ctrl.speed = 0;
          if (ctrl.inertia?.halt) ctrl.inertia.halt();
          ctrl.physicsPosition?.copy(ctrl.boat.position);
          ctrl.prevPosition?.copy(ctrl.boat.position);
        } else {
          if (ctrl.currentStateName === 'Fish') {
            ctrl.currentStateName = 'Idle';
          }
        }
      }
    }
    this._attachedController = null;

    this.callbacks.onFishingStateChange?.('idle');
    this.callbacks.onCastProgress?.(0);
    this.callbacks.onReelProgress?.(0);
    this.callbacks.onFishReady?.(false);
    this.callbacks.onPendingCatchesChange?.(0);
    this.callbacks.onPromptChange?.(null);
  }

  _attachGear(entity, isBoat = true) {
    if (!entity) return;
    this._attachedEntity = entity;
    this._isFishingFromBoat = isBoat;

    if (isBoat) {
      if (this.rodGroup.parent !== entity) entity.add(this.rodGroup);
      if (this.bucketGroup.parent !== entity) entity.add(this.bucketGroup);

      // Position rod on boat starboard gunwale
      this.rodGroup.position.set(0.72, 0.82, -0.4);
      this.rodGroup.rotation.set(-0.25, 0, -0.55);
      this.rodGroup.visible = true;

      // Position bucket on deck
      this.bucketGroup.position.set(0.55, 0.42, 0.6);
      this.bucketGroup.rotation.set(0, 0, 0);
      this.bucketGroup.visible = true;

      // Position bobber in water ahead-starboard
      const worldBoatPos = entity.position;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(entity.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(entity.quaternion);

      const bobberPos = worldBoatPos.clone()
        .add(forward.clone().multiplyScalar(4.5))
        .add(right.clone().multiplyScalar(3.2));
      bobberPos.y = 0;

      this.bobberGroup.position.copy(bobberPos);
      this.bobberGroup.visible = true;
      this.lineMesh.visible = true;
    } else {
      // Character on foot at the pier railing!
      if (this.bucketGroup.parent !== this.root) this.root.add(this.bucketGroup);
      if (this.rodGroup) this.rodGroup.visible = false; // Character uses built-in ProceduralCharacter rod!

      const charPos = this._attachedController?.position ? this._attachedController.position : entity.position;
      const targetAnchor = this.currentSpot === 'left' ? this._leftAnchor : this._rightAnchor;
      targetAnchor.updateMatrixWorld(true);
      targetAnchor.getWorldPosition(this._tmpPos);

      // Vector pointing towards water
      const toWater = new THREE.Vector3(this._tmpPos.x - charPos.x, 0, this._tmpPos.z - charPos.z);
      if (toWater.lengthSq() > 0.001) {
        toWater.normalize();
      } else {
        toWater.set(0, 0, 1);
      }
      const right = new THREE.Vector3(-toWater.z, 0, toWater.x);

      // Orient character towards the water
      const angle = Math.atan2(toWater.x, toWater.z);
      if (this._attachedController) {
        this._attachedController.yaw = angle;
        this._attachedController.prevYaw = angle;
      }
      entity.rotation.y = angle;

      // Bucket sitting on the wooden dock beside the character
      this.bucketGroup.position.copy(charPos).add(right.clone().multiplyScalar(-0.6));
      this.bucketGroup.position.y = charPos.y; // dock floor
      this.bucketGroup.rotation.set(0, 0, 0);
      this.bucketGroup.visible = true;
      this.bucketGroup.updateMatrixWorld(true);

      // Bobber floating in the water near the anchor
      const bobberPos = this._tmpPos.clone();
      bobberPos.y = 0;
      this.bobberGroup.position.copy(bobberPos);
      this.bobberGroup.visible = true;
      this.lineMesh.visible = true;
    }
  }

  /**
   * Main per-frame update loop.
   * @param {number} dt delta time in seconds
   * @param {object} input input manager (keys.interact, keys.reel)
   * @param {THREE.Object3D} entity player entity (boat or character.group)
   * @param {object} controller controller instance (boatController or character)
   * @param {boolean} isBoat whether the player is in boat mode
   */
  update(dt, input, entity, controller, isBoat = true) {
    if (!entity) return;

    // ── 1. Proximity check ──────────────────────────────────────────
    const spot = this.checkFishingSpot(controller?.position) || this.checkFishingSpot(entity?.position);
    this.currentSpot = spot;

    if (spot !== this._wasNearSpot) {
      this._wasNearSpot = spot;
      this.callbacks.onNearFishingSpot?.(spot);
    }

    // If player somehow moved out while in idle, ensure cast progress is reset
    if (!spot && this.state === 'idle') {
      if (this.castHoldTimer > 0) {
        this.castHoldTimer = 0;
        this.callbacks.onCastProgress?.(0);
      }
      return;
    }

    const holdingF = input?.keys?.interact ?? false;
    const holdingR = input?.keys?.reel ?? false;

    // Release flag when player releases F
    if (!holdingF) {
      this._justStartedFishing = false;
      this._castKeyActive = false;
      this._mustReleaseFBeforeStop = false;
      this._mustReleaseFBeforeCast = false;
    }

    // Release flag when player releases R (each fish requires holding R freshly)
    if (!holdingR) {
      this._needReelRelease = false;
    }

    // Press or hold F to stop fishing at any time while actively fishing
    // (Player must release F first from casting before F can trigger stop)
    if (this.state !== 'idle' && !this._mustReleaseFBeforeStop && !this._justStartedFishing && holdingF) {
      this.stopFishing(controller);
      this._mustReleaseFBeforeCast = true; // Still holding F from stopping; must release before casting again
      return;
    }

    // ── 2. Idle / Casting state: Hold F for 2 seconds to start ───────
    if (this.state === 'idle') {
      if (spot && holdingF && !this._mustReleaseFBeforeCast) {
        this.castHoldTimer += dt;
        if (this.castHoldTimer >= FishingSystem.F_HOLD_DURATION - 0.005) {
          this.castHoldTimer = 0;
          this._lastReportedCastProgress = 0;
          this.callbacks.onCastProgress?.(0);
          this.startFishing(entity, controller, isBoat);
        } else {
          const progress = Math.min(0.99, this.castHoldTimer / FishingSystem.F_HOLD_DURATION);
          const rounded = Math.round(progress * 50) / 50;
          if (rounded !== this._lastReportedCastProgress) {
            this._lastReportedCastProgress = rounded;
            this.callbacks.onCastProgress?.(rounded);
          }
        }
      } else {
        if (this.castHoldTimer > 0) {
          this.castHoldTimer = 0;
          if (this._lastReportedCastProgress !== 0) {
            this._lastReportedCastProgress = 0;
            this.callbacks.onCastProgress?.(0);
          }
        }
      }
      return;
    }

    // ── 3. Active Fishing State (Stationary) ─────────────────────────
    // Maintain movement lock while keeping character rendering & ground detection active
    if (controller) {
      if (isBoat) {
        controller.enabled = false;
        controller.speed = 0;
      } else {
        controller.isFishing = true;
        controller.enabled = true;
        if (controller.velocity?.set) {
          controller.velocity.x = 0;
          controller.velocity.z = 0;
        }
        controller.currentStateName = 'Fish';
      }
    }

    // Update bobber wave physics
    const waveH = this.waveSampler
      ? (typeof this.waveSampler.getHeight === 'function'
          ? this.waveSampler.getHeight(this.bobberGroup.position.x, this.bobberGroup.position.z, this._waveTime || 0)
          : (typeof this.waveSampler.sample === 'function'
              ? this.waveSampler.sample(this.bobberGroup.position.x, this.bobberGroup.position.z, this._waveTime || 0)
              : 0))
      : 0;
    this.bobberGroup.position.y = waveH + 0.05;

    // Update fishing line from rod tip to bobber
    this._updateLine();

    // ── 4. Independent Repeating 20-Second Catch Cycle ──────────────
    // Start a repeating 20-second timer when fishing begins. Every 20 seconds,
    // a new fish becomes available. Runs continuously so multiple fish can accumulate safely.
    this.fishTimer += dt;
    if (this.fishTimer >= FishingSystem.FISH_INTERVAL) {
      this.fishTimer -= FishingSystem.FISH_INTERVAL;
      this.pendingCatches += 1;
      soundFx.playBiteAlertSound();

      // Trigger popup notification whenever a new fish is caught
      this.callbacks.onFishAlert?.({
        text: '🐟 Fish caught! Hold R to retrieve your fish!',
        key: Date.now(),
        count: this.pendingCatches,
      });
      this._lastFishReady = true;
      this.callbacks.onFishReady?.(true);
      this.callbacks.onPendingCatchesChange?.(this.pendingCatches);
    }

    // Throttle fishTimer update to whole seconds (prevents 60 Hz React re-renders)
    const timeLeft = Math.max(0, FishingSystem.FISH_INTERVAL - this.fishTimer);
    const timeLeftSec = Math.ceil(timeLeft);
    if (timeLeftSec !== this._lastReportedFishTimerSec) {
      this._lastReportedFishTimerSec = timeLeftSec;
      this.callbacks.onFishTimer?.(timeLeftSec);
    }

    // ── 5. Bobber Ripple & Bite Feedback ────────────────────────────
    if (this.pendingCatches > 0) {
      const wiggle = Math.sin(Date.now() * 0.02) * 0.08;
      this.bobberGroup.position.y += wiggle - 0.06;
      if (this._bobberRipple) {
        this._bobberRipple.visible = true;
        this._bobberRipple.scale.setScalar(1 + Math.sin(Date.now() * 0.015) * 0.35);
      }
    } else {
      if (this._bobberRipple) this._bobberRipple.visible = false;
    }

    // ── 6. Fish Retrieval (Hold R for 3-4s per available fish) ────────
    if (this.pendingCatches > 0) {
      if (holdingR && !this._needReelRelease) {
        this.state = 'reeling';
        this.reelHoldTimer += dt;
        const progress = Math.min(1.0, this.reelHoldTimer / FishingSystem.R_HOLD_DURATION);
        const rounded = Math.round(progress * 50) / 50;
        if (rounded !== this._lastReportedReelProgress) {
          this._lastReportedReelProgress = rounded;
          this.callbacks.onReelProgress?.(rounded);
        }

        if (this.reelHoldTimer >= FishingSystem.R_HOLD_DURATION - 0.005) {
          this._handleCatchSuccess();
        }
      } else {
        if (this.state === 'reeling') {
          this.reelHoldTimer = 0;
          if (this._lastReportedReelProgress !== 0) {
            this._lastReportedReelProgress = 0;
            this.callbacks.onReelProgress?.(0);
          }
        }
        this.state = 'fish_ready';
      }

      this.callbacks.onPromptChange?.({
        text: this.pendingCatches > 1
          ? `🐟 ${this.pendingCatches} fish waiting! Hold R to retrieve!`
          : '🐟 Fish caught! Hold R to retrieve your fish!',
        action: 'R',
        sub: 'Hold R for 3-4s to retrieve',
      });
    } else {
      // No catches pending — waiting for next bite
      if (this.state === 'reeling' || this.state === 'fish_ready') {
        this.reelHoldTimer = 0;
        if (this._lastReportedReelProgress !== 0) {
          this._lastReportedReelProgress = 0;
          this.callbacks.onReelProgress?.(0);
        }
      }
      this.state = 'fishing';
      if (this._lastFishReady !== false) {
        this._lastFishReady = false;
        this.callbacks.onFishReady?.(false);
      }
      this.callbacks.onPromptChange?.({
        text: 'Fishing active · Waiting for next bite...',
        action: null,
        sub: 'Press or hold [F] or [Esc] to stop',
      });
    }

    if (this.state !== this._lastReportedState) {
      this._lastReportedState = this.state;
      this.callbacks.onFishingStateChange?.(this.state);
    }

    // ── 7. Animate leaping fish into bucket ───────────────────────────
    if (this._leapingFish) {
      this._updateLeapingFish(dt);
    }
  }

  _updateLine() {
    if (!this.lineMesh) return;
    let rodTipWorld;
    if (!this._isFishingFromBoat && this._attachedController?._char?.fishingRodTip) {
      rodTipWorld = new THREE.Vector3();
      this._attachedController._char.fishingRodTip.getWorldPosition(rodTipWorld);
    } else if (!this._isFishingFromBoat && this._attachedController?._char?.fishingRod) {
      const rodTipLocal = new THREE.Vector3(0, 2.25, 0);
      rodTipWorld = this._attachedController._char.fishingRod.localToWorld(rodTipLocal.clone());
    } else if (this.rodGroup && this.rodGroup.visible) {
      const rodTipLocal = new THREE.Vector3(0, 2.85, 0);
      rodTipWorld = this.rodGroup.localToWorld(rodTipLocal.clone());
    }
    if (!rodTipWorld) return;

    const bobberWorld = this.bobberGroup.position.clone();
    bobberWorld.y += 0.12; // top of bobber pin

    const posAttr = this.lineMesh.geometry.attributes.position;
    posAttr.setXYZ(0, rodTipWorld.x, rodTipWorld.y, rodTipWorld.z);
    posAttr.setXYZ(1, bobberWorld.x, bobberWorld.y, bobberWorld.z);
    posAttr.needsUpdate = true;
  }

  _handleCatchSuccess() {
    if (this.pendingCatches <= 0) return; // Prevent duplicate retrieval
    this.pendingCatches -= 1;
    this.fishCount += 1;
    this.reelHoldTimer = 0;
    this._needReelRelease = true; // Player must release and hold R freshly for each fish
    this.callbacks.onReelProgress?.(0);
    this.callbacks.onPendingCatchesChange?.(this.pendingCatches);

    soundFx.playCatchSound();

    // Trigger leaping fish animation from bobber to bucket
    this.bucketGroup.updateMatrixWorld(true);
    this._startFishJump(
      this.bobberGroup.position.clone(),
      this.bucketGroup.localToWorld(new THREE.Vector3(0, 0.35, 0))
    );

    // Update 3D bucket contents
    const visibleIndex = Math.min(this.fishCount - 1, this._bucketFishes.length - 1);
    if (visibleIndex >= 0 && this._bucketFishes[visibleIndex]) {
      this._bucketFishes[visibleIndex].visible = true;
    }

    // Award score / points (3 coins)
    this.callbacks.onFishCaught?.({
      count: this.fishCount,
      points: FishingSystem.POINTS_PER_FISH,
    });

    if (this.pendingCatches > 0) {
      this.state = 'fish_ready';
      this.callbacks.onFishReady?.(true);
      this.callbacks.onPromptChange?.({
        text: this.pendingCatches > 1
          ? `🐟 ${this.pendingCatches} fish waiting! Hold R to retrieve!`
          : '🐟 Fish caught! Hold R to retrieve your fish!',
        action: 'R',
        sub: 'Hold R for 3-4s to retrieve',
      });
    } else {
      this.state = 'fishing';
      this.callbacks.onFishReady?.(false);
      if (this._bobberRipple) this._bobberRipple.visible = false;
      this.callbacks.onPromptChange?.({
        text: 'Fishing active · Waiting for next bite...',
        action: null,
        sub: 'Press or hold [F] or [Esc] to stop',
      });
    }
    if (this.state !== this._lastReportedState) {
      this._lastReportedState = this.state;
      this.callbacks.onFishingStateChange?.(this.state);
    }
  }

  _startFishJump(startWorld, endWorld) {
    if (this._leapingFish) {
      this.root.remove(this._leapingFish.mesh);
    }
    const mesh = this._createSmallFishModel();
    mesh.position.copy(startWorld);
    this.root.add(mesh);

    this._leapingFish = {
      mesh,
      start: startWorld.clone(),
      end: endWorld.clone(),
      apexY: Math.max(startWorld.y, endWorld.y) + 1.8,
      t: 0,
      duration: 0.85,
    };
  }

  _updateLeapingFish(dt) {
    const leap = this._leapingFish;
    if (!leap) return;
    leap.t += dt / leap.duration;
    const u = Math.min(1.0, leap.t);

    // Quadratic Bezier arc
    const mx = (leap.start.x + leap.end.x) / 2;
    const mz = (leap.start.z + leap.end.z) / 2;
    const x = (1 - u) * (1 - u) * leap.start.x + 2 * (1 - u) * u * mx + u * u * leap.end.x;
    const y = (1 - u) * (1 - u) * leap.start.y + 2 * (1 - u) * u * leap.apexY + u * u * leap.end.y;
    const z = (1 - u) * (1 - u) * leap.start.z + 2 * (1 - u) * u * mz + u * u * leap.end.z;

    leap.mesh.position.set(x, y, z);
    leap.mesh.rotation.x += dt * 8;
    leap.mesh.rotation.y += dt * 4;

    if (leap.t >= 1.0) {
      this.root.remove(leap.mesh);
      this._leapingFish = null;
      // Pulse bucket
      if (this.bucketGroup) {
        this.bucketGroup.scale.set(1.15, 1.15, 1.15);
        setTimeout(() => this.bucketGroup.scale.set(1, 1, 1), 180);
      }
    }
  }

  /**
   * Shift fishing anchors, bobber, and bucket during a floating-origin rebase.
   * @param {THREE.Vector3} offset
   */
  rebase(offset) {
    if (!offset) return;
    if (this.bobberGroup) this.bobberGroup.position.sub(offset);
    if (this.bucketGroup && this.bucketGroup.parent === this.root) {
      this.bucketGroup.position.sub(offset);
    }
    if (this._leapingFish) {
      this._leapingFish.start.sub(offset);
      this._leapingFish.end.sub(offset);
      this._leapingFish.mesh.position.sub(offset);
    }
    this._updateLine();
  }

  dispose() {
    this.stopFishing();
    if (this.root && this.scene) {
      this.scene.remove(this.root);
    }
  }
}

