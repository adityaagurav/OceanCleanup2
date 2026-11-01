import * as THREE from 'three';
import { computeLeaderboardSections } from '../multiplayer/LeaderboardDisplay.js';

/**
 * LeaderboardBoard.js — The physical 3D "RECYCLING LEADERS" board standing in
 * the harbor (mounted beside the pier entrance, on the rear platform).
 *
 * Style matches the harbor's low-poly look and the existing RECYCLING sign:
 * dark navy panel, aqua frame accent (#19b89a), timber piles, canvas face in
 * the "Outfit"/system-ui font family used everywhere else.
 *
 * Content (see LeaderboardDisplay.computeLeaderboardSections):
 *   Section 1 — Top 5 players of the session (rank, username, points).
 *   Section 2 — the local player's own rank below the divider, only when
 *               they are OUTSIDE the Top 5 (never shown twice; inside the
 *               Top 5 their row is highlighted instead).
 *
 * Updates are EVENT-DRIVEN (`update(entries, localPlayerId)` is called when a
 * `leaderboard:update` broadcast arrives) and skipped entirely when the data
 * is unchanged — nothing here ever runs per frame.
 */
export class LeaderboardBoard {
  /** Canvas resolution (2×-ish for crisp text at reading distance). */
  static CANVAS_W = 640;
  static CANVAS_H = 416;

  /**
   * @param {THREE.Object3D} parent — harbour root (rebase moves it along)
   * @param {THREE.Mesh[]} wallColliders — character blockers
   * @param {{x?: number, y?: number, z?: number, rotationY?: number}} [position]
   */
  constructor(parent, wallColliders = [], position = {}) {
    this.root = new THREE.Group();
    this.root.name = 'LeaderboardBoard';
    this.root.position.set(position.x ?? -6.5, position.y ?? 1.2, position.z ?? -5);
    this.root.rotation.y = position.rotationY ?? 1.05; // faces the spawn / pier approach
    parent.add(this.root);

    const navy = new THREE.MeshStandardMaterial({ color: 0x0d2b40, roughness: 0.75 });
    const aqua = new THREE.MeshStandardMaterial({ color: 0x19b89a, roughness: 0.65 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x5d3a1e, roughness: 1 });
    this._materials = [navy, aqua, timber];

    // ── Timber piles ────────────────────────────────────────────────────
    const postGeo = new THREE.BoxGeometry(0.2, 2.4, 0.2);
    this._geometries = [postGeo];
    for (const x of [-2.1, 2.1]) {
      const post = new THREE.Mesh(postGeo, timber);
      post.position.set(x, 1.2, 0);
      post.castShadow = true;
      this.root.add(post);
      wallColliders.push(post);
    }

    // ── Aqua rim (shows as a thin frame around the navy panel) ──────────
    const rimGeo = new THREE.BoxGeometry(4.8, 3.1, 0.1);
    this._geometries.push(rimGeo);
    const rim = new THREE.Mesh(rimGeo, aqua);
    rim.position.set(0, 2.75, 0);
    rim.castShadow = true;
    this.root.add(rim);

    // ── Navy panel ──────────────────────────────────────────────────────
    const panelGeo = new THREE.BoxGeometry(4.66, 2.96, 0.14);
    this._geometries.push(panelGeo);
    const panel = new THREE.Mesh(panelGeo, navy);
    panel.position.set(0, 2.75, 0.02);
    panel.castShadow = true;
    this.root.add(panel);
    wallColliders.push(panel);

    // ── Canvas face ─────────────────────────────────────────────────────
    this._texture = null;
    this._ctx = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = LeaderboardBoard.CANVAS_W;
      canvas.height = LeaderboardBoard.CANVAS_H;
      this._ctx = canvas.getContext('2d');
      this._texture = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) this._texture.encoding = THREE.sRGBEncoding;

      const faceGeo = new THREE.PlaneGeometry(4.5, 2.84);
      this._geometries.push(faceGeo);
      const faceMat = new THREE.MeshStandardMaterial({ map: this._texture, roughness: 0.7 });
      this._materials.push(faceMat);
      const face = new THREE.Mesh(faceGeo, faceMat);
      face.position.set(0, 2.75, 0.095); // just in front of the panel
      this.root.add(face);

      drawLeaderboard(this._ctx, LeaderboardBoard.CANVAS_W, LeaderboardBoard.CANVAS_H, {
        top5: [],
        personal: null,
        isEmpty: true,
      });
      this._texture.needsUpdate = true;
    }

    this._signature = null;
  }

  /**
   * Apply a leaderboard broadcast. No-op when the data matches what is
   * already displayed, so identical re-broadcasts cost nothing.
   * @param {Array<{rank:number,playerId:string,username:string,points:number}>} entries
   * @param {string|null} localPlayerId
   * @returns {boolean} true when the board was actually redrawn
   */
  update(entries, localPlayerId = null) {
    const sections = computeLeaderboardSections(entries, localPlayerId);
    const sig = JSON.stringify([
      sections.top5.map((e) => [e.rank, e.username, e.points, e.isYou]),
      sections.personal ? [sections.personal.rank, sections.personal.username, sections.personal.points] : null,
    ]);
    if (sig === this._signature) return false;
    this._signature = sig;

    if (this._ctx) {
      drawLeaderboard(this._ctx, LeaderboardBoard.CANVAS_W, LeaderboardBoard.CANVAS_H, sections);
      this._texture.needsUpdate = true;
    }
    return true;
  }

  dispose() {
    if (this._texture) {
      this._texture.dispose();
      this._texture = null;
    }
    for (const g of this._geometries) g.dispose();
    for (const m of this._materials) {
      m.map?.dispose();
      m.dispose();
    }
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

/**
 * Paint the leaderboard face onto a 2D context (kept pure & ctx-driven so
 * Node tests can smoke-test rendering with a stub context).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ top5: Array<object>, personal: object|null, isEmpty: boolean }} sections
 */
export function drawLeaderboard(ctx, w, h, sections) {
  if (!ctx) return;
  const font = '"Outfit", system-ui, sans-serif';

  // Background
  ctx.fillStyle = '#0a2233';
  ctx.fillRect(0, 0, w, h);

  // Title strip
  const titleH = 56;
  ctx.fillStyle = '#19b89a';
  roundRect(ctx, 12, 12, w - 24, titleH, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 32px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♻ RECYCLING LEADERS', w / 2, 12 + titleH / 2 + 2);

  const { top5 = [], personal = null, isEmpty = false } = sections;
  const rowH = 46;
  const rowTop = 82;

  if (isEmpty || top5.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 24px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText('No points yet —', w / 2, rowTop + 60);
    ctx.fillText('recycle trash to rank up!', w / 2, rowTop + 96);
    return;
  }

  // ── Section 1: Top 5 ────────────────────────────────────────────────
  for (let i = 0; i < top5.length; i++) {
    const e = top5[i];
    const y = rowTop + i * rowH;
    const isYou = !!e.isYou;

    ctx.fillStyle = isYou ? 'rgba(253,224,71,0.16)' : (i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)');
    roundRect(ctx, 20, y, w - 40, rowH - 6, 8);
    ctx.fill();
    if (isYou) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      roundRect(ctx, 20, y, w - 40, rowH - 6, 8);
      ctx.stroke();
    }

    // Rank + username (left)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isYou ? '#fde047' : '#ffffff';
    ctx.font = `${isYou ? 800 : 600} 25px ${font}`;
    const label = `${e.rank}. ${truncate(e.username, 16)}${isYou ? ' (YOU)' : ''}`;
    ctx.fillText(label, 36, y + (rowH - 6) / 2);

    // Points (right)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7dd3fc';
    ctx.font = `800 25px ${font}`;
    ctx.fillText(`${formatPts(e.points)} pts`, w - 36, y + (rowH - 6) / 2);
  }

  // ── Section 2: personal ranking (only when OUTSIDE the Top 5) ───────
  if (personal) {
    const y = rowTop + 5 * rowH + 10;

    // Dashed separator
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(w - 24, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const py = y + 10;
    ctx.fillStyle = 'rgba(253,224,71,0.16)';
    roundRect(ctx, 20, py, w - 40, rowH - 2, 8);
    ctx.fill();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    roundRect(ctx, 20, py, w - 40, rowH - 2, 8);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fde047';
    ctx.font = '800 25px ' + font;
    ctx.fillText(`${personal.rank}. YOU`, 36, py + (rowH - 2) / 2);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '800 25px ' + font;
    ctx.fillText(`${formatPts(personal.points)} pts`, w - 36, py + (rowH - 2) / 2);
  }
}

// ── small helpers ─────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncate(str, max) {
  const s = String(str ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatPts(n) {
  return Number(n || 0).toLocaleString('en-US');
}
