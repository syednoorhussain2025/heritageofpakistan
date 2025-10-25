// app/[username]/mytrips/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { listTripsByUsername, deleteTrip, countTripItems } from "@/lib/trips";

type TripRow = {
  id: string;
  name: string;
  slug: string;
  cover_photo_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function UserTripsPage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();

  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stats, setStats] = useState<
    Record<string, { sites: number; travels: number }>
  >({});

  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"recent" | "az">("recent");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErrMsg(null);
        const data = await listTripsByUsername(username);
        if (!mounted) return;
        setTrips(data);

        Promise.all(
          data.map(async (t) => [t.id, await countTripItems(t.id)] as const)
        ).then((pairs) => {
          if (!mounted) return;
          setStats(Object.fromEntries(pairs));
        });
      } catch (e: any) {
        if (!mounted) return;
        setErrMsg(e?.message || "Failed to load trips.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [username]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = !needle
      ? trips
      : trips.filter(
          (t) =>
            t.name.toLowerCase().includes(needle) ||
            t.slug.toLowerCase().includes(needle)
        );
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

  const toTrip = (slug: string) => router.push(`/${username}/trip/${slug}`);

  return (
    <main className="bg-slate-100 min-h-screen py-6">
      <style jsx global>{`
        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }
      `}</style>

      <div className="mx-auto max-w-6xl rounded-2xl bg-white shadow-sm px-5 md:px-8 lg:px-10 py-6">
        {/* Breadcrumb */}
        <div className="mb-3 text-xs text-gray-500">
          <Link href={`/${username}`} className="hover:underline">
            @{username}
          </Link>{" "}
          / <span className="text-gray-700">mytrips</span>
        </div>

        {/* Header + Search */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-4xl md:text-5xl font-black leading-tight text-[#0A1B4D]">
            Your Trips
          </h1>

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

        {/* Error message */}
        {errMsg && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errMsg}
          </div>
        )}

        {/* Skeletons */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="relative h-36 w-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[shimmer_2s_infinite_linear] bg-[length:1000px_100%]" />
                <div className="p-4 space-y-3">
                  <div className="h-4 w-3/4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[shimmer_2s_infinite_linear] bg-[length:1000px_100%] rounded" />
                  <div className="h-3 w-1/2 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[shimmer_2s_infinite_linear] bg-[length:1000px_100%] rounded" />
                  <div className="h-3 w-2/3 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[shimmer_2s_infinite_linear] bg-[length:1000px_100%] rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            No trips yet. Create your first trip from the Trip Builder.
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
                  {/* Cover */}
                  <div className="relative h-36 w-full bg-gray-100 overflow-hidden">
                    {/* Trip pill (top-left) */}
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
                        className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.12]"
                        style={{
                          imageRendering: "smooth",
                          transform: "translateZ(0)",
                          willChange: "transform",
                          backfaceVisibility: "hidden",
                        }}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-400">
                        <div className="flex items-center gap-2 text-sm">
                          <Icon name="image" size={16} />
                          <span>No cover</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-[17px] text-[#0A1B4D]">
                          {t.name}
                        </h3>
                        <div className="mt-0.5 text-xs text-gray-500 truncate">
                          Updated{" "}
                          {t.updated_at
                            ? new Date(t.updated_at).toLocaleDateString()
                            : t.created_at
                            ? new Date(t.created_at).toLocaleDateString()
                            : "—"}
                        </div>
                      </div>
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
                        title="Delete this trip"
                        aria-label="Delete trip"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
