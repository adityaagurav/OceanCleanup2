import * as THREE from 'three';
import { buildBoatModel } from '../player/BoatModelBuilder.js';
import { ProceduralCharacter } from '../player/ProceduralCharacter.js';
import { BoatConfig } from '../config/BoatConfig.js';

/**
 * RemotePlayerManager.js — Multiplayer Boat Ownership & Lifecycle Manager
 *
 * Responsibilities:
 *  1. Shared Harbor Human Characters (state: 'DOCKED' / 'RETURNING'):
 *     - Spawns distinct procedural humanoid characters with custom color styling and nametags.
 *     - Synchronizes walking, running, idle, and fishing animations.
 *     - Inactive remote boats are NOT replicated at the harbor docks.
 *  2. Shared Ocean Boats (state: 'ACTIVE' / 'BOARDING'):
 *     - Spawns the owner's actual upgraded boat (Level 1, 2, or 3) when they launch.
 *     - Synchronizes position, heading, velocity, and floating wave physics.
 *     - Automatically despawns ocean representation when the owner docks or leaves.
 *  3. Individual Boat Ownership:
 *     - Each player sees ONLY their own boat at their dock berth.
 *     - Remote players are never confused with local player controls.
 *     - Disconnection and state transitions are strictly leak-free.
 */
const _lerpAngle = (curr, target, alpha) => {
  let diff = target - curr;
  diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return curr + diff * alpha;
};

export class RemotePlayerManager {
  constructor(scene, waveSampler) {
    this.scene = scene;
    this.waveSampler = waveSampler;

    // Root groups
    this.root = new THREE.Group();
    this.root.name = 'RemoteEntities';
    this.scene.add(this.root);

    // Map<playerId, RemoteEntityEntry>
    this.remoteEntities = new Map();

    // Backward-compatible remoteBoats map reference
    this.remoteBoats = this.remoteEntities;

    // Local player identity
    this.localPlayer = null;
    this.localPlayerId = null;
    this.localSocketId = null;
    this.localBoat = null;
    this.localNametagSprite = null;

    this._time = 0;
  }

  /**
   * Helper to verify if a player session represents the local player.
   * @param {object} player
   * @returns {boolean}
   */
  _isLocalPlayer(player) {
    if (!player) return false;
    const pid = player.playerId || player.id;
    if (this.localPlayer && (this.localPlayer.playerId === pid || this.localPlayer.id === pid)) return true;
    if (this.localPlayerId && pid === this.localPlayerId) return true;
    if (this.localSocketId && player.socketId && player.socketId === this.localSocketId) return true;
    if (this.localPlayer?.socketId && player.socketId && player.socketId === this.localPlayer.socketId) return true;
    return false;
  }

  /**
   * Set or update local player identity and attach the distinctive "YOU" badge.
   * @param {object} player - Local player session from server
   * @param {THREE.Object3D} localBoat - The local player's 3D boat mesh
   */
  setLocalPlayer(player, localBoat) {
    if (!player) return;
    this.localPlayer = player;
    this.localPlayerId = player.playerId || player.id;
    this.localSocketId = player.socketId;
    this.localBoat = localBoat;

    // Safety: if a remote entity was spawned for local player earlier, clean it up
    if (this.localPlayerId && this.remoteEntities.has(this.localPlayerId)) {
      this.removePlayer(this.localPlayerId);
    }

    if (!localBoat) return;

    // Remove existing local nametag if any
    if (this.localNametagSprite) {
      if (this.localNametagSprite.parent) {
        this.localNametagSprite.parent.remove(this.localNametagSprite);
      }
      this._disposeSprite(this.localNametagSprite);
      this.localNametagSprite = null;
    }

    // Create distinctive golden/cyan "⭐ YOU - [Username]" nametag above local boat mast
    const sprite = this._createNametagSprite(player.username, '#38bdf8', true);
    sprite.position.set(0, 5.2, 0.15);
    localBoat.add(sprite);
    this.localNametagSprite = sprite;
  }

  /**
   * Add a remote player, creating their human character and ocean boat representation.
   * Inactive boats remain hidden while the player is on foot at the harbor.
   * @param {object} player - Player session object
   */
  addPlayer(player) {
    if (!player || (!player.playerId && !player.id)) return;
    const playerId = player.playerId || player.id;

    // Strictly ensure local player is NEVER spawned as a remote entity
    if (this._isLocalPlayer(player)) return;

    if (this.remoteEntities.has(playerId)) {
      this.updatePlayer(player);
      return;
    }

    const primaryColor = player.color?.primary || '#38bdf8';
    const accentColor = player.color?.accent || '#0891b2';
    const primaryHex = parseInt(primaryColor.replace('#', ''), 16) || 0x38bdf8;
    const accentHex = parseInt(accentColor.replace('#', ''), 16) || 0x0891b2;

    const initialPos = player.transform || player.berth || { x: 0, y: 1.5, z: -2, yaw: 0 };
    const x = initialPos.x ?? 0;
    const y = initialPos.y ?? 1.5;
    const z = initialPos.z ?? -2;
    const yaw = initialPos.yaw ?? 0;

    // ── 1. Human Character for Harbor Mode (state: 'DOCKED') ──────────────
    const characterGroup = new THREE.Group();
    characterGroup.name = `RemoteChar_${playerId}`;
    characterGroup.position.set(x, y, z);
    characterGroup.rotation.y = yaw;

    const proceduralChar = new ProceduralCharacter({
      shirtColor: primaryHex,
      packColor: accentHex,
    });
    characterGroup.add(proceduralChar.root);

    const charNametag = this._createNametagSprite(player.username, primaryColor, false);
    charNametag.position.set(0, 2.35, 0); // Above character's head
    charNametag.scale.set(2.4, 0.6, 1.0);
    characterGroup.add(charNametag);

    // ── 2. Upgraded 3D Boat for Ocean Mode (state: 'ACTIVE') ─────────────
    const boatLevel = Math.max(1, Math.min(3, Number(player.boatLevel) || 1));
    const boatGroup = new THREE.Group();
    boatGroup.name = `RemoteBoat_${playerId}`;
    boatGroup.position.set(x, y, z);
    boatGroup.rotation.y = yaw;

    const boatMesh = buildBoatModel(boatLevel, {
      color: player.color,
      isRemote: true,
    });
    boatGroup.add(boatMesh);

    const boatNametag = this._createNametagSprite(player.username, primaryColor, false);
    boatNametag.position.set(0, 5.2, 0.15); // Above boat mast
    boatNametag.scale.set(3.2, 0.8, 1.0);
    boatGroup.add(boatNametag);

    // ── 3. Initial Visibility based on Boat Lifecycle State ───────────────
    const state = player.state || 'DOCKED';
    const isSailing = state === 'ACTIVE' || state === 'BOARDING';

    characterGroup.visible = !isSailing;
    boatGroup.visible = isSailing;

    this.root.add(characterGroup);
    this.root.add(boatGroup);

    console.log(
      `[RemotePlayerManager] Registered remote player "${player.username}" (${playerId}) | State: ${state} | Boat Level: ${boatLevel} | Harbor Char: ${!isSailing} | Ocean Boat: ${isSailing}`
    );

    this.remoteEntities.set(playerId, {
      player,
      state,
      boatLevel,
      characterGroup,
      proceduralChar,
      charNametag,
      boatGroup,
      boatMesh,
      boatNametag,
      targetPos: new THREE.Vector3(x, y, z),
      targetYaw: yaw,
      currentPos: new THREE.Vector3(x, y, z),
      get basePos() { return this.currentPos; },
      set basePos(v) { this.currentPos = v; },
      currentYaw: yaw,
      speed: initialPos.speed || 0,
      animState: initialPos.animState || 'Idle',
      deflectionVx: 0,
      deflectionVz: 0,
      deflectionYawRate: 0,
      phaseOffset: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Update existing remote player properties and sync boat upgrade model if changed.
   * @param {object} player
   */
  updatePlayer(player) {
    const playerId = player.playerId || player.id;
    const entry = this.remoteEntities.get(playerId);
    if (!entry) return;

    entry.player = { ...entry.player, ...player };

    if (player.boatLevel && player.boatLevel !== entry.boatLevel) {
      this._rebuildBoatModel(entry, player.boatLevel);
    }
    if (player.state && player.state !== entry.state) {
      this.handlePlayerState({
        playerId,
        state: player.state,
        boatLevel: player.boatLevel,
        transform: player.transform,
      });
    }
    // Only accept transform from periodic players:list if we have not received live packets recently
    if (player.transform && (!entry.lastLivePacketTime || Date.now() - entry.lastLivePacketTime > 2500)) {
      this.handlePlayerMove({ playerId, ...player.transform });
    }
  }

  /**
   * Rebuild the 3D boat model when the owner upgrades their boat tier.
   */
  _rebuildBoatModel(entry, newLevel) {
    const level = Math.max(1, Math.min(3, Number(newLevel) || 1));
    entry.boatLevel = level;

    // Remove old boat mesh from boatGroup
    if (entry.boatMesh) {
      entry.boatGroup.remove(entry.boatMesh);
      this._disposeObject(entry.boatMesh);
    }

    // Build new upgraded model matching exact tier
    const newMesh = buildBoatModel(level, {
      color: entry.player.color,
      isRemote: true,
    });
    entry.boatMesh = newMesh;
    entry.boatGroup.add(newMesh);

    console.log(`[RemotePlayerManager] Rebuilt remote boat for "${entry.player.username}" to Level ${level}`);
  }

  /**
   * Handle high-frequency movement update from another player.
   * @param {object} data - { playerId, x, y, z, yaw, speed, animState, state, boatLevel }
   */
  handlePlayerMove(data) {
    if (!data || !data.playerId) return;
    if (this._isLocalPlayer(data)) return;

    const entry = this.remoteEntities.get(data.playerId);
    if (!entry) return;

    entry.lastLivePacketTime = Date.now();

    const t = data.transform || data;
    if (typeof t.x === 'number' && typeof t.z === 'number') {
      const inCooldown = entry.collisionCooldown && Date.now() < entry.collisionCooldown;
      if (inCooldown && entry.collisionPos) {
        // Prevent stale in-flight packet from snapping remote boat back into collision
        const distFromCollision = Math.hypot(t.x - entry.collisionPos.x, t.z - entry.collisionPos.z);
        if (distFromCollision < 0.8) {
          entry.targetPos.set(entry.collisionPos.x, t.y ?? entry.targetPos.y, entry.collisionPos.z);
        } else {
          entry.targetPos.set(t.x, t.y ?? entry.targetPos.y, t.z);
        }
      } else {
        entry.targetPos.set(t.x, t.y ?? entry.targetPos.y, t.z);
      }
    }
    if (typeof t.yaw === 'number') {
      entry.targetYaw = t.yaw;
    }
    if (typeof t.speed === 'number') {
      entry.speed = t.speed;
    }
    if (t.animState) {
      entry.animState = t.animState;
    }
    if (data.boatLevel && data.boatLevel !== entry.boatLevel) {
      this._rebuildBoatModel(entry, data.boatLevel);
    }
    if (data.state && data.state !== entry.state) {
      this.handlePlayerState({ playerId: data.playerId, state: data.state, transform: t });
    }
  }

  /**
   * Handle discrete lifecycle state transition (DOCKED, BOARDING, ACTIVE, RETURNING).
   * @param {object} data - { playerId, state, boatLevel, transform }
   */
  handlePlayerState(data) {
    if (!data || !data.playerId) return;
    if (this._isLocalPlayer(data)) return;

    const entry = this.remoteEntities.get(data.playerId);
    if (!entry) return;

    const oldState = entry.state;
    const newState = data.state;
    entry.state = newState;

    if (data.boatLevel && data.boatLevel !== entry.boatLevel) {
      this._rebuildBoatModel(entry, data.boatLevel);
    }

    if (data.transform) {
      const t = data.transform;
      if (typeof t.x === 'number' && typeof t.z === 'number') entry.targetPos.set(t.x, t.y ?? entry.targetPos.y, t.z);
      if (typeof t.yaw === 'number') entry.targetYaw = t.yaw;
      if (typeof t.speed === 'number') entry.speed = t.speed;
      if (t.animState) entry.animState = t.animState;
    }

    // Toggle representations based on boat lifecycle state
    const isSailing = newState === 'ACTIVE' || newState === 'BOARDING';

    entry.characterGroup.visible = !isSailing;
    entry.boatGroup.visible = isSailing;

    // Snap positions during state transition to avoid unwanted lerp drifts
    if (oldState !== newState) {
      entry.currentPos.copy(entry.targetPos);
      entry.currentYaw = entry.targetYaw;
      if (isSailing) {
        entry.boatGroup.position.set(entry.currentPos.x, entry.currentPos.y, entry.currentPos.z);
        entry.boatGroup.rotation.y = entry.currentYaw;
      } else {
        entry.characterGroup.position.set(entry.currentPos.x, entry.currentPos.y, entry.currentPos.z);
        entry.characterGroup.rotation.y = entry.currentYaw;
      }
    }

    console.log(
      `[RemotePlayerManager] Remote player "${entry.player.username}" state: ${oldState} -> ${newState} | Boat visible: ${isSailing} | Char visible: ${!isSailing}`
    );
  }

  /**
   * Phase 3B: Handle boat-to-boat collision update from server or local physics.
   * Updates remote boat's target position, deflection velocity, and speed.
   * @param {object} data - { boatA, boatB, normal, depth, impulse }
   */
  handleBoatCollision(data) {
    if (!data) return;

    const processBoat = (b) => {
      if (!b || !b.playerId) return;
      if (this._isLocalPlayer({ playerId: b.playerId })) return;

      const entry = this.remoteEntities.get(b.playerId);
      if (!entry) return;

      if (typeof b.x === 'number' && typeof b.z === 'number') {
        entry.targetPos.set(b.x, entry.targetPos.y, b.z);
        // Immediately separate to prevent persistent penetration
        entry.currentPos.set(b.x, entry.currentPos.y, b.z);
        if (entry.boatGroup) {
          entry.boatGroup.position.x = b.x;
          entry.boatGroup.position.z = b.z;
        }
        entry.collisionCooldown = Date.now() + 250;
        entry.collisionPos = { x: b.x, z: b.z };
      }
      if (typeof b.yaw === 'number') {
        entry.targetYaw = b.yaw;
      }
      if (typeof b.speed === 'number') {
        entry.speed = b.speed;
      }
      if (typeof b.deflectionVx === 'number' && typeof b.deflectionVz === 'number') {
        entry.deflectionVx = b.deflectionVx;
        entry.deflectionVz = b.deflectionVz;
      }
      if (typeof b.yawDeflectionRate === 'number') {
        entry.deflectionYawRate = b.yawDeflectionRate;
      }
    };

    processBoat(data.boatA);
    processBoat(data.boatB);
  }

  /**
   * Phase 3B: Get all remote boats actively sailing in the ocean.
   * Excludes docked or returning boats.
   * @returns {Array<object>}
   */
  getActiveOceanBoats() {
    const list = [];
    for (const [playerId, entry] of this.remoteEntities.entries()) {
      if (entry.state === 'ACTIVE' || entry.state === 'BOARDING') {
        list.push({
          id: playerId,
          playerId,
          x: entry.currentPos.x,
          z: entry.currentPos.z,
          yaw: entry.currentYaw,
          speed: entry.speed,
          level: entry.boatLevel || 1,
          mass: entry.mass || (BoatConfig.COLLISION?.MASS_BY_LEVEL[(entry.boatLevel || 1) - 1] || 1200),
          deflectionVx: entry.deflectionVx || 0,
          deflectionVz: entry.deflectionVz || 0,
        });
      }
    }
    return list;
  }

  /**
   * Remove a remote player and dispose all 3D assets and nametags.
   * @param {string} playerId
   */
  removePlayer(playerId) {
    const entry = this.remoteEntities.get(playerId);
    if (!entry) return;

    console.log(`[RemotePlayerManager] Removing player and assets for: ${playerId}`);

    // Remove from scene graph
    this.root.remove(entry.characterGroup);
    this.root.remove(entry.boatGroup);

    // Dispose character
    entry.proceduralChar?.dispose();
    if (entry.charNametag) this._disposeSprite(entry.charNametag);

    // Dispose boat
    if (entry.boatGroup) this._disposeObject(entry.boatGroup);
    if (entry.boatNametag) this._disposeSprite(entry.boatNametag);

    this.remoteEntities.delete(playerId);
  }

  /**
   * Synchronize all remote entities against the active server player list.
   * @param {Array<object>} playersList
   * @param {string} localPlayerId
   */
  syncPlayers(playersList = [], localPlayerId = null) {
    if (localPlayerId) {
      this.localPlayerId = localPlayerId;
    }
    const activeRemoteIds = new Set();

    playersList.forEach((player) => {
      const pid = player.playerId || player.id;
      if (!pid) return;
      if (this._isLocalPlayer(player) || (localPlayerId && pid === localPlayerId)) {
        return;
      }
      activeRemoteIds.add(pid);

      if (!this.remoteEntities.has(pid)) {
        this.addPlayer(player);
      } else {
        this.updatePlayer(player);
      }
    });

    // Remove any players who have left the session
    for (const [playerId] of this.remoteEntities.entries()) {
      if (!activeRemoteIds.has(playerId)) {
        this.removePlayer(playerId);
      }
    }
  }

  /**
   * Per-frame render update — drives remote character walking animations and remote boat ocean physics.
   * @param {number} fd - Frame delta in seconds
   */
  update(fd) {
    this._time += fd;
    if (!this.remoteEntities || this.remoteEntities.size === 0) return;

    for (const [, entry] of this.remoteEntities.entries()) {
      try {
        const { state, currentPos, targetPos } = entry;

        // Teleport if distance is abnormally large (e.g. spawn / rebase shift)
        if (currentPos.distanceTo(targetPos) > 35) {
          currentPos.copy(targetPos);
          entry.currentYaw = entry.targetYaw;
        }

        if (state === 'ACTIVE' || state === 'BOARDING') {
          // ── Remote Boat Ocean Physics & Interpolation ──────────────────
          // Integrate deflection push velocity if present
          if (entry.deflectionVx || entry.deflectionVz) {
            currentPos.x += entry.deflectionVx * fd;
            currentPos.z += entry.deflectionVz * fd;
            const drag = Math.exp(-(BoatConfig.COLLISION?.WATER_DRAG_DEFLECTION || 3.6) * fd);
            entry.deflectionVx *= drag;
            entry.deflectionVz *= drag;
            if (Math.hypot(entry.deflectionVx, entry.deflectionVz) < 0.05) {
              entry.deflectionVx = 0;
              entry.deflectionVz = 0;
            }
          }

          currentPos.lerp(targetPos, Math.min(1, fd * 12));
          entry.currentYaw = _lerpAngle(entry.currentYaw, entry.targetYaw, Math.min(1, fd * 12));

          const x = currentPos.x;
          const z = currentPos.z;

          const waveH = this.waveSampler
            ? (typeof this.waveSampler.getHeight === 'function'
                ? this.waveSampler.getHeight(x, z, this._time)
                : (typeof this.waveSampler.sample === 'function' ? this.waveSampler.sample(x, z, this._time) : 0))
            : 0;

          const bob = Math.sin(this._time * 1.4 + entry.phaseOffset) * 0.04;
          entry.boatGroup.position.set(x, waveH + bob, z);
          entry.boatGroup.rotation.y = entry.currentYaw;
          entry.boatGroup.rotation.z = Math.sin(this._time * 1.1 + entry.phaseOffset) * 0.025;
          entry.boatGroup.rotation.x = Math.cos(this._time * 0.9 + entry.phaseOffset) * 0.015;
        } else {
          // ── Remote Human Character Harbor Walk & Animation ─────────────
          currentPos.lerp(targetPos, Math.min(1, fd * 14));
          entry.currentYaw = _lerpAngle(entry.currentYaw, entry.targetYaw, Math.min(1, fd * 14));

          entry.characterGroup.position.set(currentPos.x, currentPos.y, currentPos.z);
          entry.characterGroup.rotation.y = entry.currentYaw;

          // Drive walking/idle animation
          let anim = entry.animState || 'Idle';
          const speed = entry.speed || 0;
          if (speed > 0.4 && (anim === 'Idle' || !anim)) {
            anim = speed > 4.5 ? 'Run' : 'Walk';
          }
          entry.proceduralChar?.update(anim, speed, fd);
        }
      } catch (err) {
        console.error('[RemotePlayerManager] Error updating remote player:', err);
      }
    }
  }

  /**
   * Floating-origin rebase: shift all remote characters and boats by -offset.
   * @param {THREE.Vector3} offset
   */
  rebase(offset) {
    if (!offset) return;
    for (const [, entry] of this.remoteEntities.entries()) {
      if (entry.targetPos) entry.targetPos.sub(offset);
      if (entry.currentPos) entry.currentPos.sub(offset);
      if (entry.characterGroup) entry.characterGroup.position.sub(offset);
      if (entry.boatGroup) entry.boatGroup.position.sub(offset);
    }
  }

  /**
   * Create high-resolution billboard canvas sprite for player nametag.
   * @param {string} username
   * @param {string} colorHex
   * @param {boolean} isLocal
   */
  _createNametagSprite(username, colorHex = '#38bdf8', isLocal = false) {
    if (typeof document === 'undefined') {
      return new THREE.Object3D();
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, 512, 128);

      const w = 480;
      const h = 88;
      const x = (512 - w) / 2;
      const y = (128 - h) / 2;
      const r = 26;

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

      ctx.fillStyle = isLocal ? 'rgba(7, 16, 38, 0.92)' : 'rgba(10, 25, 47, 0.88)';
      ctx.fill();

      ctx.lineWidth = isLocal ? 6 : 4;
      ctx.strokeStyle = isLocal ? '#38bdf8' : (colorHex || '#38bdf8');
      ctx.stroke();

      ctx.textBaseline = 'middle';
      if (isLocal) {
        ctx.fillStyle = '#fde047'; // Gold star
        ctx.font = 'bold 36px "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('⭐ YOU', x + 24, y + h / 2);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`· ${username}`, x + 160, y + h / 2);
      } else {
        ctx.beginPath();
        ctx.arc(x + 40, y + h / 2, 12, 0, Math.PI * 2);
        ctx.fillStyle = colorHex || '#38bdf8';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(username, x + 68, y + h / 2);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.2, 0.8, 1.0);
    sprite.userData = { canvas, texture, material: spriteMat };

    return sprite;
  }

  _disposeSprite(sprite) {
    if (!sprite) return;
    if (sprite.material?.map) {
      if (sprite.material.map.image) sprite.material.map.image = null;
      sprite.material.map.dispose();
    }
    if (sprite.material) sprite.material.dispose();
    if (sprite.userData?.canvas) {
      sprite.userData.canvas.width = 1;
      sprite.userData.canvas.height = 1;
      sprite.userData.canvas = null;
    }
    sprite.userData = null;
  }

  _disposeObject(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.isMesh || child.isLine || child.isSprite) {
        if (child.geometry) child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
  }

  /**
   * Cleanup everything on shutdown
   */
  dispose() {
    for (const [playerId] of this.remoteEntities.entries()) {
      this.removePlayer(playerId);
    }
    this.remoteEntities.clear();

    if (this.localNametagSprite) {
      if (this.localNametagSprite.parent) {
        this.localNametagSprite.parent.remove(this.localNametagSprite);
      }
      this._disposeSprite(this.localNametagSprite);
      this.localNametagSprite = null;
    }

    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
  }
}
