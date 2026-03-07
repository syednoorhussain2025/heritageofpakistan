/**
 * Client-side cache for map bootstrap and sites (localStorage).
 * Time-based cache like images: max-age in seconds, then convert to ms for TTL.
 * Same style as img-proxy (max-age=31536000) and heritage pages (revalidate=3600).
 */

const BOOTSTRAP_KEY = "hop:map:bootstrap:v1";
const SITES_KEY = "hop:map:sites:v1";

/** Cache max-age in seconds (like Cache-Control max-age). 30 days. */
const BOOTSTRAP_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const SITES_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;     // 30 days

const BOOTSTRAP_TTL_MS = BOOTSTRAP_MAX_AGE_SECONDS * 1000;
const SITES_TTL_MS = SITES_MAX_AGE_SECONDS * 1000;

export type CachedBootstrap = {
  mapSettings: Record<string, unknown> | null;
  icons: Array<{ name: string; svg_content: string }>;
  categories: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  cachedAt: number;
};

export function getCachedBootstrap(): CachedBootstrap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOTSTRAP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedBootstrap;
    if (!data || !data.cachedAt) return null;
    if (Date.now() - data.cachedAt > BOOTSTRAP_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function setCachedBootstrap(b: Omit<CachedBootstrap, "cachedAt">): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      BOOTSTRAP_KEY,
      JSON.stringify({ ...b, cachedAt: Date.now() } as CachedBootstrap)
    );
  } catch {
    // quota or disabled
  }
}

export type CachedSites = { sites: unknown[]; cachedAt: number };

export function getCachedSites(): CachedSites | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SITES_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedSites;
    if (!data?.sites || !Array.isArray(data.sites) || !data.cachedAt) return null;
    if (Date.now() - data.cachedAt > SITES_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function setCachedSites(sites: unknown[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SITES_KEY, JSON.stringify({ sites, cachedAt: Date.now() }));
  } catch {
    // quota or disabled
  }
}
