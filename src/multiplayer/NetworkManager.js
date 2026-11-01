import { io } from 'socket.io-client';

/**
 * NetworkManager.js — Phase 1 & 2: Client-Side Multiplayer Network Manager
 *
 * Responsibilities:
 *  - Automatically resolves multiplayer server address for local & LAN (Wi-Fi) players.
 *  - Manages Socket.IO connection lifecycle (connect, reconnect, error, disconnect).
 *  - Maintains connection status, unique socket ID, ping/latency, and total online player count.
 *  - Phase 2: Player registration & joining (custom/guest username, player ID, visual color & berth).
 *  - Dispatches player join/leave events and active player list to 3D engine and React HUD.
 *  - Scaffolded stubs for future phases (player:move, player:state, game:sync).
 */
export class NetworkManager {
  static instance = null;

  static getInstance(options = {}) {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager(options);
    }
    return NetworkManager.instance;
  }

  constructor(options = {}) {
    this.serverUrl = options.serverUrl || this._resolveServerUrl();
    this.socket = null;
    this.subscribers = new Set();
    this._eventListeners = new Map(); // Map<string, Set<Function>>

    // Internal reactive state
    this.state = {
      status: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
      connected: false,
      socketId: null,
      playerId: null,
      username: this._loadSavedUsername() || null,
      tempUsername: null,
      hasJoined: false,
      localPlayer: null,
      players: [],        // Array of joined PlayerSession objects
      playerCount: 1,     // Total connected clients
      latency: 0,
      error: null,
      serverUrl: this.serverUrl,
      lastNotification: null, // { id, text, type: 'join'|'leave', timestamp }
      leaderboard: null,      // { entries: [{ rank, playerId, username, points }], serverTime }
    };

    this._pingTimer = null;
  }

  _loadSavedUsername() {
    if (typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem('ocean_cleanup_username') || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  _saveUsername(name) {
    if (typeof localStorage !== 'undefined' && name) {
      try {
        localStorage.setItem('ocean_cleanup_username', name);
      } catch (e) {}
    }
  }

  /**
   * Determine the multiplayer server URL dynamically.
   * If accessing from http://192.168.1.3:5173 on another laptop,
   * automatically resolves to http://192.168.1.3:3001.
   */
  _resolveServerUrl() {
    if (typeof window === 'undefined') {
      return 'http://localhost:3001';
    }

    // 1. Check URL query param ?server=http://...
    const urlParams = new URLSearchParams(window.location.search);
    const paramServer = urlParams.get('server');
    if (paramServer) return paramServer;

    // 2. Check window override or Vite env
    if (window.__MULTIPLAYER_SERVER_URL__) return window.__MULTIPLAYER_SERVER_URL__;
    if (import.meta.env?.VITE_MULTIPLAYER_URL) return import.meta.env.VITE_MULTIPLAYER_URL;

    // 3. Dynamic hostname detection (works seamlessly across Wi-Fi & localhost)
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname || 'localhost';
    const defaultPort = 3001;

    return `${protocol}//${hostname}:${defaultPort}`;
  }

  /**
   * Connect to the Socket.IO multiplayer server.
   */
  connect() {
    if (this.socket) {
      if (this.socket.connected || this.state.status === 'connecting') {
        return;
      }
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this._updateState({
      status: 'connecting',
      error: null,
    });

    console.log(`[NetworkManager] Connecting to multiplayer server at ${this.serverUrl}...`);

    this.socket = io(this.serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    // ── Connection lifecycle events ──────────────────────────────────────────
    this.socket.on('connect', () => {
      console.log(`[NetworkManager] Connected! Socket ID: ${this.socket.id}`);
      this._updateState({
        status: 'connected',
        connected: true,
        socketId: this.socket.id,
        error: null,
      });
      this._startPingInterval();

      // If we previously had joined and reconnected, rejoin automatically
      if (this.state.hasJoined && this.state.username) {
        this.joinGame(this.state.username, this.state.localPlayer?.boatLevel || 1);
      }
    });

    this.socket.on('init', (payload) => {
      console.log('[NetworkManager] Received server init packet:', payload);
      this._updateState({
        socketId: payload.socketId,
        playerId: payload.playerId || `p_${payload.socketId?.substring(0, 8)}`,
        tempUsername: payload.tempUsername,
        playerCount: payload.playerCount || 1,
      });
    });

    this.socket.on('playerCount:update', (payload) => {
      if (typeof payload?.playerCount === 'number') {
        this._updateState({
          playerCount: payload.playerCount,
        });
      }
    });

    this.socket.on('player:connected', (payload) => {
      console.log('[NetworkManager] Remote client connected:', payload.socketId);
      if (typeof payload?.playerCount === 'number') {
        this._updateState({ playerCount: payload.playerCount });
      }
    });

    this.socket.on('player:disconnected', (payload) => {
      console.log('[NetworkManager] Remote client disconnected:', payload.socketId);
      if (typeof payload?.playerCount === 'number') {
        this._updateState({ playerCount: payload.playerCount });
      }
    });

    // ── Phase 2: Player Joined & Left events ──────────────────────────────────
    this.socket.on('player:joined_success', (payload) => {
      console.log('[NetworkManager] Local player join confirmed:', payload.localPlayer);
      this._saveUsername(payload.localPlayer.username);
      this._updateState({
        hasJoined: true,
        localPlayer: payload.localPlayer,
        username: payload.localPlayer.username,
        playerId: payload.localPlayer.playerId,
      });
      this._emitEvent('joinSuccess', payload);
    });

    this.socket.on('player:joined', (payload) => {
      console.log('[NetworkManager] Remote player joined the harbor:', payload.player?.username);
      const notif = {
        id: `join_${Date.now()}_${Math.random()}`,
        text: `⛵ ${payload.player?.username || 'A player'} joined the harbor`,
        type: 'join',
        timestamp: Date.now(),
      };
      this._updateState({ lastNotification: notif });
      this._emitEvent('playerJoined', payload.player);
    });

    this.socket.on('player:left', (payload) => {
      console.log('[NetworkManager] Player left the harbor:', payload.username);
      const notif = {
        id: `leave_${Date.now()}_${Math.random()}`,
        text: `👋 ${payload.username || 'A player'} left the harbor`,
        type: 'leave',
        timestamp: Date.now(),
      };
      this._updateState({ lastNotification: notif });
      this._emitEvent('playerLeft', payload);
    });

    this.socket.on('players:list', (payload) => {
      const players = payload.players || [];
      this._updateState({ players });
      this._emitEvent('playersList', players);
    });

    this.socket.on('player:moved', (payload) => {
      this._emitEvent('playerMoved', payload);
    });

    // ── Recycling points & live leaderboard ────────────────────────
    this.socket.on('leaderboard:update', (payload) => {
      this._updateState({ leaderboard: payload });
      this._emitEvent('leaderboardUpdate', payload);
    });

    this.socket.on('points:awarded', (payload) => {
      this._emitEvent('pointsAwarded', payload);
    });

    this.socket.on('player:state_changed', (payload) => {
      this._emitEvent('playerStateChanged', payload);
    });

    this.socket.on('boats:collision', (payload) => {
      this._emitEvent('boatCollision', payload);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`[NetworkManager] Disconnected: ${reason}`);
      this._stopPingInterval();
      this._updateState({
        status: reason === 'io client disconnect' ? 'disconnected' : 'reconnecting',
        connected: false,
        socketId: null,
      });
    });

    this.socket.on('connect_error', (err) => {
      console.warn(`[NetworkManager] Connection error: ${err.message}`);
      this._updateState({
        status: 'error',
        connected: false,
        error: err.message,
      });
    });

    this.socket.on('reconnect_attempt', () => {
      this._updateState({
        status: 'reconnecting',
      });
    });
  }

  /**
   * Phase 2: Send player join request to the server.
   * @param {string} requestedUsername
   * @param {number} boatLevel
   * @returns {Promise<object>}
   */
  joinGame(requestedUsername, boatLevel = 1) {
    const username = requestedUsername || this.state.username || this.state.tempUsername || '';
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        console.warn('[NetworkManager] Cannot join: socket not connected. Connecting first...');
        this.connect();
        // Wait up to 5s for connection
        const checkConn = setInterval(() => {
          if (this.socket?.connected) {
            clearInterval(checkConn);
            this._sendJoin(username, boatLevel, resolve);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkConn);
          resolve({ success: false, error: 'Connection timeout' });
        }, 5000);
        return;
      }
      this._sendJoin(username, boatLevel, resolve);
    });
  }

  _sendJoin(username, boatLevel, resolve) {
    this.socket.emit(
      'player:join',
      { username, boatLevel },
      (ack) => {
        if (ack?.success) {
          this._saveUsername(ack.localPlayer.username);
          this._updateState({
            hasJoined: true,
            localPlayer: ack.localPlayer,
            username: ack.localPlayer.username,
            playerId: ack.localPlayer.playerId,
          });
        }
        resolve(ack || { success: true });
      }
    );
  }

  /**
   * Periodic latency measurement
   */
  _startPingInterval() {
    this._stopPingInterval();
    const measure = () => {
      if (!this.socket?.connected) return;
      const start = Date.now();
      this.socket.emit('ping:check', start, () => {
        const latency = Math.max(1, Date.now() - start);
        // Throttle minor jitter updates (< 4ms) to prevent unnecessary React re-renders
        if (!this.state.latency || Math.abs(latency - this.state.latency) >= 4) {
          this._updateState({ latency });
        }
      });
    };
    measure();
    this._pingTimer = setInterval(measure, 5000);
  }

  _stopPingInterval() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this._stopPingInterval();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this._updateState({
      status: 'disconnected',
      connected: false,
      socketId: null,
      hasJoined: false,
    });
  }

  /**
   * State update and subscriber broadcast
   */
  _updateState(patch) {
    this.state = { ...this.state, ...patch };
    this.subscribers.forEach((fn) => {
      try {
        fn(this.state);
      } catch (err) {
        console.error('[NetworkManager] Subscriber error:', err);
      }
    });
  }

  /**
   * React hook / listener subscription
   */
  subscribe(fn) {
    this.subscribers.add(fn);
    fn(this.state); // Initial call with current state
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /**
   * Custom event subscription (playerJoined, playerLeft, playersList, joinSuccess)
   */
  on(event, handler) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this._eventListeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  _emitEvent(event, data) {
    const handlers = this._eventListeners.get(event);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(data);
        } catch (e) {
          console.error(`[NetworkManager] Error in event listener for "${event}":`, e);
        }
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Modular Scaffolding for Upcoming Phases
  // ──────────────────────────────────────────────────────────────────────────

  isConnected() {
    return !!this.socket?.connected;
  }

  sendPlayerMove(data) {
    if (this.socket?.connected) {
      this.socket.emit('player:move', data);
    }
  }

  sendPlayerState(data) {
    // Scaffolded for Phase 3
    if (this.socket?.connected) {
      this.socket.emit('player:state', data);
    }
  }

  /**
   * Report a completed recycling transaction (unload at the harbour).
   * Only the item count + transaction id are sent — the server
   * calculates the points itself and broadcasts the new leaderboard.
   * @param {{ transactionId: string, itemCount: number, kg?: number }} data
   * @returns {Promise<object|null>} server ack (null when not connected)
   */
  sendRecycleDeliver(data) {
    if (!this.socket?.connected) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.socket.emit('recycle:deliver', data, (ack) => resolve(ack || null));
      // Don't hang the caller forever if the server never answers.
      setTimeout(() => resolve(null), 4000);
    });
  }

  sendGameSync(data) {
    // Scaffolded for Phase 4/5
    if (this.socket?.connected) {
      this.socket.emit('game:sync', data);
    }
  }
}

// Global export of the singleton
export const networkManager = NetworkManager.getInstance();
