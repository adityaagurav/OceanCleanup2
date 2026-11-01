import * as THREE from 'three';
import { BoatConfig } from '../config/BoatConfig.js';

/**
 * BoatModelBuilder.js — Centralized 3D Boat Model Factory
 *
 * Builds procedural boats for Level 1, Level 2, and Level 3 with accurate
 * visual upgrades, custom color palettes, and tier scaling.
 *
 * Used by:
 *  - Engine.js (Local player's boat)
 *  - RemotePlayerManager.js (Remote players' active ocean boats)
 */
export function buildBoatModel(level = 1, options = {}) {
  const safeLevel = Math.max(1, Math.min(3, Number(level) || 1));
  const color = options.color || {};
  const isRemote = !!options.isRemote;

  const parseColor = (col, fallback) => {
    if (typeof col === 'number') return col;
    if (typeof col === 'string') {
      const clean = col.replace('#', '');
      const parsed = parseInt(clean, 16);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return fallback;
  };

  const primaryHex = parseColor(color.primary, 0xc86a08);
  const sailHex    = parseColor(color.sail,    0xfff0c5);
  const accentHex  = parseColor(color.accent,  0x8e4208);

  const boat = new THREE.Group();
  boat.name = `Boat_Level_${safeLevel}`;

  const hullMat = new THREE.MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.52,
    metalness: 0.12,
  });
  const hullDarkMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.65,
    metalness: 0.15,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xe9a24a,
    roughness: 0.72,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x71330b,
    roughness: 0.8,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: sailHex,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const ropeMat = new THREE.LineBasicMaterial({
    color: 0x62300e,
    transparent: true,
    opacity: 0.7,
  });

  const add = (mesh) => {
    mesh.castShadow = !isRemote;
    mesh.receiveShadow = !isRemote;
    boat.add(mesh);
    return mesh;
  };

  // ── 1. Base Hull (squared stern with pointed bow along local -Z) ─────────
  const hull = add(new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.72, 3.8), hullMat));
  hull.position.set(0, 0.35, 0.5);

  const bow = add(new THREE.Mesh(new THREE.ConeGeometry(1.23, 1.45, 8), hullMat));
  bow.rotation.x = -Math.PI / 2;
  bow.position.set(0, 0.35, -2.12);

  const keel = add(new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.28, 3.9), hullDarkMat));
  keel.position.set(0, -0.02, 0.3);

  const deck = add(new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.18, 3.95), deckMat));
  deck.position.set(0, 0.78, 0.22);

  // Deck planking
  for (let z = -1.35; z <= 1.75; z += 0.38) {
    const plank = add(new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.025, 0.035), woodMat));
    plank.position.set(0, 0.885, z);
  }

  // Mast, boom, and yard
  const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 10), woodMat));
  mast.position.set(0, 3.05, 0.15);

  const boom = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.3, 8), woodMat));
  boom.rotation.z = Math.PI / 2;
  boom.position.set(0, 1.55, -0.15);

  const yard = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.55, 8), woodMat));
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, 4.45, 0.15);

  // Main sails
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

  // Rigging lines
  const rig = (from, to) => boat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), ropeMat));
  rig(new THREE.Vector3(0, 4.45, 0.15), new THREE.Vector3(-1.05, 0.95, -1.35));
  rig(new THREE.Vector3(0, 4.45, 0.15), new THREE.Vector3(1.05, 0.95, 1.65));

  // Motor and rear deck equipment
  const motor = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.42), hullDarkMat));
  motor.position.set(0, 1.08, 2.15);

  const crate = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), woodMat));
  crate.position.set(-0.48, 1.08, 0.9);

  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 14), sailMat));
  ring.position.set(0.6, 1.08, 0.65);
  ring.rotation.x = Math.PI / 2;

  // Headlight casing & lens
  const headlightCasing = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.35, 8), woodMat));
  headlightCasing.rotation.x = Math.PI / 2;
  headlightCasing.position.set(0, 0.98, -2.5);

  const headlightLens = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), new THREE.MeshBasicMaterial({ color: 0xffeaad })));
  headlightLens.rotation.x = Math.PI / 2;
  headlightLens.position.set(0, 0.98, -2.68);

  // SpotLight (only for local boat)
  if (!isRemote) {
    const HEADLIGHT_ANGLE = 0.30;
    const HEADLIGHT_RANGE = 55;
    const headlight = new THREE.SpotLight(0xfff0c8, 5.0, HEADLIGHT_RANGE, HEADLIGHT_ANGLE, 0.45, 1.1);
    headlight.position.set(0, 1.0, -2.7);
    headlight.castShadow = false;

    const target = new THREE.Object3D();
    target.position.set(0, 0.4, -30.0);
    boat.add(target);
    headlight.target = target;

    boat.add(headlight);
    boat.userData.headlight = headlight;

    const beamLen = HEADLIGHT_RANGE * 0.6;
    const beamRadius = Math.tan(HEADLIGHT_ANGLE) * beamLen;
    const beamGeom = new THREE.ConeGeometry(beamRadius, beamLen, 16, 1, true);
    beamGeom.translate(0, -beamLen / 2, 0);
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
    beamMesh.rotation.x = Math.PI / 2;
    beamMesh.position.set(0, 1.0, -2.7);
    boat.add(beamMesh);
    boat.userData.headlightBeam = beamMesh;
  }

  // ── 2. Level 2 Deck Fittings (Cabin, windshield, pontoons, rails, sorting bins) ──
  if (safeLevel >= 2) {
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x2b7780, roughness: 0.55, metalness: 0.15 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf4c76b, roughness: 0.6, metalness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9be5e5, roughness: 0.25, metalness: 0.2 });

    const cabin = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.66, 1.15), cabinMat));
    cabin.name = 'Cabin';
    cabin.position.set(0, 1.16, 0.05);

    const windshield = add(new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.34, 0.06), glassMat));
    windshield.name = 'Windshield';
    windshield.position.set(0, 1.38, -0.55);

    for (const x of [-1.2, 1.2]) {
      const pontoon = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 3.4, 8), trimMat));
      pontoon.name = 'Pontoon';
      pontoon.rotation.x = Math.PI / 2;
      pontoon.position.set(x, 0.16, 0.35);

      const rail = add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 3.2), trimMat));
      rail.name = 'Rail';
      rail.position.set(x * 0.78, 1.12, 0.25);
    }

    for (const z of [-0.65, 0.15, 0.95, 1.75]) {
      const bin = add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.55), cabinMat));
      bin.name = 'Bin';
      bin.position.set(z === 0.15 || z === 1.75 ? -0.72 : 0.72, 1.12, z);
    }
  }

  // ── 3. Level 3 Advanced Cruiser Fittings (Bridge, solar roof, radar mast, light strips) ──
  if (safeLevel >= 3) {
    const advancedMat = new THREE.MeshStandardMaterial({ color: 0x174b60, roughness: 0.42, metalness: 0.28 });
    const advancedTrimMat = new THREE.MeshStandardMaterial({ color: 0xf4c76b, roughness: 0.6, metalness: 0.2 });
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x254d73, roughness: 0.32, metalness: 0.45 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x48d8c5, emissive: 0x073e3b, roughness: 0.35, metalness: 0.2 });

    const bridge = add(new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.72, 1.05), advancedMat));
    bridge.name = 'Bridge';
    bridge.position.set(0, 1.58, 0.05);

    const roof = add(new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.12, 1.35), advancedTrimMat));
    roof.name = 'Roof';
    roof.position.set(0, 2.02, 0.05);

    for (const x of [-0.52, 0, 0.52]) {
      const panel = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.72), solarMat));
      panel.name = 'SolarPanels';
      panel.position.set(x, 2.11, 0.05);
    }

    const radar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.8, 8), advancedMat));
    radar.name = 'RadarMast';
    radar.position.set(0, 2.56, 0.05);

    const radarBar = add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.08), accentMat));
    radarBar.name = 'RadarBar';
    radarBar.position.set(0, 2.98, 0.05);

    for (const x of [-0.88, 0.88]) {
      const lightStrip = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 2.7), accentMat));
      lightStrip.position.set(x, 0.76, 0.38);
    }
  }

  // Tier scaling & metadata
  const tier = BoatConfig.LEVELS[safeLevel - 1] || BoatConfig.LEVELS[0];
  boat.scale.setScalar(tier.modelScale);
  boat.userData.level = safeLevel;
  boat.userData.maxSpeed = tier.speed;

  return boat;
}
