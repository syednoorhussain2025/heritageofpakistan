// app/[username]/trip/[tripSlug]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getTripByUsernameSlug,
  getTripWithItems,
  getTripTimeline,
  updateTripItemsBatch,
  deleteTripItem,
  addTravelLeg,
  updateTravelLeg,
  deleteTravelLeg,
  searchRegions,
  type TravelMode,
  type TimelineItem,
  type SiteLite,
} from "@/lib/trips";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import Icon from "@/components/Icon";

type BuilderSiteItem = Extract<TimelineItem, { kind: "site" }> & {
  site?: SiteLite | null;
  provinceName?: string | null;
  experience?: string[];
};
type BuilderTravelItem = Extract<TimelineItem, { kind: "travel" }> & {
  from_region_name?: string | null;
  to_region_name?: string | null;
};
type BuilderItem = BuilderSiteItem | BuilderTravelItem;

/* Grid for the list */
const GRID =
  "grid items-center gap-3 " +
  "grid-cols-[36px_minmax(200px,1.6fr)_minmax(140px,1.1fr)_minmax(120px,auto)_minmax(140px,1fr)_minmax(160px,1.1fr)_84px]";

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
    | "plus";
  size?: number;
  className?: string;
}) {
  return <Icon name={name} size={size} className={className} />;
}

export default function TripBuilderPage() {
  const { username, tripSlug } = useParams<{
    username: string;
    tripSlug: string;
  }>();
  const router = useRouter();

  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState<string>("");
  const [yourName, setYourName] = useState<string>("");

  const [items, setItems] = useState<BuilderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dirtyOrder, setDirtyOrder] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

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

  // Notes modal (site only, still limited to 50 chars)
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>("");

  // Travel editor modal
  const [editingTravel, setEditingTravel] = useState<BuilderTravelItem | null>(
    null
  );
  const [travelFromQuery, setTravelFromQuery] = useState("");
  const [travelToQuery, setTravelToQuery] = useState("");
  const [travelFromOpts, setTravelFromOpts] = useState<any[]>([]);
  const [travelToOpts, setTravelToOpts] = useState<any[]>([]);
  const [travelDraft, setTravelDraft] = useState<{
    from_region_id: string | null;
    from_region_name: string | null;
    to_region_id: string | null;
    to_region_name: string | null;
    mode: TravelMode;
    duration_minutes: number | null;
    distance_km: number | null;
  } | null>(null);

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
        setTripName(trip.name);

        // 1) unified timeline (basic site rows + travel rows)
        const timeline = await getTripTimeline(trip.id);

        // 2) hydrate site rows with site/province/experience
        const { items: siteEnriched } = await getTripWithItems(trip.id);
        const siteById: Record<string, BuilderSiteItem> = Object.fromEntries(
          (siteEnriched as BuilderSiteItem[]).map((s) => [
            s.id,
            { ...s, kind: "site" },
          ])
        );

        const merged: BuilderItem[] = timeline.map((row) => {
          if (row.kind === "site") {
            const full = siteById[row.id];
            return (
              full ??
              ({
                ...row,
                site: null,
                provinceName: null,
                experience: [],
              } as BuilderSiteItem)
            );
          }
          // travel row
          return row as BuilderTravelItem;
        });

        if (!mounted) return;
        setItems(merged);
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

  /* ---------- drag & drop ---------- */
  const handleDragStart =
    (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
      const t = e.target as HTMLElement;
      if (t.closest("textarea,input,button,a,[data-no-drag]")) {
        e.preventDefault();
        return;
      }
      dragIdRef.current = id;
      setDraggingId(id);
      e.dataTransfer.effectAllowed = "move";
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
        return renumbered as BuilderItem[];
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

  /* ---------- site dates / notes ---------- */
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
        it.id === itemId && it.kind === "site"
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

  const openNotesEditor = (itemId: string, current: string | null) => {
    setOpenNotesFor(itemId);
    setNoteDraft((current ?? "").slice(0, 50));
  };
  const handleNoteDraftChange = (val: string) => setNoteDraft(val.slice(0, 50));
  const applyNotes = async (itemId: string) => {
    const newVal = noteDraft.trim();
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId && it.kind === "site" ? { ...it, notes: newVal } : it
      )
    );
    setOpenNotesFor(null);
    try {
      await updateTripItemsBatch([{ id: itemId, notes: newVal }]);
    } catch {
      setErrorMsg("Failed to save notes.");
    }
  };

  /* ---------- save order (sites + travel) ---------- */
  const handleSaveOrder = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const siteUpdates = items
        .filter((x): x is BuilderSiteItem => x.kind === "site")
        .map((x) => ({ id: x.id, order_index: x.order_index }));
      const travelUpdates = items
        .filter((x): x is BuilderTravelItem => x.kind === "travel")
        .map((x) => ({ id: x.id, order_index: x.order_index }));

      if (siteUpdates.length) await updateTripItemsBatch(siteUpdates);
      if (travelUpdates.length) {
        await Promise.all(
          travelUpdates.map((t) =>
            updateTravelLeg(t.id, { order_index: t.order_index })
          )
        );
      }
      setDirtyOrder(false);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to save order.");
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

  /* ---------- travel editor ---------- */
  const startEditTravel = (row: BuilderTravelItem) => {
    setEditingTravel(row);
    setTravelDraft({
      from_region_id: row.from_region_id ?? null,
      from_region_name: (row as any).from_region_name ?? null,
      to_region_id: row.to_region_id ?? null,
      to_region_name: (row as any).to_region_name ?? null,
      mode: row.mode,
      duration_minutes: row.duration_minutes,
      distance_km: row.distance_km,
    });
    setTravelFromQuery("");
    setTravelToQuery("");
    setTravelFromOpts([]);
    setTravelToOpts([]);
  };

  // quick search (debounced lightly via onChange usage)
  useEffect(() => {
    let live = true;
    (async () => {
      if (travelFromQuery.trim().length < 2) return setTravelFromOpts([]);
      const res = await searchRegions(travelFromQuery.trim());
      if (!live) return;
      setTravelFromOpts(res);
    })();
    return () => {
      live = false;
    };
  }, [travelFromQuery]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (travelToQuery.trim().length < 2) return setTravelToOpts([]);
      const res = await searchRegions(travelToQuery.trim());
      if (!live) return;
      setTravelToOpts(res);
    })();
    return () => {
      live = false;
    };
  }, [travelToQuery]);

  const saveTravel = async () => {
    if (!editingTravel || !travelDraft) return;
    try {
      const patched = await updateTravelLeg(editingTravel.id, {
        from_region_id: travelDraft.from_region_id,
        to_region_id: travelDraft.to_region_id,
        mode: travelDraft.mode,
        duration_minutes: travelDraft.duration_minutes,
        distance_km: travelDraft.distance_km,
      });

      setItems((prev) =>
        prev.map((it) =>
          it.id === editingTravel.id && it.kind === "travel"
            ? {
                ...it,
                ...patched,
                from_region_name:
                  travelDraft.from_region_name ??
                  (it as any).from_region_name ??
                  null,
                to_region_name:
                  travelDraft.to_region_name ??
                  (it as any).to_region_name ??
                  null,
              }
            : it
        )
      );
      setEditingTravel(null);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to save travel.");
    }
  };

  const addTravel = async () => {
    if (!tripId) return;
    try {
      const row = await addTravelLeg({ trip_id: tripId, mode: "car" });
      // put at end in local state
      setItems((prev) => {
        const arr = [...prev, { ...row, kind: "travel" } as BuilderTravelItem];
        const ren = arr.map((x, i) => ({
          ...x,
          order_index: i + 1,
        })) as BuilderItem[];
        return ren;
      });
      setDirtyOrder(true);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to add travel.");
    }
  };

  /* ---------- delete (site or travel) ---------- */
  const handleDelete = async (it: BuilderItem) => {
    const ok = confirm("Remove this entry?");
    if (!ok) return;
    try {
      if (it.kind === "site") {
        await deleteTripItem(it.id);
      } else {
        await deleteTravelLeg(it.id);
      }
      setItems((prev) =>
        prev
          .filter((x) => x.id !== it.id)
          .map((x, idx) => ({ ...x, order_index: idx + 1 }))
      );
      setDirtyOrder(true);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to delete item.");
    }
  };

  /* ---------- render helpers ---------- */
  const siteNumber = (rowIndex: number) => {
    // numbering ONLY sites (by visual order)
    const siteIndex = items
      .slice(0, rowIndex + 1)
      .filter((x) => x.kind === "site").length;
    return siteIndex;
  };

  /* ---------- Cards ---------- */

  function SiteRow({
    it,
    isGhost = false,
  }: {
    it: BuilderSiteItem;
    isGhost?: boolean;
  }) {
    const interactive = !isGhost;
    const idx = items.findIndex((x) => x.id === it.id);
    const num = siteNumber(idx);

    return (
      <div className={"px-4 py-3 " + (isGhost ? "pointer-events-none" : "")}>
        <div className={GRID}>
          {/* Number circle (sites only) */}
          <div className="flex items-center justify-center">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#00b78b] text-white text-[11px] font-semibold shadow-sm">
              {num}
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
              <div className="truncate font-semibold text-[17px] text-[#0A1B4D]">
                {it.site ? (
                  interactive ? (
                    <Link
                      href={`/site/${it.site.slug}`}
                      className="hover:underline"
                      data-no-drag
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

          {/* Region */}
          <div className="min-w-0 truncate text-[15px] text-gray-700">
            {it.provinceName || "—"}
          </div>

          {/* Dates */}
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
              data-no-drag
              type="button"
            >
              <KIcon name="calendar-check" size={16} className="text-current" />
              <span>{fmtRange(it.date_in, it.date_out)}</span>
            </button>

            {interactive && openDateFor === it.id && (
              <div className="absolute z-40 mt-2 w-72 rounded-lg border bg-white p-3 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.22)]">
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
                      data-no-drag
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
                      data-no-drag
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => setOpenDateFor(null)}
                      className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
                      data-no-drag
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => applyDates(it.id)}
                      className="rounded-md bg-[var(--brand-orange,#f59e0b)] px-3 py-1 text-xs font-semibold text-white hover:brightness-95"
                      data-no-drag
                      type="button"
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

          {/* Notes + edit icon */}
          <div className="relative min-w-0 pt-4 pr-7">
            <button
              type="button"
              className="absolute right-0 -top-2 p-1 text-gray-500 hover:text-[var(--brand-orange,#f59e0b)]"
              onClick={() => openNotesEditor(it.id, it.notes ?? "")}
              data-no-drag
              aria-label="Edit note"
              title="Edit note"
            >
              <KIcon name="edit" size={16} />
            </button>
            <div
              className={
                "text-[14px] break-words whitespace-pre-wrap " +
                (it.notes && it.notes.trim().length > 0
                  ? "text-gray-800"
                  : "text-gray-500 italic")
              }
            >
              {it.notes && it.notes.trim().length > 0 ? it.notes : "Add note"}
            </div>
          </div>

          {/* Actions */}
          <div className="flex min-w-0 items-center justify-end">
            <button
              onClick={() => handleDelete(it)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--brand-orange,#f59e0b)]/10 text-[var(--brand-orange,#f59e0b)] hover:bg-[var(--brand-orange,#f59e0b)]/15"
              title="Delete"
              data-no-drag
              type="button"
            >
              ✖
            </button>
          </div>
        </div>
      </div>
    );
  }

  function TravelRow({
    it,
    isGhost = false,
  }: {
    it: BuilderTravelItem;
    isGhost?: boolean;
  }) {
    const interactive = !isGhost;

    const fromName = it.from_region_name ?? "From...";
    const toName = it.to_region_name ?? "To...";
    const modeTitle =
      it.mode === "airplane"
        ? "Airplane"
        : it.mode === "bus"
        ? "Bus"
        : it.mode === "car"
        ? "Car"
        : "Walk/Trek";
    const label = `${fromName} — ${modeTitle} — ${toName}`;
    const dur =
      it.duration_minutes != null ? `${it.duration_minutes} min` : "— min";
    const dist = it.distance_km != null ? `${it.distance_km} km` : "— km";

    return (
      <div className={"px-4 py-3 " + (isGhost ? "pointer-events-none" : "")}>
        <div className={GRID}>
          {/* NO number for travel */}
          <div />

          {/* Centered travel info (span across site/region columns) */}
          <div className="col-span-4 flex items-center justify-center">
            <button
              type="button"
              className="text-[17px] font-medium text-[#0A1B4D] underline-offset-2 hover:underline"
              onClick={() => interactive && startEditTravel(it)}
              data-no-drag
              title="Edit travel"
            >
              {label}
            </button>
          </div>

          {/* duration / distance small pill */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => interactive && startEditTravel(it)}
              className="rounded-md border px-3 py-1 text-sm text-[#0A1B4D] hover:bg-gray-50"
              data-no-drag
            >
              {dur} / {dist}
            </button>
          </div>

          {/* Actions */}
          <div className="flex min-w-0 items-center justify-end">
            <button
              onClick={() => handleDelete(it)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--brand-orange,#f59e0b)]/10 text-[var(--brand-orange,#f59e0b)] hover:bg-[var(--brand-orange,#f59e0b)]/15"
              title="Delete"
              data-no-drag
              type="button"
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
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            type="button"
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
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange,#f59e0b)]/40"
            placeholder="My trip…"
          />
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold text-gray-700">
            Your Name
          </div>
          <input
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange,#f59e0b)]/40"
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
          This trip has no items yet.
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="rounded-[10px] bg-[var(--brand-orange,#f59e0b)] px-4 py-2.5 text-white shadow-sm">
            <div className={GRID}>
              <div className="text-[15px] font-semibold whitespace-nowrap">
                Order
              </div>
              <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                <KIcon name="unesco" className="text-white" />
                <span>Item</span>
              </div>
              <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                <KIcon name="map-marker-alt" className="text-white" />
                <span>Details</span>
              </div>
              <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                <KIcon name="calendar-check" className="text-white" />
                <span>Dates / Time</span>
              </div>
              <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                <KIcon name="hike" className="text-white" />
                <span>Extra</span>
              </div>
              <div className="flex items-center gap-2 text-[15px] font-semibold whitespace-nowrap text-white">
                <KIcon name="info" className="text-white" />
                <span>Notes</span>
              </div>
              <div className="text-right text-[15px] font-semibold whitespace-nowrap">
                Actions
              </div>
            </div>
          </div>

          {/* Rows */}
          <div ref={listParent} className="mt-4 space-y-3">
            {items.map((it) => {
              const isDragging = draggingId === it.id;
              return (
                <div
                  key={it.id}
                  ref={(el) => rowRefs.current.set(it.id, el)}
                  className={
                    "group rounded-[14px] border overflow-visible " +
                    (isDragging
                      ? "border-dashed border-2 border-gray-300 bg-gray-100"
                      : "border-gray-300 bg-white hover:bg-gray-100 cursor-grab active:cursor-grabbing shadow-[0_8px_24px_-8px_rgba(0,0,0,0.18)]")
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
                  {it.kind === "site" ? (
                    <SiteRow it={it} />
                  ) : (
                    <TravelRow it={it} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Drag Ghost */}
      {draggingId && dragXY && (
        <div
          className="pointer-events-none fixed z-50 rounded-[14px] border border-gray-300 bg-white shadow-[0_10px_28px_-10px_rgba(0,0,0,0.22)]"
          style={{
            left: `${dragXY.x}px`,
            top: `${dragXY.y}px`,
            width: `${dragSize.w}px`,
            height: `${dragSize.h}px`,
            transform: "scale(0.985) rotate(-0.25deg)",
            transition: "transform 80ms ease-out",
          }}
        >
          {(() => {
            const row = items.find((x) => x.id === draggingId)!;
            return row.kind === "site" ? (
              <SiteRow it={row} isGhost />
            ) : (
              <TravelRow it={row} isGhost />
            );
          })()}
        </div>
      )}

      {/* Notes Modal (sites) */}
      {openNotesFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenNotesFor(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border bg-white p-4 shadow-xl">
            <div className="mb-2 text-sm font-semibold text-gray-700">
              Edit note
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => handleNoteDraftChange(e.target.value)}
              rows={5}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-orange,#f59e0b)]/40"
              placeholder="Type note (max 50 characters)…"
              autoFocus
            />
            <div className="mt-1 text-xs text-gray-500">
              {noteDraft.length}/50 characters
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setOpenNotesFor(null)}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={() => applyNotes(openNotesFor)}
                className="rounded-md bg-[var(--brand-orange,#f59e0b)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Travel Editor (single popup) */}
      {editingTravel && travelDraft && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingTravel(null);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border bg-white p-5 shadow-2xl">
            <div className="mb-3 text-lg font-semibold text-slate-800">
              Edit travel
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* From */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  From
                </label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Search region…"
                  value={travelFromQuery}
                  onChange={(e) => setTravelFromQuery(e.target.value)}
                />
                {travelFromOpts.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-auto rounded-md border">
                    {travelFromOpts.map((r) => (
                      <button
                        key={r.id}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        onClick={() =>
                          setTravelDraft(
                            (d) =>
                              d && {
                                ...d,
                                from_region_id: r.id,
                                from_region_name: r.name,
                              }
                          )
                        }
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
                {!!travelDraft.from_region_name && (
                  <div className="mt-1 text-xs text-slate-600">
                    Selected: {travelDraft.from_region_name}
                  </div>
                )}
              </div>

              {/* To */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  To
                </label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Search region…"
                  value={travelToQuery}
                  onChange={(e) => setTravelToQuery(e.target.value)}
                />
                {travelToOpts.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-auto rounded-md border">
                    {travelToOpts.map((r) => (
                      <button
                        key={r.id}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        onClick={() =>
                          setTravelDraft(
                            (d) =>
                              d && {
                                ...d,
                                to_region_id: r.id,
                                to_region_name: r.name,
                              }
                          )
                        }
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
                {!!travelDraft.to_region_name && (
                  <div className="mt-1 text-xs text-slate-600">
                    Selected: {travelDraft.to_region_name}
                  </div>
                )}
              </div>

              {/* Mode */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Mode
                </label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={travelDraft.mode}
                  onChange={(e) =>
                    setTravelDraft(
                      (d) => d && { ...d, mode: e.target.value as TravelMode }
                    )
                  }
                >
                  <option value="airplane">Airplane</option>
                  <option value="bus">Bus</option>
                  <option value="car">Car</option>
                  <option value="walk">Walk/Trekking</option>
                </select>
              </div>

              {/* Duration / Distance */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={travelDraft.duration_minutes ?? ""}
                    onChange={(e) =>
                      setTravelDraft(
                        (d) =>
                          d && {
                            ...d,
                            duration_minutes: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                      )
                    }
                    min={0}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Distance (km)
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={travelDraft.distance_km ?? ""}
                    onChange={(e) =>
                      setTravelDraft(
                        (d) =>
                          d && {
                            ...d,
                            distance_km: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                      )
                    }
                    step="0.1"
                    min={0}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setEditingTravel(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-[var(--brand-orange,#f59e0b)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95"
                onClick={saveTravel}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        aria-label="Add"
        className="fixed bottom-6 right-6 z-[65] inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#00b78b] text-white shadow-xl transition-transform duration-150 hover:scale-105 active:scale-95"
        onClick={() => setShowAddMenu(true)}
      >
        <KIcon name="plus" size={28} />
      </button>

      {showAddMenu && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowAddMenu(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border bg-white p-5 shadow-2xl">
            <div className="mb-3 text-lg font-semibold text-slate-800">
              Add to Trip
            </div>
            <div className="grid gap-2">
              <button
                className="w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50"
                onClick={() => setShowAddMenu(false)}
              >
                Add Day
              </button>
              <button
                className="w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50"
                onClick={() => setShowAddMenu(false)}
              >
                Add Activity
              </button>
              <button
                className="w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50"
                onClick={async () => {
                  setShowAddMenu(false);
                  await addTravel();
                }}
              >
                Add Travel
              </button>
              <button
                className="w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50"
                onClick={() => setShowAddMenu(false)}
              >
                Add Site
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setShowAddMenu(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
