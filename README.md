# Ocean Cleanup 2
## Ocean cleaning game

### Created and maintained by [adityaagurav](https://github.com/adityaagurav)

![Game preview](assets/preview.png)

## Progression

The core loop is continuous — no missions, no completion screens:

```
COLLECT TRASH → RETURN TO HARBOR → [E] UNLOAD → EARN COINS → REPEAT
```

### Coins

- Trash is stored on your boat as you collect it. Nothing is rewarded automatically.
- Sail to the **recycling station** on the harbor dock and press **[E] Unload Trash** when prompted.
- Unloading pays **5 coins per trash** (`COINS_PER_TRASH` in `src/config/ProgressionConfig.js`), with a lightweight trash-arc animation and a `+X` coin popup in the HUD.
- Unloading is locked while in progress — repeated presses can never duplicate rewards.
- Coins persist locally (`localStorage`) across sessions.

### Weekly quests

Optional, non-blocking goals tracked in `src/config/WeeklyQuests.js`. Progress updates from real gameplay events only (collect / unload / earn) — never per-frame:

| Quest | Reward |
| --- | --- |
| Collect 50 trash | 🪙 100 |
| Unload 30 trash | 🪙 150 |
| Earn 250 coins | 🪙 100 |

- Open the **WEEKLY** panel from the HUD to view progress and claim rewards (each claimable exactly once).
- Quests reset every **Monday 00:00 local time**; coins are kept across resets. Progress persists through refreshes.
