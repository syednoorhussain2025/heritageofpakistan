// src/components/UserMapPreviewCard.tsx
"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

// The data structure for a site shown on the user's map
type UserSite = {
  slug: string;
  /** NEW: province slug for province-aware heritage route */
  province_slug?: string | null;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  heritage_type?: string | null;
  visited_year?: number | null;
  visited_month?: number | null;
  rating?: number; // The user's specific rating for this site
};

// Helper to create a resized thumbnail URL for images
function thumb(url?: string | null, w = 400, q = 70) {
  if (!url) return "";
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  const [origin] = url.split(marker);
  const tail = url.split(marker)[1];
  const h = Math.round(w * 0.75);
  return `${origin}/storage/v1/render/image/public/${tail}?width=${w}&height=${h}&resize=cover&quality=${q}`;
}

const monthNames = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function UserMapPreviewCard({ site }: { site: UserSite }) {
  // Province-aware detail URL with legacy fallback
  const detailHref =
    site.province_slug && site.province_slug.length > 0
      ? `/heritage/${site.province_slug}/${site.slug}`
      : `/heritage/${site.slug}`;

  /* Fade-in logic */
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hasFaded = useRef(false);
  const [src, setSrc] = useState(() => thumb(site.cover_photo_url));

  useEffect(() => {
    hasFaded.current = false;
    if (imgRef.current) imgRef.current.style.opacity = "0";
    setSrc(thumb(site.cover_photo_url));
  }, [site.slug, site.cover_photo_url]);

  return (
    <div className="w-64 rounded-xl overflow-hidden bg-white shadow-lg relative border-2 border-transparent hover:border-[#f78300] transition-all duration-300">
      <Link href={detailHref} className="group block" prefetch={false}>
        {/* Image Section */}
        <div className="relative">
          <img
            ref={imgRef}
            src={src}
            alt={site.title}
            className="block w-full h-32 object-cover opacity-0 transition-opacity duration-500"
            loading="lazy"
            onLoad={() => {
              if (!hasFaded.current && imgRef.current) {
                imgRef.current.style.opacity = "1";
                hasFaded.current = true;
              }
            }}
          />

          {/* Heritage Type Badge */}
          {site.heritage_type && (
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#f78300]/90 text-white text-xs font-semibold shadow">
              {site.heritage_type}
            </div>
          )}

          {/* "Covered" Tick Mark */}
          <div className="absolute top-2 right-2 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center border-2 border-white shadow-md">
            <Icon name="check" size={16} className="text-white" />
          </div>
        </div>

        {/* Content Section */}
        <div className="p-3">
          <h3 className="text-gray-800 text-lg font-bold truncate group-hover:text-[#f78300]">
            {site.title}
          </h3>

          {/* Location */}
          {site.location_free && (
            <div className="mt-1 flex items-center gap-1.5 text-gray-600 text-xs">
              <Icon name="map-marker-alt" size={12} />
              <span className="truncate">{site.location_free}</span>
            </div>
          )}

          {/* User's Star Rating */}
          {site.rating && (
            <div className="mt-2 flex items-center gap-1">
              <div className="text-amber-500 text-sm leading-none">
                {"★".repeat(Math.round(site.rating))}
              </div>
              <div className="text-gray-300 text-sm leading-none">
                {"★".repeat(5 - Math.round(site.rating))}
              </div>
            </div>
          )}

          {/* Visited Date */}
          {site.visited_year && site.visited_month && (
            <div className="mt-2 flex items-center gap-1.5 text-md text-gray-800 font-semibold">
              <Icon name="calendar-check" size={14} className="text-gray-500" />
              <span>
                Visited: {monthNames[site.visited_month]} {site.visited_year}
              </span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
