import * as THREE from 'three';

/**
 * ProceduralCharacter.js — Fully procedural humanoid built from Three.js geometry.
 *
 * No external assets required. Instant load. Full animation control.
 * Supports: Idle, Walk, Run, Jump, Fall, Fish states.
 *
 * Rig hierarchy:
 *   root (group)
 *     └─ torso
 *          ├─ head
 *          │    └─ hat
 *          ├─ leftUpperArm → leftForearm → leftHand
 *          ├─ rightUpperArm → rightForearm → rightHand (holds fishing rod)
 *          ├─ leftUpperLeg → leftLowerLeg → leftFoot
 *          └─ rightUpperLeg → rightLowerLeg → rightFoot
 */
export class ProceduralCharacter {
  constructor() {
    this.root = new THREE.Group();

    // Animation time accumulator
    this._t      = 0;
    this._state  = 'Idle';
    this._speed  = 0;

    this._build();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────────

  /** Add to scene */
  addTo(scene) { scene.add(this.root); }

  /** Remove from scene */
  removeFrom(scene) { scene.remove(this.root); }

  /**
   * Drive animations every render frame.
   * @param {string} state  — 'Idle'|'Walk'|'Run'|'Jump'|'Fall'|'Fish'
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
  //  Build rig
  // ─────────────────────────────────────────────────────────────────────────

  _build() {
    // ── Materials ───────────────────────────────────────────────────
    const skin    = this._mat(0xf5c5a0); // skin tone
    const shirt   = this._mat(0x2563eb); // blue shirt
    const pants   = this._mat(0x1e293b); // dark pants
    const shoes   = this._mat(0x292524); // dark shoes
    const hair    = this._mat(0x292524); // dark hair/hat
    const pack    = this._mat(0x16a34a); // green backpack

    // ── Torso ───────────────────────────────────────────────────────
    this.torso = this._box(0.55, 0.65, 0.28, shirt);
    this.torso.position.y = 1.05;
    this.root.add(this.torso);

    // Backpack
    const bp = this._box(0.30, 0.40, 0.12, pack);
    bp.position.set(0, 0, -0.18);
    this.torso.add(bp);

    // ── Head ────────────────────────────────────────────────────────
    this.head = this._sphere(0.22, skin);
    this.head.position.y = 0.44; // sits on top of torso
    this.torso.add(this.head);

    // Hair cap
    const cap = this._box(0.24, 0.12, 0.24, hair);
    cap.position.y = 0.14;
    this.head.add(cap);
    // Brim
    const brim = this._box(0.30, 0.03, 0.30, hair);
    brim.position.y = 0.06;
    brim.position.z = 0.05;
    this.head.add(brim);

    // ── Left Arm ────────────────────────────────────────────────────
    this.leftShoulder  = new THREE.Group();
    this.leftShoulder.position.set(-0.35, 0.22, 0);
    this.torso.add(this.leftShoulder);

    this.leftUpperArm  = this._box(0.12, 0.32, 0.12, shirt);
    this.leftUpperArm.position.y = -0.16;
    this.leftShoulder.add(this.leftUpperArm);

    this.leftElbow     = new THREE.Group();
    this.leftElbow.position.y = -0.32;
    this.leftShoulder.add(this.leftElbow);

    this.leftForearm   = this._box(0.10, 0.28, 0.10, skin);
    this.leftForearm.position.y = -0.14;
    this.leftElbow.add(this.leftForearm);
    
    const leftHand = this._box(0.10, 0.12, 0.10, skin);
    leftHand.position.y = -0.32;
    this.leftElbow.add(leftHand);

    // ── Right Arm ───────────────────────────────────────────────────
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(0.35, 0.22, 0);
    this.torso.add(this.rightShoulder);

    this.rightUpperArm = this._box(0.12, 0.32, 0.12, shirt);
    this.rightUpperArm.position.y = -0.16;
    this.rightShoulder.add(this.rightUpperArm);

    this.rightElbow    = new THREE.Group();
    this.rightElbow.position.y = -0.32;
    this.rightShoulder.add(this.rightElbow);

    this.rightForearm  = this._box(0.10, 0.28, 0.10, skin);
    this.rightForearm.position.y = -0.14;
    this.rightElbow.add(this.rightForearm);

    const rightHand = this._box(0.10, 0.12, 0.10, skin);
    rightHand.position.y = -0.32;
    this.rightElbow.add(rightHand);

    // Fishing rod (attached to right hand)
    this.fishingRod = this._buildFishingRod();
    this.fishingRod.position.set(0.04, -0.28, 0.04);
    this.fishingRod.rotation.x = -0.3;
    this.fishingRod.visible = false;
    this.rightElbow.add(this.fishingRod);

    // ── Hips (pivot for legs) ───────────────────────────────────────
    this.hips = new THREE.Group();
    this.hips.position.y = -0.33; // bottom of torso
    this.torso.add(this.hips);

    // ── Left Leg ────────────────────────────────────────────────────
    this.leftHip      = new THREE.Group();
    this.leftHip.position.set(-0.14, 0, 0);
    this.hips.add(this.leftHip);

    this.leftUpperLeg  = this._box(0.14, 0.40, 0.14, pants);
    this.leftUpperLeg.position.y = -0.20;
    this.leftHip.add(this.leftUpperLeg);

    this.leftKnee      = new THREE.Group();
    this.leftKnee.position.y = -0.40;
    this.leftHip.add(this.leftKnee);

    this.leftLowerLeg  = this._box(0.12, 0.38, 0.12, pants);
    this.leftLowerLeg.position.y = -0.19;
    this.leftKnee.add(this.leftLowerLeg);

    this.leftFoot      = this._box(0.14, 0.10, 0.22, shoes);
    this.leftFoot.position.set(0, -0.43, 0.04);
    this.leftKnee.add(this.leftFoot);

    // ── Right Leg ───────────────────────────────────────────────────
    this.rightHip     = new THREE.Group();
    this.rightHip.position.set(0.14, 0, 0);
    this.hips.add(this.rightHip);

    this.rightUpperLeg = this._box(0.14, 0.40, 0.14, pants);
    this.rightUpperLeg.position.y = -0.20;
    this.rightHip.add(this.rightUpperLeg);

    this.rightKnee     = new THREE.Group();
    this.rightKnee.position.y = -0.40;
    this.rightHip.add(this.rightKnee);

    this.rightLowerLeg = this._box(0.12, 0.38, 0.12, pants);
    this.rightLowerLeg.position.y = -0.19;
    this.rightKnee.add(this.rightLowerLeg);

    this.rightFoot     = this._box(0.13, 0.10, 0.22, shoes);
    this.rightFoot.position.set(0, -0.43, 0.04);
    this.rightKnee.add(this.rightFoot);

    // Enable shadows on all parts
    this.root.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow    = true;
        obj.receiveShadow = false;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Animation
  // ─────────────────────────────────────────────────────────────────────────

  _animate() {
    const t = this._t;
    const s = this._state;

    // Reset rod visibility
    this.fishingRod.visible = (s === 'Fish');

    switch (s) {
      case 'Walk': this._animWalk(t, 1.0);     break;
      case 'Run':  this._animWalk(t, 1.8);     break;
      case 'Jump': this._animJump(t);           break;
      case 'Fall': this._animFall(t);           break;
      case 'Fish': this._animFish(t);           break;
      default:     this._animIdle(t);           break;
    }
  }

  /** Gentle breathing + slight head bob */
  _animIdle(t) {
    const breath = Math.sin(t * 1.2) * 0.015;
    this.torso.scale.y = 1 + breath;
    this.head.rotation.y = Math.sin(t * 0.4) * 0.04;

    // Arms hang naturally, slight sway
    this._setLimbAngles({
      lShoulderX: Math.sin(t * 0.8) * 0.05,
      rShoulderX: -Math.sin(t * 0.8) * 0.05,
      lHipX: 0, rHipX: 0,
      lKneeX: 0, rKneeX: 0,
      torsoX: 0,
    });
    
    // Slight natural elbow bend
    this.leftElbow.rotation.x = -0.1;
    this.rightElbow.rotation.x = -0.1;
  }

  /** Walk/run cycle */
  _animWalk(t, freq) {
    const swing = Math.sin(t * freq * Math.PI * 2);
    const legAmp  = freq > 1.2 ? 0.70 : 0.50;
    const armAmp  = freq > 1.2 ? 0.55 : 0.40;
    const kneeBend = freq > 1.2 ? 0.55 : 0.35;
    const torsoLean = freq > 1.2 ? -0.12 : -0.04;

    this._setLimbAngles({
      lShoulderX:  swing * armAmp,
      rShoulderX: -swing * armAmp,
      lHipX:      -swing * legAmp,
      rHipX:       swing * legAmp,
      lKneeX:  Math.max(0, -Math.sin(t * freq * Math.PI * 2) * kneeBend),
      rKneeX:  Math.max(0,  Math.sin(t * freq * Math.PI * 2) * kneeBend),
      torsoX:  torsoLean,
    });

    this.head.rotation.x = -torsoLean;
    this.leftElbow.rotation.x = Math.max(0, -swing * armAmp * 0.4) - 0.1;
    this.rightElbow.rotation.x = Math.max(0, swing * armAmp * 0.4) - 0.1;
  }

  _animJump(t) {
    this._setLimbAngles({
      lShoulderX: -0.6,
      rShoulderX: -0.6,
      lHipX:  0.4,
      rHipX:  0.4,
      lKneeX: 0.7,
      rKneeX: 0.7,
      torsoX: -0.1,
    });
  }

  _animFall(t) {
    this._setLimbAngles({
      lShoulderX: -0.8,
      rShoulderX: -0.8,
      lHipX:  0.2,
      rHipX:  0.2,
      lKneeX: 0.2,
      rKneeX: 0.2,
      torsoX:  0.15,
    });
  }

  /** Fishing: right arm extends forward, rod bobs */
  _animFish(t) {
    const bob = Math.sin(t * 1.5) * 0.08;
    this._setLimbAngles({
      lShoulderX:  0.10,
      rShoulderX: -0.85 + bob,
      lHipX: 0, rHipX: 0,
      lKneeX: 0, rKneeX: 0,
      torsoX: -0.1,
    });
    this.rightElbow.rotation.x = -0.6 + bob * 0.3;
  }

  /** Apply precomputed angles to limb pivot groups */
  _setLimbAngles({ lShoulderX, rShoulderX, lHipX, rHipX, lKneeX, rKneeX, torsoX }) {
    this.leftShoulder.rotation.x  = lShoulderX;
    this.rightShoulder.rotation.x = rShoulderX;
    this.leftHip.rotation.x       = lHipX;
    this.rightHip.rotation.x      = rHipX;
    this.leftKnee.rotation.x      = lKneeX;
    this.rightKnee.rotation.x     = rKneeX;
    this.torso.rotation.x         = torsoX;
  }

  _buildFishingRod() {
    const rod = new THREE.Group();
    const rodMat = this._mat(0x92400e); // brown wood

    // Rod shaft
    const shaft = this._box(0.03, 0.9, 0.03, rodMat);
    shaft.position.y = 0.45;
    rod.add(shaft);

    // Fishing line
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcccccc });
    const lineGeo  = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.9, 0),
      new THREE.Vector3(0.1, -0.5, 0.8),
    ]);
    rod.add(new THREE.Line(lineGeo, lineMat));

    return rod;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Geometry helpers
  // ─────────────────────────────────────────────────────────────────────────

  _mat(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.0 });
  }

  _box(w, h, d, mat) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }

  _sphere(r, mat) {
    return new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
  }

  _cylinder(rTop, rBot, h, mat) {
    return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 10), mat);
  }
}
