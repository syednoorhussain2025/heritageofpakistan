// src/components/NearbySearchModal.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/browser";
import Icon from "./Icon";
import { clearPlacesNearby } from "@/lib/placesNearby";

/* ───────────────────────── Types ───────────────────────── */
export type NearbyValue = {
  centerSiteId?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
};

type SiteRow = {
  id: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
  cover_photo_url?: string | null;
  location_free?: string | null;
};

/* ───────────────────────── Thumb helper ───────────────────────── */
function thumbUrl(input?: string | null, size = 48) {
  if (!input) return "";
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  let absolute = input;
  if (!/^https?:\/\//i.test(input)) {
    if (!SUPA_URL) return "";
    absolute = `${SUPA_URL}/storage/v1/object/public/${input.replace(/^\/+/, "")}`;
  }
  const isSameProject = SUPA_URL && absolute.startsWith(SUPA_URL);
  if (!isSameProject) return absolute;
  const PUBLIC_MARK = "/storage/v1/object/public/";
  const SIGN_MARK = "/storage/v1/object/sign/";
  let renderBase = "";
  let tail = "";
  if (absolute.includes(PUBLIC_MARK)) {
    renderBase = `${SUPA_URL}/storage/v1/render/image/public/`;
    tail = absolute.split(PUBLIC_MARK)[1];
  } else if (absolute.includes(SIGN_MARK)) {
    renderBase = `${SUPA_URL}/storage/v1/render/image/sign/`;
    tail = absolute.split(SIGN_MARK)[1];
  } else {
    return absolute;
  }
  const u = new URL(renderBase + tail);
  u.searchParams.set("width", String(size));
  u.searchParams.set("height", String(size));
  u.searchParams.set("resize", "cover");
  u.searchParams.set("quality", "75");
  return u.toString();
}

/* ───────────────────────── Site thumbnail ───────────────────────── */
function SiteThumbnail({ raw, size = 40 }: { raw?: string | null; size?: number }) {
  const thumb = thumbUrl(raw, size);
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const absoluteFallback = raw
    ? /^https?:\/\//i.test(raw)
      ? raw
      : SUPA_URL
      ? `${SUPA_URL}/storage/v1/object/public/${raw.replace(/^\/+/, "")}`
      : ""
    : "";

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {thumb ? (
        <img
          src={thumb}
          alt=""
          aria-hidden="true"
          className="rounded-full object-cover ring-1 ring-gray-200"
          style={{ width: size, height: size }}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const t = e.currentTarget as HTMLImageElement;
            if (absoluteFallback && t.src !== absoluteFallback) {
              t.src = absoluteFallback;
              return;
            }
            t.style.display = "none";
            const ph = t.nextElementSibling as HTMLElement | null;
            if (ph) ph.style.display = "flex";
          }}
        />
      ) : null}
      <div
        style={{ display: thumb ? "none" : "flex", width: size, height: size }}
        className="absolute inset-0 rounded-full bg-gray-100 ring-1 ring-gray-200 items-center justify-center text-gray-400"
      >
        <Icon name="image" size={Math.round(size * 0.3)} />
      </div>
    </div>
  );
}

/* ───────────────────────── Modal ───────────────────────── */
export default function NearbySearchModal({
  isOpen,
  onClose,
  value,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  value: NearbyValue;
  onApply: (v: NearbyValue) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SiteRow[]>([]);
  const [draftSite, setDraftSite] = useState<{
    id: string;
    title: string;
    subtitle?: string | null;
    lat: number;
    lng: number;
    cover?: string | null;
  } | null>(null);
  const [draftRadius, setDraftRadius] = useState(25);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* Init draft when modal opens */
  useEffect(() => {
    if (!isOpen) return;
    setDraftRadius(
      typeof value.radiusKm === "number" && value.radiusKm > 0
        ? value.radiusKm
        : 25
    );
    setQuery("");
    setResults([]);
    setSearchOpen(false);

    if (!value.centerSiteId) {
      setDraftSite(null);
      return;
    }

    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id,title,cover_photo_url,location_free,latitude,longitude")
        .eq("id", value.centerSiteId)
        .maybeSingle();
      if (!active) return;
      if (!error && data && data.latitude != null && data.longitude != null) {
        setDraftSite({
          id: data.id,
          title: data.title,
          subtitle: data.location_free ?? null,
          lat: Number(data.latitude),
          lng: Number(data.longitude),
          cover: data.cover_photo_url ?? null,
        });
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, value.centerSiteId]);

  /* Live site search */
  useEffect(() => {
    let active = true;
    (async () => {
      if (!searchOpen || query.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      const { data, error } = await supabase
        .from("sites")
        .select("id,title,latitude,longitude,cover_photo_url,location_free")
        .ilike("title", `%${query.trim()}%`)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("title")
        .limit(12);
      if (active) {
        if (!error) setResults((data || []) as SiteRow[]);
        setSearching(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [searchOpen, query]);

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  /* Focus input when modal opens (and no site is already selected) */
  useEffect(() => {
    if (isOpen && !draftSite) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isOpen, draftSite]);

  const chooseSite = (row: SiteRow) => {
    if (row.latitude == null || row.longitude == null) return;
    setDraftSite({
      id: row.id,
      title: row.title,
      subtitle: row.location_free ?? null,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      cover: row.cover_photo_url ?? null,
    });
    setQuery("");
    setSearchOpen(false);
    setResults([]);
  };

  const clearDraft = () => {
    setDraftSite(null);
    setQuery("");
  };

  const handleApply = () => {
    if (!draftSite) return;
    onApply({
      centerSiteId: draftSite.id,
      centerLat: draftSite.lat,
      centerLng: draftSite.lng,
      radiusKm: draftRadius,
    });
    onClose();
  };

  const handleClear = () => {
    onApply(clearPlacesNearby());
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-modal="true"
      role="dialog"
      aria-label="Search Around a Site"
    >
      {/* Backdrop — appears instantly, no transition */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Modal panel — fades + scales in */}
      <div
        className={`relative w-full max-w-lg bg-white rounded-2xl shadow-2xl ring-1 ring-gray-200 flex flex-col transition-all duration-200 ${
          isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 rounded-t-2xl overflow-hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)]/10 flex items-center justify-center">
              <Icon
                name="map-marker-alt"
                size={14}
                className="text-[var(--brand-orange)]"
              />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Search Around a Site
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
            aria-label="Close"
          >
            <Icon name="times" size={12} />
          </button>
        </div>

        {/* Body — no overflow-y-auto so the search dropdown can expand freely */}
        <div className="px-5 py-4 space-y-5 flex-1">
          {/* Site picker */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wider">
                Heritage Site
              </label>
              <span className="relative group/hs-info cursor-default">
                <Icon name="info-circle" size={11} className="text-gray-400" />
                <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 px-2.5 py-1.5 bg-gray-900 text-white text-[0.68rem] rounded-lg whitespace-nowrap opacity-0 group-hover/hs-info:opacity-100 transition-opacity duration-150 z-50 shadow-lg leading-snug w-52 whitespace-normal">
                  Type 2+ characters to search. Select a site to enable the radius filter.
                  <span className="absolute top-full left-4 border-[3px] border-transparent border-t-gray-900" />
                </span>
              </span>
            </div>
            <div className="relative">
              {draftSite ? (
                /* Selected site card */
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--brand-orange)]/40 bg-[var(--brand-orange)]/5">
                  <SiteThumbnail raw={draftSite.cover} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="text-gray-900 font-medium truncate text-sm">
                      {draftSite.title}
                    </div>
                    {draftSite.subtitle && (
                      <div className="text-xs text-gray-500 truncate">
                        {draftSite.subtitle}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={clearDraft}
                    className="w-6 h-6 rounded-full bg-white ring-1 ring-gray-300 flex items-center justify-center text-gray-500 hover:text-[var(--brand-orange)] transition-colors flex-shrink-0"
                    title="Change site"
                  >
                    <Icon name="times" size={9} />
                  </button>
                </div>
              ) : (
                /* Search input + dropdown */
                <div className="rounded-xl bg-white border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/30 focus-within:border-[var(--brand-orange)] transition-all">
                  <div className="flex items-center">
                    <Icon
                      name="map-marker-alt"
                      size={14}
                      className="ml-3 mr-2 text-gray-400 flex-shrink-0"
                    />
                    <input
                      ref={inputRef}
                      className="w-full px-2 py-2.5 bg-transparent outline-none text-gray-800 placeholder-gray-500 text-sm"
                      placeholder="Type a site name…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSearchOpen(true);
                      }}
                      onFocus={() => setSearchOpen(true)}
                    />
                    {query && (
                      <button
                        onClick={() => {
                          setQuery("");
                          setResults([]);
                        }}
                        className="mr-3 w-5 h-5 rounded-full bg-gray-100 ring-1 ring-gray-300 flex items-center justify-center text-gray-500 hover:text-[var(--brand-orange)] transition-colors flex-shrink-0"
                        title="Clear"
                      >
                        <Icon name="times" size={9} />
                      </button>
                    )}
                  </div>

                  {/* Dropdown results — z-50 so it floats above the radius section */}
                  {searchOpen && query.length >= 2 && (
                    <div className="absolute left-0 right-0 z-50 mt-1 bg-white rounded-xl shadow-2xl ring-1 ring-gray-100 overflow-hidden">
                      {searching ? (
                        <div className="px-4 py-3 text-xs text-gray-500">
                          Searching…
                        </div>
                      ) : results.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-gray-500">
                          No sites found
                        </div>
                      ) : (
                        <ul className="max-h-[280px] overflow-auto py-1.5 divide-y divide-gray-100">
                          {results.map((r) => (
                            <li
                              key={r.id}
                              onClick={() => chooseSite(r)}
                              className="px-4 py-2.5 cursor-pointer hover:bg-gray-50 flex items-center gap-3"
                            >
                              <SiteThumbnail raw={r.cover_photo_url} size={36} />
                              <div className="min-w-0">
                                <div className="text-gray-900 font-medium truncate text-sm">
                                  {r.title}
                                </div>
                                {r.location_free && (
                                  <div className="text-xs text-gray-500 truncate">
                                    {r.location_free}
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Radius slider */}
          <div>
            <label className="block text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Radius (km)
            </label>
            <div
              className={`transition-opacity ${
                draftSite ? "" : "opacity-40 pointer-events-none"
              }`}
            >
              <div className="grid grid-cols-[1fr_auto] gap-2.5 items-center">
                <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/40 px-3 py-1.5">
                  <input
                    type="range"
                    min={1}
                    max={300}
                    step={1}
                    value={draftRadius}
                    onChange={(e) => setDraftRadius(Number(e.target.value))}
                    className="w-full"
                    disabled={!draftSite}
                  />
                </div>
                <div className="w-24 rounded-xl bg-white shadow-sm ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/40 px-2.5 py-1.5">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    value={draftRadius}
                    onChange={(e) =>
                      setDraftRadius(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-full bg-transparent outline-none text-right text-xs"
                    disabled={!draftSite}
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[0.7rem] text-gray-500">
                {draftSite
                  ? `Sites within ${draftRadius} km of ${draftSite.title}`
                  : "Select a site above to enable radius search."}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleApply}
            disabled={!draftSite}
            className="flex-1 py-2.5 rounded-xl bg-[var(--brand-blue)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 text-sm flex items-center justify-center gap-2"
          >
            <Icon name="search" size={13} />
            {draftSite ? `Search within ${draftRadius} km` : "Select a Site First"}
          </button>
          <button
            onClick={handleClear}
            className="px-4 rounded-xl bg-white ring-1 ring-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 text-xs transition-all"
            title="Clear proximity search"
          >
            <Icon name="redo-alt" size={12} className="text-[var(--brand-orange)]" />
            Clear
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
