// src/app/dashboard/mytrips/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { getTripWithItems, getTripUrlById, type SiteLite, type TripDay, type TripItem } from "@/lib/trips";
import Icon from "@/components/Icon";
import { hapticLight, hapticMedium } from "@/lib/haptics";

type SiteItemDisplay = TripItem & {
  site: SiteLite | null;
  provinceName: string | null;
  experience: string[];
};

type DayGroup = {
  day: TripDay | null; // null = ungrouped
  items: SiteItemDisplay[];
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

const MODE_ICONS: Record<string, string> = {
  airplane: "✈️",
  bus: "🚌",
  car: "🚗",
  walk: "🚶",
  train: "🚂",
};

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [tripName, setTripName] = useState("");
  const [tripSlug, setTripSlug] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [days, setDays] = useState<TripDay[]>([]);
  const [items, setItems] = useState<SiteItemDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch trip meta
        const { data: tripRow } = await supabase
          .from("trips")
          .select("id, name, slug, creator_name, is_public, created_at, updated_at")
          .eq("id", id)
          .maybeSingle();

        if (!tripRow) { setError("Trip not found."); setLoading(false); return; }

        setTripName(tripRow.name ?? "Trip");
        setTripSlug(tripRow.slug ?? null);
        setCreatorName(tripRow.creator_name ?? null);
        setIsPublic(tripRow.is_public ?? null);
        setCreatedAt(tripRow.created_at ?? null);
        setUpdatedAt(tripRow.updated_at ?? null);

        // Get username for edit URL
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (userId) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();
          setUsername(prof?.username ?? null);
        }

        // Build edit URL
        if (tripRow.slug) {
          const prettyUrl = await getTripUrlById(id).catch(() => null);
          setEditUrl(prettyUrl ?? null);
        }

        // Fetch trip items with sites
        const result = await getTripWithItems(id);
        // Fetch days separately
        const { data: daysData } = await supabase
          .from("trip_days")
          .select("*")
          .eq("trip_id", id)
          .order("order_index", { ascending: true });
        setDays((daysData ?? []) as TripDay[]);
        setItems((result.items ?? []) as SiteItemDisplay[]);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load trip.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Group items by day
  const groups: DayGroup[] = [];
  const ungrouped = items.filter((it: any) => !it.day_id);
  const grouped = items.filter((it: any) => it.day_id);

  for (const day of days) {
    const dayItems = grouped.filter((it: any) => it.day_id === day.id);
    groups.push({ day, items: dayItems });
  }
  if (ungrouped.length > 0) {
    groups.push({ day: null, items: ungrouped });
  }

  const totalSites = items.length;

  if (loading) {
    return (
      <div className="space-y-4 pb-24">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="space-y-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 bg-white rounded-2xl p-4">
              <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-gray-500 text-sm">
        {error}{" "}
        <button onClick={() => router.push("/dashboard/mytrips")} className="text-[var(--brand-green)] font-medium">Go back</button>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Trip header */}
      <div className="pb-4">
        <h2 className="text-xl font-bold text-gray-900 leading-tight">{tripName}</h2>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">
            {totalSites} {totalSites === 1 ? "site" : "sites"}
            {days.length > 0 ? ` · ${days.length} ${days.length === 1 ? "day" : "days"}` : ""}
          </span>
          {isPublic !== null && (
            <span className="text-xs text-gray-400">· {isPublic ? "public" : "private"}</span>
          )}
          {updatedAt && (
            <span className="text-xs text-gray-400">· updated {new Date(updatedAt).toLocaleDateString()}</span>
          )}
        </div>
        {creatorName && (
          <p className="text-xs text-gray-500 mt-0.5">by {creatorName}</p>
        )}
      </div>

      {/* Items */}
      {groups.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          No sites added to this trip yet.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group, gi) => (
            <div key={group.day?.id ?? "ungrouped"}>
              {/* Day header */}
              {group.day && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="inline-flex items-center rounded-full bg-[var(--brand-blue)] px-4 py-1 text-white text-xs font-bold">
                    Day {gi + 1}{group.day.title ? ` — ${group.day.title}` : ""}
                  </span>
                  {group.day.the_date && (
                    <span className="text-xs text-gray-400">
                      {new Date(group.day.the_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                </div>
              )}
              {!group.day && days.length > 0 && (
                <div className="mb-2 px-1">
                  <span className="inline-flex items-center rounded-full bg-gray-200 px-4 py-1 text-gray-600 text-xs font-bold">Ungrouped</span>
                </div>
              )}

              {/* Site cards */}
              <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                {group.items.map((it, idx) => (
                  <div key={it.id} className="relative">
                    {idx > 0 && <span className="absolute top-0 right-0 left-[72px] h-px bg-gray-100" />}
                    <Link
                      href={it.site?.slug ? `/site/${it.site.slug}` : "#"}
                      onClick={() => void hapticLight()}
                      className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors"
                    >
                      {/* Site thumbnail */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                        {it.site?.cover_photo_thumb_url ?? it.site?.cover_photo_url ? (
                          <img
                            src={(it.site.cover_photo_thumb_url ?? it.site.cover_photo_url)!}
                            alt={it.site?.title ?? ""}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <Icon name="image" size={20} />
                          </div>
                        )}
                      </div>

                      {/* Site info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-[var(--brand-black)] truncate">
                          {it.site?.title ?? "Unknown site"}
                        </div>
                        {it.provinceName && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{it.provinceName}</div>
                        )}
                        {(it as any).notes && (
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-1 italic">{(it as any).notes}</div>
                        )}
                        {it.experience && it.experience.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {it.experience.slice(0, 2).map((e) => (
                              <span key={e} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{e}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      <Icon name="chevron-right" size={13} className="text-[var(--brand-light-grey)] shrink-0" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fixed Edit Trip button */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-[500] bg-white border-t border-gray-100 px-4 py-3"
        style={{ paddingBottom: "calc(52px + var(--safe-bottom, 0px) + 12px)" }}
      >
        {editUrl ? (
          <Link
            href={editUrl}
            onClick={() => void hapticMedium()}
            className="flex items-center justify-center gap-2 w-full rounded-full py-3.5 font-bold text-white active:opacity-80 transition"
            style={{ backgroundColor: "var(--brand-green)" }}
          >
            <Icon name="edit" size={16} />
            Edit Trip
          </Link>
        ) : (
          <button
            disabled
            className="w-full rounded-full py-3.5 font-bold text-white opacity-40"
            style={{ backgroundColor: "var(--brand-green)" }}
          >
            Edit Trip
          </button>
        )}
      </div>

      {/* Desktop Edit Trip button */}
      <div className="hidden lg:block pt-4">
        {editUrl && (
          <Link
            href={editUrl}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white"
            style={{ backgroundColor: "var(--brand-green)" }}
          >
            <Icon name="edit" size={16} />
            Edit Trip
          </Link>
        )}
      </div>
    </div>
  );
}
