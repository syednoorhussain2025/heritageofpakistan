// src/app/heritage/[slug]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ───────────── UI helpers ───────────── */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs px-2 py-1 rounded-full bg-gray-100">
      {children}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function KeyVal({ k, v }: { k: string; v?: string | number | null }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1 border-b last:border-b-0">
      <div className="text-sm text-gray-600">{k}</div>
      <div className="text-sm font-medium text-gray-900 text-right">
        {String(v)}
      </div>
    </div>
  );
}

function ActionButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { children, className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm ${
        className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

/* ───────────── Types (subset) ───────────── */

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

  history_content?: string | null;
  architecture_content?: string | null;
  climate_env_content?: string | null;

  stay_hotels_available?: string | null;
  stay_spending_night_recommended?: string | null;
  stay_camping_possible?: string | null;
  stay_places_to_eat_available?: string | null;
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

type CustomSection = {
  id: string;
  site_id: string;
  title: string;
  content: string;
  sort_order: number;
};

/* ───────────── Page ───────────── */

export default function HeritagePage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const [site, setSite] = useState<Site | null>(null);
  const [provinceName, setProvinceName] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    []
  );
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [gallery, setGallery] = useState<ImageRow[]>([]);
  const [biblio, setBiblio] = useState<Bibliography[]>([]);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [hasPhotoStory, setHasPhotoStory] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from("sites")
        .select("*")
        .eq("slug", slug)
        .single();
      if (!s) return;
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
        .select("category_id, categories(name)")
        .eq("site_id", s.id);
      setCategories(
        (sc || [])
          .map((row: any) => ({
            id: row.category_id,
            name: row.categories?.name,
          }))
          .filter((x: any) => !!x.name)
      );

      const { data: sr } = await supabase
        .from("site_regions")
        .select("region_id, regions(name)")
        .eq("site_id", s.id);
      setRegions(
        (sr || [])
          .map((row: any) => ({ id: row.region_id, name: row.regions?.name }))
          .filter((x: any) => !!x.name)
      );

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
            ? supabase.storage.from("site-images").getPublicUrl(r.storage_path)
                .data.publicUrl
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

      const { data: cs } = await supabase
        .from("custom_sections")
        .select("*")
        .eq("site_id", s.id)
        .order("sort_order", { ascending: true });
      setCustomSections((cs as any[]) || []);

      const { data: ps } = await supabase
        .from("photo_stories")
        .select("site_id")
        .eq("site_id", s.id)
        .maybeSingle();
      setHasPhotoStory(!!ps);
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

  const categoriesLine = useMemo(
    () => (categories.length ? categories.map((c) => c.name).join(", ") : null),
    [categories]
  );

  const [bookmarked, setBookmarked] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [inTrip, setInTrip] = useState(false);

  function doShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if ((navigator as any).share)
      (navigator as any).share({ title: site?.title || "Heritage", url });
    else {
      navigator.clipboard.writeText(url);
      alert("Link copied!");
    }
  }

  if (!site) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* HERO (full width + full viewport height) */}
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

        {/* dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

        {/* hero text container with ~100px side margins */}
        <div className="absolute inset-0 flex items-end">
          <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Title/Tagline/Ratings */}
            <div className="text-white">
              <h1 className="text-3xl md:text-5xl font-bold">{site.title}</h1>
              {site.tagline ? (
                <p className="mt-3 max-w-2xl text-base md:text-lg opacity-95">
                  {site.tagline}
                </p>
              ) : null}
              {(site.avg_rating != null || site.review_count != null) && (
                <div className="mt-4 flex items-center gap-3 text-sm md:text-base">
                  <span className="font-medium">
                    {site.avg_rating != null
                      ? "★".repeat(Math.round(site.avg_rating))
                      : ""}{" "}
                    {site.avg_rating != null ? site.avg_rating.toFixed(1) : ""}
                  </span>
                  <span className="opacity-90">
                    {site.review_count != null
                      ? `(${site.review_count} reviews)`
                      : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Heritage Type, Location, Photo Story */}
            <div className="text-white flex flex-col items-start md:items-end gap-2 md:gap-3">
              {site.heritage_type ? (
                <div className="px-3 py-1 rounded-full bg-white/15 backdrop-blur text-sm">
                  Heritage Type:{" "}
                  <span className="font-semibold">{site.heritage_type}</span>
                </div>
              ) : null}
              {site.location_free ? (
                <div className="px-3 py-1 rounded-full bg-white/15 backdrop-blur text-sm">
                  Location:{" "}
                  <span className="font-semibold">{site.location_free}</span>
                </div>
              ) : null}
              {hasPhotoStory ? (
                <a
                  href={`/heritage/${site.slug}/story`}
                  className="mt-2 inline-block px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
                >
                  Open Photo Story
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ACTION LINKS — centered, inside the 100px‑margin container */}
      <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4">
        <div className="flex flex-wrap justify-center gap-2 md:gap-3 mt-4">
          {mapsLink ? (
            <a
              href={mapsLink}
              target="_blank"
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm"
            >
              Open Pin
            </a>
          ) : null}
          <ActionButton onClick={() => setBookmarked((b) => !b)}>
            {bookmarked ? "Bookmarked ✓" : "Bookmark"}
          </ActionButton>
          <ActionButton onClick={() => setWishlisted((w) => !w)}>
            {wishlisted ? "Wishlisted ✓" : "Add to Wishlist"}
          </ActionButton>
          <ActionButton onClick={() => setInTrip((t) => !t)}>
            {inTrip ? "Added to Trip ✓" : "Add to Trip"}
          </ActionButton>
          <a
            href={`/heritage/${site.slug}/gallery`}
            className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm"
          >
            Photo Gallery
          </a>
          <ActionButton onClick={doShare}>Share</ActionButton>
        </div>
      </div>

      {/* BODY CONTENT — two columns, inside the 100px‑margin container */}
      <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 my-6 lg:flex lg:items-start lg:gap-6">
        {/* LEFT SIDEBAR */}
        <aside className="space-y-5 w-full lg:w-80 lg:flex-shrink-0">
          <Section title="Where is it?">
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
              <div className="text-sm text-gray-600">
                Location coordinates not available.
              </div>
            )}
            {mapsLink ? (
              <a
                href={mapsLink}
                target="_blank"
                className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
              >
                Open Location
              </a>
            ) : null}
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

          <Section title="Location">
            <KeyVal k="Town/City/Village" v={site.town_city_village} />
            <KeyVal k="Tehsil" v={site.tehsil} />
            <KeyVal k="District" v={site.district} />
            <KeyVal k="Region/Province" v={provinceName || undefined} />
            <KeyVal k="Latitude" v={site.latitude || undefined} />
            <KeyVal k="Longitude" v={site.longitude || undefined} />
          </Section>

          <Section title="Regions">
            {regions.length ? (
              <div className="flex flex-wrap gap-2">
                {regions.map((r) => (
                  <Chip key={r.id}>{r.name}</Chip>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600">No regions specified.</div>
            )}
          </Section>

          <Section title="General Info">
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

          <Section title="UNESCO">
            {site.unesco_status && site.unesco_status !== "None" ? (
              <div className="flex items-start gap-3">
                <div className="text-2xl">🏛️</div>
                <div>
                  <div className="font-medium">{site.unesco_status}</div>
                  {site.unesco_line ? (
                    <div className="text-sm text-gray-700 mt-1">
                      {site.unesco_line}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                No UNESCO designation listed.
              </div>
            )}
          </Section>

          <Section title="Protected under">
            {site.protected_under ? (
              <div className="text-sm text-gray-800 whitespace-pre-wrap">
                {site.protected_under}
              </div>
            ) : (
              <div className="text-sm text-gray-600">Not specified.</div>
            )}
          </Section>

          <Section title="Climate & Topography">
            <KeyVal k="Landform" v={site.landform} />
            <KeyVal k="Altitude" v={site.altitude} />
            <KeyVal k="Mountain Range" v={site.mountain_range} />
            <KeyVal k="Weather Type" v={site.weather_type} />
            <KeyVal k="Avg Temp (Summers)" v={site.avg_temp_summers} />
            <KeyVal k="Avg Temp (Winters)" v={site.avg_temp_winters} />
          </Section>

          <Section title="Did you Know">
            {site.did_you_know ? (
              <div className="text-sm text-gray-800 whitespace-pre-wrap">
                {site.did_you_know}
              </div>
            ) : (
              <div className="text-sm text-gray-600">—</div>
            )}
          </Section>

          <Section title="Travel Guide">
            <KeyVal k="Heritage Site" v={site.title} />
            <KeyVal k="Location" v={site.travel_location} />
            <KeyVal k="How to Reach" v={site.travel_how_to_reach} />
            <KeyVal k="Nearest Major City" v={site.travel_nearest_major_city} />
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
            {site.travel_full_guide_url ? (
              <a
                href={site.travel_full_guide_url}
                target="_blank"
                className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
              >
                Open Full Travel Guide
              </a>
            ) : null}
          </Section>

          <Section title="Best Time to Visit">
            {site.best_time_option_key ? (
              <div className="text-sm text-gray-800">
                {site.best_time_option_key}
              </div>
            ) : (
              <div className="text-sm text-gray-600">—</div>
            )}
          </Section>

          <Section title="Places to Stay">
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
        </aside>

        {/* RIGHT MAIN */}
        <main className="space-y-5 w-full lg:flex-1">
          <Section title="Heritage Categories">
            {categories.length ? (
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Chip key={c.id}>{c.name}</Chip>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                No categories assigned.
              </div>
            )}
          </Section>

          {site.history_content ? (
            <Section title="History & Background">
              <Article content={site.history_content} />
            </Section>
          ) : null}

          {site.architecture_content ? (
            <Section title="Architecture & Design">
              <Article content={site.architecture_content} />
            </Section>
          ) : null}

          {site.climate_env_content ? (
            <Section title="Climate, Geography & Environment">
              <Article content={site.climate_env_content} />
            </Section>
          ) : null}

          {customSections.map((s) => (
            <Section key={s.id} title={s.title}>
              <Article content={s.content} />
            </Section>
          ))}

          <Section title="Gallery">
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
                        <figcaption className="px-2 py-1 text-xs text-gray-600">
                          {img.caption}
                          {img.credit ? (
                            <span className="ml-1">({img.credit})</span>
                          ) : null}
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
              <div className="text-sm text-gray-600">
                No photos uploaded yet.
              </div>
            )}
          </Section>

          <Section title="Photography & Content">
            <div className="text-sm text-gray-700">
              Unless noted otherwise, photographs and written content are ©
              Heritage of Pakistan. Please contact us for permissions and usage
              rights.
            </div>
          </Section>

          <Section title="Bibliography, Sources & Further Reading">
            {biblio.length ? (
              <ol className="list-decimal list-inside space-y-2 text-sm">
                {biblio.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">{s.title}</span>
                    {s.authors ? <> — {s.authors}</> : null}
                    {s.year ? <> ({s.year})</> : null}
                    {s.publisher_or_site ? <>. {s.publisher_or_site}</> : null}
                    {s.url ? (
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
                    ) : null}
                    {s.notes ? <> — {s.notes}</> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-sm text-gray-600">No sources listed.</div>
            )}
          </Section>
        </main>
      </div>
    </div>
  );
}

/* Simple article renderer */
function Article({ content }: { content: string }) {
  return (
    <div className="prose max-w-none">
      {content.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para}
        </p>
      ))}
    </div>
  );
}
