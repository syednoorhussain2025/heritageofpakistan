import { supabase } from "@/lib/supabaseClient";

/**
 * Fetches all sites within a given radius of a center point.
 */
export async function fetchSitesWithinRadius(
  lat: number,
  lng: number,
  radiusKm: number,
  name?: string
) {
  const { data, error } = await supabase.rpc("sites_within_radius", {
    center_lat: lat,
    center_lng: lng,
    radius_km: radiusKm,
    name_ilike: name ?? null,
  });

  if (error) throw error;
  return data as {
    id: string;
    title: string;
    latitude: number;
    longitude: number;
    distance_km: number;
  }[];
}
