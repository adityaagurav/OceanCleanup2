/**
 * ProgressionConfig.js — State architecture for the new gameplay loop:
 *
 *   COLLECT → RETURN TO HARBOR → UNLOAD → EARN COINS → COMPLETE WEEKLY QUESTS
 *
 * PART 1 (this file today): the state shape only. The old mission/goal system
 * has been removed — collecting trash no longer completes anything or pays
 * out. Unloading (Part 2) and coins/quests (Part 3) will consume this state.
 *
 * State model (single source of truth — no duplicated global store):
 *   worldTrash            — trash meshes still floating in the world
 *                          (owned by TrashSystem.trashes; counted, not copied)
 *   boatTrashCount        — trash collected aboard but NOT yet unloaded
 *                          (owned by TrashSystem.boatTrashCount; the HUD's
 *                          trash chip shows this)
 *   deliveredTrashCount   — trash unloaded at the harbour (0 until Part 2;
 *                          carried across sessions only if/when persistence
 *                          is added — intentionally NOT persisted today)
 *   coins                 — currency earned from unloading (starts at 0;
 *                          nothing awards coins yet — Part 3)
 *   weeklyQuest           — quest progress (created in Part 3; the shape is
 *                          reserved here so the HUD/quests never invent
 *                          their own parallel state)
 */

export const ProgressionConfig = {
  /** Currency the player starts with (also the fallback when nothing saved). */
  STARTING_COINS: 0,

  /** The ONE place the trash→coin rate is defined (balancing lives here). */
  COINS_PER_TRASH: 5,

  /** Total unloading feedback duration (s) — arcs + a short landing beat. */
  UNLOAD_ANIM_SECONDS: 1.3,

  /** localStorage key used by the existing coin wallet. Boat levels are session-only. */
  _COINS_KEY: 'ocean_cleanup_coins',

  /** Load persisted coins (0 on first run / if storage unavailable). */
  loadCoins: () => {
    try {
      const raw = localStorage.getItem(ProgressionConfig._COINS_KEY);
      const n = raw === null ? NaN : parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : ProgressionConfig.STARTING_COINS;
    } catch (_) {
      return ProgressionConfig.STARTING_COINS;
    }
  },

  /** Persist coins (silently ignored when storage is unavailable). */
  saveCoins: (coins) => {
    try {
      localStorage.setItem(ProgressionConfig._COINS_KEY, String(Math.max(0, Math.floor(coins))));
    } catch (_) { /* private mode etc. — session-only coins then */ }
  },

  /**
   * Fresh per-session progression state. App.jsx holds the live instance in
   * React state and passes display values down to the HUD. Coins persist
   * locally across sessions; hauls are session-scoped.
   * @returns {{ boatTrashCount: number, deliveredTrashCount: number, coins: number, weeklyQuest: null }}
   */
  createSessionState: () => ({
    boatTrashCount: 0,
    deliveredTrashCount: 0,
    boatLevel: 1,
    coins: ProgressionConfig.loadCoins(),
    // Reserved for Part 4 — no quest system exists yet, so it stays null and
    // nothing in the UI may render from it until it is real.
    weeklyQuest: null,
  }),
};
