import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * HeroScene.jsx — Landing-page hero backdrop.
 *
 * A tiny, stylized low-poly ocean scene that echoes the real game world:
 *  - flat-shaded teal ocean with gentle vertex waves,
 *  - the U-shaped harbour silhouette (quay, central pier, coral cranes,
 *    harbour building) standing in for the actual HarbourManager layout,
 *  - a chunky low-poly fishing boat bobbing at centre-stage,
 *  - a few floating trash bits (the game's core subject),
 *  - gentle parallax toward the pointer (desktop only).
 *
 * Performance constraints:
 *  - zero downloads (no textures/models — everything is THREE primitives),
 *  - DPR capped at 1.5, ~30 fps cap, `powerPreference: 'low-power'`,
 *  - paused when the tab is hidden, when scrolled off-screen, or when the
 *    parent reports an overlay (e.g. the game) is covering it,
 *  - fully disposed on unmount (no leaks when navigating into the game).
 */

// The game's shared harbour palette (mirrors HarbourManager materials).
const PAL = {
  concrete: 0xb9bdc2,
  stone: 0xa3a8ad,
  wood: 0xa06a3c,
  piling: 0x5d3a1e,
  crane: 0xc1492f,
  metal: 0x3c4043,
  building: 0xe8e4da,
  roof: 0x8a4a30,
  glass: 0x7fa8b8,
  sand: 0xd8b377,
  palm: 0x2e9d6f,
  boatHull: 0xe9f4f7,
  boatTrim: 0x0f86c4,
  boatCabin: 0xffffff,
  lamp: 0xf2a33c,
  trash: [0xd93a2f, 0xf2a33c, 0x4a6072, 0x19b89a],
};

// Sky gradient as a single always-behind quad — one draw call, no textures.
function makeSky() {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: {
      top: { value: new THREE.Color(0x0a2f4e) },
      horizon: { value: new THREE.Color(0x9fd9ef) },
    },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: [
      'uniform vec3 top;',
      'uniform vec3 horizon;',
      'void main(){',
      '  float t = smoothstep(0.0, 0.95, gl_FragCoord.y / 900.0);',
      '  gl_FragColor = vec4(mix(horizon, top, t), 1.0);',
      '}',
    ].join('\n'),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// Flat-shaded standard material helper (one material per colour, shared
// wherever possible by the callers below).
const mat = (c, r = 0.9) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: r, flatShading: true });

// Low-poly fishing boat — hull, wheelhouse, mast, deck crane with a hanging
// crate. Reads as the game's utility boat, not a product render.
function makeBoat() {
  const g = new THREE.Group();

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 5.6), mat(PAL.boatHull, 0.6));
  hull.position.y = 0.35;
  g.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), mat(PAL.boatHull, 0.6));
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.35, 3.9);
  g.add(bow);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.18, 5.64), mat(PAL.boatTrim, 0.5));
  stripe.position.y = 0.1;
  g.add(stripe);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 4.6), mat(PAL.wood, 0.9));
  deck.position.y = 0.78;
  g.add(deck);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.9), mat(PAL.boatCabin, 0.85));
  cabin.position.set(0, 1.45, -1.5);
  g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.14, 2.15), mat(PAL.boatTrim, 0.5));
  roof.position.set(0, 2.08, -1.5);
  g.add(roof);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.42, 1.92), mat(0x2e6e96, 0.25));
  glass.position.set(0, 1.62, -1.5);
  g.add(glass);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 6), mat(PAL.metal, 0.5));
  mast.position.set(0, 2.9, -1.5);
  g.add(mast);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(PAL.lamp, 0.4));
  lamp.position.set(0, 3.8, -1.5);
  g.add(lamp);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6), mat(PAL.metal, 0.5));
  post.position.set(-0.75, 1.5, 0.9);
  g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), mat(PAL.metal, 0.5));
  arm.position.set(-0.75, 2.2, 1.25);
  arm.rotation.x = 0.6;
  g.add(arm);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), mat(PAL.metal, 0.5));
  cable.position.set(-0.75, 1.55, 1.55);
  g.add(cable);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), mat(PAL.wood, 0.9));
  crate.position.set(-0.75, 0.95, 1.55);
  g.add(crate);

  for (const x of [-1.34, 1.34]) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.09, 6, 12), mat(0x2a2d31, 0.95));
    tire.rotation.y = Math.PI / 2;
    tire.position.set(x, 0.45, 0.4);
    g.add(tire);
  }

  g.userData.lamp = lamp;
  return g;
}

// Harbour silhouette on the horizon — the recognizable U-shaped quay with
// central pier, twin coral cranes, harbour building and a beach with palms.
function makeHarbour() {
  const g = new THREE.Group();

  const quay = new THREE.Mesh(new THREE.BoxGeometry(56, 2.4, 22), mat(PAL.concrete));
  quay.position.set(0, 1.0, -11);
  g.add(quay);

  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 2.4, 26), mat(PAL.stone));
    wing.position.set(s * 20, 1.0, 13);
    g.add(wing);
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 26), mat(PAL.metal, 0.6));
    fender.position.set(s * 14.9, 1.0, 13);
    g.add(fender);
    for (let z = 4; z <= 24; z += 5) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 6), mat(PAL.piling));
      p.position.set(s * 14.6, 0.2, z);
      g.add(p);
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 6), mat(PAL.piling));
      p2.position.set(s * 25.4, 0.2, z);
      g.add(p2);
    }
  }

  const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 20), mat(PAL.wood));
  pier.position.set(0, 1.0, 2);
  g.add(pier);

  const bldg = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 8), mat(PAL.building, 0.85));
  bldg.position.set(0, 5.2, -14);
  g.add(bldg);
  const bRoof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.7, 9), mat(PAL.roof));
  bRoof.position.set(0, 8.5, -14);
  g.add(bRoof);
  const band = new THREE.Mesh(new THREE.BoxGeometry(12.2, 1.3, 8.2), mat(PAL.glass, 0.3));
  band.position.set(0, 6.4, -14);
  g.add(band);

  for (const s of [-1, 1]) {
    const cx = s * 20;
    const cz = -14;
    const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 3), mat(PAL.stone));
    base.position.set(cx, 2.9, cz);
    g.add(base);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.3, 9, 1.3), mat(PAL.crane));
    tower.position.set(cx, 7.6, cz);
    g.add(tower);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.8), mat(PAL.metal, 0.5));
    cab.position.set(cx, 12.4, cz);
    g.add(cab);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(16, 0.7, 0.5), mat(PAL.crane));
    jib.position.set(cx - s * 8, 11.6, cz);
    g.add(jib);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.7, 0.5), mat(PAL.crane));
    counter.position.set(cx + s * 1.9, 11.6, cz);
    g.add(counter);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 4), mat(PAL.metal, 0.5));
    cable.position.set(cx - s * 15, 9.3, cz);
    g.add(cable);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 10), mat(PAL.metal, 0.5));
    hook.position.set(cx - s * 15, 6.8, cz);
    g.add(hook);
  }

  const beach = new THREE.Mesh(new THREE.BoxGeometry(58, 1.0, 5), mat(PAL.sand));
  beach.position.set(0, 0.3, -24);
  g.add(beach);
  for (const [px, pz] of [[-25, -25], [-21, -26.5], [24, -25], [20, -26.5]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 3.2, 6), mat(PAL.piling));
    trunk.position.set(px, 2.1, pz);
    trunk.rotation.z = (px < 0 ? 1 : -1) * 0.12;
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.6, 4), mat(PAL.palm));
      leaf.position.set(px + Math.sin(i * 1.25) * 0.7, 4.0, pz + Math.cos(i * 1.25) * 0.7);
      leaf.rotation.z = (i / 5) * Math.PI * 2;
      leaf.rotation.y = i * 1.25;
      g.add(leaf);
    }
  }

  return g;
}

// A handful of floating trash bits with slow bob/drift.
function makeTrash() {
  const items = [];
  const cols = PAL.trash;
  const geoms = [
    new THREE.BoxGeometry(0.5, 0.18, 0.35),
    new THREE.CylinderGeometry(0.22, 0.22, 0.55, 8),
    new THREE.TorusGeometry(0.28, 0.1, 6, 10),
  ];
  const spots = [
    [-9, 6], [7.5, 9], [-5, 16], [10, 18], [3, 22],
    [-12, 22], [13, 4], [-16, 8], [18, 12], [-20, 14],
  ];
  for (let i = 0; i < spots.length; i++) {
    const m = new THREE.Mesh(
      geoms[i % geoms.length],
      mat(cols[i % cols.length], 0.85)
    );
    const [x, z] = spots[i];
    m.position.set(x, 0.12, z);
    m.rotation.y = (i * 2.399) % (Math.PI * 2);
    m.userData = {
      phase: (i * 1.7) % (Math.PI * 2),
      speed: 0.7 + (i % 4) * 0.2,
      amp: 0.07 + (i % 3) * 0.03,
      baseX: x,
    };
    items.push(m);
  }
  const group = new THREE.Group();
  items.forEach((m) => group.add(m));
  return { group, items };
}

export default function HeroScene({ paused = false }) {
  const mountRef = useRef(null);
  const [visible, setVisible] = useState(false); // lazy-mount gate
  const controlsRef = useRef(null); // { setPaused }
  const pausedRef = useRef(paused);

  // Lazy-mount: build the WebGL scene only once the hero nears the viewport.
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '250px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Build + run the scene once, when visible.
  useEffect(() => {
    if (!visible || !mountRef.current) return undefined;

    const mount = mountRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch (err) {
      return undefined; // no WebGL — keep the CSS gradient fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x9fd9ef, 60, 230);

    const camera = new THREE.PerspectiveCamera(
      45,
      (mount.clientWidth || 1) / (mount.clientHeight || 1),
      0.1,
      400
    );
    camera.position.set(0, 4.2, 26);
    camera.lookAt(0, 1.2, 0);

    scene.add(makeSky());

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    sun.position.set(-30, 40, 25);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x0b4d74, 0.75));

    // Ocean — one low-poly plane, gentle CPU vertex waves.
    const seaGeo = new THREE.PlaneGeometry(360, 200, 48, 32);
    seaGeo.rotateX(-Math.PI / 2);
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x1587a8,
      roughness: 0.35,
      metalness: 0.1,
      flatShading: true,
    });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    scene.add(sea);
    const seaPos = seaGeo.attributes.position;
    const baseY = new Float32Array(seaPos.count);
    for (let i = 0; i < seaPos.count; i++) baseY[i] = seaPos.getY(i);

    const harbour = makeHarbour();
    harbour.position.set(0, 0, -58);
    scene.add(harbour);

    const boat = makeBoat();
    boat.position.set(0, 0.05, 4);
    boat.rotation.y = 0.35;
    scene.add(boat);

    const { group: trashGroup, items: trashItems } = makeTrash();
    scene.add(trashGroup);

    // ── Runtime plumbing ─────────────────────────────────────────────
    let disposed = false;
    let rafId = 0;
    let last = performance.now();
    let t = 0;
    let hidden = document.hidden;
    let onScreen = true; // hero visible in viewport

    const onVis = () => { hidden = document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    let io2 = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io2 = new IntersectionObserver(
        (entries) => { onScreen = entries.some((e) => e.isIntersecting); },
        { threshold: 0.02 }
      );
      io2.observe(mount);
    }

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e) => {
      if (e.pointerType === 'touch') return;
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const wave = (time) => {
      for (let i = 0; i < seaPos.count; i++) {
        const x = seaPos.getX(i);
        const z = seaPos.getZ(i);
        seaPos.setY(
          i,
          baseY[i]
            + Math.sin(x * 0.18 + time * 1.1) * 0.22
            + Math.cos(z * 0.15 + time * 0.9) * 0.18
            + Math.sin((x + z) * 0.09 + time * 0.6) * 0.12
        );
      }
      seaPos.needsUpdate = true;
    };

    // Respect prefers-reduced-motion: draw one static frame, no rAF loop.
    const reduceMotion =
      typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      wave(0);
      renderer.render(scene, camera);
      controlsRef.current = { setPaused: () => {} };
      return () => {
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
        scene.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        });
        seaGeo.dispose();
        seaMat.dispose();
        renderer.dispose();
        controlsRef.current = null;
      };
    }

    const renderFrame = (now) => {
      if (disposed) return;
      rafId = requestAnimationFrame(renderFrame);
      if (now - last < 1000 / 32) return; // ~30 fps cap
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (hidden || pausedRef.current || !onScreen) return; // still capped above

      t += dt;

      wave(t);

      boat.position.y = 0.05 + Math.sin(t * 1.6) * 0.09;
      boat.rotation.z = Math.sin(t * 1.1) * 0.035;
      boat.rotation.x = Math.cos(t * 1.4) * 0.02;
      boat.userData.lamp.material.color.setHex(
        Math.sin(t * 2.5) > 0 ? 0xf2a33c : 0xd8b377
      );

      for (const item of trashItems) {
        const u = item.userData;
        item.position.y = 0.12 + Math.sin(t * u.speed * 2 + u.phase) * u.amp;
        item.position.x = u.baseX + Math.sin(t * 0.25 + u.phase) * 0.5;
        item.rotation.y += 0.002;
        item.rotation.x = Math.sin(t * u.speed + u.phase) * 0.12;
      }

      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      camera.position.x = mouse.x * 1.4;
      camera.position.y = 4.2 - mouse.y * 0.7;
      camera.position.z = 26 + Math.sin(t * 0.12) * 0.8;
      camera.lookAt(mouse.x * 0.3, 1.1, 0);

      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(renderFrame);

    controlsRef.current = { setPaused: (v) => { pausedRef.current = v; } };

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
      if (io2) io2.disconnect();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      seaGeo.dispose();
      seaMat.dispose();
      renderer.dispose();
      controlsRef.current = null;
    };
  }, [visible]);

  // Overlay pause via prop.
  useEffect(() => {
    pausedRef.current = paused;
    if (controlsRef.current) controlsRef.current.setPaused(paused);
  }, [paused]);

  return (
    <div ref={mountRef} className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* CSS gradient fallback — also the fast first paint before WebGL */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #0a2f4e 0%, #0e4a73 42%, #1587a8 78%, #1fa3b8 100%)',
        }}
      />
      <div
        className="absolute -top-20 right-[8%] w-[34vmin] h-[34vmin] rounded-full anim-glow"
        style={{ background: 'radial-gradient(circle, rgba(255,225,160,0.4), transparent 70%)' }}
      />
    </div>
  );
}
