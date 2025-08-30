// src/app/dashboard/mycollections/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import {
  listCollectionItems,
  setCollectionCover,
  reorderCollectionItems,
} from "@/lib/photoCollections";
import { createClient } from "@/lib/supabase/browser";
import { motion, AnimatePresence } from "framer-motion";

/* Lightbox for a single collection */
type LightboxImage = {
  publicUrl: string | null;
  alt_text?: string | null;
  caption?: string | null;
  credit?: string | null;
};

function Lightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);
  const img = images[index];

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 10);
    return () => clearTimeout(t);
  }, []);

  const requestClose = useCallback(() => {
    setShow(false);
    setTimeout(() => onClose(), 350);
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, onPrev, onNext]);

  return (
    <div
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) requestClose();
      }}
      className={`fixed inset-0 z-[2000] flex items-center justify-center transition-opacity duration-300 ${
        show ? "opacity-100" : "opacity-0"
      } bg-black/85 backdrop-blur-[1px]`}
      aria-modal="true"
      role="dialog"
    >
      <div
        className={`relative w-[92vw] h-[88vh] max-w-6xl mx-auto transition-transform duration-300 ${
          show ? "scale-100 translate-y-0" : "scale-95 translate-y-1"
        }`}
      >
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={requestClose}
          className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center"
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/90 hover:bg-white flex items-center justify-center"
          aria-label="Previous"
          title="Previous"
        >
          ‹
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/90 hover:bg-white flex items-center justify-center"
          aria-label="Next"
          title="Next"
        >
          ›
        </button>

        <div className="w-full h-full flex items-center justify-center">
          {img?.publicUrl ? (
            <img
              src={img.publicUrl}
              alt={img.alt_text || ""}
              className="max-w-[92vw] max-h-[78vh] object-contain shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="w-full h-full bg-gray-200" />
          )}
        </div>

        {(img?.caption || img?.credit || img?.alt_text) && (
          <div className="absolute left-0 right-0 -bottom-0 translate-y-full mt-3 text-center text-sm text-white/95">
            <div className="inline-block bg-black/70 px-3 py-2 rounded-lg">
              {img?.caption || img?.alt_text}
              {img?.credit ? (
                <span className="ml-2 text-white/70">({img.credit})</span>
              ) : null}
              <span className="ml-3 text-white/60">
                {index + 1} / {images.length}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Small 6-dot handle used in Reorder mode */
function DotsHandle() {
  return (
    <div className="grid grid-cols-3 gap-[2px] p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-600/90" />
      ))}
    </div>
  );
}

/* Page */
export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState<string>("");
  const [coverCollectedId, setCoverCollectedId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modes
  const [selectCoverMode, setSelectCoverMode] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  // Track if order changed (so we only persist when needed)
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // DnD
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Lightbox
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

  // Grid ref for outside-click detection
  const gridRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: c } = await supabase
        .from("photo_collections")
        .select("name, cover_collected_id")
        .eq("id", id)
        .maybeSingle();
      setName(c?.name ?? "Collection");
      setCoverCollectedId(c?.cover_collected_id ?? null);
      setItems(await listCollectionItems(id));
      setOrderDirty(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function removeItem(itemId: string) {
    await supabase.from("photo_collection_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((x) => x.id !== itemId));
    setOrderDirty(true);
  }

  async function makeCover(collectedId: string) {
    await setCollectionCover(id, collectedId);
    setCoverCollectedId(collectedId);
  }

  const openLightbox = useCallback((idx: number) => {
    setLbIndex(idx);
    setLbOpen(true);
  }, []);
  const prev = useCallback(
    () => setLbIndex((i) => (i - 1 + items.length) % items.length),
    [items.length]
  );
  const next = useCallback(
    () => setLbIndex((i) => (i + 1) % items.length),
    [items.length]
  );

  // Helpers
  function arrayMove<T>(arr: T[], from: number, to: number) {
    const a = arr.slice();
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    return a;
  }

  const persistOrder = useCallback(
    async (current: any[]) => {
      setSavingOrder(true);
      try {
        const ids = current.map((it) => it.id);
        await reorderCollectionItems(id, ids);
        setOrderDirty(false);
      } finally {
        setSavingOrder(false);
      }
    },
    [id]
  );

  const saveOrderIfDirty = useCallback(async () => {
    if (!orderDirty) return;
    await persistOrder(items);
  }, [orderDirty, persistOrder, items]);

  // Close reorder when clicking anywhere that's not a photo tile
  useEffect(() => {
    if (!reorderMode) return;

    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // If click is on a tile (or inside one), don't exit
      const isTile = !!target.closest('[data-tile="1"]');
      if (isTile) return;

      // Clicked outside tiles (blank grid, header, buttons, etc.)
      // Save (if dirty) and exit reorder
      saveOrderIfDirty().finally(() => setReorderMode(false));
    }

    // Use capture so we run before component onClick handlers (Back, etc.)
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [reorderMode, saveOrderIfDirty]);

  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-40 bg-gray-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{name}</h1>
          <span className="text-sm text-gray-500">{items.length} items</span>
          {savingOrder && (
            <span className="ml-2 inline-flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
              Saving order…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Reorder toggle (still available, but not required for saving) */}
          <button
            onClick={async () => {
              if (reorderMode) {
                await saveOrderIfDirty();
                setReorderMode(false);
              } else {
                setSelectCoverMode(false);
                setReorderMode(true);
              }
            }}
            className={`px-3 py-2 rounded-lg border ${
              reorderMode
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white hover:bg-gray-50"
            }`}
            title="Drag images to reorder"
          >
            {reorderMode ? "Reorder: ON" : "Reorder"}
          </button>

          {/* Choose Cover toggle */}
          <button
            onClick={async () => {
              if (reorderMode) {
                await saveOrderIfDirty();
                setReorderMode(false);
              }
              setSelectCoverMode((v) => !v);
            }}
            className={`px-3 py-2 rounded-lg border ${
              selectCoverMode
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white hover:bg-gray-50"
            }`}
            title="Choose a photo to set as cover"
          >
            {selectCoverMode ? "Choose Cover: ON" : "Choose Cover"}
          </button>

          <button
            onClick={async () => {
              if (reorderMode) {
                await saveOrderIfDirty();
                setReorderMode(false);
              }
              router.back();
            }}
            className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
          >
            ← Back
          </button>
        </div>
      </div>

      {(reorderMode || selectCoverMode) && (
        <div
          className={`rounded-xl px-4 py-3 border ${
            reorderMode
              ? "bg-indigo-50 text-indigo-800 border-indigo-200"
              : "bg-blue-50 text-blue-800 border-blue-200"
          }`}
        >
          {reorderMode
            ? "Drag photos to reorder. Click anywhere outside the photos to save & exit."
            : "Click any photo below to set it as the collection cover."}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-6 text-gray-600">
          No photos in this collection yet.
        </div>
      ) : (
        <div
          ref={gridRef}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
        >
          <AnimatePresence initial={false}>
            {items.map((it, idx) => {
              const isCurrentCover = coverCollectedId === it.collected_id;

              return (
                <motion.div
                  key={it.id}
                  data-tile="1"
                  layout
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 35,
                    mass: 0.6,
                  }}
                  className={`relative group rounded-xl overflow-hidden bg-gray-100 ring-1 ring-black/5
                    ${
                      selectCoverMode
                        ? "cursor-pointer"
                        : reorderMode
                        ? "cursor-grab active:cursor-grabbing"
                        : "cursor-zoom-in"
                    }
                  `}
                  draggable={reorderMode}
                  onDragStart={(e) => {
                    if (!reorderMode) return;
                    setDragIndex(idx);
                    // hide ghost
                    const img = new Image();
                    img.src =
                      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
                    e.dataTransfer.setDragImage(img, 0, 0);
                  }}
                  onDragEnter={(e) => {
                    if (!reorderMode) return;
                    e.preventDefault();
                    // Live-reorder so the grid animates as we move
                    setItems((prev) => {
                      if (dragIndex === null || dragIndex === idx) return prev;
                      const moved = arrayMove(prev, dragIndex, idx);
                      setDragIndex(idx);
                      return moved;
                    });
                    setOrderDirty(true);
                  }}
                  onDragOver={(e) => {
                    if (reorderMode) e.preventDefault();
                  }}
                  onDrop={async (e) => {
                    if (!reorderMode) return;
                    e.preventDefault();
                    setDragIndex(null);
                    // Persist immediately (also covered by outside-click/back)
                    await persistOrder(items);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  onClick={async () => {
                    if (reorderMode) return; // clicks on tile do not exit
                    if (selectCoverMode) {
                      const ok = confirm("Set this as the collection cover?");
                      if (!ok) return;
                      await makeCover(it.collected_id);
                      setSelectCoverMode(false);
                    } else {
                      openLightbox(idx);
                    }
                  }}
                  title={
                    reorderMode
                      ? "Drag to reorder"
                      : selectCoverMode
                      ? "Set as cover"
                      : "Open"
                  }
                >
                  {/* Reorder dots handle (top-left), visible only in Reorder mode */}
                  {reorderMode && (
                    <div className="absolute left-2 top-2 z-10 rounded-md bg-white/90 text-gray-700 ring-1 ring-black/5 opacity-80 pointer-events-none">
                      <DotsHandle />
                    </div>
                  )}

                  {/* Transform inner wrapper (not the <img>) to avoid pixel jitter */}
                  <div
                    className={`transition-transform duration-200 transform-gpu will-change-transform
                      group-hover:scale-[1.01]
                      ${
                        selectCoverMode
                          ? "group-hover:ring-2 group-hover:ring-blue-500"
                          : ""
                      }
                    `}
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <img
                      src={it.publicUrl}
                      alt={it.alt_text || ""}
                      className="w-full h-40 object-cover select-none"
                      draggable={false}
                    />
                  </div>

                  {/* Remove item */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(it.id);
                    }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white text-gray-700 hover:bg-red-50 hover:text-red-600 shadow ring-1 ring-black/5 flex items-center justify-center"
                    title="Remove from collection"
                  >
                    <Icon name="times" />
                  </button>

                  {/* Cover badge */}
                  {isCurrentCover && (
                    <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md text-xs font-medium bg-black/70 text-white">
                      Cover
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {lbOpen && items.length > 0 && (
        <Lightbox
          images={items}
          index={lbIndex}
          onClose={() => setLbOpen(false)}
          onPrev={prev}
          onNext={next}
        />
      )}
    </div>
  );
}
