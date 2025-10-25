// app/[username]/trip/[tripSlug]/finalize/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  site?: SiteLite | null;
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

/* 7-col grid; keep children aligned (same as Builder) */
const GRID =
  "grid items-center gap-3 " +
  "grid-cols-[36px_minmax(240px,2.2fr)_minmax(140px,1fr)_minmax(120px,0.9fr)_minmax(140px,1fr)_minmax(160px,1.1fr)_84px]";

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

/** icon+label for modes (UI also exposes "train") */
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

export default function FinalizedTripPage() {
  const { username, tripSlug } = useParams<{
    username: string;
    tripSlug: string;
  }>();
  const router = useRouter();

  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState<string>("");
  const [creatorName, setCreatorName] = useState<string>("");

  const [days, setDays] = useState<TripDay[]>([]);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ---------- load (same data as Builder) ---------- */
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
        setErrorMsg(e?.message || "Failed to load trip.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [username, tripSlug]);

  /* ---------- derived: items grouped by day (same as Builder) ---------- */
  const itemsByDay = useMemo(() => {
    const map = new Map<string | null, BuilderItem[]>();
    for (const it of items) {
      const key = (it as any).day_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [items]);

  /* ---------- global site numbering across all days ---------- */
  const siteSequence = useMemo(() => {
    // Flatten items in the order days appear; skip ungrouped since we don't render them
    const ordered: BuilderItem[] = days.flatMap(
      (d) => itemsByDay.get(d.id) ?? []
    );
    const seq = new Map<string, number>();
    let n = 1;
    for (const it of ordered) {
      if (it.kind === "site") {
        seq.set(it.id, n);
        n += 1;
      }
    }
    return seq; // Map<siteItemId, globalIndex>
  }, [days, itemsByDay]);

  /* ---------- formatting helpers (same output) ---------- */
  const fmtDateTimeShort = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const formatVisitLabel = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    const dd = d.toLocaleString("en-GB", { day: "2-digit" });
    const mon = d.toLocaleString("en-GB", { month: "short" });
    const yyyy = d.getFullYear();
    return `${dd} ${mon}, ${yyyy}`;
  };
  const durationLabel = (mins: number | null | undefined) => {
    if (mins == null) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  };

  /* ---------- Read-only rows (divider-only list; numbering via global map) ---------- */
  function SiteRow({ it }: { it: BuilderSiteItem }) {
    const siteNumber = siteSequence.get(it.id) ?? 0;
    const currentVisit = it.date_in ?? it.date_out ?? "";

    return (
      <div className="py-3">
        <div className={GRID}>
          <div className="flex items-center justify-center">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#00b78b] text-white text-[11px] font-semibold">
              {siteNumber}
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200">
              {it.site?.cover_photo_url ? (
                <img
                  src={it.site.cover_photo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-[17px] text-[#0A1B4D]">
                {it.site ? (
                  <Link
                    href={`/site/${it.site.slug}`}
                    className="hover:underline"
                  >
                    {it.site.title}
                  </Link>
                ) : (
                  <span className="text-gray-500">Unknown site</span>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 truncate text-[15px] text-gray-700">
            {it.provinceName || "—"}
          </div>

          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-1.5 px-0 py-0 text-[12px] text-gray-700 whitespace-nowrap"
              title="Visit date"
            >
              <KIcon
                name="calendar-check"
                size={14}
                className="text-[var(--brand-orange,#f59e0b)]"
              />
              <span>{formatVisitLabel(currentVisit)}</span>
            </span>
          </div>

          <div className="min-w-0 flex flex-wrap gap-2">
            {it.experience && it.experience.length > 0 ? (
              it.experience.map((e, idx) => (
                <span
                  key={idx}
                  className="rounded-full bg-gray-100 px-2 py-[3px] text-[12px] text-gray-700 whitespace-nowrap"
                >
                  {e}
                </span>
              ))
            ) : (
              <span className="text-sm text-gray-500">—</span>
            )}
          </div>

          <div className="min-w-0 text-[14px] break-words whitespace-pre-wrap text-gray-800">
            {(it as any).notes && (it as any).notes.trim().length > 0
              ? (it as any).notes
              : "—"}
          </div>

          <div />
        </div>
      </div>
    );
  }

  function TravelRow({ it }: { it: BuilderTravelItem }) {
    const fromName = it.from_region_name ?? "From…";
    const toName = it.to_region_name ?? "To…";
    const modeMeta = MODE_META[it.mode] || MODE_META.car;

    const startShort = fmtDateTimeShort((it as any).travel_start_at);
    const endShort = fmtDateTimeShort((it as any).travel_end_at);

    return (
      <div className="py-3">
        <div className={GRID}>
          <div />
          <div className="col-span-5">
            <div className="flex items-center justify-center gap-3 w-full text-[#0A1B4D]">
              <div className="flex flex-col items-start min-w-0">
                <div className="flex items-center gap-2">
                  <KIcon
                    name="map-marker-alt"
                    className="shrink-0 text-[var(--brand-orange,#f59e0b)]"
                  />
                  <span className="truncate font-medium">{fromName}</span>
                </div>
                {startShort && (
                  <div className="ml-6 text-xs text-slate-600">
                    {startShort}
                  </div>
                )}
              </div>

              <div className="h-[2px] w-20 md:w-32 bg-gray-300 rounded" />

              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <KIcon
                    name={modeMeta.icon}
                    className="text-[var(--brand-orange,#f59e0b)]"
                  />
                  <span className="font-semibold">{modeMeta.label}</span>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  {durationLabel(it.duration_minutes)}{" "}
                  <span className="mx-1">•</span>
                  {it.distance_km != null ? `${it.distance_km} km` : "— km"}
                </div>
              </div>

              <div className="h-[2px] w-20 md:w-32 bg-gray-300 rounded" />

              <div className="flex flex-col items-start min-w-0">
                <div className="flex items-center gap-2">
                  <KIcon
                    name="map-marker-alt"
                    className="shrink-0 text-[var(--brand-orange,#f59e0b)]"
                  />
                  <span className="truncate font-medium">{toName}</span>
                </div>
                {endShort && (
                  <div className="ml-6 text-xs text-slate-600">{endShort}</div>
                )}
              </div>
            </div>
          </div>

          <div />
        </div>
      </div>
    );
  }

  /* ---------- UI ---------- */
  return (
    <main
      className="min-h-screen py-6 bg-slate-100"
      style={{
        backgroundImage:
          'url("https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/background.png")',
        backgroundRepeat: "repeat",
        backgroundSize: "600px",
        backgroundPosition: "top left",
      }}
    >
      <div className="mx-auto max-w-6xl rounded-2xl bg-white shadow-sm px-5 md:px-8 lg:px-10 py-6">
        {/* Page Header (no breadcrumbs). Title = Trip name; subtitle = creator */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-5xl font-black leading-tight text-[#0A1B4D]">
              {tripName || "—"}
            </h1>
            <div className="mt-2 text-base text-slate-700">
              <span className="font-medium">Trip Created by:</span>{" "}
              {creatorName || "—"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/${username}/trip/${tripSlug}`)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              type="button"
              title="Back to Builder"
            >
              Back to Builder
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              type="button"
              title="Print itinerary"
            >
              Print
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Loading itinerary…</div>
        ) : (
          <>
            {/* Column header row (kept) */}
            <div className="rounded-[10px] bg-[var(--brand-orange,#f59e0b)] px-4 py-2.5 text-white shadow-sm mb-6 print:hidden">
              <div className={GRID}>
                <div className="text-[15px] font-semibold whitespace-nowrap">
                  No
                </div>
                <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                  <KIcon name="unesco" className="text-white" />
                  <span>Site</span>
                </div>
                <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                  <KIcon name="map-marker-alt" className="text-white" />
                  <span>Location</span>
                </div>
                <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                  <KIcon name="calendar-check" className="text-white" />
                  <span>Visit Date</span>
                </div>
                <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                  <KIcon name="hike" className="text-white" />
                  <span>Experience</span>
                </div>
                <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                  <KIcon name="info" className="text-white" />
                  <span>Notes</span>
                </div>
                <div className="text-right text-[15px] font-semibold whitespace-nowrap" />
              </div>
            </div>

            {/* Days (read-only) */}
            <div className="space-y-10 mb-6">
              {days.map((day, i) => {
                const scoped = itemsByDay.get(day.id) ?? [];
                return (
                  <section
                    key={day.id}
                    className="rounded-[14px] border border-gray-200 bg-white p-4"
                  >
                    {/* Day header (simplified, no borders around title/date) */}
                    <div className="mb-2 flex items-center gap-4">
                      <span className="inline-flex items-center rounded-full bg-[#0b1a55] px-6 py-1.5 text-white text-sm font-bold">
                        {`Day ${i + 1}`}
                      </span>

                      <span className="text-2xl font-bold text-[#0b1a55]">
                        {day.title?.trim() ? day.title : "—"}
                      </span>

                      <span className="ml-auto text-sm text-slate-700">
                        {day && (day as any).the_date
                          ? formatVisitLabel((day as any).the_date)
                          : "—"}
                      </span>
                    </div>

                    {/* Items list with ONLY thin separators; global site numbering */}
                    {scoped.length ? (
                      <div className="divide-y divide-gray-200">
                        {scoped.map((it) =>
                          it.kind === "site" ? (
                            <SiteRow key={it.id} it={it as BuilderSiteItem} />
                          ) : (
                            <TravelRow
                              key={it.id}
                              it={it as BuilderTravelItem}
                            />
                          )
                        )}
                      </div>
                    ) : (
                      <div className="px-1 py-3 text-center text-sm text-gray-400">
                        No items for this day
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Print-friendly tweaks (optional minimal) */}
      <style jsx global>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          a[href]:after {
            content: "";
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </main>
  );
}
