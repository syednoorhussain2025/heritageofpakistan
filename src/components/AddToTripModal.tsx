// src/components/AddToTripModal.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useBottomSheetParallax } from "@/hooks/useBottomSheetParallax";
import { supabase } from "@/lib/supabase/browser";
import { createTrip, getTripUrlById } from "@/lib/trips";

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
  try { return JSON.stringify(e); } catch { return String(e); }
}

function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
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
  site,
}: {
  siteId: string;
  onClose: () => void;
  site?: { name?: string | null; imageUrl?: string | null; location?: string | null };
}) {
  const router = useRouter();
  useBodyScrollLock();

  const [isOpen, setIsOpen] = useState(false);
  useBottomSheetParallax(isOpen);
  const closeTimerRef = useRef<number | null>(null);

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
  const [toastOpen, setToastOpen] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const [lastTripForBuilder, setLastTripForBuilder] = useState<string | null>(null);

  // Create new trip sheet
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateVisible, setIsCreateVisible] = useState(false);
  const [isCreateAnimatingOpen, setIsCreateAnimatingOpen] = useState(false);
  const createCloseTimerRef = useRef<number | null>(null);

  const previewUrl = site?.imageUrl?.trim() || null;
  const previewTitle = site?.name?.trim() || "";
  const previewLocation = site?.location?.trim() || "";
  const hasPreview = !!(previewUrl || previewTitle);

  useEffect(() => {
    const t = setTimeout(() => setIsOpen(true), 10);
    return () => clearTimeout(t);
  }, []);

  function requestClose() {
    void hapticLight();
    setIsOpen(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => onClose(), 500);
  }

  function showToast(message: string) {
    setToastMsg(message);
    setToastOpen(false);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    window.requestAnimationFrame(() => setToastOpen(true));
    toastTimerRef.current = window.setTimeout(() => {
      setToastOpen(false);
      window.setTimeout(() => setToastMsg(null), 220);
    }, 2200);
  }

  const requestCreateClose = () => {
    void hapticLight();
    setIsCreateAnimatingOpen(false);
    if (createCloseTimerRef.current) window.clearTimeout(createCloseTimerRef.current);
    createCloseTimerRef.current = window.setTimeout(() => {
      setIsCreateVisible(false);
      setIsCreateOpen(false);
    }, 500);
  };

  useEffect(() => {
    if (isCreateOpen) {
      setIsCreateVisible(true);
      const t = window.setTimeout(() => setIsCreateAnimatingOpen(true), 10);
      return () => window.clearTimeout(t);
    } else {
      setIsCreateAnimatingOpen(false);
      if (isCreateVisible) {
        const t = window.setTimeout(() => setIsCreateVisible(false), 500);
        return () => window.clearTimeout(t);
      }
    }
  }, [isCreateOpen, isCreateVisible]);

  async function refreshTrips() {
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

  async function handleCreate() {
    if (!newName.trim() || busyCreate) return;
    void hapticMedium();
    setBusyCreate(true);
    const name = newName.trim();
    try {
      const trip = await createTrip(name, privacy === "public");
      setNewName("");
      await refreshTrips();
      setLastTripForBuilder(trip?.id ?? null);
      requestCreateClose();
      showToast(`Created "${name}"`);
    } catch (e) {
      showToast(`Could not create trip: ${errText(e)}`);
    } finally {
      setBusyCreate(false);
    }
  }

  async function toggleMembership(tripId: string, tripName: string) {
    if (toggling) return;
    void hapticMedium();
    const isOn = selected.has(tripId);
    setToggling(tripId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
    showToast(`${isOn ? "Removed from" : "Added to"} "${tripName}"`);
    try {
      if (isOn) {
        const { error } = await supabase.from("trip_items").delete().eq("trip_id", tripId).eq("site_id", siteId);
        if (error) throw error;
      } else {
        const { count, error: cErr } = await supabase.from("trip_items").select("*", { count: "exact", head: true }).eq("trip_id", tripId);
        if (cErr) throw cErr;
        const { error: insErr } = await supabase.from("trip_items").insert({ trip_id: tripId, site_id: siteId, order_index: (count ?? 0) + 1 });
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
      showToast(`Failed to update "${tripName}"`);
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(tripId: string, tripName: string) {
    if (!confirm(`Delete trip "${tripName}"? This will remove it entirely.`)) return;
    void hapticMedium();
    setDeletingId(tripId);
    try {
      const { error } = await supabase.from("trips").delete().eq("id", tripId);
      if (error) throw error;
      setSelected((prev) => { const next = new Set(prev); next.delete(tripId); return next; });
      await refreshTrips();
      showToast(`Deleted "${tripName}"`);
    } catch (e) {
      showToast(`Could not delete trip: ${errText(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function pushTripById(id: string) {
    const pretty = await getTripUrlById(id);
    requestClose();
    const href = pretty ?? `/trip/${id}`;
    try { router.push(href); } catch { window.location.href = href; }
  }

  async function openTripBuilder() {
    void hapticLight();
    const id = lastTripForBuilder || (trips.length ? trips[0].id : null) || Array.from(selected)[0] || null;
    if (!id) return;
    await pushTripById(id);
  }

  return (
    <>
      {/* Main overlay */}
      <div
        className={`fixed inset-0 z-[9999999999] transition-all duration-500 ease-in-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-modal="true"
        role="dialog"
        onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      >
        <div
          className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl h-[82vh] max-h-[82vh] flex flex-col transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
          }`}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-200/60 shrink-0">
            {/* Title centered */}
            <div className="flex items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center">
                <Icon name="line-segments-light" size={16} className="text-[var(--brand-orange)]" />
              </div>
              <span className="text-[17px] font-bold text-gray-900">Add to Trip</span>
            </div>
            {/* Site preview */}
            {hasPreview && (
              <div className="flex items-center gap-3 mt-3">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt={previewTitle}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-200"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {previewTitle && <p className="text-[15px] font-semibold text-gray-900 leading-snug truncate">{previewTitle}</p>}
                  {previewLocation && <p className="text-[12px] text-gray-500 truncate mt-0.5">{previewLocation}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Scrollable list */}
          <div className="flex-1 min-h-0 flex flex-col px-4 py-3 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 space-y-2 overflow-hidden">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Your Trips</label>
              <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-2xl bg-gray-100 overflow-hidden">
                {/* Search */}
                <div className="shrink-0 p-3 pb-0">
                  <div className="relative group">
                    <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search your trips"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-white border border-gray-300 text-gray-900 rounded-full pl-11 pr-5 py-3 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/20 focus:border-[var(--brand-orange)]/30 transition-all placeholder:text-gray-500"
                    />
                  </div>
                </div>
                {/* List */}
                <div className="flex-1 overflow-y-scroll p-3 pt-3 overscroll-contain touch-pan-y">
                  {loading ? (
                    <div className="relative">
                      <ul className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <li key={i} className="flex items-center gap-4 p-3 border border-gray-100 rounded-2xl bg-white">
                            <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
                              <div className="h-2 bg-gray-100 rounded w-1/4 animate-pulse" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <Icon name="line-segments-light" size={32} className="mb-2 opacity-50" />
                      <span className="text-sm">No trips yet</span>
                      <span className="text-xs mt-0.5">Tap below to create one</span>
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
                            className={`group relative flex items-center gap-4 p-3 pr-12 rounded-2xl border transition-all cursor-pointer ${
                              isOn ? "bg-orange-50/50 border-orange-200" : "bg-white border-gray-100 hover:border-gray-300"
                            }`}
                            onClick={() => { if (!isBusy && !toggling) toggleMembership(t.id, t.name); }}
                          >
                            <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                              isOn ? "bg-[var(--brand-orange)] text-white shadow-md" : "bg-gray-100 text-gray-400"
                            }`}>
                              {toggling === t.id ? (
                                <Spinner size={16} className={isOn ? "border-white/70" : "border-gray-400"} />
                              ) : isOn ? (
                                <Icon name="check" size={16} />
                              ) : (
                                <Icon name="plus" size={16} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-semibold text-sm truncate ${isOn ? "text-[var(--brand-orange)]" : "text-gray-900"}`}>
                                {t.name}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center gap-1">
                                <span>{t.is_public ? "Public" : "Private"}</span>
                                <span className="text-gray-300">•</span>
                                <span>{itemCount} items</span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); void hapticLight(); void pushTripById(t.id); }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                              title="Open trip"
                            >
                              <Icon name="edit" size={14} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 pt-3 pb-8 border-t border-gray-100 shrink-0 bg-white">
            <button
              onClick={() => { void hapticLight(); setIsCreateOpen(true); }}
              className="w-full py-3 rounded-full bg-[var(--brand-orange)] text-white font-semibold text-[14px] active:scale-95 transition-all shadow-sm"
            >
              + Create New Trip
            </button>
          </div>
        </div>
      </div>

      {/* Create new trip sheet */}
      {isCreateVisible && (
        <div
          className={`fixed inset-0 z-[99999999999] transition-all duration-500 ease-in-out ${
            isCreateAnimatingOpen ? "opacity-100" : "opacity-0"
          }`}
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) requestCreateClose(); }}
        >
          <div
            className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl h-[82vh] max-h-[82vh] flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isCreateAnimatingOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
            }`}
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-4 pt-3 pb-4 border-b border-gray-100 shrink-0 flex items-center justify-center">
              <h3 className="text-[17px] font-bold text-gray-900">New Trip</h3>
            </div>
            <div className="p-5 space-y-5 flex-1 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Trip Name</label>
                <input
                  type="text"
                  placeholder="e.g. Northern Adventure, Family Road Trip…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-full px-5 py-3.5 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/20 focus:border-[var(--brand-orange)]/40 transition-all placeholder:text-gray-400 text-[15px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Privacy</label>
                <div className="flex bg-gray-100 rounded-full p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => { void hapticLight(); setPrivacy("private"); }}
                    className={`flex-1 py-2.5 rounded-full text-[14px] font-semibold transition-all ${
                      privacy === "private" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                    }`}
                  >
                    Private
                  </button>
                  <button
                    type="button"
                    onClick={() => { void hapticLight(); setPrivacy("public"); }}
                    className={`flex-1 py-2.5 rounded-full text-[14px] font-semibold transition-all ${
                      privacy === "public" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                    }`}
                  >
                    Public
                  </button>
                </div>
                <p className="text-[12px] text-gray-400 ml-1">
                  {privacy === "private" ? "Only visible to you" : "Visible to everyone"}
                </p>
              </div>
            </div>
            <div className="px-4 pt-3 pb-8 border-t border-gray-100 bg-white shrink-0">
              <button
                onClick={handleCreate}
                disabled={busyCreate || !newName.trim()}
                className="w-full py-3 rounded-full bg-[var(--brand-orange)] text-white font-semibold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
              >
                {busyCreate && <Spinner size={16} className="border-white/80" />}
                {busyCreate ? "Creating…" : "Create Trip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed inset-0 z-[9999999999] pointer-events-none flex items-end justify-center pb-14">
          <div
            className="px-6 py-3.5 rounded-2xl bg-gray-900 text-white shadow-2xl flex items-center gap-3 max-w-[90vw] w-max"
            style={{
              transform: toastOpen ? "translateY(0)" : "translateY(16px)",
              opacity: toastOpen ? 1 : 0,
              transition: "transform 220ms ease, opacity 220ms ease",
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--brand-orange)] shrink-0" />
            <span className="font-medium text-[15px] leading-tight truncate">{toastMsg}</span>
          </div>
        </div>
      )}
    </>
  );
}
