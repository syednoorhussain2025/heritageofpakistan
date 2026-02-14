"use client";

import { useEffect, useMemo, useState } from "react";
import HeritageSection from "./HeritageSection";
import SitePreviewCard from "@/components/SitePreviewCard";
import { supabase } from "@/lib/supabase/browser";
import Link from "next/link";
import { buildPlacesNearbyURL } from "@/lib/placesNearby";

type NearbySite = {
  id: string;
  slug: string;
  province_id?: number | null;
  province_slug?: string | null;

  title: string;
  cover_photo_url?: string | null;
  cover_blur_data_url?: string | null;
  cover_width?: number | null;
  cover_height?: number | null;

  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  latitude: number | null;
  longitude: number | null;
  distance_km?: number | null;
};

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));
  return EARTH_RADIUS_KM * c;
}

function bboxAround(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

async function buildProvinceSlugMapForSites(siteIds: string[]) {
  const out = new Map<string, string | null>();
  if (!siteIds.length) return out;

  const { data: siteRows } = await supabase
    .from("sites")
    .select("id, province_id")
    .in("id", siteIds);

  if (!siteRows?.length) return out;

  const bySiteId = new Map<string, number | null>();
  const provinceIds = new Set<number>();
  for (const r of siteRows as { id: string; province_id: number | null }[]) {
    bySiteId.set(r.id, r.province_id ?? null);
    if (r.province_id != null) provinceIds.add(r.province_id);
  }

  let slugByProvinceId = new Map<number, string>();
  if (provinceIds.size > 0) {
    const { data: provs } = await supabase
      .from("provinces")
      .select("id, slug")
      .in("id", Array.from(provinceIds));
    slugByProvinceId = new Map(
      (provs || []).map((p: any) => [p.id as number, String(p.slug ?? "").trim()])
    );
  }

  for (const id of siteIds) {
    const pid = bySiteId.get(id);
    const slug = pid != null ? slugByProvinceId.get(pid) ?? null : null;
    out.set(id, slug && slug.length > 0 ? slug : null);
  }
  return out;
}

async function ensureProvinceSlugOnSites(sites: NearbySite[]) {
  const missing = sites.filter(
    (s) => !s.province_slug || s.province_slug.trim() === ""
  );
  if (missing.length === 0) return;

  const ids = missing.map((s) => s.id);
  const slugMap = await buildProvinceSlugMapForSites(ids);
  for (const s of sites) {
    if (!s.province_slug || s.province_slug.trim() === "") {
      s.province_slug = slugMap.get(s.id) ?? null;
    }
  }
}

function buildCoverUrlFromStoragePath(storagePath: string | null) {
  if (!storagePath) return "";
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!SUPA_URL) return "";
  const clean = storagePath.replace(/^\/+/, "");
  return `${SUPA_URL}/storage/v1/object/public/site-images/${clean}`;
}

async function attachActiveCovers(sites: NearbySite[]) {
  const ids = Array.from(new Set(sites.map((s) => s.id))).filter(Boolean);
  if (!ids.length) return;
  const { data } = await supabase
    .from("site_covers")
    .select("site_id, storage_path, blur_data_url, width, height")
    .in("site_id", ids)
    .eq("is_active", true);

  if (!data?.length) return;

  const bySiteId = new Map<string, any>();
  for (const row of data) bySiteId.set(row.site_id, row);

  for (const s of sites) {
    const cover = bySiteId.get(s.id);
    if (!cover) continue;
    const url = buildCoverUrlFromStoragePath(cover.storage_path);
    s.cover_photo_url = url || null;
    s.cover_blur_data_url = cover.blur_data_url ?? null;
    s.cover_width = cover.width ?? null;
    s.cover_height = cover.height ?? null;
  }
}

export default function HeritageNearby({
  siteId,
  siteTitle,
  lat,
  lng,
}: {
  siteId: string;
  siteTitle: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const [rows, setRows] = useState<NearbySite[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const hasCoords = typeof lat === "number" && typeof lng === "number";

  const exploreHref = useMemo(() => {
    if (!hasCoords) return null;
    return buildPlacesNearbyURL({
      siteId,
      lat: lat as number,
      lng: lng as number,
      radiusKm: 25,
      basePath: "/explore",
    });
  }, [hasCoords, siteId, lat, lng]);

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        setErr(null);
        setRows(null);

        if (!hasCoords) {
          setRows([]);
          return;
        }

        const box50 = bboxAround(lat!, lng!, 50);
        const { data, error } = await supabase
          .from("sites")
          .select(
            `
            id, slug, province_id, title, cover_photo_url,
            location_free, heritage_type, avg_rating, review_count,
            latitude, longitude
          `
          )
          .neq("id", siteId)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .gte("latitude", box50.minLat)
          .lte("latitude", box50.maxLat)
          .gte("longitude", box50.minLng)
          .lte("longitude", box50.maxLng)
          .limit(400);

        if (error) throw error;

        const withDistance = (data || []).map((s: any) => {
          const d =
            s.latitude != null && s.longitude != null
              ? haversineKm(lat!, lng!, Number(s.latitude), Number(s.longitude))
              : Number.POSITIVE_INFINITY;
          return { ...s, distance_km: Number.isFinite(d) ? d : null };
        });

        let within25 = withDistance
          .filter((s) => (s.distance_km ?? Infinity) <= 25)
          .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
          .slice(0, 6);

        if (within25.length < 6) {
          const need = 6 - within25.length;
          const within50 = withDistance
            .filter(
              (s) =>
                (s.distance_km ?? Infinity) > 25 &&
                (s.distance_km ?? Infinity) <= 50
            )
            .sort(
              (a, b) =>
                (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity)
            )
            .slice(0, need);
          within25 = [...within25, ...within50];
        }

        await ensureProvinceSlugOnSites(within25);
        await attachActiveCovers(within25);

        if (!active) return;
        setRows(within25);
      } catch (e: any) {
        if (!active) return;
        setErr(e?.message || "Failed to load nearby places");
        setRows([]);
      }
    }

    run();
    return () => {
      active = false;
    };
  }, [siteId, lat, lng, hasCoords]);

  return (
    <>
      <HeritageSection
        id="nearby"
        title={`Places to Explore near ${siteTitle}`}
        iconName="nearby"
      >
        {!hasCoords ? (
          <div className="text-[13px]" style={{ color: "var(--muted-foreground,#5b6b84)" }}>
            Location coordinates are missing for this site.
          </div>
        ) : (
          <>
            {/* Loading */}
            {rows == null && !err && (
              <>
                <div className="flex justify-center py-3">
                  <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-48 bg-[var(--ivory-cream)] rounded-xl animate-pulse" />
                  ))}
                </div>
              </>
            )}

            {/* Error */}
            {err && (
              <div className="text-sm text-red-600">{err}</div>
            )}

            {/* No results */}
            {rows && !err && rows.length === 0 && (
              <div className="text-[13px]" style={{ color: "var(--muted-foreground,#5b6b84)" }}>
                No nearby places found within 50 km.
              </div>
            )}

            {/* Results */}
            {rows && rows.length > 0 && (
              <>
                <div className="sm:hidden -mx-4 px-4">
                  <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
                    {rows.map((r, index) => (
                      <div key={r.id} className="min-w-[85%] snap-start">
                        <SitePreviewCard site={r} index={index} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rows.map((r, index) => (
                    <SitePreviewCard key={r.id} site={r} index={index} />
                  ))}
                </div>
              </>
            )}

            {exploreHref && (
              <div className="mt-5 flex justify-center">
                <Link
                  href={exploreHref}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold
                             bg-[var(--navy-deep,#0f2746)] text-white hover:brightness-110
                             focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--navy-deep,#0f2746)]
                             rounded-none"
                >
                  Explore Nearby Sites
                </Link>
              </div>
            )}
          </>
        )}
      </HeritageSection>

      <style jsx global>{`
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  );
}
