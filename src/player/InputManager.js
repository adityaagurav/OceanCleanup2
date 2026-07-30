/**
 * InputManager.js — Centralised, frame-rate-independent input state.
 * 
 * Character and camera read from this instead of scattered addEventListener calls.
 * Mouse deltas are accumulated per frame and cleared after each read.
 */
export class InputManager {
  constructor() {
    // Keyboard state — true while key is held
    this.keys = {
      forward:  false,  // W / ArrowUp
      backward: false,  // S / ArrowDown
      left:     false,  // A / ArrowLeft
      right:    false,  // D / ArrowRight
      jump:     false,  // Space
      sprint:   false,  // Shift
      interact: false,  // F
    };

    // Mouse delta — accumulated between frames, consumed each frame
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.scrollDelta = 0;
    this.isPointerLocked = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  _mapKey(code) {
    switch (code) {
      case 'KeyW': case 'ArrowUp':    return 'forward';
      case 'KeyS': case 'ArrowDown':  return 'backward';
      case 'KeyA': case 'ArrowLeft':  return 'left';
      case 'KeyD': case 'ArrowRight': return 'right';
      case 'Space':                   return 'jump';
      case 'ShiftLeft': case 'ShiftRight': return 'sprint';
      case 'KeyF':                    return 'interact';
      default:                        return null;
    }
  }

  _onKeyDown(e) {
    const action = this._mapKey(e.code);
    if (action) {
      e.preventDefault();
      this.keys[action] = true;
    }
  }

  _onKeyUp(e) {
    const action = this._mapKey(e.code);
    if (action) this.keys[action] = false;
  }

  _onMouseMove(e) {
    if (!this.isPointerLocked) return;
    this.mouseDeltaX += e.movementX || 0;
    this.mouseDeltaY += e.movementY || 0;
  }

  _onWheel(e) {
    e.preventDefault();
    this.scrollDelta += e.deltaY;
  }

  _onPointerLockChange() {
    this.isPointerLocked = !!document.pointerLockElement;
  }

  /**
   * Call once per render frame. Returns accumulated mouse/scroll deltas and resets them.
   * @returns {{ dx: number, dy: number, scroll: number }}
   */
  consumeMouseDelta() {
    const result = {
      dx:     this.mouseDeltaX,
      dy:     this.mouseDeltaY,
      scroll: this.scrollDelta,
    };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.scrollDelta = 0;
    return result;
  }

  /** True if any movement key is held */
  get isMoving() {
    return this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
