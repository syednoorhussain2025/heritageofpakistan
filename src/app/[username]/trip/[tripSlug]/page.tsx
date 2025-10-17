// app/[username]/trip/[tripSlug]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
  attachItemsToDay,
  addTripDay,
  updateTripDay,
  deleteTripDay,
  setDayDateAndPropagate,
  type TravelMode,
  type TimelineItem,
  type SiteLite,
  type TripDay,
} from "@/lib/trips";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import Icon from "@/components/Icon";

/* dnd-kit */
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  DragStartEvent,
  DragEndEvent,
  DragCancelEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

const UNGROUPED = "ungrouped";

/* 7-col grid; keep children aligned */
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

/* ---------- Reusable fade modal ---------- */
function FadeModal({
  isOpen,
  onClose,
  maxWidthClass = "max-w-md",
  children,
  z = 70,
}: {
  isOpen: boolean;
  onClose: () => void;
  maxWidthClass?: string;
  children: React.ReactNode;
  z?: number;
}) {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[${z}] flex items-center justify-center p-4 transition-colors duration-200 ${
        visible ? "bg-black/30" : "bg-black/0"
      }`}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} transform rounded-2xl border bg-white shadow-2xl transition-all duration-200 ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────────── DnD helpers ───────────────────────────── */

function DroppableContainer({
  id,
  isActive,
  children,
}: {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={
        "rounded-[14px] p-3 md:p-4 border-dashed transition-colors " +
        (isActive
          ? "border-[3px] border-[#00b78b] bg-[#00b78b]/5"
          : "border-[3px] border-gray-300 bg-gray-50")
      }
    >
      {children}
    </div>
  );
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={
        "group rounded-[14px] border overflow-visible select-none " +
        (isDragging
          ? "border-dashed border-2 border-[#00b78b] bg-[#00b78b]/5"
          : "border-gray-300 bg-white hover:bg-gray-100 cursor-grab active:cursor-grabbing shadow-[0_8px_24px_-8px_rgba(0,0,0,0.18)]")
      }
      title="Drag to move"
    >
      {children}
    </div>
  );
}

/* ───────────────────────────── Component ───────────────────────────── */

export default function TripBuilderPage() {
  const { username, tripSlug } = useParams<{
    username: string;
    tripSlug: string;
  }>();
  const router = useRouter();

  const [tripId, setTripId] = useState<string | null>(null);
  const [tripName, setTripName] = useState<string>("");
  const [yourName, setYourName] = useState<string>("");

  const [days, setDays] = useState<TripDay[]>([]);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dirtyOrder, setDirtyOrder] = useState(false);
  const [justSaved, setJustSaved] = useState<null | "ok" | "err">(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const [listParent] = useAutoAnimate({ duration: 220, easing: "ease-in-out" });

  // dnd state (simplified: highlight container only)
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overContainer, setOverContainer] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    })
  );

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

  /* ---------- derived: items grouped by day ---------- */
  const itemsByDay = useMemo(() => {
    const map = new Map<string | null, BuilderItem[]>();
    for (const it of items) {
      const key = (it as any).day_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [items]);

  const containerIds = useMemo(
    () => [UNGROUPED, ...days.map((d) => d.id)],
    [days]
  );

  const idsInContainer = (containerId: string) => {
    if (containerId === UNGROUPED)
      return (itemsByDay.get(null) ?? []).map((i) => i.id);
    return (itemsByDay.get(containerId) ?? []).map((i) => i.id);
  };

  const findContainerOf = (id: string | null): string | null => {
    if (!id) return null;
    if (containerIds.includes(id)) return id;
    for (const c of containerIds) {
      if (idsInContainer(c).includes(id)) return c;
    }
    return null;
  };

  /* ---------- persistence helpers ---------- */
  async function persistFullOrder(next: BuilderItem[]) {
    // Build updates for *all* items so server order matches UI exactly
    const siteUpdates = next
      .filter((x): x is BuilderSiteItem => x.kind === "site")
      .map((x: any) => ({
        id: x.id,
        order_index: x.order_index,
        day_id: x.day_id ?? null,
      }));

    const travelUpdates = next
      .filter((x): x is BuilderTravelItem => x.kind === "travel")
      .map((x: any) => ({
        id: x.id,
        order_index: x.order_index,
        day_id: x.day_id ?? null,
      }));

    // Persist
    if (siteUpdates.length) {
      await updateTripItemsBatch(siteUpdates);
    }
    if (travelUpdates.length) {
      await Promise.all(
        travelUpdates.map((t) =>
          updateTravelLeg(t.id, {
            order_index: t.order_index,
            day_id: t.day_id ?? null,
          } as any)
        )
      );
    }
  }

  /* ---------- DnD handlers ---------- */
  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOverContainer(findContainerOf(String(e.active.id)));
    setJustSaved(null);
  };

  const onDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id ? String(e.over.id) : null;
    setOverContainer(findContainerOf(overId));
  };

  const onDragCancel = (_e: DragCancelEvent) => {
    setActiveId(null);
    setOverContainer(null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const aId = e.active?.id ? String(e.active.id) : null;
    const oId = e.over?.id ? String(e.over.id) : null;
    setActiveId(null);
    setOverContainer(null);

    if (!aId || !oId || aId === oId) return;

    const fromCid = findContainerOf(aId);
    const maybeContainer = containerIds.includes(oId) ? oId : null;
    const toCid = findContainerOf(oId) ?? maybeContainer;
    if (!fromCid || !toCid) return;

    // ---- Compute next items array deterministically from current 'items'
    const groups = new Map<string | null, BuilderItem[]>();
    for (const it of items) {
      const key = (it as any).day_id ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    for (const d of days) if (!groups.has(d.id)) groups.set(d.id, []);
    if (!groups.has(null)) groups.set(null, []);

    const fKey = fromCid === UNGROUPED ? null : fromCid;
    const tKey = toCid === UNGROUPED ? null : toCid;

    const fromArr = groups.get(fKey) ?? [];
    const toArr = groups.get(tKey) ?? [];

    const fromIdx = fromArr.findIndex((x) => x.id === aId);
    if (fromIdx < 0) return;

    // Target index before removal if dropping over an item
    const overIdxPre = maybeContainer
      ? -1
      : toArr.findIndex((x) => x.id === oId);

    const [moved] = fromArr.splice(fromIdx, 1);
    if (!moved) return;

    let insertIdx: number;
    if (maybeContainer) insertIdx = toArr.length;
    else if (fromCid === toCid)
      insertIdx = overIdxPre === -1 ? toArr.length : overIdxPre;
    else insertIdx = overIdxPre === -1 ? toArr.length : overIdxPre;

    const movedWithDay = { ...moved, day_id: tKey } as any;
    toArr.splice(
      Math.max(0, Math.min(insertIdx, toArr.length)),
      0,
      movedWithDay
    );

    groups.set(fKey, fromArr);
    groups.set(tKey, toArr);

    const knownDayIds = days.map((d) => d.id);
    const unknownKeys = Array.from(groups.keys()).filter(
      (k) => k !== null && !knownDayIds.includes(k as string)
    ) as string[];

    const orderedKeys: (string | null)[] = [
      ...knownDayIds,
      ...unknownKeys,
      null,
    ];
    const flat: BuilderItem[] = orderedKeys.flatMap(
      (k) => groups.get(k as any) ?? []
    );
    const next = flat.map((x, i) => ({
      ...x,
      order_index: i + 1,
    })) as BuilderItem[];

    // optimistic UI
    setItems(next);
    setDirtyOrder(true);
    setJustSaved(null);

    // Persist both grouping and full order so it survives refresh.
    try {
      // For sites, if day changed we prefer server helper (side-effects), but we still persist full order below.
      const prevDayId = fromCid === UNGROUPED ? null : fromCid;
      const newDayId = tKey;
      const movedNow = next.find((x) => x.id === aId)!;

      if (movedNow.kind === "site" && prevDayId !== newDayId) {
        if (newDayId) {
          await attachItemsToDay({ dayId: newDayId, itemIds: [movedNow.id] });
        } else {
          await updateTripItemsBatch([
            { id: movedNow.id, day_id: null } as any,
          ]);
        }
      }
      // Persist the entire order & day_id snapshot for consistency
      await persistFullOrder(next);

      setDirtyOrder(false);
      setJustSaved("ok");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to persist item position.");
      setJustSaved("err");
      // (Optional) you could reload here, but we leave optimistic order in place so the user can try again.
    }
  };

  /* ---------- site dates / notes ---------- */
  const [openDateFor, setOpenDateFor] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState<{
    in?: string | null;
    out?: string | null;
  }>({});

  const handleOpenDateModal = (
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

  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>("");
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

  /* ---------- delete handlers ---------- */
  const handleDelete = async (it: BuilderItem) => {
    const ok = confirm("Delete this item?");
    if (!ok) return;
    try {
      if (it.kind === "site") await deleteTripItem(it.id);
      else await deleteTravelLeg(it.id);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      setJustSaved(null);
      // After delete, persist full order so positions stay stable.
      const next = (prevItems: BuilderItem[]) =>
        prevItems.map((x, i) => ({
          ...x,
          order_index: i + 1,
        })) as BuilderItem[];
      const computed = next(items.filter((x) => x.id !== it.id));
      await persistFullOrder(computed);
      setItems(computed);
      setJustSaved("ok");
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to delete item.");
      setJustSaved("err");
    }
  };

  /* ---------- manual "Save Order" (kept visible) ---------- */
  const handleSaveOrder = async () => {
    setSaving(true);
    setErrorMsg(null);
    setJustSaved(null);
    try {
      const next = items.map((x, i) => ({
        ...x,
        order_index: i + 1,
      })) as BuilderItem[];
      await persistFullOrder(next);
      setItems(next);
      setDirtyOrder(false);
      setJustSaved("ok");
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to save order.");
      setJustSaved("err");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- formatting helpers ---------- */
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
  const durationLabel = (mins: number | null | undefined) => {
    if (mins == null) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  };

  /* ---------- Cards ---------- */
  function SiteRow({ it }: { it: BuilderSiteItem }) {
    const idx = items.findIndex((x) => x.id === it.id);
    const siteNumber = items
      .slice(0, idx + 1)
      .filter((x) => x.kind === "site").length;

    return (
      <div className="px-4 py-3">
        <div className={GRID}>
          <div className="flex items-center justify-center">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#00b78b] text-white text-[11px] font-semibold shadow-sm">
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
                    data-no-drag
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

          <div className="relative min-w-0">
            <button
              onClick={() =>
                handleOpenDateModal(it.id, it.date_in, it.date_out)
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-700 whitespace-nowrap hover:bg-gray-100"
              data-no-drag
              type="button"
            >
              <KIcon
                name="calendar-check"
                size={14}
                className="text-[var(--brand-orange,#f59e0b)]"
              />
              <span>{fmtRange(it.date_in, it.date_out)}</span>
            </button>
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

          <div className="relative min-w-0 pt-4 pr-7">
            <button
              type="button"
              className="absolute right-0 -top-2 p-1 text-gray-500 hover:text-[var(--brand-orange,#f59e0b)]"
              onClick={() => openNotesEditor(it.id, (it as any).notes ?? "")}
              data-no-drag
              aria-label="Edit note"
              title="Edit note"
            >
              <KIcon name="edit" size={16} />
            </button>
            <div
              className={
                "text-[14px] break-words whitespace-pre-wrap " +
                ((it as any).notes && (it as any).notes.trim().length > 0
                  ? "text-gray-800"
                  : "text-gray-500 italic")
              }
            >
              {(it as any).notes && (it as any).notes.trim().length > 0
                ? (it as any).notes
                : "Add note"}
            </div>
          </div>

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

  function TravelRow({ it }: { it: BuilderTravelItem }) {
    const fromName = it.from_region_name ?? "From…";
    const toName = it.to_region_name ?? "To…";
    const modeMeta = MODE_META[it.mode] || MODE_META.car;

    const startShort = fmtDateTimeShort((it as any).travel_start_at);
    const endShort = fmtDateTimeShort((it as any).travel_end_at);

    return (
      <div className="px-4 py-3">
        <div className={GRID}>
          <div />
          <div className="col-span-5">
            <button
              type="button"
              className="w-full"
              onClick={() => startEditTravel(it)}
              data-no-drag
              title="Edit travel"
            >
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
                    <div className="ml-6 text-xs text-slate-600">
                      {endShort}
                    </div>
                  )}
                </div>
              </div>
            </button>
          </div>

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

  /* ---------- Travel editor state & helpers ---------- */
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
    mode: TravelMode | "train";
    duration_hours: number | null;
    duration_mins: number | null;
    distance_km: number | null;
    travel_start_at: string | null;
    travel_end_at: string | null;
  } | null>(null);

  const startEditTravel = (row: BuilderTravelItem) => {
    const mins = row.duration_minutes ?? null;
    const h = mins != null ? Math.floor(mins / 60) : null;
    const m = mins != null ? mins % 60 : null;
    setEditingTravel(row);
    setTravelDraft({
      from_region_id: row.from_region_id ?? null,
      from_region_name: (row as any).from_region_name ?? null,
      to_region_id: row.to_region_id ?? null,
      to_region_name: (row as any).to_region_name ?? null,
      mode: row.mode,
      duration_hours: h,
      duration_mins: m,
      distance_km: row.distance_km ?? null,
      travel_start_at: (row as any).travel_start_at ?? null,
      travel_end_at: (row as any).travel_end_at ?? null,
    });
    setTravelFromQuery("");
    setTravelToQuery("");
    setTravelFromOpts([]);
    setTravelToOpts([]);
  };

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
      const totalMinutes =
        (travelDraft.duration_hours ?? 0) * 60 +
        (travelDraft.duration_mins ?? 0);
      const modeToSave =
        (travelDraft.mode as any) === "train"
          ? ("bus" as TravelMode)
          : (travelDraft.mode as TravelMode);

      const basePatch: any = {
        from_region_id: travelDraft.from_region_id,
        to_region_id: travelDraft.to_region_id,
        mode: modeToSave,
        duration_minutes: Number.isFinite(totalMinutes) ? totalMinutes : null,
        distance_km: travelDraft.distance_km,
      };
      const withDatesPatch = {
        ...basePatch,
        travel_start_at: travelDraft.travel_start_at || null,
        travel_end_at: travelDraft.travel_end_at || null,
      };

      let patched: any;
      try {
        patched = await updateTravelLeg(editingTravel.id, withDatesPatch);
      } catch (err: any) {
        const msg = err?.message || "";
        if (msg.includes("travel_start_at") || msg.includes("travel_end_at")) {
          setErrorMsg(
            "Saved, but start/end time isn’t supported yet on this trip."
          );
          patched = await updateTravelLeg(editingTravel.id, basePatch);
        } else {
          throw err;
        }
      }

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
                travel_start_at:
                  travelDraft.travel_start_at ??
                  (it as any).travel_start_at ??
                  null,
                travel_end_at:
                  travelDraft.travel_end_at ??
                  (it as any).travel_end_at ??
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
      const appended = [
        ...items,
        { ...row, kind: "travel" } as BuilderTravelItem,
      ].map((x, i) => ({
        ...x,
        order_index: i + 1,
      })) as BuilderItem[];
      setItems(appended);
      setDirtyOrder(true);
      setJustSaved(null);
      await persistFullOrder(appended);
      setDirtyOrder(false);
      setJustSaved("ok");
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to add travel.");
      setJustSaved("err");
    }
  };

  /* ---------- Day CRUD ---------- */
  const handleAddDay = async () => {
    if (!tripId) return;
    try {
      const created = await addTripDay({ trip_id: tripId, title: "" } as any);
      setDays((prev) => [{ ...created }, ...prev]);
      setShowAddMenu(false);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to add day.");
    }
  };

  const handleUpdateDayTitle = async (day: TripDay, title: string) => {
    setDays((prev) => prev.map((d) => (d.id === day.id ? { ...d, title } : d)));
    try {
      await updateTripDay(day.id, { title: title ?? "" });
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to update day.");
    }
  };

  const handleUpdateDayDate = async (day: TripDay, dateStr: string) => {
    const the_date = dateStr || null;
    setDays((prev) =>
      prev.map((d) => (d.id === day.id ? { ...d, the_date } : d))
    );
    try {
      if (the_date) {
        await setDayDateAndPropagate(day.id, the_date);
        setItems((prev) =>
          prev.map((it: any) =>
            it.day_id === day.id
              ? { ...it, date_in: the_date, date_out: the_date }
              : it
          )
        );
      } else {
        await updateTripDay(day.id, { the_date: null });
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to update day date.");
    }
  };

  const handleDeleteDay = async (day: TripDay) => {
    const ok = confirm("Delete this day? Items will be ungrouped.");
    if (!ok) return;
    setItems((prev) =>
      prev.map((it: any) =>
        it.day_id === day.id ? { ...it, day_id: null } : it
      )
    );
    setDays((prev) => prev.filter((d) => d.id !== day.id));
    try {
      const scoped = items.filter((it: any) => it.day_id === day.id);
      if (scoped.length) {
        await updateTripItemsBatch(
          scoped.map((it) => ({ id: it.id, day_id: null } as any))
        );
      }
      await deleteTripDay(day.id);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to delete day.");
    }
  };

  /* ---------- UI ---------- */
  return (
    <main className="bg-slate-100 min-h-screen py-6">
      <div className="mx-auto max-w-6xl rounded-2xl bg-white shadow-sm px-5 md:px-8 lg:px-10 py-6">
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
            <button
              onClick={handleSaveOrder}
              disabled={saving || !dirtyOrder}
              className={
                "rounded-lg px-4 py-2 text-sm font-semibold text-white " +
                (saving || !dirtyOrder
                  ? "bg-blue-400/60 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700")
              }
              type="button"
            >
              {saving ? "Saving…" : "Save Order"}
            </button>
            {justSaved === "ok" && (
              <span className="text-xs text-green-700">All changes saved</span>
            )}
            {justSaved === "err" && (
              <span className="text-xs text-red-600">Save failed</span>
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
        ) : (
          <>
            {/* Orange labels row ABOVE the days */}
            <div className="rounded-[10px] bg-[var(--brand-orange,#f59e0b)] px-4 py-2.5 text-white shadow-sm mb-6">
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
                <div className="text-right text-[15px] font-semibold whitespace-nowrap">
                  Remove
                </div>
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragCancel={onDragCancel}
              onDragEnd={onDragEnd}
            >
              {/* Days */}
              <div className="space-y-14 mb-6">
                {days.map((day, i) => {
                  const scoped = itemsByDay.get(day.id) ?? [];
                  const isActive = overContainer === day.id && !!activeId;

                  return (
                    <DroppableContainer
                      key={day.id}
                      id={day.id}
                      isActive={isActive}
                    >
                      {/* Day header */}
                      <div className="mb-3 flex items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-[#0b1a55] px-14 py-2 text-white text-sm font-bold">
                          {`Day ${i + 1}`}
                        </span>

                        <input
                          className="flex-1 rounded-lg px-3 py-2 text-sm bg-white border border-gray-200 focus:outline-none focus:border-[#0b1a55] focus:ring-2 focus:ring-[#0b1a55]/30"
                          placeholder="Add Title"
                          value={day.title ?? ""}
                          onChange={(e) =>
                            handleUpdateDayTitle(day, e.target.value)
                          }
                        />

                        <input
                          type="date"
                          className="rounded-lg px-3 py-2 text-sm bg-white border border-gray-200 focus:outline-none focus:border-[var(--brand-orange,#f59e0b)] focus:ring-2 focus:ring-[var(--brand-orange,#f59e0b)]/30"
                          value={(day as any).the_date ?? ""}
                          onChange={(e) =>
                            handleUpdateDayDate(day, e.target.value)
                          }
                        />

                        <button
                          type="button"
                          className="p-2"
                          title="Delete day"
                          onClick={() => handleDeleteDay(day)}
                        >
                          <KIcon
                            name="trash"
                            className="text-[var(--brand-orange,#f59e0b)]"
                          />
                        </button>
                      </div>

                      {/* Sortable list */}
                      <SortableContext
                        items={scoped.map((x) => x.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {scoped.length ? (
                          <div className="space-y-3">
                            {scoped.map((it) => (
                              <SortableItem key={it.id} id={it.id}>
                                {it.kind === "site" ? (
                                  <SiteRow it={it as BuilderSiteItem} />
                                ) : (
                                  <TravelRow it={it as BuilderTravelItem} />
                                )}
                              </SortableItem>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed px-4 py-2 text-center text-sm text-gray-400 bg-white">
                            Drag items here
                          </div>
                        )}
                      </SortableContext>
                    </DroppableContainer>
                  );
                })}
              </div>

              {/* Ungrouped header */}
              <div className="mt-2 mb-2 text-sm font-semibold text-slate-700">
                Ungrouped items
              </div>

              {/* Ungrouped container */}
              <DroppableContainer
                id={UNGROUPED}
                isActive={overContainer === UNGROUPED && !!activeId}
              >
                <SortableContext
                  items={(itemsByDay.get(null) ?? []).map((x) => x.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div ref={listParent} className="space-y-3">
                    {(itemsByDay.get(null) ?? []).length ? (
                      (itemsByDay.get(null) ?? []).map((it) => (
                        <SortableItem key={it.id} id={it.id}>
                          {it.kind === "site" ? (
                            <SiteRow it={it as BuilderSiteItem} />
                          ) : (
                            <TravelRow it={it as BuilderTravelItem} />
                          )}
                        </SortableItem>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed px-4 py-2 text-center text-sm text-gray-400 bg-white">
                        Drag items here to ungroup
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DroppableContainer>

              {/* Drag overlay */}
              <DragOverlay>
                {activeId
                  ? (() => {
                      const row = items.find((x) => x.id === activeId)!;
                      return row.kind === "site" ? (
                        <div className="rounded-[14px] border border-gray-300 bg-white shadow-[0_10px_28px_-10px_rgba(0,0,0,0.22)]">
                          <SiteRow it={row as BuilderSiteItem} />
                        </div>
                      ) : (
                        <div className="rounded-[14px] border border-gray-300 bg-white shadow-[0_10px_28px_-10px_rgba(0,0,0,0.22)]">
                          <TravelRow it={row as BuilderTravelItem} />
                        </div>
                      );
                    })()
                  : null}
              </DragOverlay>
            </DndContext>
          </>
        )}

        {/* Floating green + FAB */}
        <button
          type="button"
          aria-label="Add"
          className="fixed bottom-6 right-6 z-[65] inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#00b78b] text-white shadow-xl transition-transform duration-150 hover:scale-105 active:scale-95"
          onClick={() => setShowAddMenu(true)}
        >
          <KIcon name="plus" size={28} />
        </button>
      </div>

      {/* Modals */}
      <FadeModal
        isOpen={!!openDateFor}
        onClose={() => setOpenDateFor(null)}
        maxWidthClass="max-w-lg"
        z={75}
      >
        <div className="p-5">
          <div className="mb-3 text-lg font-semibold text-slate-800">
            Select dates
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="w-20 shrink-0 text-xs font-semibold text-slate-600">
                Check-in
              </label>
              <input
                type="date"
                value={dateDraft.in ?? ""}
                onChange={(e) =>
                  setDateDraft((d) => ({ ...d, in: e.target.value || "" }))
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                data-no-drag
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="w-20 shrink-0 text-xs font-semibold text-slate-600">
                Check-out
              </label>
              <input
                type="date"
                value={dateDraft.out ?? ""}
                onChange={(e) =>
                  setDateDraft((d) => ({ ...d, out: e.target.value || "" }))
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
                data-no-drag
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenDateFor(null)}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50"
              type="button"
            >
              Cancel
            </button>
            {openDateFor && (
              <button
                onClick={() => applyDates(openDateFor)}
                className="rounded-md bg-[var(--brand-orange,#f59e0b)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
                type="button"
              >
                Apply
              </button>
            )}
          </div>
        </div>
      </FadeModal>

      <FadeModal isOpen={!!openNotesFor} onClose={() => setOpenNotesFor(null)}>
        <div className="p-4">
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
            {openNotesFor && (
              <button
                onClick={() => applyNotes(openNotesFor)}
                className="rounded-md bg-[var(--brand-orange,#f59e0b)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
                type="button"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </FadeModal>

      {/* Travel Editor */}
      <FadeModal
        isOpen={!!editingTravel && !!travelDraft}
        onClose={() => setEditingTravel(null)}
        maxWidthClass="max-w-lg"
      >
        {editingTravel && travelDraft && (
          <div className="p-5">
            <div className="mb-3 text-lg font-semibold text-slate-800">
              Edit travel
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* From / To */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
              </div>

              {/* Mode buttons */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Mode
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    ["airplane", "bus", "car", "walk", "train"] as (
                      | TravelMode
                      | "train"
                    )[]
                  ).map((m) => {
                    const meta = MODE_META[m];
                    const active = travelDraft.mode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        className={
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
                          (active
                            ? "border-blue-600 text-blue-700 bg-blue-50"
                            : "border-gray-300 hover:bg-gray-50")
                        }
                        onClick={() =>
                          setTravelDraft((d) => d && { ...d, mode: m })
                        }
                      >
                        <KIcon name={meta.icon} />
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration + Distance */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Hours
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={travelDraft.duration_hours ?? ""}
                    onChange={(e) =>
                      setTravelDraft(
                        (d) =>
                          d && {
                            ...d,
                            duration_hours: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                      )
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Minutes
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={travelDraft.duration_mins ?? ""}
                    onChange={(e) => {
                      const v = e.target.value
                        ? Math.min(Number(e.target.value), 59)
                        : null;
                      setTravelDraft((d) => d && { ...d, duration_mins: v });
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Distance (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
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
                  />
                </div>
              </div>

              {/* Travel Start / End */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Travel Start
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={travelDraft.travel_start_at ?? ""}
                    onChange={(e) =>
                      setTravelDraft(
                        (d) =>
                          d && { ...d, travel_start_at: e.target.value || null }
                      )
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Travel End
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={travelDraft.travel_end_at ?? ""}
                    onChange={(e) =>
                      setTravelDraft(
                        (d) =>
                          d && { ...d, travel_end_at: e.target.value || null }
                      )
                    }
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
        )}
      </FadeModal>

      {/* Add menu */}
      <FadeModal
        isOpen={showAddMenu}
        onClose={() => setShowAddMenu(false)}
        maxWidthClass="max-w-sm"
        z={70}
      >
        <div className="p-5">
          <div className="mb-3 text-lg font-semibold text-slate-800">
            Add to Trip
          </div>
        </div>
        <div className="px-5 pb-5 grid gap-2">
          <button
            className="w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50"
            onClick={handleAddDay}
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
        <div className="px-5 pb-5 flex justify-end">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            onClick={() => setShowAddMenu(false)}
          >
            Close
          </button>
        </div>
      </FadeModal>
    </main>
  );
}
