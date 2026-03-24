// src/lib/db/badges.ts

// The definitive list of all possible badge names in your system.
export type Badge =
  | "Beginner"
  | "Scout"
  | "Explorer"
  | "Adventurer"
  | "Voyager"
  | "Wanderer"
  | "Globetrotter"
  | "Heritage Guardian"
  | "Master Traveler"
  | "Legendary Nomad";

// Defines the structure for a single badge tier.
type Tier = {
  name: Badge;
  min: number; // The minimum number of reviews (inclusive) to earn this badge.
  max?: number; // The maximum number of reviews (inclusive). Undefined for the final tier.
};

// The official list of badge tiers, updated with your new structure.
// This is the single source of truth for badge progression.
export const BADGE_TIERS: Tier[] = [
  { name: "Beginner", min: 0, max: 0 },
  { name: "Scout", min: 1, max: 4 },
  { name: "Explorer", min: 5, max: 29 },
  { name: "Adventurer", min: 30, max: 79 },
  { name: "Voyager", min: 80, max: 119 },
  { name: "Wanderer", min: 120, max: 199 },
  { name: "Globetrotter", min: 200, max: 299 },
  { name: "Heritage Guardian", min: 300, max: 499 },
  { name: "Master Traveler", min: 500, max: 799 },
  { name: "Legendary Nomad", min: 800 },
];

/**
 * Computes which badge a user should have based on their total review/visit count.
 * @param visitedCount The total number of reviews or visits for the user.
 * @returns The corresponding Badge name.
 */
export function badgeForCount(visitedCount: number): Badge {
  for (const tier of BADGE_TIERS) {
    if (visitedCount >= tier.min && (tier.max === undefined || visitedCount <= tier.max)) {
      return tier.name;
    }
  }
  return "Beginner";
}

/**
 * Calculates how many more visits are needed for the user to reach the next badge.
 * @param visitedCount The user's current total number of reviews or visits.
 * @returns An object with the current badge, the next badge, and the remaining count.
 */
export function progressToNextBadge(visitedCount: number) {
  const current = badgeForCount(visitedCount);
  const currentTierIndex = BADGE_TIERS.findIndex((t) => t.name === current);

  // Find the next tier in the array.
  const nextTier = BADGE_TIERS[currentTierIndex + 1];

  if (!nextTier) {
    // This is the final badge, there is no next tier.
    return { current, remaining: 0, next: null };
  }

  return {
    current,
    remaining: Math.max(nextTier.min - visitedCount, 0),
    next: nextTier.name,
  };
}
