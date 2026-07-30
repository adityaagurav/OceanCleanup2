/**
 * GameStateManager.js — Simple finite state machine for game lifecycle.
 *
 * States:
 *   LOADING  → Initial asset loading
 *   HARBOR   → Player is on the harbor, can walk and board boat
 *   BOAT     → Player is controlling the boat, mission active
 *   PAUSED   → Game loop ticks but physics/AI freeze
 *   GAMEOVER → End screen shown
 *
 * Usage:
 *   GameState.transition('PAUSED');
 *   GameState.is('HARBOR');
 *   GameState.onEnter('HARBOR', () => showHarborUI());
 */
class GameStateManagerClass {
  constructor() {
    this._state     = 'LOADING';
    this._listeners = {}; // { state: [{ on: 'enter'|'exit', fn }] }
  }

  /** All valid states */
  static STATES = ['LOADING', 'HARBOR', 'BOAT', 'PAUSED', 'GAMEOVER'];

  /** @returns {string} current state name */
  get current() { return this._state; }

  /** @param {string} state */
  is(state) { return this._state === state; }

  /**
   * Transition to a new state.
   * Fires exit listeners on old state, enter listeners on new state.
   * @param {string} newState
   */
  transition(newState) {
    if (this._state === newState) return;
    if (!GameStateManagerClass.STATES.includes(newState)) {
      console.warn(`[GameState] Unknown state: ${newState}`);
      return;
    }

    const prev = this._state;
    this._fire(prev, 'exit');
    this._state = newState;
    this._fire(newState, 'enter');

    console.log(`[GameState] ${prev} → ${newState}`);
  }

  /**
   * Register a callback when entering a state.
   * @param {string} state
   * @param {function} fn
   */
  onEnter(state, fn) { this._addListener(state, 'enter', fn); }

  /**
   * Register a callback when exiting a state.
   * @param {string} state
   * @param {function} fn
   */
  onExit(state, fn)  { this._addListener(state, 'exit', fn); }

  _addListener(state, on, fn) {
    if (!this._listeners[state]) this._listeners[state] = [];
    this._listeners[state].push({ on, fn });
  }

  _fire(state, on) {
    (this._listeners[state] || [])
      .filter(l => l.on === on)
      .forEach(l => l.fn());
  }

  /** Remove all listeners (call on destroy) */
  dispose() { this._listeners = {}; }

  /** Restore the singleton to its initial state before creating a new engine. */
  reset() {
    this._state = 'LOADING';
    this._listeners = {};
  }
}

// Singleton export
export const GameState = new GameStateManagerClass();
