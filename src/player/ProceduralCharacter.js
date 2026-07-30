import * as THREE from 'three';

/**
 * ProceduralCharacter.js — Fully procedural stylized ocean cleanup adventurer.
 *
 * No external assets required. Instant load. Full animation control.
 * Matches the target aesthetic: Raft / Wind Waker / Animal Crossing.
 *
 * Character design:
 *   • Young adult, cartoon proportions (~5.5 heads tall, ~2.2m)
 *   • Teal waterproof jacket, orange life vest, dark cargo pants
 *   • Brown rubber boots, fingerless gloves, utility belt
 *   • Small backpack with cleanup badge
 *   • Visible equipment: fishing net, trash grabber, compass, rope, radio
 *   • Large expressive eyes, short dark hair
 *
 * Supports 20+ animation states:
 *   Idle, Walk, Run, Sprint, Jump, Fall, Land,
 *   Swim, TreadWater, BoardBoat, LeaveBoat, Sit,
 *   PickupTrash, CarryObject, ThrowNet, Fishing, OpenChest, PushBoat,
 *   Celebrate, Wave, Sleep, Death
 *
 * Rig hierarchy:
 *   root (group, scale 2.2)
 *     └─ torso (teal jacket)
 *          ├─ head (skin + hair + eyes)
 *          ├─ lifeVest (orange)
 *          ├─ backpack (green with badge)
 *          ├─ utilityBelt
 *          ├─ leftShoulder → leftUpperArm → leftElbow → leftForearm → leftHand
 *          ├─ rightShoulder → rightUpperArm → rightElbow → rightForearm → rightHand
 *          └─ hips
 *               ├─ leftHip → leftUpperLeg → leftKnee → leftLowerLeg → leftFoot
 *               └─ rightHip → rightUpperLeg → rightKnee → rightLowerLeg → rightFoot
 */
export class ProceduralCharacter {
  constructor() {
    this.root = new THREE.Group();
    this.root.scale.set(2.2, 2.2, 2.2);

    // Animation state — driven by AnimationController or directly
    this._t           = 0;
    this._state       = 'Idle';
    this._speed       = 0;
    this._blendWeight = 1.0;
    this._stateTime   = 0;

    this._build();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────────

  addTo(scene) { scene.add(this.root); }
  removeFrom(scene) { scene.remove(this.root); }

  /**
   * Drive animations every render frame.
   * @param {string} state  — animation state name
   * @param {number} speed  — horizontal speed in m/s
   * @param {number} dt     — frame delta in seconds
   */
  update(state, speed, dt) {
    this._state = state;
    this._speed = speed;
    this._t    += dt;
    this._animate();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Build Character
  // ─────────────────────────────────────────────────────────────────────────

  _build() {
    // ── Materials ─────────────────────────────────────────────────────
    this._mats = {
      skin:       this._mat(0xf5c5a0),   // warm skin tone
      hair:       this._mat(0x2c1810),   // dark brown hair
      eyeWhite:   this._mat(0xffffff),   // eye whites
      iris:       this._mat(0x2d5016),   // dark green iris
      pupil:      this._mat(0x0a0a0a),   // black pupil
      jacket:     this._mat(0x0d9488),   // teal waterproof jacket
      vest:       this._mat(0xf97316),   // orange life vest
      pants:      this._mat(0x1e293b),   // dark cargo pants
      boots:      this._mat(0x6b3a1f),   // brown rubber boots
      gloves:     this._mat(0x44403c),   // dark fingerless gloves
      belt:       this._mat(0x3f3f46),   // utility belt grey
      backpack:   this._mat(0x166534),   // dark green backpack
      badge:      this._mat(0x38bdf8),   // cleanup badge cyan
      metal:      this._mat(0x9ca3af),   // metallic accessories
      rope:       this._mat(0xd4a574),   // rope tan
      wood:       this._mat(0x92400e),   // wooden rod
      net:        this._mat(0x94a3b8, 0.5), // translucent net
      radio:      this._mat(0x1f2937),   // dark radio body
    };

    // ── Torso (Teal Jacket) ──────────────────────────────────────────
    this.torso = this._box(0.55, 0.65, 0.30, this._mats.jacket);
    this.torso.position.y = 1.05;
    this.root.add(this.torso);

    // Life Vest (layered on top of jacket)
    this.lifeVest = this._box(0.58, 0.40, 0.34, this._mats.vest);
    this.lifeVest.position.set(0, 0.08, 0.01);
    this.torso.add(this.lifeVest);

    // Vest straps
    const strapL = this._box(0.06, 0.50, 0.04, this._mats.vest);
    strapL.position.set(-0.18, 0.10, 0.16);
    this.torso.add(strapL);
    const strapR = this._box(0.06, 0.50, 0.04, this._mats.vest);
    strapR.position.set(0.18, 0.10, 0.16);
    this.torso.add(strapR);

    // ── Backpack ────────────────────────────────────────────────────
    const bp = this._box(0.32, 0.42, 0.14, this._mats.backpack);
    bp.position.set(0, 0.02, -0.20);
    this.torso.add(bp);

    // Cleanup badge on backpack
    const badge = this._box(0.10, 0.10, 0.02, this._mats.badge);
    badge.position.set(0.06, 0.10, -0.28);
    this.torso.add(badge);

    // Rope coil on backpack
    const ropeCoil = this._torus(0.08, 0.02, this._mats.rope);
    ropeCoil.position.set(-0.08, 0.14, -0.28);
    ropeCoil.rotation.y = Math.PI / 2;
    this.torso.add(ropeCoil);

    // ── Utility Belt ────────────────────────────────────────────────
    const belt = this._box(0.58, 0.06, 0.32, this._mats.belt);
    belt.position.set(0, -0.28, 0);
    this.torso.add(belt);

    // Belt buckle
    const buckle = this._box(0.08, 0.06, 0.03, this._mats.metal);
    buckle.position.set(0, -0.28, 0.16);
    this.torso.add(buckle);

    // Compass on belt
    const compass = this._cylinder(0.04, 0.04, 0.03, this._mats.metal);
    compass.position.set(0.22, -0.28, 0.12);
    this.torso.add(compass);

    // Radio on belt
    const radio = this._box(0.05, 0.10, 0.03, this._mats.radio);
    radio.position.set(-0.22, -0.24, 0.12);
    this.torso.add(radio);
    // Radio antenna
    const antenna = this._cylinder(0.005, 0.005, 0.08, this._mats.metal);
    antenna.position.set(-0.22, -0.16, 0.12);
    this.torso.add(antenna);

    // Trash grabber (clipped to belt side)
    const grabberHandle = this._cylinder(0.015, 0.015, 0.30, this._mats.metal);
    grabberHandle.position.set(0.30, -0.12, -0.05);
    grabberHandle.rotation.z = 0.15;
    this.torso.add(grabberHandle);

    // ── Head ────────────────────────────────────────────────────────
    this.head = this._sphere(0.22, this._mats.skin);
    this.head.position.y = 0.50;
    this.torso.add(this.head);

    // Hair (dark, messy-short style)
    const hairTop = this._box(0.26, 0.10, 0.26, this._mats.hair);
    hairTop.position.set(0, 0.14, -0.02);
    this.head.add(hairTop);

    const hairFront = this._box(0.22, 0.06, 0.06, this._mats.hair);
    hairFront.position.set(0, 0.10, 0.12);
    this.head.add(hairFront);

    const hairBack = this._box(0.24, 0.14, 0.06, this._mats.hair);
    hairBack.position.set(0, 0.06, -0.14);
    this.head.add(hairBack);

    // Left eye
    const eyeL = this._sphere(0.045, this._mats.eyeWhite);
    eyeL.position.set(-0.08, 0.02, 0.17);
    this.head.add(eyeL);
    const irisL = this._sphere(0.028, this._mats.iris);
    irisL.position.set(0, 0, 0.025);
    eyeL.add(irisL);
    const pupilL = this._sphere(0.015, this._mats.pupil);
    pupilL.position.set(0, 0, 0.018);
    irisL.add(pupilL);

    // Right eye
    const eyeR = this._sphere(0.045, this._mats.eyeWhite);
    eyeR.position.set(0.08, 0.02, 0.17);
    this.head.add(eyeR);
    const irisR = this._sphere(0.028, this._mats.iris);
    irisR.position.set(0, 0, 0.025);
    eyeR.add(irisR);
    const pupilR = this._sphere(0.015, this._mats.pupil);
    pupilR.position.set(0, 0, 0.018);
    irisR.add(pupilR);

    // Mouth (subtle)
    const mouth = this._box(0.08, 0.015, 0.02, this._mats.hair);
    mouth.position.set(0, -0.08, 0.18);
    this.head.add(mouth);

    // ── Left Arm ────────────────────────────────────────────────────
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(-0.35, 0.22, 0);
    this.torso.add(this.leftShoulder);

    this.leftUpperArm = this._box(0.13, 0.32, 0.13, this._mats.jacket);
    this.leftUpperArm.position.y = -0.16;
    this.leftShoulder.add(this.leftUpperArm);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.y = -0.32;
    this.leftShoulder.add(this.leftElbow);

    this.leftForearm = this._box(0.11, 0.28, 0.11, this._mats.jacket);
    this.leftForearm.position.y = -0.14;
    this.leftElbow.add(this.leftForearm);

    // Fingerless glove + oversized hand
    const leftGlove = this._box(0.13, 0.08, 0.13, this._mats.gloves);
    leftGlove.position.set(0, -0.30, 0);
    this.leftElbow.add(leftGlove);
    const leftFingers = this._box(0.12, 0.06, 0.10, this._mats.skin);
    leftFingers.position.set(0, -0.37, 0);
    this.leftElbow.add(leftFingers);

    // ── Right Arm ───────────────────────────────────────────────────
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(0.35, 0.22, 0);
    this.torso.add(this.rightShoulder);

    this.rightUpperArm = this._box(0.13, 0.32, 0.13, this._mats.jacket);
    this.rightUpperArm.position.y = -0.16;
    this.rightShoulder.add(this.rightUpperArm);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.y = -0.32;
    this.rightShoulder.add(this.rightElbow);

    this.rightForearm = this._box(0.11, 0.28, 0.11, this._mats.jacket);
    this.rightForearm.position.y = -0.14;
    this.rightElbow.add(this.rightForearm);

    // Fingerless glove + oversized hand
    const rightGlove = this._box(0.13, 0.08, 0.13, this._mats.gloves);
    rightGlove.position.set(0, -0.30, 0);
    this.rightElbow.add(rightGlove);
    const rightFingers = this._box(0.12, 0.06, 0.10, this._mats.skin);
    rightFingers.position.set(0, -0.37, 0);
    this.rightElbow.add(rightFingers);

    // ── Fishing Net (on back) ───────────────────────────────────────
    this.fishingNet = this._buildFishingNet();
    this.fishingNet.position.set(0.15, 0.20, -0.30);
    this.fishingNet.rotation.z = 0.3;
    this.torso.add(this.fishingNet);

    // ── Fishing Rod (held in right hand, hidden by default) ─────────
    this.fishingRod = this._buildFishingRod();
    this.fishingRod.position.set(0.04, -0.28, 0.04);
    this.fishingRod.rotation.x = -0.3;
    this.fishingRod.visible = false;
    this.rightElbow.add(this.fishingRod);

    // ── Hips (pivot for legs) ───────────────────────────────────────
    this.hips = new THREE.Group();
    this.hips.position.y = -0.33;
    this.torso.add(this.hips);

    // ── Left Leg ────────────────────────────────────────────────────
    this.leftHip = new THREE.Group();
    this.leftHip.position.set(-0.14, 0, 0);
    this.hips.add(this.leftHip);

    this.leftUpperLeg = this._box(0.15, 0.40, 0.15, this._mats.pants);
    this.leftUpperLeg.position.y = -0.20;
    this.leftHip.add(this.leftUpperLeg);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.y = -0.40;
    this.leftHip.add(this.leftKnee);

    this.leftLowerLeg = this._box(0.13, 0.34, 0.13, this._mats.pants);
    this.leftLowerLeg.position.y = -0.17;
    this.leftKnee.add(this.leftLowerLeg);

    // Brown rubber boot (oversized)
    this.leftFoot = this._box(0.16, 0.16, 0.24, this._mats.boots);
    this.leftFoot.position.set(0, -0.40, 0.03);
    this.leftKnee.add(this.leftFoot);
    // Boot sole
    const leftSole = this._box(0.17, 0.04, 0.25, this._mats.belt);
    leftSole.position.set(0, -0.46, 0.03);
    this.leftKnee.add(leftSole);

    // ── Right Leg ───────────────────────────────────────────────────
    this.rightHip = new THREE.Group();
    this.rightHip.position.set(0.14, 0, 0);
    this.hips.add(this.rightHip);

    this.rightUpperLeg = this._box(0.15, 0.40, 0.15, this._mats.pants);
    this.rightUpperLeg.position.y = -0.20;
    this.rightHip.add(this.rightUpperLeg);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.y = -0.40;
    this.rightHip.add(this.rightKnee);

    this.rightLowerLeg = this._box(0.13, 0.34, 0.13, this._mats.pants);
    this.rightLowerLeg.position.y = -0.17;
    this.rightKnee.add(this.rightLowerLeg);

    // Brown rubber boot (oversized)
    this.rightFoot = this._box(0.16, 0.16, 0.24, this._mats.boots);
    this.rightFoot.position.set(0, -0.40, 0.03);
    this.rightKnee.add(this.rightFoot);
    // Boot sole
    const rightSole = this._box(0.17, 0.04, 0.25, this._mats.belt);
    rightSole.position.set(0, -0.46, 0.03);
    this.rightKnee.add(rightSole);

    // ── Enable shadows on all parts ────────────────────────────────
    this.root.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow    = true;
        obj.receiveShadow = false;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Equipment Builders
  // ─────────────────────────────────────────────────────────────────────────

  _buildFishingNet() {
    const group = new THREE.Group();

    // Net handle
    const handle = this._cylinder(0.015, 0.015, 0.45, this._mats.wood);
    handle.rotation.x = Math.PI / 2;
    group.add(handle);

    // Net ring
    const ring = this._torus(0.10, 0.01, this._mats.metal);
    ring.position.set(0, 0, 0.22);
    group.add(ring);

    // Net mesh (simplified cone)
    const netGeo = new THREE.ConeGeometry(0.10, 0.18, 6);
    const netMesh = new THREE.Mesh(netGeo, this._mats.net);
    netMesh.position.set(0, -0.09, 0.22);
    netMesh.rotation.x = Math.PI;
    group.add(netMesh);

    return group;
  }

  _buildFishingRod() {
    const rod = new THREE.Group();

    // Rod shaft
    const shaft = this._cylinder(0.015, 0.01, 0.9, this._mats.wood);
    shaft.position.y = 0.45;
    rod.add(shaft);

    // Reel
    const reel = this._cylinder(0.03, 0.03, 0.04, this._mats.metal);
    reel.position.set(0.03, 0.15, 0);
    reel.rotation.z = Math.PI / 2;
    rod.add(reel);

    // Fishing line
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcccccc });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.9, 0),
      new THREE.Vector3(0.1, -0.5, 0.8),
    ]);
    rod.add(new THREE.Line(lineGeo, lineMat));

    return rod;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Animation Dispatcher
  // ─────────────────────────────────────────────────────────────────────────

  _animate() {
    const t = this._t;
    const s = this._state;

    // Show/hide equipment based on state
    this.fishingRod.visible = (s === 'Fishing');

    switch (s) {
      case 'Walk':        this._animWalk(t, 1.0);    break;
      case 'Run':         this._animWalk(t, 1.6);    break;
      case 'Sprint':      this._animWalk(t, 2.2);    break;
      case 'Jump':        this._animJump(t);          break;
      case 'Fall':        this._animFall(t);          break;
      case 'Land':        this._animLand(t);          break;
      case 'Swim':        this._animSwim(t);          break;
      case 'TreadWater':  this._animTreadWater(t);    break;
      case 'BoardBoat':   this._animBoardBoat(t);     break;
      case 'LeaveBoat':   this._animLeaveBoat(t);     break;
      case 'Sit':         this._animSit(t);           break;
      case 'PickupTrash': this._animPickup(t);        break;
      case 'CarryObject': this._animCarry(t);         break;
      case 'ThrowNet':    this._animThrowNet(t);      break;
      case 'Fishing':     this._animFish(t);          break;
      case 'OpenChest':   this._animOpenChest(t);     break;
      case 'PushBoat':    this._animPushBoat(t);      break;
      case 'Celebrate':   this._animCelebrate(t);     break;
      case 'Wave':        this._animWave(t);          break;
      case 'Sleep':       this._animSleep(t);         break;
      case 'Death':       this._animDeath(t);         break;
      default:            this._animIdle(t);          break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Animation Implementations
  // ─────────────────────────────────────────────────────────────────────────

  /** Gentle breathing + slight head bob */
  _animIdle(t) {
    const breath = Math.sin(t * 1.2) * 0.015;
    this.torso.scale.y = 1 + breath;
    this.head.rotation.y = Math.sin(t * 0.4) * 0.04;
    this.head.rotation.x = 0;

    this._setLimbAngles({
      lShoulderX: Math.sin(t * 0.8) * 0.05,
      rShoulderX: -Math.sin(t * 0.8) * 0.05,
      lHipX: 0, rHipX: 0,
      lKneeX: 0, rKneeX: 0,
      torsoX: 0,
    });
    this.leftElbow.rotation.x = -0.1;
    this.rightElbow.rotation.x = -0.1;
  }

  /** Walk / Run / Sprint cycle — frequency drives speed */
  _animWalk(t, freq) {
    const swing = Math.sin(t * freq * Math.PI * 2);
    const isRun = freq > 1.2;
    const isSprint = freq > 1.8;
    const legAmp  = isSprint ? 0.85 : isRun ? 0.70 : 0.50;
    const armAmp  = isSprint ? 0.70 : isRun ? 0.55 : 0.40;
    const kneeBend = isSprint ? 0.65 : isRun ? 0.55 : 0.35;
    const torsoLean = isSprint ? -0.15 : isRun ? -0.12 : -0.04;

    const bob = Math.abs(Math.sin(t * freq * Math.PI * 2)) * (isRun ? 0.08 : 0.04);
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX:  swing * armAmp,
      rShoulderX: -swing * armAmp,
      lHipX:      -swing * legAmp,
      rHipX:       swing * legAmp,
      lKneeX:  Math.max(0, -Math.sin(t * freq * Math.PI * 2) * kneeBend),
      rKneeX:  Math.max(0,  Math.sin(t * freq * Math.PI * 2) * kneeBend),
      torsoX:  torsoLean,
    });

    this.head.rotation.x = -torsoLean * 0.5;
    this.head.rotation.y = Math.sin(t * freq * Math.PI) * 0.03;
    this.leftElbow.rotation.x = Math.max(0, -swing * armAmp * 0.4) - 0.15;
    this.rightElbow.rotation.x = Math.max(0, swing * armAmp * 0.4) - 0.15;
  }

  /** Jump — arms up, legs tucked */
  _animJump(t) {
    this.torso.scale.y = 1.0;
    this._setLimbAngles({
      lShoulderX: -0.6,
      rShoulderX: -0.6,
      lHipX:  0.4,
      rHipX:  0.4,
      lKneeX: 0.7,
      rKneeX: 0.7,
      torsoX: -0.1,
    });
    this.head.rotation.x = -0.1;
    this.leftElbow.rotation.x = -0.3;
    this.rightElbow.rotation.x = -0.3;
  }

  /** Fall — arms spread, legs dangling */
  _animFall(t) {
    this.torso.scale.y = 1.0;
    this._setLimbAngles({
      lShoulderX: -0.8,
      rShoulderX: -0.8,
      lHipX:  0.2,
      rHipX:  0.2,
      lKneeX: 0.15,
      rKneeX: 0.15,
      torsoX:  0.15,
    });
    this.leftElbow.rotation.x = -0.2;
    this.rightElbow.rotation.x = -0.2;
    // Slight flailing
    this.leftShoulder.rotation.z = Math.sin(t * 6) * 0.1;
    this.rightShoulder.rotation.z = -Math.sin(t * 6) * 0.1;
  }

  /** Land — brief squat impact */
  _animLand(t) {
    const impact = Math.max(0, 1 - this._stateTime * 5);
    this.torso.scale.y = 1.0 - impact * 0.1;
    this._setLimbAngles({
      lShoulderX: -0.3 * impact,
      rShoulderX: -0.3 * impact,
      lHipX:  0.3 * impact,
      rHipX:  0.3 * impact,
      lKneeX: 0.5 * impact,
      rKneeX: 0.5 * impact,
      torsoX: -0.05 * impact,
    });
  }

  /** Swim — horizontal body, arm strokes, leg kicks */
  _animSwim(t) {
    const strokeFreq = 3.0;
    const stroke = Math.sin(t * strokeFreq);
    const kick = Math.sin(t * strokeFreq * 2);

    this.torso.scale.y = 1.0;
    this.torso.rotation.x = -1.2; // nearly horizontal

    this._setLimbAngles({
      lShoulderX: -1.5 + stroke * 0.8,
      rShoulderX: -1.5 - stroke * 0.8,
      lHipX:  kick * 0.4,
      rHipX: -kick * 0.4,
      lKneeX: Math.max(0, kick * 0.3),
      rKneeX: Math.max(0, -kick * 0.3),
      torsoX: -1.2,
    });

    this.leftElbow.rotation.x = -0.8 + stroke * 0.3;
    this.rightElbow.rotation.x = -0.8 - stroke * 0.3;
    this.head.rotation.x = 1.0; // look forward while swimming
  }

  /** Tread Water — upright, gentle arm/leg motion */
  _animTreadWater(t) {
    const tread = Math.sin(t * 2.0);
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX: -0.6 + tread * 0.15,
      rShoulderX: -0.6 - tread * 0.15,
      lHipX:  0.3 + tread * 0.1,
      rHipX:  0.3 - tread * 0.1,
      lKneeX: 0.4,
      rKneeX: 0.4,
      torsoX: 0,
    });

    this.leftElbow.rotation.x = -0.4;
    this.rightElbow.rotation.x = -0.4;
    this.head.rotation.x = 0;
  }

  /** Board Boat — climbing motion */
  _animBoardBoat(t) {
    const progress = Math.min(this._stateTime * 2, 1);
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX: -1.2 * (1 - progress),
      rShoulderX: -1.2 * (1 - progress),
      lHipX:  0.8 * (1 - progress),
      rHipX:  0.4 * (1 - progress),
      lKneeX: 1.0 * (1 - progress),
      rKneeX: 0.5 * (1 - progress),
      torsoX: -0.2 * (1 - progress),
    });
  }

  /** Leave Boat — step-off */
  _animLeaveBoat(t) {
    const progress = Math.min(this._stateTime * 2, 1);
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX: 0.2 * (1 - progress),
      rShoulderX: 0.2 * (1 - progress),
      lHipX: -0.3 * (1 - progress),
      rHipX:  0.5 * (1 - progress),
      lKneeX: 0.2 * (1 - progress),
      rKneeX: 0.8 * (1 - progress),
      torsoX:  0.1 * (1 - progress),
    });
  }

  /** Sit — seated pose for boat */
  _animSit(t) {
    const breath = Math.sin(t * 1.0) * 0.01;
    this.torso.scale.y = 1.0 + breath;

    this._setLimbAngles({
      lShoulderX: 0.15,
      rShoulderX: 0.15,
      lHipX: -1.5,    // legs forward for sitting
      rHipX: -1.5,
      lKneeX: 1.5,    // knees bent
      rKneeX: 1.5,
      torsoX: -0.1,
    });
    this.leftElbow.rotation.x = -0.4;
    this.rightElbow.rotation.x = -0.4;
  }

  /** Pickup Trash — bend down and grab */
  _animPickup(t) {
    const progress = Math.min(this._stateTime * 3, 1);
    const bendDown = Math.sin(progress * Math.PI); // up-down curve

    this.torso.scale.y = 1.0;
    this._setLimbAngles({
      lShoulderX: 0.3 + bendDown * 0.8,
      rShoulderX: 0.3 + bendDown * 0.8,
      lHipX: -bendDown * 0.3,
      rHipX: -bendDown * 0.3,
      lKneeX: bendDown * 0.6,
      rKneeX: bendDown * 0.6,
      torsoX: bendDown * 0.6,
    });
    this.leftElbow.rotation.x = -0.6 * bendDown;
    this.rightElbow.rotation.x = -0.6 * bendDown;
  }

  /** Carry Object — walk with object held */
  _animCarry(t) {
    // Walk cycle but arms hold forward
    const swing = Math.sin(t * Math.PI * 2);
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX: -0.8,    // arms forward
      rShoulderX: -0.8,
      lHipX: -swing * 0.35,
      rHipX:  swing * 0.35,
      lKneeX: Math.max(0, -swing * 0.25),
      rKneeX: Math.max(0,  swing * 0.25),
      torsoX: -0.05,
    });
    this.leftElbow.rotation.x = -0.9;
    this.rightElbow.rotation.x = -0.9;
  }

  /** Throw Net — wind up and release */
  _animThrowNet(t) {
    const progress = Math.min(this._stateTime * 2.5, 1);
    const windUp = progress < 0.5 ? progress * 2 : 1;
    const release = progress >= 0.5 ? (progress - 0.5) * 2 : 0;

    this.torso.scale.y = 1.0;
    this._setLimbAngles({
      lShoulderX: 0.2,
      rShoulderX: -1.2 * windUp + 2.0 * release,
      lHipX: 0,
      rHipX: 0,
      lKneeX: 0,
      rKneeX: 0,
      torsoX: -0.2 * windUp + 0.3 * release,
    });
    this.rightElbow.rotation.x = -0.5 * windUp;
    this.torso.rotation.y = -0.3 * windUp + 0.5 * release;
  }

  /** Fishing — right arm extended, rod bobs */
  _animFish(t) {
    const bob = Math.sin(t * 1.5) * 0.08;
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX:  0.10,
      rShoulderX: -0.85 + bob,
      lHipX: 0, rHipX: 0,
      lKneeX: 0, rKneeX: 0,
      torsoX: -0.1,
    });
    this.rightElbow.rotation.x = -0.6 + bob * 0.3;
    this.leftElbow.rotation.x = -0.1;
  }

  /** Open Chest — kneel and lift */
  _animOpenChest(t) {
    const progress = Math.min(this._stateTime * 2, 1);

    this.torso.scale.y = 1.0;
    this._setLimbAngles({
      lShoulderX: -0.5 * progress,
      rShoulderX: -0.5 * progress,
      lHipX: -0.8 * progress,
      rHipX: -0.8 * progress,
      lKneeX: 1.4 * progress,
      rKneeX: 1.4 * progress,
      torsoX: 0.3 * progress,
    });
    this.leftElbow.rotation.x = -0.7 * progress;
    this.rightElbow.rotation.x = -0.7 * progress;
  }

  /** Push Boat — lean forward, pushing stance */
  _animPushBoat(t) {
    const push = Math.sin(t * 2.0) * 0.1;
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX: -1.0 + push,
      rShoulderX: -1.0 - push,
      lHipX: -push * 2,
      rHipX:  push * 2,
      lKneeX: 0.1,
      rKneeX: 0.1,
      torsoX: 0.4,
    });
    this.leftElbow.rotation.x = -0.3;
    this.rightElbow.rotation.x = -0.3;
  }

  /** Celebrate — jump with fist pump */
  _animCelebrate(t) {
    const bounce = Math.abs(Math.sin(t * 4)) * 0.15;
    this.torso.scale.y = 1.0;
    this.torso.position.y = 1.05 + bounce;

    this._setLimbAngles({
      lShoulderX: -0.3,
      rShoulderX: -2.8,    // fist up
      lHipX: 0,
      rHipX: 0,
      lKneeX: bounce > 0.05 ? 0.3 : 0,
      rKneeX: bounce > 0.05 ? 0.3 : 0,
      torsoX: -0.1,
    });
    this.rightElbow.rotation.x = -0.2;
    this.leftElbow.rotation.x = -0.1;
    this.head.rotation.x = -0.15;
  }

  /** Wave — friendly arm wave */
  _animWave(t) {
    const wave = Math.sin(t * 5) * 0.3;
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX: 0.05,
      rShoulderX: -2.5 + wave,
      lHipX: 0, rHipX: 0,
      lKneeX: 0, rKneeX: 0,
      torsoX: 0,
    });
    this.rightElbow.rotation.x = -0.8 + wave * 0.5;
    this.leftElbow.rotation.x = -0.1;
    this.head.rotation.y = 0.2;
  }

  /** Sleep — curled up, breathing */
  _animSleep(t) {
    const breath = Math.sin(t * 0.8) * 0.02;
    this.torso.scale.y = 1.0 + breath;

    this._setLimbAngles({
      lShoulderX: 0.8,
      rShoulderX: 0.8,
      lHipX: -1.2,
      rHipX: -1.2,
      lKneeX: 1.5,
      rKneeX: 1.5,
      torsoX: 1.2,   // lying down
    });
    this.leftElbow.rotation.x = -1.0;
    this.rightElbow.rotation.x = -1.0;
    this.head.rotation.x = -0.5;
  }

  /** Death — dramatic fall (optional) */
  _animDeath(t) {
    const fallProgress = Math.min(this._stateTime * 2, 1);
    this.torso.scale.y = 1.0;

    this._setLimbAngles({
      lShoulderX: -0.5 * fallProgress,
      rShoulderX: -0.5 * fallProgress,
      lHipX: 0,
      rHipX: 0,
      lKneeX: 0,
      rKneeX: 0,
      torsoX: 1.5 * fallProgress, // fall backward
    });
    this.head.rotation.x = -0.5 * fallProgress;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Limb Helper
  // ─────────────────────────────────────────────────────────────────────────

  _setLimbAngles({ lShoulderX, rShoulderX, lHipX, rHipX, lKneeX, rKneeX, torsoX }) {
    this.leftShoulder.rotation.x  = lShoulderX;
    this.rightShoulder.rotation.x = rShoulderX;
    this.leftHip.rotation.x       = lHipX;
    this.rightHip.rotation.x      = rHipX;
    this.leftKnee.rotation.x      = lKneeX;
    this.rightKnee.rotation.x     = rKneeX;
    this.torso.rotation.x         = torsoX;

    // Reset Z rotations unless overridden by specific animations
    this.leftShoulder.rotation.z  = 0;
    this.rightShoulder.rotation.z = 0;
    this.torso.rotation.y         = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Geometry Helpers
  // ─────────────────────────────────────────────────────────────────────────

  _mat(color, opacity = 1.0) {
    const opts = { color, roughness: 0.8, metalness: 0.0, flatShading: true };
    if (opacity < 1.0) {
      opts.transparent = true;
      opts.opacity = opacity;
    }
    return new THREE.MeshStandardMaterial(opts);
  }

  _box(w, h, d, mat) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }

  _sphere(r, mat) {
    return new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
  }

  _cylinder(rTop, rBot, h, mat) {
    return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 8), mat);
  }

  _torus(r, tube, mat) {
    return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 12), mat);
  }
}
