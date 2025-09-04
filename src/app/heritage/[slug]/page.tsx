// src/app/heritage/[slug]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import DOMPurify from "isomorphic-dompurify";
import Icon from "@/components/Icon";
import { useBookmarks } from "@/components/BookmarkProvider";
import AddToWishlistModal from "@/components/AddToWishlistModal"; // existing
import ReviewModal from "@/components/reviews/ReviewModal"; // modal
import ReviewsTab from "@/components/reviews/ReviewsTab"; // reviews tab

/* ───────────── UI helpers ───────────── */

function IconChip({
  iconName,
  label,
  id,
  type,
}: {
  iconName: string | null;
  label: string;
  id: string;
  type: "category" | "region";
}) {
  const href =
    type === "category" ? `/explore?cats=${id}` : `/explore?regs=${id}`;

  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)] flex items-center justify-center flex-shrink-0">
        {iconName && <Icon name={iconName} size={16} className="text-white" />}
      </div>
      <span className="font-category-chip transition-colors duration-200 group-hover:text-[var(--brand-orange)]">
        {label}
      </span>
    </Link>
  );
}

function Section({
  title,
  iconName,
  children,
  id,
}: {
  title: string;
  iconName?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="font-section-header mb-3 flex items-center gap-2">
        {iconName && (
          <Icon
            name={iconName}
            size={20}
            className="text-[var(--brand-orange)]"
          />
        )}
        <span>{title}</span>
      </h2>
      {children}
    </section>
  );
}

function KeyVal({ k, v }: { k: string; v?: string | number | null }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1 border-b last:border-b-0">
      <div className="font-sidebar-key">{k}</div>
      <div className="font-sidebar-value text-right">{String(v)}</div>
    </div>
  );
}

function ActionButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { children, className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 font-button-action ${
        className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

/* ───────────── Skeletons ───────────── */

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

function SkeletonCircle({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-full bg-gray-200 ${className}`} />
  );
}

function HeroSkeleton() {
  return (
    <div className="relative w-full h-screen">
      <div className="w-full h-full bg-gray-200 animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />
      <div className="absolute inset-0 flex items-end">
        <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-white">
            <SkeletonBar className="h-10 w-72 mb-3" />
            <SkeletonBar className="h-4 w-96 mb-2" />
            <SkeletonBar className="h-4 w-64" />
            <div className="mt-4 flex items-center gap-3">
              <SkeletonBar className="h-4 w-20" />
              <SkeletonBar className="h-4 w-28" />
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <SkeletonBar className="h-7 w-44 rounded-full" />
            <SkeletonBar className="h-7 w-64 rounded-full" />
            <SkeletonBar className="h-9 w-40 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionBarSkeleton() {
  return (
    <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4">
      <div className="flex flex-wrap justify-center gap-2 md:gap-3 mt-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBar key={i} className="h-10 w-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function SidebarCardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <SkeletonBar className="h-6 w-48 mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} className="h-4 w-full mb-2" />
      ))}
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <SkeletonBar className="h-6 w-44 mb-3" />
      <SkeletonBar className="h-56 w-full rounded-lg mb-3" />
      <SkeletonBar className="h-8 w-40 rounded mb-3" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBar className="h-4 w-20" />
        <SkeletonBar className="h-4 w-24 justify-self-end" />
        <SkeletonBar className="h-4 w-20" />
        <SkeletonBar className="h-4 w-24 justify-self-end" />
      </div>
    </div>
  );
}

function ChipsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <SkeletonBar className="h-6 w-56 mb-3" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="inline-flex items-center gap-2">
            <SkeletonCircle className="w-8 h-8" />
            <SkeletonBar className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

function GallerySkeleton({ count = 6 }: { count?: number }) {
  return (
    <Section title="Gallery" iconName="gallery">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden">
            <SkeletonBar className="h-40 w-full" />
            <SkeletonBar className="h-5 w-32 mt-2 ml-2 mb-2" />
          </div>
        ))}
      </div>
      <SkeletonBar className="h-9 w-48 rounded-lg mt-3" />
    </Section>
  );
}

function BibliographySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Section
      title="Bibliography, Sources & Further Reading"
      iconName="bibliography-sources"
    >
      <ol className="list-decimal list-inside space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i}>
            <SkeletonBar className="h-4 w-3/4" />
          </li>
        ))}
      </ol>
    </Section>
  );
}

function ReviewsSkeleton() {
  return (
    <Section id="reviews" title="Traveler Reviews" iconName="star">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-3">
            <div className="flex items-center gap-3 mb-2">
              <SkeletonCircle className="w-9 h-9" />
              <SkeletonBar className="h-4 w-40" />
            </div>
            <SkeletonBar className="h-4 w-full mb-2" />
            <SkeletonBar className="h-4 w-5/6 mb-2" />
            <SkeletonBar className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ───────────── Types (updated for snapshots-only) ───────────── */

type Site = {
  id: string;
  slug: string;
  title: string;
  tagline?: string | null;
  cover_photo_url?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  heritage_type?: string | null;
  location_free?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  town_city_village?: string | null;
  tehsil?: string | null;
  district?: string | null;
  province_id?: number | null;

  architectural_style?: string | null;
  construction_materials?: string | null;
  local_name?: string | null;
  architect?: string | null;
  construction_date?: string | null;
  built_by?: string | null;
  dynasty?: string | null;
  conservation_status?: string | null;
  current_use?: string | null;
  restored_by?: string | null;
  known_for?: string | null;
  era?: string | null;
  inhabited_by?: string | null;

  national_park_established_in?: string | null;
  population?: string | null;
  ethnic_groups?: string | null;
  languages_spoken?: string | null;

  excavation_status?: string | null;
  excavated_by?: string | null;
  administered_by?: string | null;

  unesco_status?: string | null;
  unesco_line?: string | null;
  protected_under?: string | null;

  landform?: string | null;
  altitude?: string | null;
  mountain_range?: string | null;
  weather_type?: string | null;
  avg_temp_summers?: string | null;
  avg_temp_winters?: string | null;

  did_you_know?: string | null;

  travel_location?: string | null;
  travel_how_to_reach?: string | null;
  travel_nearest_major_city?: string | null;
  travel_airport_access?: string | null;
  travel_international_flight?: string | null;
  travel_access_options?: string | null;
  travel_road_type_condition?: string | null;
  travel_best_time_free?: string | null;
  travel_full_guide_url?: string | null;
  best_time_option_key?: string | null;

  /* NEW: snapshots produced by the Admin builder */
  history_layout_html?: string | null;
  architecture_layout_html?: string | null;
  climate_layout_html?: string | null;

  /* NEW: custom sections JSON — each must have layout_html to render */
  custom_sections_json?:
    | {
        id: string;
        title: string;
        layout_html?: string | null;
      }[]
    | null;

  /* Stay */
  stay_hotels_available?: string | null;
  stay_spending_night_recommended?: string | null;
  stay_camping_possible?: string | null;
  stay_places_to_eat_available?: string | null;
};

type Taxonomy = {
  id: string;
  name: string;
  icon_key: string | null;
};

type ImageRow = {
  id: string;
  site_id: string;
  storage_path: string;
  alt_text?: string | null;
  caption?: string | null;
  credit?: string | null;
  is_cover?: boolean | null;
  sort_order: number;
  publicUrl?: string | null;
};

type Bibliography = {
  id: string;
  site_id: string;
  title?: string | null;
  authors?: string | null;
  year?: string | null;
  publisher_or_site?: string | null;
  url?: string | null;
  notes?: string | null;
  sort_order: number;
};

/* ───────────── Page ───────────── */

export default function HeritagePage() {
  const params = useParams();
  const slug = (params.slug as string) ?? "";

  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();

  const [site, setSite] = useState<Site | null>(null);
  const [provinceName, setProvinceName] = useState<string | null>(null);
  const [categories, setCategories] = useState<Taxonomy[]>([]);
  const [regions, setRegions] = useState<Taxonomy[]>([]);
  const [gallery, setGallery] = useState<ImageRow[]>([]);
  const [biblio, setBiblio] = useState<Bibliography[]>([]);
  const [hasPhotoStory, setHasPhotoStory] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [inTrip, setInTrip] = useState(false);
  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        setLoading(true);

        // Pull snapshots + custom JSON directly on the site row
        const { data: s } = await supabase
          .from("sites")
          .select(
            `*,
             history_layout_html,
             architecture_layout_html,
             climate_layout_html,
             custom_sections_json`
          )
          .eq("slug", slug)
          .single();

        if (!s) {
          setSite(null);
          return;
        }
        setSite(s as Site);

        if (s.province_id) {
          const { data: p } = await supabase
            .from("provinces")
            .select("name")
            .eq("id", s.province_id)
            .maybeSingle();
          setProvinceName(p?.name ?? null);
        } else setProvinceName(null);

        const { data: sc } = await supabase
          .from("site_categories")
          .select("categories(id, name, icon_key)")
          .eq("site_id", s.id);
        setCategories(
          (sc || []).map((row: any) => row.categories).filter(Boolean)
        );

        const { data: sr } = await supabase
          .from("site_regions")
          .select("regions(id, name, icon_key)")
          .eq("site_id", s.id);
        setRegions((sr || []).map((row: any) => row.regions).filter(Boolean));

        const { data: imgs } = await supabase
          .from("site_images")
          .select("*")
          .eq("site_id", s.id)
          .order("sort_order", { ascending: true })
          .limit(6);
        const withUrls: ImageRow[] = await Promise.all(
          (imgs || []).map(async (r: any) => ({
            ...r,
            publicUrl: r.storage_path
              ? supabase.storage
                  .from("site-images")
                  .getPublicUrl(r.storage_path).data.publicUrl
              : null,
          }))
        );
        setGallery(withUrls);

        const { data: bib } = await supabase
          .from("bibliography_sources")
          .select("*")
          .eq("site_id", s.id)
          .order("sort_order", { ascending: true });
        setBiblio((bib as any[]) || []);

        const { data: ps } = await supabase
          .from("photo_stories")
          .select("site_id")
          .eq("site_id", s.id)
          .maybeSingle();
        setHasPhotoStory(!!ps);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const lat = site?.latitude ? Number(site.latitude) : null;
  const lng = site?.longitude ? Number(site.longitude) : null;
  const mapEmbed =
    lat != null && lng != null
      ? `https://www.google.com/maps?q=${lat},${lng}&z=12&output=embed`
      : null;
  const mapsLink =
    lat != null && lng != null
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const isBookmarked = isLoaded && site ? bookmarkedIds.has(site.id) : false;

  function doShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if ((navigator as any).share)
      (navigator as any).share({ title: site?.title || "Heritage", url });
    else {
      navigator.clipboard.writeText(url);
      alert("Link copied!");
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* HERO */}
      {loading || !site ? (
        <HeroSkeleton />
      ) : (
        <div className="relative w-full h-screen">
          {site.cover_photo_url ? (
            <img
              src={site.cover_photo_url}
              alt={site.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-200" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
          <div className="absolute inset-0 flex items-end">
            <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="text-white">
                <h1 className="font-hero-title">{site.title}</h1>
                {site.tagline && (
                  <p className="mt-3 max-w-2xl font-hero-tagline">
                    {site.tagline}
                  </p>
                )}
                {(site.avg_rating != null || site.review_count != null) && (
                  <div className="mt-4 flex items-center gap-3 text-sm md:text-base">
                    <span className="font-medium">
                      {site.avg_rating != null
                        ? "★".repeat(Math.round(site.avg_rating))
                        : ""}{" "}
                      {site.avg_rating?.toFixed(1)}
                    </span>
                    <span className="opacity-90">
                      {site.review_count != null
                        ? `(${site.review_count} reviews)`
                        : ""}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-white flex flex-col items-start md:items-end gap-2 md:gap-3">
                {site.heritage_type && (
                  <div className="px-3 py-1 rounded-full bg-white/15 backdrop-blur font-hero-cover-details">
                    Heritage Type:{" "}
                    <span className="font-semibold">{site.heritage_type}</span>
                  </div>
                )}
                {site.location_free && (
                  <div className="px-3 py-1 rounded-full bg-white/15 backdrop-blur font-hero-cover-details">
                    Location:{" "}
                    <span className="font-semibold">{site.location_free}</span>
                  </div>
                )}
                {hasPhotoStory && (
                  <a
                    href={`/heritage/${site.slug}/story`}
                    className="mt-2 inline-block px-4 py-2 rounded-lg bg-white font-button-photostory"
                  >
                    Open Photo Story
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTION LINKS */}
      {loading || !site ? (
        <ActionBarSkeleton />
      ) : (
        <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-2 md:gap-3 mt-4">
            {mapsLink && (
              <a
                href={mapsLink}
                target="_blank"
                className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 font-button-action"
              >
                Open Pin
              </a>
            )}
            <ActionButton
              onClick={() => site && toggleBookmark(site.id)}
              className={
                isBookmarked ? "text-red-500 border-red-200 bg-red-50" : ""
              }
            >
              <div className="flex items-center gap-1.5">
                <Icon name="heart" size={12} />
                <span>
                  {isLoaded
                    ? isBookmarked
                      ? "Bookmarked"
                      : "Bookmark"
                    : "Bookmark"}
                </span>
              </div>
            </ActionButton>

            <ActionButton onClick={() => setShowWishlistModal(true)}>
              {wishlisted ? "Wishlisted ✓" : "Add to Wishlist"}
            </ActionButton>
            {showWishlistModal && site && (
              <AddToWishlistModal
                siteId={site.id}
                onClose={() => setShowWishlistModal(false)}
              />
            )}

            <ActionButton onClick={() => setInTrip((t) => !t)}>
              {inTrip ? "Added to Trip ✓" : "Add to Trip"}
            </ActionButton>
            <a
              href={site ? `/heritage/${site.slug}/gallery` : "#"}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 font-button-action"
            >
              Photo Gallery
            </a>
            <ActionButton onClick={doShare}>Share</ActionButton>

            <a
              href="#reviews"
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 font-button-action"
            >
              Reviews
            </a>

            <ActionButton onClick={() => setShowReviewModal(true)}>
              Share Your Experience
            </ActionButton>
          </div>
        </div>
      )}

      {/* BODY CONTENT */}
      <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 my-6 lg:flex lg:items-start lg:gap-6">
        {/* LEFT SIDEBAR */}
        <aside className="space-y-5 w-full lg:w-80 lg:flex-shrink-0">
          {loading || !site ? (
            <>
              <MapSkeleton />
              <SidebarCardSkeleton lines={7} />
              <SidebarCardSkeleton lines={5} />
              <SidebarCardSkeleton lines={12} />
              <SidebarCardSkeleton lines={3} />
              <SidebarCardSkeleton lines={4} />
              <SidebarCardSkeleton lines={5} />
              <SidebarCardSkeleton lines={4} />
            </>
          ) : (
            <>
              <Section title="Where is it?" iconName="where-is-it">
                {mapEmbed ? (
                  <div className="w-full overflow-hidden rounded-lg">
                    <iframe
                      src={mapEmbed}
                      className="w-full h-56"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                ) : (
                  <div className="font-sidebar-muted-text">
                    Location coordinates not available.
                  </div>
                )}
                {mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
                  >
                    Open Location
                  </a>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="text-xs text-gray-600">Latitude</div>
                  <div className="text-xs font-medium text-gray-900 text-right">
                    {site.latitude ?? "—"}
                  </div>
                  <div className="text-xs text-gray-600">Longitude</div>
                  <div className="text-xs font-medium text-gray-900 text-right">
                    {site.longitude ?? "—"}
                  </div>
                </div>
              </Section>

              <Section title="Location" iconName="location">
                <KeyVal k="Town/City/Village" v={site.town_city_village} />
                <KeyVal k="Tehsil" v={site.tehsil} />
                <KeyVal k="District" v={site.district} />
                <KeyVal k="Region/Province" v={provinceName} />
                <KeyVal k="Latitude" v={site.latitude} />
                <KeyVal k="Longitude" v={site.longitude} />
              </Section>

              <Section title="Regions" iconName="regions">
                {regions.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {regions.map((r) => (
                      <IconChip
                        key={r.id}
                        id={r.id}
                        type="region"
                        iconName={r.icon_key}
                        label={r.name}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="font-sidebar-muted-text">
                    No regions specified.
                  </div>
                )}
              </Section>

              <Section title="General Info" iconName="general-info">
                <KeyVal k="Heritage Type" v={site.heritage_type} />
                <KeyVal k="Architectural Style" v={site.architectural_style} />
                <KeyVal
                  k="Construction Materials"
                  v={site.construction_materials}
                />
                <KeyVal k="Local Name" v={site.local_name} />
                <KeyVal k="Architect" v={site.architect} />
                <KeyVal k="Construction Date" v={site.construction_date} />
                <KeyVal k="Built by" v={site.built_by} />
                <KeyVal k="Dynasty" v={site.dynasty} />
                <KeyVal k="Conservation Status" v={site.conservation_status} />
                <KeyVal k="Current Use" v={site.current_use} />
                <KeyVal k="Restored by" v={site.restored_by} />
                <KeyVal k="Known for" v={site.known_for} />
                <KeyVal k="Era" v={site.era} />
                <KeyVal k="Inhabited by" v={site.inhabited_by} />
                <KeyVal
                  k="National Park Established in"
                  v={site.national_park_established_in}
                />
                <KeyVal k="Population" v={site.population} />
                <KeyVal k="Ethnic Groups" v={site.ethnic_groups} />
                <KeyVal k="Languages Spoken" v={site.languages_spoken} />
                <KeyVal k="Excavation Status" v={site.excavation_status} />
                <KeyVal k="Excavated by" v={site.excavated_by} />
                <KeyVal k="Administered by" v={site.administered_by} />
              </Section>

              <Section title="UNESCO" iconName="unesco">
                {site.unesco_status && site.unesco_status !== "None" ? (
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">🏛️</div>
                    <div>
                      <div className="font-medium">{site.unesco_status}</div>
                      {site.unesco_line && (
                        <div className="font-sidebar-text mt-1">
                          {site.unesco_line}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="font-sidebar-muted-text">
                    No UNESCO designation listed.
                  </div>
                )}
              </Section>

              <Section title="Protected under" iconName="protected-under">
                {site.protected_under ? (
                  <div className="font-sidebar-text whitespace-pre-wrap">
                    {site.protected_under}
                  </div>
                ) : (
                  <div className="font-sidebar-muted-text">Not specified.</div>
                )}
              </Section>

              <Section
                title="Climate & Topography"
                iconName="climate-topography"
              >
                <KeyVal k="Landform" v={site.landform} />
                <KeyVal k="Altitude" v={site.altitude} />
                <KeyVal k="Mountain Range" v={site.mountain_range} />
                <KeyVal k="Weather Type" v={site.weather_type} />
                <KeyVal k="Avg Temp (Summers)" v={site.avg_temp_summers} />
                <KeyVal k="Avg Temp (Winters)" v={site.avg_temp_winters} />
              </Section>

              <Section title="Did you Know" iconName="did-you-know">
                {site.did_you_know ? (
                  <div className="font-sidebar-text whitespace-pre-wrap">
                    {site.did_you_know}
                  </div>
                ) : (
                  <div className="font-sidebar-muted-text">—</div>
                )}
              </Section>

              <Section title="Travel Guide" iconName="travel-guide">
                <KeyVal k="Heritage Site" v={site.title} />
                <KeyVal k="Location" v={site.travel_location} />
                <KeyVal k="How to Reach" v={site.travel_how_to_reach} />
                <KeyVal
                  k="Nearest Major City"
                  v={site.travel_nearest_major_city}
                />
                <KeyVal k="Airport Access" v={site.travel_airport_access} />
                <KeyVal
                  k="International Flight"
                  v={site.travel_international_flight}
                />
                <KeyVal k="Access Options" v={site.travel_access_options} />
                <KeyVal
                  k="Road Type & Condition"
                  v={site.travel_road_type_condition}
                />
                <KeyVal k="Best Time to Visit" v={site.travel_best_time_free} />
                {site.travel_full_guide_url && (
                  <a
                    href={site.travel_full_guide_url}
                    target="_blank"
                    className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
                  >
                    Open Full Travel Guide
                  </a>
                )}
              </Section>

              <Section title="Best Time to Visit" iconName="best-time-to-visit">
                {site.best_time_option_key ? (
                  <div className="font-sidebar-text">
                    {site.best_time_option_key}
                  </div>
                ) : (
                  <div className="font-sidebar-muted-text">—</div>
                )}
              </Section>

              <Section title="Places to Stay" iconName="places-to-stay">
                <KeyVal k="Hotels Available" v={site.stay_hotels_available} />
                <KeyVal
                  k="Spending Night Recommended"
                  v={site.stay_spending_night_recommended}
                />
                <KeyVal k="Camping Possible" v={site.stay_camping_possible} />
                <KeyVal
                  k="Places to Eat Available"
                  v={site.stay_places_to_eat_available}
                />
              </Section>
            </>
          )}
        </aside>

        {/* RIGHT MAIN */}
        <main className="space-y-5 w-full lg:flex-1">
          {loading || !site ? (
            <>
              <ChipsSkeleton />
              <SidebarCardSkeleton lines={6} />
              <SidebarCardSkeleton lines={6} />
              <SidebarCardSkeleton lines={6} />
              {GallerySkeleton({ count: 6 })}
              <SidebarCardSkeleton lines={3} />
              {BibliographySkeleton({ rows: 4 })}
              {ReviewsSkeleton()}
            </>
          ) : (
            <>
              <Section
                title="Heritage Categories"
                iconName="heritage-categories"
              >
                {categories.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categories.map((c) => (
                      <IconChip
                        key={c.id}
                        id={c.id}
                        type="category"
                        iconName={c.icon_key}
                        label={c.name}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="font-sidebar-muted-text">
                    No categories assigned.
                  </div>
                )}
              </Section>

              {/* ── SNAPSHOT-BASED ARTICLE SECTIONS (no fallbacks) ── */}
              {site.history_layout_html ? (
                <Section
                  title="History & Background"
                  iconName="history-background"
                >
                  <Article html={site.history_layout_html} />
                </Section>
              ) : null}

              {site.architecture_layout_html ? (
                <Section
                  title="Architecture & Design"
                  iconName="architecture-design"
                >
                  <Article html={site.architecture_layout_html} />
                </Section>
              ) : null}

              {site.climate_layout_html ? (
                <Section
                  title="Climate, Geography & Environment"
                  iconName="climate-topography"
                >
                  <Article html={site.climate_layout_html} />
                </Section>
              ) : null}

              {/* Custom sections from JSON only; render only those with layout_html */}
              {Array.isArray(site.custom_sections_json) &&
                site.custom_sections_json
                  .filter(
                    (cs) => !!cs.layout_html && cs.layout_html.trim() !== ""
                  )
                  .map((cs) => (
                    <Section
                      key={cs.id}
                      title={cs.title}
                      iconName="history-background"
                    >
                      <Article html={cs.layout_html!} />
                    </Section>
                  ))}

              <Section title="Gallery" iconName="gallery">
                {gallery.length ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {gallery.map((img) => (
                        <figure
                          key={img.id}
                          className="bg-gray-100 rounded-lg overflow-hidden"
                        >
                          {img.publicUrl ? (
                            <img
                              src={img.publicUrl}
                              alt={img.alt_text || ""}
                              className="w-full h-40 object-cover"
                            />
                          ) : (
                            <div className="w-full h-40" />
                          )}
                          {(img.caption || img.credit) && (
                            <figcaption className="px-2 py-1 font-caption">
                              {img.caption}
                              {img.credit && (
                                <span className="ml-1">({img.credit})</span>
                              )}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                    <a
                      href={`/heritage/${site.slug}/gallery`}
                      className="mt-3 inline-block px-4 py-2 rounded-lg bg-black text-white text-sm"
                    >
                      Open Photo Gallery
                    </a>
                  </>
                ) : (
                  <div className="font-sidebar-muted-text">
                    No photos uploaded yet.
                  </div>
                )}
              </Section>

              <Section
                title="Photography & Content"
                iconName="photography-content"
              >
                <div className="font-sidebar-text">
                  Unless noted otherwise, photographs and written content are ©
                  Heritage of Pakistan. Please contact us for permissions and
                  usage rights.
                </div>
              </Section>

              {/* Bibliography */}
              <Section
                title="Bibliography, Sources & Further Reading"
                iconName="bibliography-sources"
              >
                {biblio.length ? (
                  <ol className="list-decimal list-inside space-y-2 font-sidebar-text">
                    {biblio.map((s) => (
                      <li key={s.id}>
                        <span className="font-medium">{s.title}</span>
                        {s.authors && <> — {s.authors}</>}
                        {s.year && <> ({s.year})</>}
                        {s.publisher_or_site && <>. {s.publisher_or_site}</>}
                        {s.url && (
                          <>
                            {" "}
                            <a
                              className="text-blue-600"
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Link
                            </a>
                          </>
                        )}
                        {s.notes && <> — {s.notes}</>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="font-sidebar-muted-text">
                    No sources listed.
                  </div>
                )}
              </Section>

              {/* Reviews */}
              <Section id="reviews" title="Traveler Reviews" iconName="star">
                <ReviewsTab siteId={site.id} />
              </Section>
            </>
          )}
        </main>
      </div>

      {/* Review Modal */}
      {showReviewModal && site && (
        <ReviewModal
          open={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          siteId={site.id}
        />
      )}

      {/* Wishlist modal mount */}
      {showWishlistModal && site && (
        <AddToWishlistModal
          siteId={site.id}
          onClose={() => setShowWishlistModal(false)}
        />
      )}
    </div>
  );
}

/* Sanitized HTML renderer for snapshots */
function Article({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "img",
      "hr",
      "strong",
      "em",
      "u",
      "ul",
      "ol",
      "li",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "br",
      "span",
      "a",
      "figure",
      "figcaption",
      "div",
      "section",
    ],
    ALLOWED_ATTR: [
      "src",
      "alt",
      "title",
      "style",
      "href",
      "target",
      "rel",
      "class",
      "width",
      "height",
      "loading",
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });

  return (
    <div
      className="prose max-w-none"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
