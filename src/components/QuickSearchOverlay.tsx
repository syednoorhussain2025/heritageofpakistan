"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getPublicClient } from "@/lib/supabase/browser";
import { hapticLight, hapticMedium } from "@/lib/haptics";

/* ── Types ── */

type SearchSite = {
  id: string;
  slug: string;
  province_slug?: string | null;
  province_id?: string | null;
  title: string;
  cover_photo_thumb_url?: string | null;
  cover_photo_url?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  location_free?: string | null;
  tagline?: string | null;
};

type SearchRegion = {
  id: string;
  name: string;
  slug?: string | null;
  parent_id?: string | null;
};

/* ── Recent searches ── */

const RECENT_KEY = "home_recent_searches";
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function saveRecent(q: string) {
  try {
    const prev = loadRecent().filter((s) => s !== q);
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENT)));
  } catch {}
}
function clearRecent() {
  try { localStorage.removeItem(RECENT_KEY); } catch {}
}

/* ── Province slug cache (needed so site links resolve correctly) ── */

let _provinceSlugCache: Record<string, string> | null = null;
let _provinceSlugCachePromise: Promise<Record<string, string>> | null = null;

async function warmProvinceSlugCache(): Promise<Record<string, string>> {
  if (_provinceSlugCache) return _provinceSlugCache;
  if (_provinceSlugCachePromise) return _provinceSlugCachePromise;
  _provinceSlugCachePromise = Promise.resolve(
    getPublicClient()
      .from("regions")
      .select("id, slug")
      .is("parent_id", null)
  ).then(({ data }) => {
    const map: Record<string, string> = {};
    (data || []).forEach((r: { id: string; slug: string }) => { map[r.id] = r.slug; });
    _provinceSlugCache = map;
    return map;
  });
  return _provinceSlugCachePromise;
}

async function ensureProvinceSlugOnSites(sites: SearchSite[]) {
  const missing = sites.filter((s) => !s.province_slug && s.province_id);
  if (!missing.length) return;
  const cache = await warmProvinceSlugCache();
  missing.forEach((s) => { if (s.province_id) s.province_slug = cache[s.province_id] ?? null; });
}

/* ── Fallback gradient ── */

const FALLBACK_GRADIENT = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#F78300"/><stop offset="100%" stop-color="#16a34a"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`
);

/* ── Props ── */

interface QuickSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional: called when a site is selected. If not provided, navigates to site page directly. */
  onSiteSelect?: (site: SearchSite) => void;
}

/* ── Component ── */

export default function QuickSearchOverlay({ isOpen, onClose, onSiteSelect }: QuickSearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [sites, setSites] = useState<SearchSite[]>([]);
  const [regions, setRegions] = useState<SearchRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount → next frame → slide in
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setRecents(loadRecent());
      const r1 = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
          setTimeout(() => inputRef.current?.focus(), 320);
        });
      });
      return () => cancelAnimationFrame(r1);
    } else {
      setVisible(false);
      const t = setTimeout(() => {
        setMounted(false);
        setQuery("");
        setSites([]);
        setRegions([]);
      }, 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSites([]); setRegions([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const q = query.trim();
      const sb = getPublicClient();
      const [sitesRes, regionsRes] = await Promise.all([
        sb.from("sites")
          .select("id, slug, province_id, title, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, location_free, tagline")
          .eq("is_published", true)
          .or(`title.ilike.%${q}%,location_free.ilike.%${q}%`)
          .limit(15),
        sb.from("regions")
          .select("id, name, slug, parent_id")
          .ilike("name", `%${q}%`)
          .order("name")
          .limit(10),
      ]);
      const fetchedSites = (sitesRes.data || []) as SearchSite[];
      await ensureProvinceSlugOnSites(fetchedSites);
      setSites(fetchedSites);
      setRegions((regionsRes.data || []) as SearchRegion[]);
      setLoading(false);
    }, 280);
  }, [query]);

  async function handleSiteSelect(site: SearchSite) {
    saveRecent(site.title);
    // Ensure province_slug is resolved before navigating or opening bottom sheet
    if (!site.province_slug && site.province_id) {
      const cache = await warmProvinceSlugCache();
      site.province_slug = cache[site.province_id] ?? null;
    }
    if (onSiteSelect) {
      onSiteSelect(site);
      onClose();
    } else {
      const href = site.province_slug
        ? `/heritage/${site.province_slug}/${site.slug}`
        : `/explore?q=${encodeURIComponent(site.title)}`;
      router.push(href);
      onClose();
    }
  }

  function handleRegionSelect(region: SearchRegion) {
    saveRecent(region.name);
    router.push(`/explore?regs=${region.id}`);
    onClose();
  }

  function handleRecentSelect(term: string) {
    setQuery(term);
    inputRef.current?.focus();
  }

  const hasResults = sites.length > 0 || regions.length > 0;
  const showEmpty = !loading && query.trim().length > 0 && !hasResults;
  const siteRows: SearchSite[][] = [];
  for (let i = 0; i < sites.length; i += 4) siteRows.push(sites.slice(i, i + 4));

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Full-screen white backdrop — above all portalled headers and menus */}
      <div className="fixed inset-0 z-[10000] bg-white" />

      {/* Content slides up */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[10001] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${visible ? "translate-y-0" : "translate-y-full"}`}
        style={{ top: 0, height: "100svh", overflow: "hidden" }}
      >
        {/* Search bar row */}
        <div
          className="flex items-center gap-2 px-3 shrink-0"
          style={{ paddingTop: "calc(var(--sat, 44px) + 8px)", paddingBottom: 12 }}
        >
          {/* Back button */}
          <button
            onClick={() => { void hapticLight(); onClose(); }}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 text-[var(--brand-blue)]"
            aria-label="Back"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Pill input */}
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2.5">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites, places, regions…"
              className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {query.length > 0 && (
              <button onClick={() => { void hapticLight(); setQuery(""); }} className="text-gray-400 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="h-px bg-gray-100 shrink-0" />

        {/* Scrollable results */}
        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="flex justify-center py-10">
              <span className="w-5 h-5 border-2 border-[var(--brand-green)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && !query.trim() && recents.length > 0 && (
            <div className="pt-5 pb-4">
              <div className="flex items-center justify-between px-4 mb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Recent</p>
                <button
                  onClick={() => { void hapticLight(); clearRecent(); setRecents([]); }}
                  className="text-xs text-[var(--brand-green)] font-semibold"
                >
                  Clear
                </button>
              </div>
              {recents.map((term) => (
                <button
                  key={term}
                  onClick={() => { void hapticLight(); handleRecentSelect(term); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 active:bg-gray-50"
                >
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-600">{term}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && !query.trim() && recents.length === 0 && (
            <p className="text-center text-sm text-gray-400 mt-16">Start typing to search…</p>
          )}

          {showEmpty && (
            <p className="text-center text-sm text-gray-400 mt-16">
              No results for "<span className="text-gray-600">{query}</span>"
            </p>
          )}

          {!loading && hasResults && (
            <div className="pt-4 pb-12 space-y-6">

              {sites.length > 0 && (
                <div>
                  <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Sites</p>
                  <div className="flex gap-3 px-4 overflow-x-auto pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
                    {siteRows.map((row, ri) => (
                      <div key={ri} className="flex flex-col gap-1 shrink-0">
                        {row.map((site) => (
                          <button
                            key={site.id}
                            onClick={() => { void hapticMedium(); handleSiteSelect(site); }}
                            className="flex items-center gap-3 py-2 pr-4 active:bg-gray-50 rounded-xl text-left"
                            style={{ width: "56vw", maxWidth: 240 }}
                          >
                            <div className="shrink-0 w-14 h-14 rounded-full overflow-hidden bg-gray-100">
                              <img
                                src={site.cover_photo_thumb_url || site.cover_photo_url || FALLBACK_GRADIENT}
                                alt={site.title}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GRADIENT; }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-[var(--brand-blue)] leading-tight truncate">{site.title}</div>
                              {site.location_free && (
                                <div className="text-[11px] text-gray-400 truncate">{site.location_free}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {regions.length > 0 && (
                <div>
                  <p className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Regions & Locations</p>
                  <div className="flex gap-2.5 px-4 overflow-x-auto pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
                    {regions.map((region) => (
                      <button
                        key={region.id}
                        onClick={() => { void hapticLight(); handleRegionSelect(region); }}
                        className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gray-100 border border-gray-200 active:bg-gray-200"
                      >
                        <svg className="w-3 h-3 text-[var(--brand-green)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-semibold text-[var(--brand-blue)] whitespace-nowrap">{region.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
