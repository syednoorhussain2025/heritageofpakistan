/**
 * Central helper for "Places Nearby" behavior across the app.
 * Focuses ONLY on radius-based site search state.
 */

export const PLACES_NEARBY_KEYS = {
  site: "center", // site id
  lat: "clat",
  lng: "clng",
  radius: "rkm",
} as const;

export type NearbyParams = {
  centerSiteId: string | null;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
};

/* ───────────────────────────── Core Utilities ───────────────────────────── */

/** Build a URL for Explore page showing nearby sites. */
export function buildPlacesNearbyURL(opts: {
  siteId: string;
  lat: number;
  lng: number;
  radiusKm?: number;
  basePath?: string;
}) {
  const base = opts.basePath || "/explore";
  const url = new URL(
    base,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );

  url.searchParams.set(PLACES_NEARBY_KEYS.site, opts.siteId);
  url.searchParams.set(PLACES_NEARBY_KEYS.lat, String(opts.lat));
  url.searchParams.set(PLACES_NEARBY_KEYS.lng, String(opts.lng));
  url.searchParams.set(PLACES_NEARBY_KEYS.radius, String(opts.radiusKm ?? 25));

  return url.toString();
}

/** Read Explore URL params → NearbyParams. */
export function readPlacesNearbyParams(
  searchParams: URLSearchParams
): NearbyParams {
  const siteId = searchParams.get(PLACES_NEARBY_KEYS.site);
  const lat = Number(searchParams.get(PLACES_NEARBY_KEYS.lat));
  const lng = Number(searchParams.get(PLACES_NEARBY_KEYS.lng));
  const rkm = Number(searchParams.get(PLACES_NEARBY_KEYS.radius));

  return {
    centerSiteId: siteId || null,
    centerLat: !Number.isNaN(lat) ? lat : null,
    centerLng: !Number.isNaN(lng) ? lng : null,
    radiusKm: !Number.isNaN(rkm) ? rkm : null,
  };
}

/** Check if the Explore filters represent an active "Places Nearby" search. */
export function isPlacesNearbyActive(p: NearbyParams | null | undefined) {
  if (!p) return false;
  return (
    p.centerSiteId &&
    typeof p.centerLat === "number" &&
    typeof p.centerLng === "number" &&
    typeof p.radiusKm === "number" &&
    p.radiusKm > 0
  );
}

/** Reset / clear radius search fields. */
export function clearPlacesNearby(): NearbyParams {
  return {
    centerSiteId: null,
    centerLat: null,
    centerLng: null,
    radiusKm: null,
  };
}
