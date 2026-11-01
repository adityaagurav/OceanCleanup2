import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

/**
 * Visual color themes for distinct player boats.
 */
export const COLOR_PALETTE = [
  { name: 'Cyan Wave',   primary: '#06b6d4', sail: '#ecfeff', accent: '#0891b2' },
  { name: 'Emerald Bay', primary: '#10b981', sail: '#ecfdf5', accent: '#059669' },
  { name: 'Amber Reef',  primary: '#f59e0b', sail: '#fffbeb', accent: '#d97706' },
  { name: 'Coral Rose',  primary: '#f43f5e', sail: '#fff1f2', accent: '#e11d48' },
  { name: 'Violet Tide', primary: '#8b5cf6', sail: '#f5f3ff', accent: '#7c3aed' },
  { name: 'Ocean Blue',  primary: '#3b82f6', sail: '#eff6ff', accent: '#2563eb' },
  { name: 'Teal Coast',  primary: '#14b8a6', sail: '#f0fdf4', accent: '#0d9488' },
  { name: 'Sunset Glow', primary: '#f97316', sail: '#fff7ed', accent: '#ea580c' },
];

/**
 * Designated mooring berths along the harbour pier & arms.
 * Local player spawns at (5.75, 0, 31). Remote boats moor in separate slips
 * so no boats ever overlap or clip.
 */
export const HARBOR_BERTHS = [
  { x: -5.75, y: 0, z: 31, yaw: 0 },         // Berth 1: Opposite central head face (-x)
  { x: 5.75,  y: 0, z: 23, yaw: 0 },         // Berth 2: Central pier east side (z: 23)
  { x: -5.75, y: 0, z: 23, yaw: 0 },         // Berth 3: Central pier west side (z: 23)
  { x: 5.75,  y: 0, z: 15, yaw: 0 },         // Berth 4: Central pier east side mid (z: 15)
  { x: -5.75, y: 0, z: 15, yaw: 0 },         // Berth 5: Central pier west side mid (z: 15)
  { x: 14.5,  y: 0, z: 25, yaw: 0 },         // Berth 6: Right arm inner face (x: 14.5, z: 25)
  { x: -14.5, y: 0, z: 25, yaw: 0 },         // Berth 7: Left arm inner face (x: -14.5, z: 25)
  { x: 14.5,  y: 0, z: 18, yaw: 0 },         // Berth 8: Right arm inner face mid (x: 14.5, z: 18)
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

    // HTTP server for health check and Socket.IO handshake
    this.httpServer = http.createServer((req, res) => {
      this._handleHttpRequest(req, res);
    });

    // Socket.IO server with cross-origin support for LAN & local dev
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*', // Allow connections from localhost, LAN IPs (192.168.x.x), etc.
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 20000,
      pingInterval: 10000,
      connectTimeout: 15000,
      transports: ['websocket', 'polling'],
    });

    this._setupSocketHandlers();
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
   * Resolve a unique username among active joined players
   */
  resolveUniqueUsername(requestedName, currentSocketId) {
    let name = sanitizeUsername(requestedName);
    if (!name || name.length < 2) {
      name = generateGuestName();
    }

    const takenNames = new Set(
      Array.from(this.players.values())
        .filter((p) => p.hasJoined && p.socketId !== currentSocketId)
        .map((p) => p.username.toLowerCase())
    );

    if (!takenNames.has(name.toLowerCase())) {
      return name;
    }

    // Append _2, _3, etc. if name is already taken
    let suffix = 2;
    let candidate = `${name}_${suffix}`;
    while (takenNames.has(candidate.toLowerCase())) {
      suffix += 1;
      candidate = `${name}_${suffix}`;
    }
    return candidate;
  }

  /**
   * Simple HTTP request router (health check & status)
   */
  _handleHttpRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // Phase 4/5: Game World Synchronization (trash, ocean events)
    socket.on('game:sync', (data) => {
      this._handleGameSyncStub(socket, data);
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

    // Resolve username (handle duplicates & sanitize)
    const finalUsername = this.resolveUniqueUsername(data.username, socket.id);
    session.username = finalUsername;

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
      `[MultiplayerServer] Player joined: "${session.username}" (${session.playerId}) | Color: ${session.color.name} | Berth: (${session.berth.x}, ${session.berth.z})`
    );

    const publicSession = {
      socketId: session.socketId,
      playerId: session.playerId,
      username: session.username,
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

    // 2. If this is a fresh join (not just a rename), broadcast to other clients
    if (!wasAlreadyJoined) {
      socket.broadcast.emit('player:joined', {
        player: publicSession,
        playerCount: this.players.size,
      });
    }

    // 3. Broadcast updated full player list to all clients
    this.io.emit('players:list', { players: this.getJoinedPlayers() });
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
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Player Movement & Lifecycle State Handlers
  // ──────────────────────────────────────────────────────────────────────────

  _handlePlayerMove(socket, data = {}) {
    const session = this.players.get(socket.id);
    if (!session || !session.hasJoined) return;
    session.lastSeen = Date.now();

    if (data.transform) {
      session.transform = {
        ...session.transform,
        ...data.transform,
      };
    } else if (typeof data.x === 'number') {
      session.transform = {
        x: data.x,
        y: data.y ?? (session.transform ? session.transform.y : 1.5),
        z: data.z,
        yaw: data.yaw ?? (session.transform ? session.transform.yaw : 0),
        speed: data.speed ?? 0,
        animState: data.animState || (session.transform ? session.transform.animState : 'Idle'),
      };
    }
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

  _handleGameSyncStub(socket, data) {
    // Future Phase 4/5: Shared trash pickup sync, global quests
    const session = this.players.get(socket.id);
    if (!session) return;
    session.lastSeen = Date.now();
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
