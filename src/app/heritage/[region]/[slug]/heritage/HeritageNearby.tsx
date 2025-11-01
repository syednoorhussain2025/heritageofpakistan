"use client";

import { useEffect, useMemo, useState } from "react";
import HeritageSection from "./HeritageSection";
import SitePreviewCard from "@/components/SitePreviewCard";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { buildPlacesNearbyURL } from "@/lib/placesNearby";

type NearbySite = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  latitude: number | null;
  longitude: number | null;
  distance_km?: number | null; // computed client-side
};

const EARTH_RADIUS_KM = 6371;

/** Haversine distance in km */
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

/** Quick bounding box (in degrees) for a given radius (km) around a lat/lng */
function bboxAround(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32; // ~1 deg lat ≈ 111.32 km
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
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

  // Build Explore deep-link: /explore?center=...&clat=...&clng=...&rkm=25
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

        // 1) Fetch candidates within a 50 km bounding box
        const box50 = bboxAround(lat!, lng!, 50);
        const { data, error } = await supabase
          .from("sites")
          .select(
            "id,slug,title,cover_photo_url,location_free,heritage_type,avg_rating,review_count,latitude,longitude"
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

        const withDistance: NearbySite[] = (data || []).map((s: any) => {
          const d =
            s.latitude != null && s.longitude != null
              ? haversineKm(lat!, lng!, Number(s.latitude), Number(s.longitude))
              : Number.POSITIVE_INFINITY;
          return { ...s, distance_km: Number.isFinite(d) ? d : null };
        });

        // 2) Primary: within 25 km
        let within25 = withDistance
          .filter((s) => (s.distance_km ?? Infinity) <= 25)
          .sort(
            (a, b) =>
              (a.distance_km ?? Number.POSITIVE_INFINITY) -
              (b.distance_km ?? Number.POSITIVE_INFINITY)
          )
          .slice(0, 6);

        // 3) Top-up from <= 50 km if needed
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
                (a.distance_km ?? Number.POSITIVE_INFINITY) -
                (b.distance_km ?? Number.POSITIVE_INFINITY)
            )
            .slice(0, need);

          within25 = [...within25, ...within50];
        }

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
    <HeritageSection
      id="nearby"
      title={`Places to Explore near ${siteTitle}`}
      iconName="nearby"
    >
      {!hasCoords ? (
        <div
          className="text-[13px]"
          style={{ color: "var(--muted-foreground, #5b6b84)" }}
        >
          Location coordinates are missing for this site.
        </div>
      ) : (
        <>
          {/* Grid of nearby cards */}
          {err ? (
            <div className="text-sm text-red-600">{err}</div>
          ) : rows == null ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 bg-[var(--ivory-cream)] rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div
              className="text-[13px]"
              style={{ color: "var(--muted-foreground, #5b6b84)" }}
            >
              No nearby places found within 50 km.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rows.map((r) => (
                <SitePreviewCard
                  key={r.id}
                  site={{
                    id: r.id,
                    slug: r.slug,
                    title: r.title,
                    cover_photo_url: r.cover_photo_url ?? null,
                    location_free: r.location_free ?? null,
                    heritage_type: r.heritage_type ?? null,
                    avg_rating: r.avg_rating ?? null,
                    review_count: r.review_count ?? null,
                    distance_km: r.distance_km ?? null,
                    latitude: r.latitude ?? null,
                    longitude: r.longitude ?? null,
                  }}
                />
              ))}
            </div>
          )}

          {/* Explore Nearby Sites CTA (centered, dark blue, square corners, padded) */}
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
  );
}
