import React, { useState, useEffect, useRef } from 'react';

/**
 * DebugOverlay.jsx — F3 debug panel (Minecraft-inspired).
 *
 * Shows: FPS, Draw Calls, Triangles, Character Velocity, Camera Position,
 *        Grounded state, Active Entities, Loaded Assets.
 *
 * Toggle: press F3 in-game.
 *
 * Props:
 *   engineRef — ref to the active Engine instance
 */
export function DebugOverlay({ engineRef }) {
  const [visible,  setVisible]  = useState(false);
  const [stats,    setStats]    = useState(null);
  const frameRef   = useRef(null);
  const fpsCounter = useRef({ frames: 0, last: performance.now(), fps: 0 });

  // Toggle on F3
  useEffect(() => {
    const onKey = (e) => { if (e.code === 'F3') { e.preventDefault(); setVisible(v => !v); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Poll stats every frame only when visible
  useEffect(() => {
    if (!visible) { if (frameRef.current) cancelAnimationFrame(frameRef.current); return; }

    const tick = () => {
      const engine = engineRef?.current;
      if (!engine) { frameRef.current = requestAnimationFrame(tick); return; }

      // FPS counter
      const fc = fpsCounter.current;
      fc.frames++;
      const now = performance.now();
      if (now - fc.last >= 500) {
        fc.fps    = Math.round(fc.frames * 1000 / (now - fc.last));
        fc.frames = 0;
        fc.last   = now;
      }

      const renderer  = engine.renderer;
      const info      = renderer?.info;
      const char      = engine.character;
      const cam       = engine.camera;
      const assetMgr  = engine.assetManager;

      setStats({
        fps:         fc.fps,
        drawCalls:   info?.render?.calls   ?? 0,
        triangles:   info?.render?.triangles ?? 0,
        geometries:  info?.memory?.geometries ?? 0,
        textures:    info?.memory?.textures   ?? 0,
        velX:        char?.velocity?.x?.toFixed(2) ?? '—',
        velY:        char?.velocity?.y?.toFixed(2) ?? '—',
        velZ:        char?.velocity?.z?.toFixed(2) ?? '—',
        speed:       char?.speed?.toFixed(2) ?? '—',
        grounded:    char?.isGrounded ? 'YES' : 'NO',
        anim:        char?.currentStateName ?? '—',
        camX:        cam?.position?.x?.toFixed(1) ?? '—',
        camY:        cam?.position?.y?.toFixed(1) ?? '—',
        camZ:        cam?.position?.z?.toFixed(1) ?? '—',
        charX:       char?.position?.x?.toFixed(1) ?? '—',
        charY:       char?.position?.y?.toFixed(1) ?? '—',
        charZ:       char?.position?.z?.toFixed(1) ?? '—',
        colliders:   engine.colliders?.length ?? 0,
        trashLeft:   engine.trash?.trashes?.length ?? 0,
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [visible, engineRef]);

  if (!visible || !stats) return null;

  const Row = ({ label, value, highlight }) => (
    <div className="flex gap-3">
      <span className="text-slate-400 w-28 shrink-0">{label}</span>
      <span className={highlight ? 'text-yellow-300 font-bold' : 'text-white'}>{value}</span>
    </div>
  );

  const fps = stats.fps;
  const fpsColor = fps >= 55 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="absolute top-2 left-2 z-50 font-mono text-xs leading-5 pointer-events-none select-none">
      <div className="bg-black/75 backdrop-blur-sm text-white rounded-lg p-3 space-y-0.5 border border-white/10">

        {/* FPS — big and coloured */}
        <div className={`text-base font-bold mb-1 ${fpsColor}`}>{fps} FPS</div>

        <div className="border-t border-white/10 pt-1 mb-1" />

        <Row label="Draw Calls"  value={stats.drawCalls} />
        <Row label="Triangles"   value={stats.triangles.toLocaleString()} />
        <Row label="Geometries"  value={stats.geometries} />
        <Row label="Textures"    value={stats.textures} />

        <div className="border-t border-white/10 pt-1 mt-1 mb-1" />

        <Row label="Position"    value={`${stats.charX}, ${stats.charY}, ${stats.charZ}`} />
        <Row label="Velocity"    value={`${stats.velX}, ${stats.velY}, ${stats.velZ}`} />
        <Row label="Speed"       value={`${stats.speed} m/s`} />
        <Row label="Grounded"    value={stats.grounded} highlight={stats.grounded === 'NO'} />
        <Row label="Animation"   value={stats.anim} />

        <div className="border-t border-white/10 pt-1 mt-1 mb-1" />

        <Row label="Camera"      value={`${stats.camX}, ${stats.camY}, ${stats.camZ}`} />
        <Row label="Colliders"   value={stats.colliders} />
        <Row label="Trash left"  value={stats.trashLeft} />

        <div className="border-t border-white/10 pt-1 mt-1">
          <span className="text-slate-500">Press F3 to hide</span>
        </div>
      </div>
    </div>
  );
}
