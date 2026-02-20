// components/MyTripsGrid.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import {
  listTripsByUsername,
  deleteTrip,
  countTripItems,
  createTrip,
  getTripUrlById,
} from "@/lib/trips";
import { withTimeout } from "@/lib/async/withTimeout";

type TripRow = {
  id: string;
  name: string;
  // slug can be nullable/undefined in DB, so reflect that in the type
  slug?: string | null;
  cover_photo_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function MyTripsGrid({
  username, // ← required; server page guarantees correctness
  context = "default",
  title = "Your Trips",
  allowDelete = true,
  containerClassName = "",
}: {
  username: string; // ← made required
  context?: "default" | "dashboard" | "tripbuilder";
  title?: string;
  allowDelete?: boolean;
  containerClassName?: string;
}) {
  const TRIPS_TIMEOUT_MS = 12000;
  const router = useRouter();

  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [stats, setStats] = useState<
    Record<string, { sites: number; travels: number }>
  >({});

  // Fetch trips for the provided username
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErrMsg(null);
        const data = await withTimeout(
          listTripsByUsername(username),
          TRIPS_TIMEOUT_MS,
          "myTrips.listTripsByUsername"
        );
        if (!mounted) return;

        // data is TripWithCover[] where slug may be null/undefined
        setTrips((data ?? []) as TripRow[]);

        // Fetch counts in a fail-safe way (no UI error spam)
        Promise.allSettled(
          (data ?? []).map(
            async (t) => [t.id, await countTripItems(t.id)] as const
          )
        ).then((results) => {
          if (!mounted) return;
          const ok = results
            .filter(
              (
                r
              ): r is PromiseFulfilledResult<
                readonly [string, { sites: number; travels: number }]
              > => r.status === "fulfilled"
            )
            .map((r) => r.value);
          setStats(Object.fromEntries(ok));
        });
      } catch (e: any) {
        // Suppress auth/RLS noise in the UI; show empty state instead
        console.error("[MyTripsGrid] load error:", e);
        if (!mounted) return;
        setTrips([]);
        const msg = (e?.message || "").toLowerCase();
        if (msg.includes("not authenticated") || msg.includes("permission")) {
          setErrMsg(null);
        } else {
          setErrMsg(e?.message || "Failed to load trips.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [username]);

  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"recent" | "az">("recent");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = !needle
      ? trips
      : trips.filter((t) => {
          const inName = t.name.toLowerCase().includes(needle);
          const inSlug = t.slug
            ? t.slug.toLowerCase().includes(needle)
            : false;
          return inName || inSlug;
        });

    if (order === "az") {
      rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      rows = [...rows].sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
          new Date(a.updated_at ?? a.created_at ?? 0).getTime()
      );
    }
    return rows;
  }, [trips, q, order]);

  const handleDelete = async (trip: TripRow) => {
    if (!allowDelete) return;
    const ok = confirm(`Delete “${trip.name}”? This cannot be undone.`);
    if (!ok) return;
    try {
      setDeletingId(trip.id);
      await deleteTrip(trip.id);
      setTrips((prev) => prev.filter((t) => t.id !== trip.id));
    } catch (e: any) {
      setErrMsg(e?.message || "Failed to delete trip.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateDefaultTrip = async () => {
    if (creating) return;
    try {
      setCreating(true);
      const trip = await createTrip("Default Trip");
      const pretty = await getTripUrlById(trip.id);
      const fallback = `/${username}/trip/${trip.slug || "default-trip"}`;
      router.push(pretty ?? fallback);
    } catch (e: any) {
      setErrMsg(e?.message || "Failed to create trip.");
    } finally {
      setCreating(false);
    }
  };

  const toTrip = (slug?: string | null) => {
    if (!slug) return;
    router.push(`/${username}/trip/${slug}`);
  };

  const wrapperClasses =
    context === "default"
      ? `mx-auto max-w-6xl rounded-2xl bg-white shadow-sm px-5 md:px-8 lg:px-10 py-6 ${containerClassName}`
      : containerClassName;

  return (
    <section className="w-full">
      <div className={`${wrapperClasses} min-h-[360px]`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl md:text-3xl font-black leading-tight text-[#0A1B4D]">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search trips..."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value as any)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              title="Sort"
            >
              <option value="recent">Recent</option>
              <option value="az">A → Z</option>
            </select>
          </div>
        </div>

        {/* Keep generic errors only (no auth banner) */}
        {errMsg && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {errMsg}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="relative h-36 w-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse" />
                <div className="p-4 space-y-3">
                  <div className="h-4 w-3/4 bg-gray-200 rounded" />
                  <div className="h-3 w-1/2 bg-gray-200 rounded" />
                  <div className="h-3 w-2/3 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-600 py-6 flex flex-col items-center justify-center">
            <img
              src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/tripbuilder.png"
              alt="Trip Builder illustration"
              className="w-full max-w-lg -mt-10 mb-1"
              loading="lazy"
              decoding="async"
            />
            <p className="text-base mb-3">
              No trips yet. Create your first trip from the Trip Builder.
            </p>
            <button
              onClick={handleCreateDefaultTrip}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60"
            >
              <Icon name="plus" size={16} />
              {creating ? "Creating..." : "Create Trip"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((t) => {
              const counts = stats[t.id] ?? { sites: 0, travels: 0 };
              const coverSrc =
                t.cover_photo_url &&
                (t.cover_photo_url.includes("?")
                  ? `${t.cover_photo_url}&width=600`
                  : `${t.cover_photo_url}?width=600`);

              return (
                <article
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toTrip(t.slug)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toTrip(t.slug);
                  }}
                  className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-lg cursor-pointer"
                >
                  <div className="relative h-36 w-full bg-gray-100 overflow-hidden">
                    <div className="absolute top-2 left-2 z-10">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#00b78b] px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
                        <Icon name="route" size={12} />
                        Trip
                      </span>
                    </div>

                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt={t.name}
                        className="h-full w-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-400 gap-1 text-xs">
                        <Icon name="image" size={16} />
                        <span>No cover</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="truncate font-semibold text-[17px] text-[#0A1B4D]">
                      {t.name}
                    </h3>
                    <div className="mt-1 text-xs text-gray-500 truncate">
                      Updated{" "}
                      {t.updated_at
                        ? new Date(t.updated_at).toLocaleDateString()
                        : t.created_at
                        ? new Date(t.created_at).toLocaleDateString()
                        : "—"}
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="architecture-design" size={14} />
                        {counts.sites} sites
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="route" size={14} />
                        {counts.travels} travels
                      </span>
                    </div>

                    {allowDelete && (
                      <div className="mt-4 flex items-center justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(t);
                          }}
                          disabled={deletingId === t.id}
                          className={
                            "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm transition " +
                            (deletingId === t.id
                              ? "bg-red-300/60 text-white cursor-not-allowed"
                              : "bg-red-600 text-white hover:bg-red-700")
                          }
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
  
