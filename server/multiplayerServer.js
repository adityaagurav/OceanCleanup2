import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { BoatCollisionSystem } from '../src/physics/BoatCollisionSystem.js';
import { LeaderboardStore } from './LeaderboardStore.js';
import { ReportStore } from './ReportStore.js';

export const DEFAULT_ADMIN_CODE = process.env.ADMIN_CODE || process.env.ADMIN_ACCESS_CODE || 'oceanAdmin2026';

// ── Recycling points (server-authoritative) ────────────────────────────────
// Points are ONLY earned by recycling garbage items at the harbour, always
// calculated HERE from the validated recycled item count — clients submit a
// transaction, never a balance. Coins (client-side, ProgressionConfig) stay
// completely separate from points.
export const RECYCLE_POINTS_PER_ITEM = 10; // 1 recycled item = 10 pts
export const MAX_RECYCLE_ITEMS = 15;       // Level-3 cargo capacity is the max haul (15 items)
export const RECYCLE_MIN_INTERVAL_MS = 1000; // ≥ the unload animation (1.3 s) between awards

// Aliases for backwards compatibility with any existing imports
export const RECYCLE_POINTS_PER_KG = RECYCLE_POINTS_PER_ITEM;
export const MAX_RECYCLE_KG = MAX_RECYCLE_ITEMS;

/**
 * Visual color themes for distinct player boats.
 */
export const COLOR_PALETTE = [
  { name: 'Cyan Wave', primary: '#06b6d4', sail: '#ecfeff', accent: '#0891b2' },
  { name: 'Emerald Bay', primary: '#10b981', sail: '#ecfdf5', accent: '#059669' },
  { name: 'Amber Reef', primary: '#f59e0b', sail: '#fffbeb', accent: '#d97706' },
  { name: 'Coral Rose', primary: '#f43f5e', sail: '#fff1f2', accent: '#e11d48' },
  { name: 'Violet Tide', primary: '#8b5cf6', sail: '#f5f3ff', accent: '#7c3aed' },
  { name: 'Ocean Blue', primary: '#3b82f6', sail: '#eff6ff', accent: '#2563eb' },
  { name: 'Teal Coast', primary: '#14b8a6', sail: '#f0fdf4', accent: '#0d9488' },
  { name: 'Sunset Glow', primary: '#f97316', sail: '#fff7ed', accent: '#ea580c' },
];

/**
 * Designated mooring berths along the harbour pier & arms.
 * Local player spawns at (5.75, 0, 31). Remote boats moor in separate slips
 * so no boats ever overlap or clip.
 */
export const HARBOR_BERTHS = [
  { x: -5.75, y: 0, z: 31, yaw: 0 },         // Berth 1: Opposite central head face (-x)
  { x: 5.75, y: 0, z: 23, yaw: 0 },         // Berth 2: Central pier east side (z: 23)
  { x: -5.75, y: 0, z: 23, yaw: 0 },         // Berth 3: Central pier west side (z: 23)
  { x: 5.75, y: 0, z: 15, yaw: 0 },         // Berth 4: Central pier east side mid (z: 15)
  { x: -5.75, y: 0, z: 15, yaw: 0 },         // Berth 5: Central pier west side mid (z: 15)
  { x: 14.5, y: 0, z: 25, yaw: 0 },         // Berth 6: Right arm inner face (x: 14.5, z: 25)
  { x: -14.5, y: 0, z: 25, yaw: 0 },         // Berth 7: Left arm inner face (x: -14.5, z: 25)
  { x: 14.5, y: 0, z: 18, yaw: 0 },         // Berth 8: Right arm inner face mid (x: 14.5, z: 18)
  { x: -14.5, y: 0, z: 18, yaw: 0 },         // Berth 9: Left arm inner face mid (x: -14.5, z: 18)
];

const ADJECTIVES = ['Eco', 'Swift', 'Ocean', 'Tidal', 'Coral', 'Solar', 'Aqua', 'Wave', 'Brave', 'Clean'];
const NOUNS = ['Sailor', 'Captain', 'Skipper', 'Navigator', 'Ranger', 'Voyager', 'Pilot', 'Keeper', 'Hero', 'Rover'];

export function generateGuestName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}${noun}${num}`;
}

export function sanitizeUsername(rawName) {
  if (typeof rawName !== 'string') return '';
  return rawName
    .replace(/[^\w\s-]/g, '')
    .trim()
    .substring(0, 16);
}

/**
 * MultiplayerServer.js — Phase 1 & 2: Multiplayer Server for OceanCleanup.io
 *
 * Responsibilities:
 *  - Central HTTP & Socket.IO server listening on 0.0.0.0
 *  - Track active player sessions by unique socket ID
 *  - Broadcast connection and disconnection events
 *  - Assign unique player IDs, distinct boat colors, and dock berths
 *  - Sanitize custom usernames and handle duplicates gracefully
 *  - Broadcast player join/leave and active player list
 *  - Health check HTTP endpoint (/health)
 *  - Modular scaffolding for Phase 3 (movement/state) and Phase 4/5 (world sync)
 */
export class MultiplayerServer {
  constructor(options = {}) {
    this.port = options.port || Number(process.env.PORT) || 3001;
    this.host = options.host || process.env.HOST || '0.0.0.0';

    // Server-side collection of connected players: Map<socketId, PlayerSession>
    this.players = new Map();
    this._nextBerthIndex = 0;
    this._nextColorIndex = 0;

    // Lifetime recycling points (server-authoritative, survives disconnects;
    // file-backed in production via `leaderboardFile`, in-memory in tests).
    this._leaderboard = options.leaderboardStore || new LeaderboardStore({ file: options.leaderboardFile });

    // Admin authentication & persistent moderation reports store
    this.adminAccessCode = String(options.adminAccessCode || DEFAULT_ADMIN_CODE);
    this._reports = options.reportStore || new ReportStore({ file: options.reportsFile || options.reportsDataFile });

    // HTTP server for health check and Socket.IO handshake
    this.httpServer = http.createServer((req, res) => {
      this._handleHttpRequest(req, res);
    });

    // Socket.IO server with cross-origin support for LAN & local dev
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: (origin, callback) => callback(null, true), // Dynamic origin reflection allows credentials across LAN & local dev
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
      },
      pingTimeout: 20000,
      pingInterval: 10000,
      connectTimeout: 15000,
      transports: ['websocket', 'polling'],
    });

    this._setupSocketHandlers();

    // Phase 3B: Server-authoritative physics & boat-to-boat collision loop (30 Hz)
    this._physicsInterval = setInterval(() => this._tickPhysics(), 33);
  }

  /**
   * Return the total count of currently connected socket clients
   */
  getPlayerCount() {
    return this.players.size;
  }

  /**
   * Return map or array of all connected player sessions
   */
  getPlayers() {
    return Array.from(this.players.values());
  }

  /**
   * Check if a socket ID is registered
   */
  hasPlayer(socketId) {
    return this.players.has(socketId);
  }

  /**
   * Return an array of all active players who have completed the join flow
   */
  getJoinedPlayers() {
    return Array.from(this.players.values())
      .filter((p) => p.hasJoined)
      .map((p) => ({
        socketId: p.socketId,
        playerId: p.playerId,
        username: p.username,
        color: p.color,
        berth: p.berth,
        boatLevel: p.boatLevel || 1,
        state: p.state || 'DOCKED',
        transform: p.transform || {
          x: p.berth?.x ?? 0,
          y: p.berth?.y ?? 1.5,
          z: p.berth?.z ?? -2,
          yaw: p.berth?.yaw ?? 0,
          speed: 0,
          animState: 'Idle',
        },
      }));
  }

  /**
   * Return formatted player management data for all joined players (admin-only).
   */
  getAdminPlayersList() {
    return Array.from(this.players.values())
      .filter((p) => p.hasJoined)
      .map((p) => ({
        socketId: p.socketId,
        playerId: p.playerId,
        username: p.username,
        isAdmin: !!p.isAdmin,
        status: 'Online',
        boatLevel: p.boatLevel || 1,
        coins: p.coins || 0,
        points: p.points || 0,
        connectedAt: p.connectedAt,
      }));
  }

  /**
   * Broadcast real-time player updates to all authenticated admin sockets.
   */
  broadcastAdminUpdate() {
    this.io.to('admin_channel').emit('admin:players_update', this.getAdminPlayersList());
  }

  /**
   * Generate a random guest callsign guaranteed not to collide with an active player.
   */
  generateUniqueGuestName() {
    let name = generateGuestName();
    let attempts = 0;
    while (
      attempts < 50 &&
      Array.from(this.players.values()).some((p) => p.hasJoined && p.username.toLowerCase() === name.toLowerCase())
    ) {
      name = generateGuestName();
      attempts += 1;
    }
    return name;
  }

  /**
   * Validate requested username and admin credentials.
   * - Enforces case-insensitive uniqueness across active joined players.
   * - Reserves "admin" strictly for authenticated administrators.
   * - Rejects duplicates with an explicit error.
   */
  validateAndResolveUsername(requestedName, currentSocketId, adminCode) {
    const raw = typeof requestedName === 'string' ? requestedName.trim() : '';

    // Admin authentication
    if (raw.toLowerCase() === 'admin') {
      if (!adminCode || String(adminCode) !== this.adminAccessCode) {
        return { valid: false, error: 'invalid-admin-code', message: 'Invalid Admin Access Code' };
      }
      for (const [sId, p] of this.players.entries()) {
        if (p.hasJoined && sId !== currentSocketId && p.username.toLowerCase() === 'admin') {
          const oldSock = this.io?.sockets?.sockets?.get?.(sId);
          if (!oldSock || !oldSock.connected) {
            this.players.delete(sId);
          } else {
            return { valid: false, error: 'username-taken', message: 'Admin is already online' };
          }
        }
      }
      return { valid: true, username: 'Admin', isAdmin: true };
    }

    // Normal player
    let sanitized = sanitizeUsername(raw);
    if (sanitized.toLowerCase() === 'admin') {
      return { valid: false, error: 'reserved-username', message: 'The username "admin" is reserved' };
    }

    if (!sanitized || sanitized.length < 2) {
      sanitized = this.generateUniqueGuestName();
    } else {
      for (const [sId, p] of this.players.entries()) {
        if (p.hasJoined && sId !== currentSocketId && p.username.toLowerCase() === sanitized.toLowerCase()) {
          const oldSock = this.io?.sockets?.sockets?.get?.(sId);
          if (!oldSock || !oldSock.connected) {
            // Stale un-graceful disconnect: clean up so reconnecting player can claim their name
            this.players.delete(sId);
          } else {
            return { valid: false, error: 'username-taken', message: `Username "${sanitized}" is already taken` };
          }
        }
      }
    }

    return { valid: true, username: sanitized, isAdmin: false };
  }

  /**
   * Resolve a unique username among active joined players
   */
  resolveUniqueUsername(requestedName, currentSocketId) {
    const res = this.validateAndResolveUsername(requestedName, currentSocketId);
    if (res.valid) return res.username;
    let name = sanitizeUsername(requestedName) || generateGuestName();
    let suffix = 2;
    let candidate = `${name}_${suffix}`;
    while (
      Array.from(this.players.values()).some(
        (p) => p.hasJoined && p.socketId !== currentSocketId && p.username.toLowerCase() === candidate.toLowerCase()
      )
    ) {
      suffix += 1;
      candidate = `${name}_${suffix}`;
    }
    return candidate;
  }

  /**
   * Simple HTTP request router (health check & status)
   */
  _handleHttpRequest(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (origin !== '*') {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/health' || req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'OceanCleanup.io Multiplayer Server',
          version: '2.0.0-phase2',
          uptime: process.uptime(),
          playerCount: this.players.size,
          joinedPlayerCount: this.getJoinedPlayers().length,
          timestamp: Date.now(),
        })
      );
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OceanCleanup.io Multiplayer Server is running.');
  }

  /**
   * Socket.IO connection lifecycle and event routing
   */
  _setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      this._handleConnection(socket);
    });

    // Log low-level connection errors
    this.io.engine.on('connection_error', (err) => {
      console.warn(`[MultiplayerServer] Connection error from ${err.req?.socket?.remoteAddress}:`, err.message);
    });
  }

  /**
   * Handle incoming player socket connection
   */
  _handleConnection(socket) {
    const socketId = socket.id;
    const remoteAddress = socket.handshake.address || socket.conn?.remoteAddress || 'unknown';

    // Duplicate registration protection
    if (this.players.has(socketId)) {
      console.warn(`[MultiplayerServer] Duplicate connection attempt for socket ID: ${socketId}`);
      socket.disconnect(true);
      return;
    }

    const playerId = `p_${socketId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8)}`;
    const tempUsername = generateGuestName();

    // Register connected player session
    const playerSession = {
      socketId,
      playerId,
      username: tempUsername,
      hasJoined: false,
      color: null,
      berth: null,
      boatLevel: 1,
      state: 'DOCKED', // 'DOCKED' (in harbor on foot) | 'BOARDING' | 'ACTIVE' (in ocean sailing) | 'RETURNING'
      transform: { x: 0, y: 1.5, z: -2, yaw: 0, speed: 0, animState: 'Idle' },
      remoteAddress,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
    };

    this.players.set(socketId, playerSession);
    const playerCount = this.players.size;

    console.log(
      `[MultiplayerServer] Player connected: ${socketId} (${playerId}) | Total Connected: ${playerCount}`
    );

    // 1. Send initial handshake packet to newly connected client
    socket.emit('init', {
      socketId,
      playerId,
      tempUsername,
      playerCount,
      serverTime: Date.now(),
      palette: COLOR_PALETTE,
    });

    // 2. Broadcast updated connection counts
    this.io.emit('playerCount:update', { playerCount });
    socket.broadcast.emit('player:connected', {
      socketId,
      playerId,
      playerCount,
    });

    // Send currently joined players list
    socket.emit('players:list', { players: this.getJoinedPlayers() });

    // ── Setup socket-specific event listeners ──────────────────────
    socket.on('disconnect', (reason) => {
      this._handleDisconnect(socket, reason);
    });

    socket.on('error', (err) => {
      console.error(`[MultiplayerServer] Socket error for ${socketId}:`, err);
    });

    // Ping / heartbeat event for latency checking
    socket.on('ping:check', (clientTimestamp, ack) => {
      if (typeof ack === 'function') {
        ack({ clientTimestamp, serverTimestamp: Date.now() });
      }
    });

    // ── Phase 2: Player Join & Registration ────────────────────────
    socket.on('player:join', (data, ack) => {
      this._handlePlayerJoin(socket, data, ack);
    });

    // ── Phase 3: Player Movement & Transform Updates ──────────────
    socket.on('player:move', (data) => {
      this._handlePlayerMove(socket, data);
    });

    // ── Phase 3: Player State Updates (sailing, fishing, docking) ──
    socket.on('player:state', (data) => {
      this._handlePlayerState(socket, data);
    });

    // ── Recycling points: deliver a completed unload transaction ───
    socket.on('recycle:deliver', (data, ack) => {
      this._handleRecycleDeliver(socket, data, ack);
    });

    // Phase 4/5: Game World Synchronization (trash, ocean events)
    socket.on('game:sync', (data) => {
      this._handleGameSyncStub(socket, data);
    });

    // ── Admin: Reports & Moderation ────────────────────────────────
    socket.on('admin:report_player', (data, ack) => {
      this._handleReportPlayer(socket, data, ack);
    });

    socket.on('admin:get_data', (ack) => {
      this._handleAdminGetData(socket, ack);
    });

    socket.on('admin:update_report', (data, ack) => {
      this._handleAdminUpdateReport(socket, data, ack);
    });

    socket.on('admin:warn_player', (data, ack) => {
      this._handleAdminWarnPlayer(socket, data, ack);
    });

    socket.on('admin:kick_player', (data, ack) => {
      this._handleAdminKickPlayer(socket, data, ack);
    });

    socket.on('player:sync_coins', (data) => {
      const session = this.players.get(socket.id);
      if (session && typeof data?.coins === 'number' && Number.isFinite(data.coins)) {
        const newCoins = Math.max(0, Math.floor(data.coins));
        if (session.coins !== newCoins) {
          session.coins = newCoins;
          this.broadcastAdminUpdate();
        }
      }
    });
  }

  /**
   * Handle Phase 2: Player Join event
   */
  _handlePlayerJoin(socket, data = {}, ack) {
    const session = this.players.get(socket.id);
    if (!session) {
      if (typeof ack === 'function') ack({ success: false, error: 'Session not found' });
      return;
    }

    session.lastSeen = Date.now();

    // 1. Resolve and validate username & admin credentials
    const resolution = this.validateAndResolveUsername(data.username, socket.id, data.adminCode);
    if (!resolution.valid) {
      if (typeof ack === 'function') {
        ack({ success: false, error: resolution.error, message: resolution.message });
      }
      return;
    }

    session.username = resolution.username;
    session.isAdmin = resolution.isAdmin;
    if (session.isAdmin) {
      socket.join('admin_channel');
    }

    if (typeof data.coins === 'number' && Number.isFinite(data.coins)) {
      session.coins = Math.max(0, Math.floor(data.coins));
    } else if (session.coins == null) {
      session.coins = 0;
    }

    // Lifetime recycling points follow the player's identity and are NEVER
    // reset by disconnects (the store keeps them; the file keeps them across
    // restarts). Clients only receive this balance — they cannot set it.
    session.points = this._leaderboard.getPoints(resolution.username);

    // Assign color theme and mooring berth if not already assigned
    if (!session.color) {
      session.color = COLOR_PALETTE[this._nextColorIndex % COLOR_PALETTE.length];
      this._nextColorIndex += 1;
    }
    if (!session.berth) {
      session.berth = HARBOR_BERTHS[this._nextBerthIndex % HARBOR_BERTHS.length];
      this._nextBerthIndex += 1;
    }
    if (data.boatLevel) {
      session.boatLevel = Math.max(1, Math.min(3, Number(data.boatLevel) || 1));
    }
    if (data.transform) {
      session.transform = {
        ...data.transform,
      };
    } else {
      session.transform = {
        x: 0,
        y: 1.2,
        z: -3,
        yaw: 0,
        speed: 0,
        animState: 'Idle',
      };
    }

    const wasAlreadyJoined = session.hasJoined;
    session.hasJoined = true;

    console.log(
      `[MultiplayerServer] Player joined: "${session.username}" (${session.playerId})${session.isAdmin ? ' [ADMIN]' : ''} | Color: ${session.color.name} | Berth: (${session.berth.x}, ${session.berth.z})`
    );

    const publicSession = {
      socketId: session.socketId,
      playerId: session.playerId,
      username: session.username,
      isAdmin: !!session.isAdmin,
      coins: session.coins || 0,
      points: session.points || 0,
      color: session.color,
      berth: session.berth,
      boatLevel: session.boatLevel || 1,
      state: session.state || 'DOCKED',
      transform: session.transform || {
        x: session.berth?.x ?? 0,
        y: session.berth?.y ?? 1.5,
        z: session.berth?.z ?? -2,
        yaw: session.berth?.yaw ?? 0,
        speed: 0,
        animState: 'Idle',
      },
    };

    const existingJoinedPlayers = this.getJoinedPlayers().filter((p) => p.socketId !== socket.id);

    // 1. Respond to sender with success and existing players list
    const responsePayload = {
      success: true,
      localPlayer: publicSession,
      existingPlayers: existingJoinedPlayers,
    };

    socket.emit('player:joined_success', responsePayload);
    if (typeof ack === 'function') {
      ack(responsePayload);
    }

    // 2. If this is an admin, send initial admin data
    if (session.isAdmin) {
      socket.emit('admin:init', {
        players: this.getAdminPlayersList(),
        reports: this._reports.getReports(),
      });
    }

    // 3. If this is a fresh join (not just a rename), broadcast to other clients
    if (!wasAlreadyJoined) {
      socket.broadcast.emit('player:joined', {
        player: publicSession,
        playerCount: this.players.size,
      });
    }

    // 4. Broadcast updated full player list to all clients
    this.io.emit('players:list', { players: this.getJoinedPlayers() });

    // 5. Broadcast the latest leaderboard so the joiner AND everyone else
    //    see identical rankings immediately (late joiners get it here).
    this._broadcastLeaderboard();

    // 6. Broadcast updated players list to admin channel
    this.broadcastAdminUpdate();
  }

  /**
   * Handle player disconnection and broadcast updates
   */
  _handleDisconnect(socket, reason) {
    const socketId = socket.id;

    if (!this.players.has(socketId)) {
      return; // Already removed or wasn't registered
    }

    const session = this.players.get(socketId);
    this.players.delete(socketId);
    const playerCount = this.players.size;

    console.log(
      `[MultiplayerServer] Player disconnected: ${socketId} (${session.username || session.playerId}) | Reason: ${reason} | Total Connected: ${playerCount}`
    );

    // Broadcast disconnection and updated player count to all remaining clients
    this.io.emit('playerCount:update', { playerCount });
    this.io.emit('player:disconnected', {
      socketId,
      playerId: session.playerId,
      username: session.username,
      playerCount,
      reason,
    });

    if (session.hasJoined) {
      this.io.emit('player:left', {
        socketId,
        playerId: session.playerId,
        username: session.username,
        playerCount,
        reason,
      });
      // Broadcast updated active players list
      this.io.emit('players:list', { players: this.getJoinedPlayers() });
      // Rankings change when a player leaves the session board
      this._broadcastLeaderboard();
      // Update admin console with real-time player list
      this.broadcastAdminUpdate();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Player Movement & Lifecycle State Handlers
  // ──────────────────────────────────────────────────────────────────────────

  _handlePlayerMove(socket, data = {}) {
    const session = this.players.get(socket.id);
    if (!session || !session.hasJoined) return;
    session.lastSeen = Date.now();

    const inCollisionCooldown = session.collisionCooldown && Date.now() < session.collisionCooldown;
    let partner = null;
    if (inCollisionCooldown && session.collisionPartnerId) {
      for (const p of this.players.values()) {
        if (p.playerId === session.collisionPartnerId) {
          partner = p;
          break;
        }
      }
    }

    let rawX = typeof data.x === 'number' ? data.x : (data.transform?.x ?? session.transform?.x ?? 0);
    let rawY = typeof data.y === 'number' ? data.y : (data.transform?.y ?? session.transform?.y ?? 1.5);
    let rawZ = typeof data.z === 'number' ? data.z : (data.transform?.z ?? session.transform?.z ?? 0);
    let rawYaw = typeof data.yaw === 'number' ? data.yaw : (data.transform?.yaw ?? session.transform?.yaw ?? 0);
    let rawSpeed = typeof data.speed === 'number' ? data.speed : (data.transform?.speed ?? session.transform?.speed ?? 0);
    let rawDeflVx = typeof data.deflectionVx === 'number' ? data.deflectionVx : (data.transform?.deflectionVx ?? session.transform?.deflectionVx ?? 0);
    let rawDeflVz = typeof data.deflectionVz === 'number' ? data.deflectionVz : (data.transform?.deflectionVz ?? session.transform?.deflectionVz ?? 0);
    let rawAnim = data.animState || data.transform?.animState || session.transform?.animState || 'Idle';

    // Requirement 9: Ensure normal movement updates do not overwrite collision corrections
    if (inCollisionCooldown && partner?.transform && session.transform) {
      const prevDist = Math.hypot(session.transform.x - partner.transform.x, session.transform.z - partner.transform.z);
      const newDist = Math.hypot(rawX - partner.transform.x, rawZ - partner.transform.z);

      // If the client's packet attempts to push back inside the partner boat:
      if (newDist < prevDist - 0.05) {
        rawX = session.transform.x;
        rawZ = session.transform.z;
        rawSpeed = Math.min(rawSpeed, session.transform.speed);
        rawDeflVx = session.transform.deflectionVx || rawDeflVx;
        rawDeflVz = session.transform.deflectionVz || rawDeflVz;
      }
    }

    session.transform = {
      x: rawX,
      y: rawY,
      z: rawZ,
      yaw: rawYaw,
      speed: rawSpeed,
      deflectionVx: rawDeflVx,
      deflectionVz: rawDeflVz,
      animState: rawAnim,
    };

    if (data.state) {
      session.state = data.state;
    }
    if (data.boatLevel) {
      session.boatLevel = Math.max(1, Math.min(3, Number(data.boatLevel) || 1));
    }

    // Broadcast movement update to all other connected clients
    socket.broadcast.emit('player:moved', {
      playerId: session.playerId,
      username: session.username,
      state: session.state,
      boatLevel: session.boatLevel,
      transform: session.transform,
    });
  }

  _handlePlayerState(socket, data = {}) {
    const session = this.players.get(socket.id);
    if (!session || !session.hasJoined) return;
    session.lastSeen = Date.now();

    const oldState = session.state;
    if (data.state) {
      session.state = data.state; // 'DOCKED' | 'BOARDING' | 'ACTIVE' | 'RETURNING'
    }
    if (data.boatLevel) {
      session.boatLevel = Math.max(1, Math.min(3, Number(data.boatLevel) || 1));
    }
    if (data.transform) {
      session.transform = {
        ...(session.transform || {}),
        ...data.transform,
      };
    }

    console.log(
      `[MultiplayerServer] Player "${session.username}" state transition: ${oldState} -> ${session.state} (Boat Level ${session.boatLevel})`
    );

    const payload = {
      playerId: session.playerId,
      username: session.username,
      state: session.state,
      boatLevel: session.boatLevel,
      color: session.color,
      berth: session.berth,
      transform: session.transform,
    };

    // Broadcast state transition to all other clients
    socket.broadcast.emit('player:state_changed', payload);
    // Broadcast updated active players list
    this.io.emit('players:list', { players: this.getJoinedPlayers() });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Recycling Points & Live Leaderboard (server-authoritative)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Award lifetime recycling points for a completed unload transaction.
   *
   * The client submits ONLY { transactionId, itemCount } (legacy data.kg / data.amount / data.count also accepted)
   * — the point value itself is always computed here (itemCount × RECYCLE_POINTS_PER_ITEM). Validation layers:
   *   1. session must be joined
   *   2. transactionId: unique string (per-session dedupe → no double awards)
   *   3. itemCount: integer in [1, MAX_RECYCLE_ITEMS] (Level-3 cargo capacity cap)
   *   4. state: 'ACTIVE' (unloading is a boat action at the recycling zone)
   *   5. rate limit: ≥ RECYCLE_MIN_INTERVAL_MS between awards
   */
  _handleRecycleDeliver(socket, data = {}, ack) {
    const session = this.players.get(socket.id);
    const reply = (payload) => {
      if (typeof ack === 'function') ack(payload);
      if (!payload.success) {
        console.warn(`[MultiplayerServer] Recycle rejected for ${session?.username || socket.id}: ${payload.error}`);
      }
    };

    if (!session || !session.hasJoined) {
      return reply({ success: false, error: 'not-joined' });
    }
    session.lastSeen = Date.now();

    // 2. Transaction identity — required, bounded, deduped.
    const transactionId =
      typeof data.transactionId === 'string' && data.transactionId.length > 0 && data.transactionId.length <= 80
        ? data.transactionId
        : null;
    if (!transactionId) {
      return reply({ success: false, error: 'invalid-transaction' });
    }
    if (!session._recycleTxIds) {
      session._recycleTxIds = new Set();
      session._recycleTxOrder = [];
    }
    if (session._recycleTxIds.has(transactionId)) {
      // Same transaction re-sent — reject without awarding again.
      return reply({ success: false, error: 'duplicate-transaction' });
    }

    // 3. Amount validation — the ONLY client input that affects points.
    // Accepts itemCount, or fallbacks (count, amount, kg for backwards compatibility).
    const itemCount = data.itemCount ?? data.count ?? data.amount ?? data.kg;
    if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > MAX_RECYCLE_ITEMS) {
      return reply({ success: false, error: 'invalid-amount' });
    }

    // 4. State validation — the player must be out sailing (in the boat).
    if (session.state !== 'ACTIVE') {
      return reply({ success: false, error: 'invalid-state' });
    }

    // 5. Rate limit — the unload animation itself takes 1.3 s.
    const now = Date.now();
    if (session._lastRecycleAt && now - session._lastRecycleAt < RECYCLE_MIN_INTERVAL_MS) {
      return reply({ success: false, error: 'too-soon' });
    }

    // Dedupe bookkeeping (bounded memory: keep the most recent 32 ids).
    session._recycleTxIds.add(transactionId);
    session._recycleTxOrder.push(transactionId);
    if (session._recycleTxOrder.length > 32) {
      session._recycleTxIds.delete(session._recycleTxOrder.shift());
    }
    session._lastRecycleAt = now;

    // ── Award: calculated and stored on the server, persisted for lifetime ──
    const points = itemCount * RECYCLE_POINTS_PER_ITEM;
    session.points = (session.points || 0) + points;
    this._leaderboard.setPoints(session.username, session.points);

    console.log(
      `[MultiplayerServer] "${session.username}" recycled ${itemCount} items → +${points} pts (lifetime: ${session.points})`
    );

    // Confirm to the earner (their display comes from the shared broadcast —
    // this ack/award event is only feedback, never a client-side balance).
    socket.emit('points:awarded', {
      itemCount,
      kg: itemCount,
      points,
      totalPoints: session.points,
      transactionId,
    });

    // Everyone sees the same new rankings immediately.
    this._broadcastLeaderboard();
    this.broadcastAdminUpdate();

    return reply({ success: true, itemCount, kg: itemCount, points, totalPoints: session.points, transactionId });
  }

  /**
   * Build the ranked leaderboard for all JOINED players.
   * Stable tie-break: more points first → earlier connection wins ties →
   * playerId as the final deterministic tiebreaker. Ranks are 1-based.
   */
  _buildLeaderboardEntries() {
    return this.getJoinedPlayers()
      .map((p) => ({
        playerId: p.playerId,
        username: p.username,
        points: this.players.get(p.socketId)?.points || 0,
        connectedAt: this.players.get(p.socketId)?.connectedAt || 0,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (a.connectedAt !== b.connectedAt) return a.connectedAt - b.connectedAt;
        return a.playerId < b.playerId ? -1 : 1;
      })
      .map((e, i) => ({ rank: i + 1, playerId: e.playerId, username: e.username, points: e.points }));
  }

  /** Broadcast the full rankings to every connected client (join/leave/award only). */
  _broadcastLeaderboard() {
    this.io.emit('leaderboard:update', {
      entries: this._buildLeaderboardEntries(),
      serverTime: Date.now(),
    });
  }

  _handleGameSyncStub(socket, data) {
    // Future Phase 4/5: Shared trash pickup sync, global quests
    const session = this.players.get(socket.id);
    if (!session) return;
    session.lastSeen = Date.now();
  }

  /**
   * Phase 3B: Server-authoritative physics and boat-to-boat collision detection loop (30 Hz).
   * Excludes docked boats (state: 'DOCKED').
   */
  _tickPhysics() {
    // Collect all active ocean boats
    const activeBoats = [];
    for (const session of this.players.values()) {
      if (!session.hasJoined || session.state !== 'ACTIVE') continue;
      const t = session.transform;
      if (!t || typeof t.x !== 'number' || typeof t.z !== 'number') continue;

      const lvl = session.boatLevel || 1;
      const dims = BoatCollisionSystem.getHullDimensions(lvl);

      // Water drag decay on any residual deflection
      if (t.deflectionVx || t.deflectionVz) {
        const decay = Math.exp(-3.6 * 0.033);
        t.deflectionVx = (t.deflectionVx || 0) * decay;
        t.deflectionVz = (t.deflectionVz || 0) * decay;
        if (Math.abs(t.deflectionVx) < 0.01) t.deflectionVx = 0;
        if (Math.abs(t.deflectionVz) < 0.01) t.deflectionVz = 0;
      }

      activeBoats.push({
        id: session.playerId,
        playerId: session.playerId,
        x: t.x,
        z: t.z,
        yaw: t.yaw || 0,
        speed: t.speed || 0,
        level: lvl,
        mass: dims.mass,
        deflectionVx: t.deflectionVx || 0,
        deflectionVz: t.deflectionVz || 0,
        session,
      });
    }

    if (activeBoats.length < 2) return;

    // Run multi-boat collision resolution
    const dt = 0.033;
    const collisions = BoatCollisionSystem.resolveMultipleCollisions(activeBoats, dt);

    if (collisions.length > 0) {
      for (const col of collisions) {
        // Update authoritative session transforms
        const bA = activeBoats.find((b) => b.id === col.boatA.playerId);
        const bB = activeBoats.find((b) => b.id === col.boatB.playerId);

        if (bA?.session) {
          bA.session.transform.x = col.boatA.x;
          bA.session.transform.z = col.boatA.z;
          bA.session.transform.yaw = col.boatA.yaw;
          bA.session.transform.speed = col.boatA.speed;
          bA.session.transform.deflectionVx = col.boatA.deflectionVx;
          bA.session.transform.deflectionVz = col.boatA.deflectionVz;
          bA.session.collisionCooldown = Date.now() + 250;
          bA.session.collisionPartnerId = bB?.id;
        }

        if (bB?.session) {
          bB.session.transform.x = col.boatB.x;
          bB.session.transform.z = col.boatB.z;
          bB.session.transform.yaw = col.boatB.yaw;
          bB.session.transform.speed = col.boatB.speed;
          bB.session.transform.deflectionVx = col.boatB.deflectionVx;
          bB.session.transform.deflectionVz = col.boatB.deflectionVz;
          bB.session.collisionCooldown = Date.now() + 250;
          bB.session.collisionPartnerId = bA?.id;
        }

        // Broadcast collision event to all connected clients
        this.io.emit('boats:collision', {
          boatA: col.boatA,
          boatB: col.boatB,
          normal: col.normal,
          depth: col.depth,
          closingSpeed: col.closingSpeed,
          impulse: col.impulse,
          contactPoint: col.contactPoint,
          timestamp: Date.now(),
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin & Moderation Handlers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Submit a player report (accessible to any joined player).
   */
  _handleReportPlayer(socket, data = {}, ack) {
    const session = this.players.get(socket.id);
    const reply = (res) => {
      if (typeof ack === 'function') ack(res);
    };

    if (!session || !session.hasJoined) {
      return reply({ success: false, error: 'not-joined', message: 'Must be joined to report a player' });
    }

    const reportedUsername = typeof data.reportedUsername === 'string' ? data.reportedUsername.trim() : '';
    const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
    if (!reportedUsername || !reason) {
      return reply({ success: false, error: 'invalid-input', message: 'Reported username and reason are required' });
    }

    const report = this._reports.addReport({
      reportedUsername,
      reportedPlayerId: data.reportedPlayerId || '',
      reporterUsername: session.username,
      reporterPlayerId: session.playerId,
      reason,
      description: data.description || '',
    });

    // Real-time broadcast to connected administrators
    this.io.to('admin_channel').emit('admin:reports_update', this._reports.getReports());

    console.log(`[MultiplayerServer] Report filed against "${reportedUsername}" by "${session.username}": ${reason}`);
    return reply({ success: true, report });
  }

  /**
   * Retrieve full admin console state (authenticated admins only).
   */
  _handleAdminGetData(socket, ack) {
    const session = this.players.get(socket.id);
    const reply = (res) => {
      if (typeof ack === 'function') ack(res);
    };

    if (!session || !session.isAdmin) {
      return reply({ success: false, error: 'unauthorized', message: 'Admin permissions required' });
    }

    return reply({
      success: true,
      players: this.getAdminPlayersList(),
      reports: this._reports.getReports(),
    });
  }

  /**
   * Update report status (authenticated admins only).
   */
  _handleAdminUpdateReport(socket, data = {}, ack) {
    const session = this.players.get(socket.id);
    const reply = (res) => {
      if (typeof ack === 'function') ack(res);
    };

    if (!session || !session.isAdmin) {
      return reply({ success: false, error: 'unauthorized', message: 'Admin permissions required' });
    }

    const updated = this._reports.updateStatus(data.reportId, data.status);
    if (!updated) {
      return reply({ success: false, error: 'report-not-found', message: 'Report not found or invalid status' });
    }

    this.io.to('admin_channel').emit('admin:reports_update', this._reports.getReports());
    return reply({ success: true, report: updated });
  }

  /**
   * Issue an in-game warning to a player (authenticated admins only).
   */
  _handleAdminWarnPlayer(socket, data = {}, ack) {
    const session = this.players.get(socket.id);
    const reply = (res) => {
      if (typeof ack === 'function') ack(res);
    };

    if (!session || !session.isAdmin) {
      return reply({ success: false, error: 'unauthorized', message: 'Admin permissions required' });
    }

    const targetPlayerId = data.targetPlayerId;
    let targetSocket = null;
    let targetSession = null;

    for (const [sId, p] of this.players.entries()) {
      if (p.playerId === targetPlayerId) {
        targetSocket = this.io.sockets.sockets.get(sId);
        targetSession = p;
        break;
      }
    }

    if (!targetSession || !targetSocket) {
      return reply({ success: false, error: 'player-not-found', message: 'Player is no longer online' });
    }

    const message = typeof data.message === 'string' && data.message.trim()
      ? data.message.trim()
      : 'Please follow community rules and play fairly.';

    targetSocket.emit('player:warning', {
      message,
      adminUsername: session.username,
      timestamp: Date.now(),
    });

    console.log(`[MultiplayerServer] Admin "${session.username}" issued warning to "${targetSession.username}": ${message}`);
    return reply({ success: true });
  }

  /**
   * Kick a player from the multiplayer session (authenticated admins only).
   */
  _handleAdminKickPlayer(socket, data = {}, ack) {
    const session = this.players.get(socket.id);
    const reply = (res) => {
      if (typeof ack === 'function') ack(res);
    };

    if (!session || !session.isAdmin) {
      return reply({ success: false, error: 'unauthorized', message: 'Admin permissions required' });
    }

    const targetPlayerId = data.targetPlayerId;
    if (targetPlayerId === session.playerId) {
      return reply({ success: false, error: 'cannot-kick-self', message: 'Cannot kick yourself' });
    }

    let targetSocket = null;
    let targetSession = null;

    for (const [sId, p] of this.players.entries()) {
      if (p.playerId === targetPlayerId) {
        targetSocket = this.io.sockets.sockets.get(sId);
        targetSession = p;
        break;
      }
    }

    if (!targetSession || !targetSocket) {
      return reply({ success: false, error: 'player-not-found', message: 'Player is no longer online' });
    }

    const reason = typeof data.reason === 'string' && data.reason.trim()
      ? data.reason.trim()
      : 'Kicked by administrator';

    targetSocket.emit('player:kicked', {
      reason,
      adminUsername: session.username,
      timestamp: Date.now(),
    });

    console.log(`[MultiplayerServer] Admin "${session.username}" kicked "${targetSession.username}". Reason: ${reason}`);

    // Disconnect socket from namespace
    targetSocket.disconnect(true);

    return reply({ success: true });
  }

  /**
   * Graceful start
   */
  start() {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, this.host, () => {
        console.log(`[MultiplayerServer] Listening on http://${this.host}:${this.port}`);
        resolve({ host: this.host, port: this.port });
      });
      this.httpServer.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Graceful stop
   */
  stop() {
    return new Promise((resolve) => {
      if (this._physicsInterval) {
        clearInterval(this._physicsInterval);
        this._physicsInterval = null;
      }
      this.io.close(() => {
        this.httpServer.close(() => {
          this.players.clear();
          console.log('[MultiplayerServer] Server stopped cleanly');
          resolve();
        });
      });
    });
  }
}
