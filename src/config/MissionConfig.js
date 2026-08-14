/**
 * MissionConfig.js — Mission rules.
 *
 * The mission is goal-based: collect TRASH_GOAL items to complete it, then
 * return to the harbour to see the Mission Summary. Scoring is defined here
 * so the TrashSystem and UI always agree.
 */
export const MissionConfig = {
  /** Items to collect before the mission counts as complete. */
  TRASH_GOAL: 20,
  /** Points awarded per reeled-in item. */
  SCORE_PER_TRASH: 50,
  /** Eco-rating thresholds (used by the Mission Summary). */
  RATINGS: [
    { min: 20, label: 'Ocean Guardian', icon: 'crown' },
    { min: 10, label: 'Eco Sailor',     icon: 'star'  },
    { min: 0,  label: 'Ocean Recruit',  icon: 'wave'  },
  ],
};
