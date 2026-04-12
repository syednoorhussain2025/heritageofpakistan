// src/hooks/useDashboardQueries.ts
// React Query hooks for all dashboard pages.
// Each hook has a stable query key so DashboardShellClient can prefetch them all
// before the user taps — making every dashboard navigation feel instant.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/browser";
import { listUserReviews, type ReviewRow } from "@/lib/db/reviews";
import { countUserVisits } from "@/lib/db/visited";
import { listPhotoCollections } from "@/lib/photoCollections";
import { listPortfolio } from "@/lib/db/portfolio";
import { listTripsByUsername } from "@/lib/trips";

// ─── Query key factory ───────────────────────────────────────────────────────

export const dashboardKeys = {
  wishlists: (userId: string) => ["dashboard", "wishlists", userId] as const,
  collections: (userId: string) => ["dashboard", "collections", userId] as const,
  trips: (key: string) => ["dashboard", "trips", key] as const,
  reviews: (_userId: string) => ["dashboard", "reviews", "me"] as const,
  placesVisited: (_userId: string) => ["dashboard", "placesVisited", "me"] as const,
  visitedCount: (userId: string) => ["dashboard", "visitedCount", userId] as const,
  profilePane: () => ["dashboard", "profilePane"] as const,
};

// ─── Fetch functions ─────────────────────────────────────────────────────────

export type WishlistCard = {
  id: string;
  name: string;
  is_public: boolean;
  wishlist_items?: { count: number }[];
  first_item?: { sites: { cover_photo_thumb_url: string | null; cover_photo_url: string | null } | null }[];
};

export async function fetchWishlists(): Promise<WishlistCard[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("wishlists")
    .select(`
      id, name, is_public,
      wishlist_items(count),
      first_item:wishlist_items(sites(cover_photo_thumb_url, cover_photo_url))
    `)
    .order("created_at", { ascending: true })
    .limit(1, { foreignTable: "first_item" });
  if (error) throw error;
  return (data as unknown as WishlistCard[]) ?? [];
}

export async function fetchCollections() {
  return listPhotoCollections();
}

export async function fetchTrips(username: string) {
  return listTripsByUsername(username);
}

// Fetches from reviews_with_profiles view — RLS scopes to auth.uid() automatically
export async function fetchReviews(_userId?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return [] as any[];
  const { data, error } = await supabase
    .from("reviews_with_profiles")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function fetchPlacesVisited(_userId?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) return { count: 0, reviews: [] };
  const [count, reviews] = await Promise.all([
    countUserVisits(userId),
    listUserReviews(userId),
  ]);
  const siteIds = Array.from(new Set(reviews.map((r) => r.site_id)));
  let sites: any[] = [];
  if (siteIds.length) {
    const { data } = await supabase
      .from("sites")
      .select("id, title, slug, cover_photo_url, latitude, longitude, location_free, heritage_type, site_categories!inner(categories(icon_key))")
      .in("id", siteIds);
    sites = data ?? [];
  }
  return {
    count,
    reviews: reviews.map((r) => ({ ...r, site: sites.find((s) => s.id === r.site_id) })),
  };
}

export async function fetchProfilePane() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) return null;
  const [accountRes, categoriesRes, interestsRes] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, bio, city, country_code, travel_style, public_profile").eq("id", userId).single(),
    supabase.from("categories").select("id, name, parent_id").is("parent_id", null).order("name"),
    supabase.from("user_interests").select("category_id, weight").eq("user_id", userId),
  ]);
  return {
    account: accountRes.data ?? null,
    categories: categoriesRes.data ?? [],
    interests: interestsRes.data ?? [],
  };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useWishlists() {
  return useQuery({
    queryKey: dashboardKeys.wishlists("me"),
    queryFn: fetchWishlists,
  });
}

export function useCollections() {
  return useQuery({
    queryKey: dashboardKeys.collections("me"),
    queryFn: fetchCollections,
  });
}

export function useTrips(username: string) {
  // trips are RLS-scoped to auth.uid() — username is ignored at DB level
  // Use "me" as a stable cache key so prefetch and component share the same entry
  return useQuery({
    queryKey: dashboardKeys.trips("me"),
    queryFn: () => fetchTrips(username),
  });
}

export function useDashboardReviews(_userId: string | null) {
  return useQuery({
    queryKey: dashboardKeys.reviews("me"),
    queryFn: () => fetchReviews(),
  });
}

export function usePlacesVisited(_userId: string | null) {
  return useQuery({
    queryKey: dashboardKeys.placesVisited("me"),
    queryFn: () => fetchPlacesVisited(),
  });
}

export function useProfilePane() {
  return useQuery({
    queryKey: dashboardKeys.profilePane(),
    queryFn: fetchProfilePane,
  });
}

// ─── Prefetch all dashboard queries at once ──────────────────────────────────
// Call this when the dashboard home mounts so all sub-pages have data ready.

export function usePrefetchDashboard(userId: string | null) {
  const queryClient = useQueryClient();

  function prefetchAll() {
    if (!userId) return;
    queryClient.prefetchQuery({ queryKey: dashboardKeys.wishlists("me"), queryFn: fetchWishlists });
    queryClient.prefetchQuery({ queryKey: dashboardKeys.collections("me"), queryFn: fetchCollections });
    queryClient.prefetchQuery({ queryKey: dashboardKeys.reviews("me"), queryFn: () => fetchReviews() });
    queryClient.prefetchQuery({ queryKey: dashboardKeys.placesVisited("me"), queryFn: () => fetchPlacesVisited() });
    queryClient.prefetchQuery({ queryKey: dashboardKeys.profilePane(), queryFn: fetchProfilePane });
    queryClient.prefetchQuery({ queryKey: dashboardKeys.trips("me"), queryFn: () => fetchTrips("") });
  }

  return prefetchAll;
}
