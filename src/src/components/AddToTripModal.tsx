// src/components/AddToTripModal.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabaseClient";
import { createTrip, getTripUrlById } from "@/lib/trips";

// Types aligned with your schema
type TripRow = {
  id: string;
  name: string;
  is_public: boolean | null;
  trip_items?: Array<{ count: number }>;
};

function errText(e: any) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e?.message) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function Spinner({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const s = `${size}px`;
  return (
    <span
      className={`inline-block rounded-full border-2 border-gray-300 border-t-transparent animate-spin ${className}`}
      style={{ width: s, height: s }}
      aria-hidden="true"
    />
  );
}

export default function AddToTripModal({
  siteId,
  onClose,
}: {
  siteId: string;
  onClose: () => void;
}) {
  const router = useRouter();

  // ---------- UI state ----------
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "public">("private");

  const [busyCreate, setBusyCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const [trips, setTrips] = useState<TripRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lastTripForBuilder, setLastTripForBuilder] = useState<string | null>(
    null
  );

  useEffect(() => {
    const t = setTimeout(() => setIsOpen(true), 10);
    return () => clearTimeout(t);
  }, []);

  function requestClose() {
    setIsOpen(false);
    setTimeout(() => onClose(), 250);
  }

  function onOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) requestClose();
  }

  function showToast(message: string) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(null), 3500);
  }

  async function refreshTrips() {
    // IMPORTANT: no joins here -> avoids RLS errors
    const { data, error } = await supabase
      .from("trips")
      .select("id, name, is_public, trip_items(count)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    setTrips((data ?? []) as TripRow[]);
  }

  async function getTripsContainingSite(siteId: string) {
    const { data, error } = await supabase
      .from("trip_items")
      .select("trip_id")
      .eq("site_id", siteId);
    if (error) throw error;
    return (data ?? []).map((row: any) => row.trip_id as string);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await refreshTrips();
        const ids = await getTripsContainingSite(siteId);
        setSelected(new Set(ids));
      } catch (e) {
        console.error("AddToTripModal refresh error:", errText(e));
        showToast(`Failed to load trips: ${errText(e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => t.name?.toLowerCase().includes(q));
  }, [trips, search]);

  // ---- Create trip using central helper (generates unique slug) ----
  async function handleCreate() {
    if (!newName.trim()) return;
    setBusyCreate(true);
    const name = newName.trim();
    try {
      const trip = await createTrip(name, privacy === "public");
      setNewName("");
      await refreshTrips();
      setLastTripForBuilder(trip?.id ?? null);
      showToast(`Created “${name}”`);
    } catch (e) {
      console.error("Create trip error:", errText(e));
      alert(`Could not create trip: ${errText(e)}`);
    } finally {
      setBusyCreate(false);
    }
  }

  // ---- Toggle site membership in a trip ----
  async function toggleMembership(tripId: string, tripName: string) {
    const isOn = selected.has(tripId);
    setToggling(tripId);

    setSelected((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
    showToast(`${isOn ? "Removed from" : "Added to"} ${tripName}`);

    try {
      if (isOn) {
        const { error } = await supabase
          .from("trip_items")
          .delete()
          .eq("trip_id", tripId)
          .eq("site_id", siteId);
        if (error) throw error;
      } else {
        const { count, error: cErr } = await supabase
          .from("trip_items")
          .select("*", { count: "exact", head: true })
          .eq("trip_id", tripId);
        if (cErr) throw cErr;

        const idx = (count ?? 0) + 1;
        const { error: insErr } = await supabase.from("trip_items").insert({
          trip_id: tripId,
          site_id: siteId,
          order_index: idx,
        });
        if (insErr) throw insErr;

        setLastTripForBuilder(tripId);
      }
    } catch (e) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (isOn) next.add(tripId);
        else next.delete(tripId);
        return next;
      });
      console.error("Toggle membership error:", errText(e));
      showToast(`Failed to update ${tripName}`);
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(tripId: string, tripName: string) {
    if (!confirm(`Delete trip “${tripName}”? This will remove it entirely.`))
      return;
    setDeletingId(tripId);
    try {
      const { error } = await supabase.from("trips").delete().eq("id", tripId);
      if (error) throw error;

      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(tripId);
        return next;
      });
      await refreshTrips();
      showToast(`Deleted ${tripName}`);
    } catch (e) {
      console.error("Delete trip error:", errText(e));
      alert(`Could not delete trip: ${errText(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  // ---- Navigation using pretty URLs from trips.ts ----
  async function pushTripById(id: string) {
    const pretty = await getTripUrlById(id);
    requestClose();
    if (pretty) router.push(pretty);
    else router.push(`/trip/${id}`); // fallback (legacy)
  }

  async function openTripBuilder() {
    const id =
      lastTripForBuilder ||
      (trips.length ? trips[0].id : null) ||
      Array.from(selected)[0] ||
      null;
    if (!id) return;
    await pushTripById(id);
  }

  async function openSpecificTrip(tripId: string) {
    await pushTripById(tripId);
  }

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        onMouseDown={onOverlayMouseDown}
        className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-modal="true"
        role="dialog"
      >
        {/* Card */}
        <div
          className={`w-full max-w-xl mx-3 rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-300 transform ${
            isOpen
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-2"
          }`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)]/10 flex items-center justify-center">
                <Icon name="route" className="text-[var(--brand-orange)]" />
              </div>
              <h2 className="text-lg font-semibold">Add to Trip</h2>
            </div>
            <div />
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Search */}
            <div className="relative">
              <Icon
                name="search"
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search your trips"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40"
              />
            </div>

            {/* Create new trip */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <input
                type="text"
                placeholder="New trip name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40"
              />
              <select
                value={privacy}
                onChange={(e) =>
                  setPrivacy(e.target.value as "private" | "public")
                }
                className="border rounded-lg px-3 py-2"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
              <button
                onClick={handleCreate}
                disabled={busyCreate}
                className="px-4 py-2 rounded-lg bg-[var(--brand-orange)] text-white hover:brightness-95 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busyCreate && <Spinner size={14} />}
                Create new trip
              </button>
            </div>

            {/* Trips list */}
            <div className="max-h-80 overflow-y-auto pr-1">
              {loading ? (
                <ul className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 p-3 border rounded-xl bg-white"
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
                      <div className="flex-1">
                        <div className="h-3 bg-gray-200 rounded w-1/2 mb-2 animate-pulse" />
                        <div className="h-3 bg-gray-200 rounded w-1/3 animate-pulse" />
                      </div>
                      <div className="w-16 h-8 rounded bg-gray-200 animate-pulse" />
                    </li>
                  ))}
                </ul>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-gray-500 px-1 py-2">
                  No trips found.
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((t) => {
                    const isOn = selected.has(t.id);
                    const isBusy = toggling === t.id || deletingId === t.id;
                    const itemCount = t.trip_items?.[0]?.count ?? 0;

                    return (
                      <li
                        key={t.id}
                        className={`group flex items-center gap-3 p-3 border rounded-xl bg-white transition-colors hover:bg-gray-50 hover:shadow-sm cursor-pointer ${
                          isOn ? "border-[var(--brand-orange)]/40" : ""
                        }`}
                        onClick={() => toggleMembership(t.id, t.name)}
                        title={isOn ? "Remove from trip" : "Add to trip"}
                      >
                        {/* Toggle button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMembership(t.id, t.name);
                          }}
                          disabled={isBusy}
                          className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all ${
                            isOn
                              ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                              : "bg-white group-hover:bg-gray-100 text-gray-600"
                          }`}
                          aria-label={isOn ? "Remove from trip" : "Add to trip"}
                          title={isOn ? "Remove from trip" : "Add to trip"}
                        >
                          {toggling === t.id ? (
                            <Spinner size={14} className="border-white/70" />
                          ) : (
                            <Icon name="route" size={16} />
                          )}
                        </button>

                        {/* Name + meta */}
                        <div className="flex-1 select-none">
                          <div className="font-medium leading-5">{t.name}</div>
                          <div className="text-xs text-gray-500">
                            {(t.is_public ? "public" : "private") +
                              " • " +
                              itemCount +
                              " items"}
                          </div>
                        </div>

                        {/* BIGGER: Open Trip Builder (edit icon) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openSpecificTrip(t.id); // resolves pretty link via getTripUrlById
                          }}
                          className={[
                            "cursor-pointer inline-flex items-center justify-center rounded-full",
                            "w-10 h-10 md:w-11 md:h-11",
                            "text-gray-600 hover:text-blue-700",
                            "hover:bg-blue-50 active:scale-95",
                            "focus:outline-none focus:ring-2 focus:ring-blue-200",
                            "transition-transform transition-colors",
                          ].join(" ")}
                          aria-label="Open this trip in Trip Builder"
                          title="Open in Trip Builder"
                        >
                          <Icon name="edit" size={18} />
                        </button>

                        {/* Delete trip (X) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(t.id, t.name);
                          }}
                          disabled={isBusy}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Delete trip"
                          title="Delete trip"
                        >
                          {deletingId === t.id ? (
                            <Spinner size={14} />
                          ) : (
                            <Icon name="times" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
            <button
              onClick={requestClose}
              className="px-4 py-2 rounded-lg border hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={openTripBuilder}
              className="px-4 py-2 rounded-lg bg-black text-white hover:brightness-95"
            >
              Open Trip Builder
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 rounded-lg bg-black text-white shadow-lg transition-opacity duration-200">
          {toastMsg}
        </div>
      )}
    </>
  );
}
