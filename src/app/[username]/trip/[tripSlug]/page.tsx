// app/[username]/trip/[tripSlug]/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  deleteTripItem,
  getTripWithItems,
  updateTripItemsBatch,
  getTripByUsernameSlug,
} from "@/lib/trips";
import { useAutoAnimate } from "@formkit/auto-animate/react";

type BuilderItem = {
  id: string;
  trip_id: string;
  site_id: string;
  order_index: number;
  date_in: string | null;
  date_out: string | null;
  notes: string | null;
  site: {
    id: string;
    slug: string;
    title: string;
    province_id: number | null;
    cover_photo_url: string | null;
  } | null;
  provinceName: string | null;
  experience: string[];
};

export default function TripBuilderPage() {
  const { username, tripSlug } = useParams<{
    username: string;
    tripSlug: string;
  }>();
  const router = useRouter();

  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState<string>("");
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dirtyOrder, setDirtyOrder] = useState(false);

  const [listParent] = useAutoAnimate({ duration: 220, easing: "ease-in-out" });

  // Drag state
  const dragIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragXY, setDragXY] = useState<{ x: number; y: number } | null>(null);
  const [dragSize, setDragSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({
    dx: 0,
    dy: 0,
  });
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Date popover
  const [openDateFor, setOpenDateFor] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState<{
    in?: string | null;
    out?: string | null;
  }>({});

  // Notes debounce map
  const notesTimers = useRef<Map<string, any>>(new Map());

  /**
   * Tight, balanced grid that guarantees Actions column visibility.
   * order | site | region | dates | exp | notes | actions
   */
  const GRID =
    "grid items-center gap-3 " +
    "grid-cols-[48px_minmax(200px,1.6fr)_minmax(90px,0.8fr)_minmax(120px,auto)_minmax(140px,1fr)_minmax(200px,1.8fr)_84px]";

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const trip = await getTripByUsernameSlug(username, tripSlug);
        if (!mounted) return;

        setTripId(trip.id);

        const { trip: t, items } = await getTripWithItems(trip.id);
        if (!mounted) return;

        setTripName(t?.name || "Trip");
        setItems(items as BuilderItem[]);
      } catch (e: any) {
        if (!mounted) return;
        setErrorMsg(
          e?.message ||
            "This trip could not be loaded. It may be private or does not exist."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      notesTimers.current.forEach((t) => clearTimeout(t));
      notesTimers.current.clear();
    };
  }, [username, tripSlug]);

  /* ---------- Drag & Drop (full-ghost + placeholder) ---------- */

  const handleDragStart =
    (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
      dragIdRef.current = id;
      setDraggingId(id);
      e.dataTransfer.effectAllowed = "move";

      // Hide native preview
      const img = new Image();
      img.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'
        );
      e.dataTransfer.setDragImage(img, 0, 0);

      const el = rowRefs.current.get(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        setDragSize({ w: rect.width, h: rect.height });
        setDragOffset({ dx: e.clientX - rect.left, dy: e.clientY - rect.top });
        setDragXY({ x: rect.left, y: rect.top });
      }
    };

  const handleDrag = () => (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggingId) return;
    if (e.clientX === 0 && e.clientY === 0) return;
    setDragXY({ x: e.clientX - dragOffset.dx, y: e.clientY - dragOffset.dy });
  };

  // Live reorder while hovering (auto-animate handles smooth motion)
  const handleDragOver =
    (overId: string) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const draggedId = dragIdRef.current;
      if (!draggedId || draggedId === overId) return;

      setItems((prev) => {
        const arr = [...prev];
        const from = arr.findIndex((x) => x.id === draggedId);
        const to = arr.findIndex((x) => x.id === overId);
        if (from === -1 || to === -1 || from === to) return prev;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        const renumbered = arr.map((x, idx) => ({
          ...x,
          order_index: idx + 1,
        }));
        setDirtyOrder(true);
        return renumbered;
      });
    };

  const clearDrag = () => {
    dragIdRef.current = null;
    setDraggingId(null);
    setDragXY(null);
  };

  const handleDrop = () => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    clearDrag();
  };
  const handleDragEnd = () => () => clearDrag();

  /* ---------- Dates / Notes / Save / Delete ---------- */

  const handleOpenDatePopover = (
    itemId: string,
    currIn: string | null,
    currOut: string | null
  ) => {
    setOpenDateFor(itemId);
    setDateDraft({ in: currIn ?? "", out: currOut ?? "" });
  };

  const applyDates = async (itemId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              date_in: dateDraft.in || null,
              date_out: dateDraft.out || null,
            }
          : it
      )
    );
    setOpenDateFor(null);
    try {
      await updateTripItemsBatch([
        {
          id: itemId,
          date_in: dateDraft.in || null,
          date_out: dateDraft.out || null,
        },
      ]);
    } catch {
      setErrorMsg("Failed to save dates.");
    }
  };

  const onNotesChange = (itemId: string, notes: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, notes } : it))
    );
    const prevTimer = notesTimers.current.get(itemId);
    if (prevTimer) clearTimeout(prevTimer);
    const t = setTimeout(async () => {
      try {
        await updateTripItemsBatch([{ id: itemId, notes }]);
      } catch {
        setErrorMsg("Failed to save notes.");
      }
    }, 500);
    notesTimers.current.set(itemId, t);
  };

  const handleDelete = async (id: string) => {
    const ok = confirm("Remove this site from the trip?");
    if (!ok) return;
    try {
      await deleteTripItem(id);
      setItems((prev) => {
        const filtered = prev.filter((x) => x.id !== id);
        const renum = filtered.map((x, idx) => ({
          ...x,
          order_index: idx + 1,
        }));
        setDirtyOrder(true);
        return renum;
      });
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to delete item.");
    }
  };

  const handleSaveOrder = async () => {
    const payload = items.map((it) => ({
      id: it.id,
      order_index: it.order_index,
    }));
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateTripItemsBatch(payload);
      setDirtyOrder(false);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const fmtRange = (a?: string | null, b?: string | null) => {
    const opt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
    const f = (d?: string | null) =>
      d ? new Date(d).toLocaleDateString(undefined, opt) : "";
    const A = f(a);
    const B = f(b);
    if (A && B) return `${A} – ${B}`;
    if (A) return A;
    if (B) return B;
    return "Set dates";
  };

  /* ---------- RowCard (reused by list and ghost) ---------- */
  function RowCard({
    it,
    isGhost = false,
  }: {
    it: BuilderItem;
    isGhost?: boolean;
  }) {
    const interactive = !isGhost;

    return (
      <div className={"px-4 py-3 " + (isGhost ? "pointer-events-none" : "")}>
        <div className={GRID}>
          {/* Order (badge) */}
          <div className="flex items-center justify-center">
            <span className="rounded-md bg-gray-100 px-2 py-[2px] text-[11px] text-gray-700">
              {it.order_index}
            </span>
          </div>

          {/* Site */}
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
              <div className="truncate font-semibold text-[18px] text-[#0A1B4D]">
                {it.site ? (
                  interactive ? (
                    <Link
                      href={`/site/${it.site.slug}`}
                      className="hover:underline"
                    >
                      {it.site.title}
                    </Link>
                  ) : (
                    it.site.title
                  )
                ) : (
                  <span className="text-gray-500">Unknown site</span>
                )}
              </div>
            </div>
          </div>

          {/* Region/Province */}
          <div className="min-w-0 truncate text-[15px] text-gray-700">
            {it.provinceName || "—"}
          </div>

          {/* Visit Dates */}
          <div className="relative min-w-0">
            <button
              onClick={
                interactive
                  ? () => handleOpenDatePopover(it.id, it.date_in, it.date_out)
                  : undefined
              }
              className={
                "inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[14px] text-gray-700 whitespace-nowrap " +
                (interactive ? "hover:bg-gray-100" : "opacity-60")
              }
            >
              <span>🗓️</span>
              <span>{fmtRange(it.date_in, it.date_out) || "Set dates"}</span>
            </button>

            {interactive && openDateFor === it.id && (
              <div className="absolute z-20 mt-2 w-72 rounded-lg border bg-white p-3 shadow-lg">
                <div className="mb-2 text-xs font-semibold text-gray-600">
                  Select in &amp; out dates
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="w-16 shrink-0 text-xs text-gray-500">
                      In
                    </label>
                    <input
                      type="date"
                      value={dateDraft.in ?? ""}
                      onChange={(e) =>
                        setDateDraft((d) => ({
                          ...d,
                          in: e.target.value || "",
                        }))
                      }
                      className="w-full rounded-md border px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="w-16 shrink-0 text-xs text-gray-500">
                      Out
                    </label>
                    <input
                      type="date"
                      value={dateDraft.out ?? ""}
                      onChange={(e) =>
                        setDateDraft((d) => ({
                          ...d,
                          out: e.target.value || "",
                        }))
                      }
                      className="w-full rounded-md border px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => setOpenDateFor(null)}
                      className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => applyDates(it.id)}
                      className="rounded-md bg-[var(--brand-orange,#f59e0b)] px-3 py-1 text-xs font-semibold text-white hover:brightness-95"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Experience */}
          <div className="min-w-0 flex flex-wrap gap-2">
            {it.experience.length > 0 ? (
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

          {/* Notes */}
          <div className="min-w-0">
            <textarea
              value={it.notes ?? ""}
              onChange={
                interactive
                  ? (e) => onNotesChange(it.id, e.target.value)
                  : undefined
              }
              readOnly={!interactive}
              rows={2}
              placeholder="Optional notes..."
              className={
                "w-full max-w-full resize-none rounded-[10px] border border-gray-300 px-3 py-2 text-[14px] outline-none " +
                (interactive
                  ? "focus:ring-2 focus:ring-[var(--brand-orange,#f59e0b)]/40"
                  : "bg-gray-50 text-gray-600")
              }
            />
          </div>

          {/* Actions */}
          <div className="flex min-w-0 items-center justify-end">
            <button
              onClick={interactive ? () => handleDelete(it.id) : undefined}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--brand-orange,#f59e0b)]/10 text-[var(--brand-orange,#f59e0b)] hover:bg-[var(--brand-orange,#f59e0b)]/15"
              title="Delete"
            >
              ✖
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- UI ---------- */
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      {/* Breadcrumb */}
      <div className="mb-3 text-xs text-gray-500">
        <Link href={`/${username}`} className="hover:underline">
          @{username}
        </Link>{" "}
        / <span className="text-gray-700">{tripSlug}</span>
      </div>

      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-5xl font-black leading-tight text-[#0A1B4D]">
          Trip Builder
        </h1>

        <div className="flex items-center gap-3">
          {dirtyOrder && (
            <button
              onClick={handleSaveOrder}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </div>

      {/* Name row */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-semibold text-gray-700">
            Name Your Trip
          </div>
          <input
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            className="w-full rounded-xl border bg-white px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange,#f59e0b)]/40"
            placeholder="My trip…"
          />
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold text-gray-700">
            Your Name
          </div>
          <input
            value=""
            onChange={() => {}}
            placeholder="Your name"
            className="w-full rounded-xl border bg-white px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange,#f59e0b)]/40"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading itinerary…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-gray-600">
          This trip has no sites yet.
        </div>
      ) : (
        <div className="mt-4">
          {/* Header */}
          <div className="rounded-[10px] bg-[var(--brand-orange,#f59e0b)] px-4 py-3 text-white font-semibold shadow-sm">
            <div className={GRID}>
              <div className="whitespace-nowrap">Order</div>
              <div className="whitespace-nowrap">🏛️ Site</div>
              <div className="whitespace-nowrap">📍 Region/Province</div>
              <div className="whitespace-nowrap">🗓️ Visit Dates</div>
              <div className="whitespace-nowrap">🧭 Experience</div>
              <div className="whitespace-nowrap">✏️ Notes</div>
              <div className="whitespace-nowrap text-right">Actions</div>
            </div>
          </div>

          {/* Rows */}
          <div ref={listParent} className="mt-4 space-y-4">
            {items.map((it) => {
              const isDragging = draggingId === it.id;
              return (
                <div
                  key={it.id}
                  ref={(el) => {
                    rowRefs.current.set(it.id, el);
                  }}
                  className={
                    "group select-none rounded-[14px] border shadow-sm overflow-hidden transition-colors " +
                    (isDragging
                      ? "border-dashed border-2 border-gray-300 bg-gray-100"
                      : "border-gray-200 bg-white hover:bg-gray-100 cursor-grab active:cursor-grabbing")
                  }
                  title="Drag to reorder"
                  style={isDragging ? { height: dragSize.h } : undefined}
                  draggable
                  onDragStart={handleDragStart(it.id)}
                  onDrag={handleDrag()}
                  onDragOver={handleDragOver(it.id)}
                  onDrop={handleDrop()}
                  onDragEnd={handleDragEnd()}
                >
                  {!isDragging && <RowCard it={it} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full-content Drag Ghost */}
      {draggingId && dragXY && (
        <div
          className="pointer-events-none fixed z-50 rounded-[14px] border border-gray-200 bg-white shadow-xl"
          style={{
            left: `${dragXY.x}px`,
            top: `${dragXY.y}px`,
            width: `${dragSize.w}px`,
            height: `${dragSize.h}px`,
            transform: "scale(0.985) rotate(-0.25deg)",
            transition: "transform 80ms ease-out",
          }}
        >
          <RowCard it={items.find((x) => x.id === draggingId)!} isGhost />
        </div>
      )}
    </main>
  );
}
