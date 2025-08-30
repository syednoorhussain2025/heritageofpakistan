// src/lib/db/badges.ts

// The definitive list of all possible badge names in your system.
export type Badge =
  | "Beginner"
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
  { name: "Beginner", min: 1, max: 5 },
  { name: "Explorer", min: 6, max: 30 },
  { name: "Adventurer", min: 31, max: 80 },
  { name: "Voyager", min: 81, max: 120 },
  { name: "Wanderer", min: 121, max: 200 },
  { name: "Globetrotter", min: 201, max: 300 },
  { name: "Heritage Guardian", min: 301, max: 500 },
  { name: "Master Traveler", min: 501, max: 800 },
  { name: "Legendary Nomad", min: 801 },
];

/**
 * Computes which badge a user should have based on their total review/visit count.
 * @param visitedCount The total number of reviews or visits for the user.
 * @returns The corresponding Badge name.
 */
export function badgeForCount(visitedCount: number): Badge {
  // Iterate through the tiers to find the one that matches the user's count.
  for (const tier of BADGE_TIERS) {
    if (visitedCount >= tier.min && (!tier.max || visitedCount <= tier.max)) {
      return tier.name;
    }
  }
  // Default to "Beginner" if no other tier matches.
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
