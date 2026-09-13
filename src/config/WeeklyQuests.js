/**
 * WeeklyQuests.js — Central weekly-quest progression system (Part 4).
 *
 * A lightweight, OPTIONAL goal layer on top of the core loop:
 *   COLLECT → RETURN → UNLOAD → EARN COINS
 *
 * Design rules:
 *  - Event-driven ONLY: progress is applied from gameplay events
 *    (onTrashCollected / onTrashUnloaded / onCoinsEarned). No polling,
 *    no per-frame work, no timers, no new listeners.
 *  - Non-blocking: nothing interrupts gameplay — the panel is opened
 *    manually from a small HUD button and claim feedback is a toast.
 *  - Weekly boundary: Monday 00:00 LOCAL time, deterministic. State stores
 *    the ISO week identifier it belongs to; a different id on load = new
 *    week → fresh set. Refresh/sessions never reset progress mid-week.
 *  - Claim-once: reward granted only when completed && !claimed.
 *  - Persistence: localStorage 'ocean_cleanup_weekly_quests' — no backend.
 *
 * Separation of concerns (kept for future shop/quests/currencies):
 *   TrashSystem (world + boat inventory) → Engine unload → App applies
 *   coins + calls into THIS module with plain numbers. The module knows
 *   nothing about THREE.js or React.
 */

const STORAGE_KEY = 'ocean_cleanup_weekly_quests';

/** The fixed weekly quest set (expand later — no random generation yet). */
export const WEEKLY_QUEST_DEFS = [
  { id: 'collect_50', type: 'collect_trash', target: 50, reward: 100, label: 'Collect 50 trash' },
  { id: 'unload_30',  type: 'unload_trash',  target: 30, reward: 150, label: 'Unload 30 trash' },
  { id: 'earn_250',   type: 'earn_coins',    target: 250, reward: 100, label: 'Earn 250 coins' },
];

/** ISO-style week id: year + week number (Monday-based, local time). */
export function currentWeekId(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // JS getDay(): Sun=0..Sat=6 → Monday-based offset (Mon=0..Sun=6)
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day); // the Monday of this week
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  let week = Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
  if (week < 1) week = 52; // edge: Jan 1 late in the week
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Fresh quest rows for a new week. */
function freshQuests() {
  return WEEKLY_QUEST_DEFS.map(def => ({
    id: def.id,
    type: def.type,
    target: def.target,
    reward: def.reward,
    label: def.label,
    progress: 0,
    completed: false,
    claimed: false,
  }));
}

/** Load persisted weekly state; roll over to a new week when needed. */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.weekId === currentWeekId() && Array.isArray(saved.quests)) {
        // Merge by id so new defs added later don't crash old saves.
        const byId = new Map(saved.quests.map(q => [q.id, q]));
        return {
          weekId: saved.weekId,
          quests: WEEKLY_QUEST_DEFS.map(def => {
            const q = byId.get(def.id);
            return q && typeof q.progress === 'number'
              ? { ...freshFromDef(def), ...q, target: def.target, reward: def.reward }
              : freshFromDef(def);
          }),
        };
      }
    }
  } catch (_) { /* corrupt/absent storage → fresh week */ }
  return { weekId: currentWeekId(), quests: freshQuests() };
}

// Small helper — a def-shaped fresh row (used by the save-merge above).
function freshFromDef(def) {
  return { id: def.id, type: def.type, target: def.target, reward: def.reward, label: def.label, progress: 0, completed: false, claimed: false };
}

/**
 * WeeklyQuestsClass — the single quest authority. App.jsx holds the instance
 * in React state and re-renders the panel from its plain-data snapshot.
 */
export class WeeklyQuestsClass {
  constructor() {
    this._state = loadState();
    this._save();
  }

  /** Plain-data snapshot for the UI (no live references). */
  getSnapshot() {
    return { weekId: this._state.weekId, quests: this._state.quests.map(q => ({ ...q })) };
  }

  /**
   * Apply progress from a gameplay event. Clamped at target; never negative.
   * @param {'collect_trash'|'unload_trash'|'earn_coins'} type
   * @param {number} amount — positive increment
   */
  addProgress(type, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    let changed = false;
    for (const q of this._state.quests) {
      if (q.type !== type || q.completed) continue;
      const next = Math.min(q.target, q.progress + Math.floor(amount));
      if (next !== q.progress) {
        q.progress = next;
        changed = true;
      }
      if (q.progress >= q.target && !q.completed) {
        q.completed = true; // claimable — reward pays on CLAIM, not here
        changed = true;
      }
    }
    if (changed) this._save();
  }

  /**
   * Claim a completed quest's reward exactly once.
   * @param {string} id
   * @returns {number|null} reward coins, or null when not claimable
   */
  claim(id) {
    const q = this._state.quests.find(q => q.id === id);
    if (!q || !q.completed || q.claimed) return null;
    q.claimed = true;
    this._save();
    return q.reward;
  }

  /** Any completed-but-unclaimed rewards (for a subtle HUD hint). */
  hasClaimable() {
    return this._state.quests.some(q => q.completed && !q.claimed);
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    } catch (_) { /* session-only quests then */ }
  }
}
