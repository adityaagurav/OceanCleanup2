/**
 * PerformanceConfig.js — Central tuning knobs for every performance system.
 *
 * This is the web-game equivalent of a Unity Inspector panel: all distances,
 * budgets and update rates used by the streaming / pooling / culling systems
 * live here so nothing is hardcoded inside a system. Tuning a single number
 * re-tunes the whole game, and the architecture scales cleanly as the map
 * grows (future islands, more players, larger oceans).
 */
export const PerformanceConfig = {
  // ── World streaming (ChunkManager + TerrainGenerator) ──────────
  CHUNK_SIZE:            64, // metres per chunk (read by TerrainGenerator)
  CHUNK_VIEW_DISTANCE:    3, // chunks KEPT loaded around the player (7×7 grid)
  CHUNK_UNLOAD_DISTANCE:  4, // chunks beyond this are unloaded (hysteresis ring,
                             //   view + 1 so nothing load/unload thrash)
  CHUNK_PRELOAD_DISTANCE: 1, // chunks from the grid edge at which the NEXT ring
                             //   starts streaming in (0 = only on boundary
                             //   crossing, 1 = one chunk of headroom)
  CHUNKS_LOAD_PER_FRAME:  2, // max chunk LOADS per frame — a boundary crossing
                             //   no longer does all the work in a single frame
  CHUNKS_UNLOAD_PER_FRAME: 2, // max chunk UNLOADS per frame

  // ── Water (Engine) ─────────────────────────────────────────────
  // The three.js Water shader re-renders the whole scene into a reflection
  // render-target once per frame. Recomputing every Nth frame divides that
  // cost; on calm cartoon water a 1-frame-old reflection is indistinguishable.
  // 1 = every frame (original behaviour).
  WATER_REFRESH_INTERVAL: 2,

  // ── HUD (App.jsx) ──────────────────────────────────────────────
  // The engine pushes boat speed every frame; React only re-renders when the
  // displayed value (rounded to this many decimals) actually changes.
  UI_SPEED_DECIMALS: 1,

  // ── Trash (TrashSystem) ────────────────────────────────────────
  // Hide trash beyond this distance. The pickup radius is only 8 m, so culling
  // at 600 m is invisible to gameplay but removes hundreds of draw calls
  // while sailing the open ocean.
  TRASH_CULL_RADIUS: 600,
};
