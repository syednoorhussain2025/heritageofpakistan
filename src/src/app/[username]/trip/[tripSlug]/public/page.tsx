// app/[username]/trip/[tripSlug]/public/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getTripByUsernameSlug,
  getTripWithItems,
  getTripTimeline,
  type TravelMode,
  type TimelineItem,
  type SiteLite,
  type TripDay,
} from "@/lib/trips";
import Icon from "@/components/Icon";

/* ───────────────────────────── Types ───────────────────────────── */

type BuilderDayItem = Extract<TimelineItem, { kind: "day" }>;

type BuilderSiteItem = Extract<TimelineItem, { kind: "site" }> & {
  site?: (SiteLite & { tagline?: string | null }) | null;
  provinceName?: string | null;
  experience?: string[];
  day_id?: string | null;
  order_index?: number;
};
type BuilderTravelItem = Extract<TimelineItem, { kind: "travel" }> & {
  from_region_name?: string | null;
  to_region_name?: string | null;
  travel_start_at?: string | null;
  travel_end_at?: string | null;
  day_id?: string | null;
  order_index?: number;
};
type BuilderItem = BuilderSiteItem | BuilderTravelItem;

/* Slim 3-column grid: number | left block | wide tagline */
const GRID =
  "grid items-start gap-4 grid-cols-[36px_minmax(260px,4fr)_minmax(520px,6fr)]";

function KIcon({
  name,
  size = 18,
  className,
}: {
  name:
    | "unesco"
    | "map-marker-alt"
    | "calendar-check"
    | "hike"
    | "info"
    | "edit"
    | "plus"
    | "best-time-to-visit"
    | "travel-guide"
    | "car"
    | "train"
    | "trash";
  size?: number;
  className?: string;
}) {
  return <Icon name={name} size={size} className={className} />;
}

const MODE_META: Record<
  TravelMode | "train",
  { label: string; icon: Parameters<typeof KIcon>[0]["name"] }
> = {
  airplane: { label: "Airplane", icon: "best-time-to-visit" },
  bus: { label: "Bus", icon: "travel-guide" },
  car: { label: "Car", icon: "car" },
  walk: { label: "Walk/Trek", icon: "hike" },
  train: { label: "Train", icon: "train" },
};

/* ───────────────────────────── Component ───────────────────────────── */

export default function PublicTripPage() {
  const { username, tripSlug } = useParams<{
    username: string;
    tripSlug: string;
  }>();

  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState<string>("");
  const [creatorName, setCreatorName] = useState<string>("");
  const [isPublic, setIsPublic] = useState<boolean>(false);

  const [days, setDays] = useState<TripDay[]>([]);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ---------- load ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const trip = await getTripByUsernameSlug(username, tripSlug);
        if (!mounted) return;

        setTripId(trip.id);
        setTripName(trip.name ?? "");
        setCreatorName((trip as any)?.creator_name ?? "");
        setIsPublic(!!trip.is_public);

        // If not public, still stop after setting header info
        const [timeline, { items: siteEnriched }] = await Promise.all([
          getTripTimeline(trip.id),
          getTripWithItems(trip.id),
        ]);

        const siteById: Record<string, BuilderSiteItem> = Object.fromEntries(
          (siteEnriched as BuilderSiteItem[]).map((s) => [
            s.id,
            { ...s, kind: "site" },
          ])
        );

        const dayRows = (
          timeline.filter((r) => r.kind === "day") as BuilderDayItem[]
        ).map((d) => ({
          id: d.id,
          title: d.title ?? "",
          the_date: (d as any).the_date ?? null,
        })) as TripDay[];

        const merged: BuilderItem[] = timeline
          .filter((r) => r.kind !== "day")
          .map((row) =>
            row.kind === "site"
              ? siteById[row.id] ??
                ({
                  ...row,
                  kind: "site",
                  site: null,
                  provinceName: null,
                  experience: [],
                } as BuilderSiteItem)
              : (row as BuilderTravelItem)
          );

        if (!mounted) return;
        setItems(merged);
        setDays(dayRows);
      } catch (e: any) {
        if (!mounted) return;
        setErrorMsg(e?.message || "Failed to load itinerary.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [username, tripSlug]);

  /* ---------- group items ---------- */
  const itemsByDay = useMemo(() => {
    const map = new Map<string | null, BuilderItem[]>();
    for (const it of items) {
      const key = (it as any).day_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [items]);

  /* ---------- global numbering ---------- */
  const siteSequence = useMemo(() => {
    const ordered: BuilderItem[] = days.flatMap(
      (d) => itemsByDay.get(d.id) ?? []
    );
    const seq = new Map<string, number>();
    let n = 1;
    for (const it of ordered) if (it.kind === "site") seq.set(it.id, n++);
    return seq;
  }, [days, itemsByDay]);

  /* ---------- helpers ---------- */
  const formatVisitLabel = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    const dd = d.toLocaleString("en-GB", { day: "2-digit" });
    const mon = d.toLocaleString("en-GB", { month: "short" });
    const yyyy = d.getFullYear();
    return `${dd} ${mon}, ${yyyy}`;
  };
  const durationLabel = (mins?: number | null) => {
    if (mins == null) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  };

  /* ---------- Rows ---------- */
  function SiteRow({ it }: { it: BuilderSiteItem }) {
    const siteNumber = siteSequence.get(it.id) ?? 0;
    const currentVisit = it.date_in ?? it.date_out ?? "";
    const tagline = (it.site as any)?.tagline ?? "—";

    return (
      <div className="py-4">
        <div className={GRID}>
          {/* No. */}
          <div className="flex items-start justify-center pt-1">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--olive-green)] text-white text-[11px] font-semibold">
              {siteNumber}
            </span>
          </div>

          {/* Left block */}
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]">
                {it.site?.cover_photo_url && (
                  <img
                    src={it.site.cover_photo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="min-w-0">
                {/* Title */}
                <div className="truncate font-semibold text-[17px] text-[var(--navy-deep)]">
                  {it.site ? (
                    <Link
                      href={`/site/${it.site.slug}`}
                      className="hover:underline"
                    >
                      {it.site.title}
                    </Link>
                  ) : (
                    <span className="text-[var(--espresso-brown)]/70">
                      Unknown site
                    </span>
                  )}
                </div>

                {/* Location */}
                <div className="mt-1 flex items-center gap-1.5 text-sm text-[var(--espresso-brown)]">
                  <KIcon
                    name="map-marker-alt"
                    size={14}
                    className="text-[var(--mustard-accent)]"
                  />
                  <span className="truncate">{it.provinceName || "—"}</span>
                </div>

                {/* Date */}
                <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--espresso-brown)]">
                  <KIcon
                    name="calendar-check"
                    size={14}
                    className="text-[var(--mustard-accent)]"
                  />
                  <span>{formatVisitLabel(currentVisit)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tagline + Categories */}
          <div className="min-w-0 text-[14px] leading-6 text-[var(--espresso-brown)]">
            <div>{tagline}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {it.experience?.length ? (
                it.experience.map((e, idx) => (
                  <span
                    key={idx}
                    className="rounded-full bg-[var(--ivory-cream)] px-2 py-[3px] text-[12px] text-[var(--espresso-brown)] whitespace-nowrap ring-1 ring-[var(--taupe-grey)]"
                  >
                    {e}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[var(--espresso-brown)]/60">
                  —
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function TravelRow({ it }: { it: BuilderTravelItem }) {
    const fromName = it.from_region_name ?? "From…";
    const toName = it.to_region_name ?? "To…";
    const modeMeta = MODE_META[it.mode] || MODE_META.car;

    return (
      <div className="py-4">
        <div className={GRID}>
          <div /> {/* spacer for number column */}
          <div className="col-span-2">
            <div className="flex items-center justify-center gap-6 w-full text-[var(--navy-deep)]">
              <div className="flex flex-col items-start min-w-0">
                <div className="flex items-center gap-2">
                  <KIcon
                    name="map-marker-alt"
                    className="text-[var(--mustard-accent)]"
                  />
                  <span className="truncate font-medium">{fromName}</span>
                </div>
              </div>

              <div className="h-[2px] w-24 bg-[var(--taupe-grey)] rounded" />

              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <KIcon
                    name={modeMeta.icon}
                    className="text-[var(--mustard-accent)]"
                  />
                  <span className="font-semibold">{modeMeta.label}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--espresso-brown)]/80">
                  {durationLabel(it.duration_minutes)} •{" "}
                  {it.distance_km != null ? `${it.distance_km} km` : "— km"}
                </div>
              </div>

              <div className="h-[2px] w-24 bg-[var(--taupe-grey)] rounded" />

              <div className="flex flex-col items-start min-w-0">
                <div className="flex items-center gap-2">
                  <KIcon
                    name="map-marker-alt"
                    className="text-[var(--mustard-accent)]"
                  />
                  <span className="truncate font-medium">{toName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- UI ---------- */
  return (
    <main
      className="min-h-screen py-6"
      style={{
        backgroundImage:
          'url("https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/background.png")',
        backgroundRepeat: "repeat",
        backgroundSize: "600px",
        backgroundPosition: "top left",
      }}
    >
      <style jsx global>{`
        :root {
          --navy-deep: #1c1f4c;
          --sand-gold: #c7a76b;
          --espresso-brown: #4b2e05;
          --ivory-cream: #faf7f2;
          --taupe-grey: #d8cfc4;
          --terracotta-red: #a9502a;
          --mustard-accent: #e2b65c;
          --olive-green: #7b6e3f;
          --dark-grey: #2b2b2b;
        }
      `}</style>

      <div className="relative mx-auto max-w-6xl rounded-2xl bg-[var(--ivory-cream)] shadow-sm border border-[var(--terracotta-red)] px-5 md:px-8 lg:px-10 py-6">
        {/* Decorative motifs */}
        <img
          src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif.png"
          alt=""
          className="absolute -top-4 -left-2 w-40 md:w-56 lg:w-64 opacity-25 pointer-events-none select-none"
          style={{ transform: "rotate(-6deg)" }}
        />
        <img
          src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif%20(2).png"
          alt=""
          className="absolute -top-6 -right-2 w-40 md:w-56 lg:w-64 opacity-25 pointer-events-none select-none"
          style={{ transform: "rotate(6deg)" }}
        />

        <header className="relative mb-6 text-center z-10">
          <h1 className="text-6xl font-black leading-tight text-[var(--terracotta-red)]">
            Travel Itinerary
          </h1>
          <h2 className="mt-2 text-4xl font-black text-[var(--dark-grey)]">
            {tripName || "—"}
          </h2>
          <div className="mt-2 text-base text-[var(--espresso-brown)]">
            <span className="font-medium">Trip Created by:</span>{" "}
            {creatorName || "—"}
          </div>

          {!isPublic && !loading && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 inline-block px-3 py-1 rounded">
              This itinerary isn’t public. Ask the owner to share it.
            </div>
          )}
        </header>

        {errorMsg && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-[var(--espresso-brown)]/70">
            Loading itinerary…
          </div>
        ) : !isPublic ? (
          <div className="text-center text-[var(--espresso-brown)]/80">
            Nothing to show yet.
          </div>
        ) : (
          <div className="space-y-10 mb-6">
            {days.map((day, i) => {
              const scoped = itemsByDay.get(day.id) ?? [];
              return (
                <section key={day.id} className="p-4">
                  {/* Day header */}
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center rounded-full bg-[var(--terracotta-red)] px-6 py-2 text-white text-sm font-bold">
                      {`Day ${i + 1}`}
                    </span>
                    <span className="text-2xl font-bold text-[var(--navy-deep)]">
                      {day.title?.trim() || "—"}
                    </span>
                    <span className="ml-auto text-lg font-bold text-[var(--navy-deep)]">
                      {day.the_date ? formatVisitLabel(day.the_date) : "—"}
                    </span>
                  </div>

                  {/* Underline */}
                  <div className="mt-3 w-full border-b-2 border-[var(--sand-gold)]" />

                  {/* Items with custom shorter dividers */}
                  {scoped.length ? (
                    <div className="mt-4">
                      {scoped.map((it, idx) => (
                        <div key={it.id}>
                          {it.kind === "site" ? (
                            <SiteRow it={it as BuilderSiteItem} />
                          ) : (
                            <TravelRow it={it as BuilderTravelItem} />
                          )}
                          {idx < scoped.length - 1 ? (
                            <div className="mx-8 md:mx-16 lg:mx-24 border-t border-[var(--taupe-grey)] opacity-70" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-1 py-3 text-center text-sm text-[var(--espresso-brown)]/60">
                      No items for this day
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
        }
      `}</style>
    </main>
  );
}
