// Server-side map bootstrap data for /map page.
// Time-based cache like images: revalidate in seconds (same style as heritage revalidate = 3600).

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public-server";

export type MapBootstrap = {
  mapSettings: Record<string, unknown> | null;
  icons: Array<{ name: string; svg_content: string }>;
  categories: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
};

const CACHE_TAG = "map-bootstrap";
/** Revalidate after this many seconds (30 days). */
const REVALIDATE_SECONDS = 30 * 24 * 60 * 60; // 30 days

async function fetchMapBootstrapUncached(): Promise<MapBootstrap> {
  const supabase = createPublicClient();

  const [settingsRes, iconsRes, catsRes, regsRes] = await Promise.all([
    supabase
      .from("global_settings")
      .select("value")
      .eq("key", "map_settings")
      .maybeSingle(),
    supabase.from("icons").select("name, svg_content"),
    supabase.from("categories").select("id,name").order("name"),
    supabase.from("regions").select("id,name").order("name"),
  ]);

  return {
    mapSettings: (settingsRes?.data as { value?: Record<string, unknown> } | null)?.value ?? null,
    icons: (iconsRes?.data as MapBootstrap["icons"]) ?? [],
    categories: (catsRes?.data as MapBootstrap["categories"]) ?? [],
    regions: (regsRes?.data as MapBootstrap["regions"]) ?? [],
  };
}

/**
 * Fetches map bootstrap (settings, icons, categories, regions) on the server.
 * Cached for REVALIDATE_SECONDS so repeat requests and navigations are fast.
 * Use in the map page server component and pass as initialBootstrap to the client.
 */
export async function fetchMapBootstrap(): Promise<MapBootstrap> {
  return unstable_cache(
    fetchMapBootstrapUncached,
    [CACHE_TAG],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] }
  )();
}
