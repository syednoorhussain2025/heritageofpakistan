// src/components/AddToCollectionModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import Icon from "@/components/Icon";
import {
  listPhotoCollections,
  getCollectionsMembership,
  toggleImageInCollection,
  createPhotoCollection,
  deletePhotoCollection,
} from "@/lib/photoCollections";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { useBottomSheetParallax } from "@/hooks/useBottomSheetParallax";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/* Match the shape we pass from the Lightbox */
type ImageIdentity = {
  siteImageId?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  siteId?: string | null;
  altText?: string | null;
  caption?: string | null;
  credit?: string | null;

  // Optional extra data for preview
  siteName?: string | null;
  locationText?: string | null;
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

/**
 * Best-effort extraction of a Supabase storagePath from a public URL.
 * Supports both:
 * - /storage/v1/object/public/<bucket>/<path>
 * - /storage/v1/object/sign/<bucket>/<path>
 */
function tryExtractStoragePathFromSupabaseUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname; // already excludes query string

    // public
    const pub = "/storage/v1/object/public/";
    const sign = "/storage/v1/object/sign/";

    const base = path.includes(pub) ? pub : path.includes(sign) ? sign : null;
    if (!base) return null;

    // after base: "<bucket>/<storagePath...>"
    const after = path.split(base)[1];
    if (!after) return null;

    const parts = after.split("/");
    if (parts.length < 2) return null;

    // bucket = parts[0], storagePath = rest
    const storagePath = parts.slice(1).join("/");
    return storagePath || null;
  } catch {
    return null;
  }
}

function normalizeIdentity(image: ImageIdentity): ImageIdentity {
  const rawUrl = image.imageUrl ?? null;
  const urlNoQuery = rawUrl ? rawUrl.split("?")[0] : null;

  // If storagePath missing but we have a supabase public/sign url, infer it
  const inferredStoragePath =
    !image.storagePath && urlNoQuery
      ? tryExtractStoragePathFromSupabaseUrl(urlNoQuery)
      : null;

  return {
    ...image,
    siteImageId: image.siteImageId ?? null,
    storagePath: (image.storagePath ?? inferredStoragePath) ?? null,
    imageUrl: urlNoQuery,
  };
}

function hasValidIdentity(image: ImageIdentity) {
  return !!(image.siteImageId || image.storagePath || image.imageUrl);
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

function isNoSwipeTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;

  // Anything inside these should not trigger swipe-to-close
  if (el.closest("[data-noswipe='true']")) return true;

  // Common interactive elements
  if (
    el.closest(
      "button, a, input, textarea, select, option, label, summary, details"
    )
  ) {
    return true;
  }

  // Contenteditable or role-based controls
  if (el.closest("[contenteditable='true'], [role='button'], [role='link']")) {
    return true;
  }

  return false;
}

export default function AddToCollectionModal({
  image,
  onClose,
}: {
  image: ImageIdentity;
  onClose: () => void;
}) {
  const stableImage = useMemo(() => normalizeIdentity(image), [image]);

  // Mount/slide animation (bottom sheet)
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  useBottomSheetParallax(isOpen);
  useBodyScrollLock(isOpen);

  // Data
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search/create
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "public">("private");
  const [busyCreate, setBusyCreate] = useState(false);

  // New Dialogue State
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Create modal fade animation (match main modal behavior)
  const [isCreateVisible, setIsCreateVisible] = useState(false);
  const [isCreateAnimatingOpen, setIsCreateAnimatingOpen] = useState(false);

  // Membership + item UI states
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<string | null>(null);

  // Smooth reorder: sort uses this set, not `selected` directly
  const [sortSelected, setSortSelected] = useState<Set<string>>(new Set());

  // FLIP animation state for list item movement
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [flipMap, setFlipMap] = useState<Record<string, number>>({});
  const [flipAnimating, setFlipAnimating] = useState(false);
  const flipTimerRef = useRef<number | null>(null);

  // Keep the "promoted" item above others during the move
  const [movingId, setMovingId] = useState<string | null>(null);

  // Delete Confirmation State
  const [collectionToDelete, setCollectionToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastCleanupRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const createCloseTimerRef = useRef<number | null>(null);
  const reorderTimerRef = useRef<number | null>(null);
  const followupToastTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Preview loading
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // Drag-to-close refs (main sheet)
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartX = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const dragStartTime = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const dragDirectionLocked = useRef<"vertical" | "horizontal" | null>(null);

  // Drag-to-close refs (create sheet)
  const createSheetRef = useRef<HTMLDivElement | null>(null);
  const createDragStartY = useRef<number | null>(null);
  const createDragStartX = useRef<number>(0);
  const createDragCurrentY = useRef<number>(0);
  const createDragStartTime = useRef<number>(0);
  const createIsDragging = useRef<boolean>(false);
  const createDragDirectionLocked = useRef<"vertical" | "horizontal" | null>(null);

  // CALCULATE PREVIEW URL (MD VARIANT) from stableImage.storagePath
  const previewUrl = useMemo(() => {
    if (stableImage.storagePath) {
      try {
        return getVariantPublicUrl(stableImage.storagePath, "md");
      } catch {
        return stableImage.imageUrl;
      }
    }
    return stableImage.imageUrl;
  }, [stableImage.storagePath, stableImage.imageUrl]);

  const previewTitle = stableImage.siteName?.trim() || "";
  const previewLocation = stableImage.locationText?.trim() || "";
  const previewCaption = stableImage.caption?.trim() || "";
  const previewAlt =
    stableImage.altText?.trim() || previewTitle || "Photo preview";

  const hasPreview = !!previewUrl;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);
      if (flipTimerRef.current) window.clearTimeout(flipTimerRef.current);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      if (createCloseTimerRef.current)
        window.clearTimeout(createCloseTimerRef.current);
      if (reorderTimerRef.current) window.clearTimeout(reorderTimerRef.current);
      if (followupToastTimerRef.current)
        window.clearTimeout(followupToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setIsOpen(true), 10);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setPreviewLoaded(false);
  }, [previewUrl]);

  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;

    const img = new window.Image();
    img.decoding = "async";
    (img as any).fetchPriority = "high";
    img.src = previewUrl;

    const done = () => {
      if (cancelled || !mountedRef.current) return;
      setPreviewLoaded(true);
    };
    img.onload = done;
    img.onerror = done;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [previewUrl]);

  const requestClose = useCallback(() => {
    setIsOpen(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => onClose(), 250);
  }, [onClose]);

  const requestCreateClose = useCallback(() => {
    setIsCreateAnimatingOpen(false);
    if (createCloseTimerRef.current)
      window.clearTimeout(createCloseTimerRef.current);
    createCloseTimerRef.current = window.setTimeout(() => {
      setIsCreateVisible(false);
      setIsCreateOpen(false);
    }, 500);
  }, []);

  // Sync create modal visibility + fade animation
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isCreateOpen) {
          requestCreateClose();
          return;
        }
        if (collectionToDelete) setCollectionToDelete(null);
        else requestClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [collectionToDelete, isCreateOpen, requestClose, requestCreateClose]);


  function runFlipReorder(updateSort: () => void) {
    if (flipTimerRef.current) {
      window.clearTimeout(flipTimerRef.current);
      flipTimerRef.current = null;
    }

    const first: Record<string, number> = {};
    Object.entries(itemRefs.current).forEach(([id, el]) => {
      if (!el) return;
      first[id] = el.getBoundingClientRect().top;
    });

    updateSort();

    window.requestAnimationFrame(() => {
      if (!mountedRef.current) return;

      const last: Record<string, number> = {};
      Object.entries(itemRefs.current).forEach(([id, el]) => {
        if (!el) return;
        last[id] = el.getBoundingClientRect().top;
      });

      const deltas: Record<string, number> = {};
      Object.keys(last).forEach((id) => {
        const a = first[id];
        const b = last[id];
        if (typeof a === "number" && typeof b === "number") {
          const d = a - b;
          if (Math.abs(d) > 0.5) deltas[id] = d;
        }
      });

      // Apply inverted transform with no transition
      setFlipAnimating(false);
      setFlipMap(deltas);

      // Next frame, animate back to 0
      window.requestAnimationFrame(() => {
        if (!mountedRef.current) return;

        setFlipAnimating(true);
        setFlipMap({});

        flipTimerRef.current = window.setTimeout(() => {
          setFlipAnimating(false);
          setMovingId(null);
          flipTimerRef.current = null;
        }, 1200);
      });
    });
  }

  // Load collections + membership for this photo (use stable identity)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [cols, mem] = await Promise.all([
          listPhotoCollections(),
          hasValidIdentity(stableImage)
            ? getCollectionsMembership(stableImage)
            : Promise.resolve(new Set<string>()),
        ]);
        if (cancelled || !mountedRef.current) return;
        setCollections(cols);
        setSelected(mem as any);

        // initial sort follows membership
        setSortSelected(new Set(mem as any));
      } catch (e) {
        if (cancelled || !mountedRef.current) return;
        console.error("[AddToCollectionModal] load failed", e, { stableImage });
        setCollections([]);
        setSelected(new Set());
        setSortSelected(new Set());
        showToast("Failed to load collections");
      } finally {
        if (cancelled || !mountedRef.current) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stableImage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let res = collections;
    if (q) {
      res = collections.filter((c) => c.name?.toLowerCase().includes(q));
    }

    // Use sortSelected so the list does not jump immediately on click
    return [...res].sort((a, b) => {
      const aSel = sortSelected.has(a.id);
      const bSel = sortSelected.has(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return 0;
    });
  }, [collections, search, sortSelected]);

  function showToast(message: string) {
    if (!mountedRef.current) return;

    setToastMsg(message);
    setToastOpen(false);

    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);

    // trigger slide-in after mount
    window.requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      setToastOpen(true);
    });

    toastTimerRef.current = window.setTimeout(() => {
      setToastOpen(false);
      toastCleanupRef.current = window.setTimeout(() => {
        setToastMsg(null);
        toastTimerRef.current = null;
        toastCleanupRef.current = null;
      }, 220);
    }, 1900);
  }

  async function handleCreate() {
    if (busyCreate) return;

    const name = newName.trim();
    if (!name) return;

    if (!hasValidIdentity(stableImage)) {
      showToast("Cannot add this photo (missing identity)");
      return;
    }

    setBusyCreate(true);
    try {
      const c = await createPhotoCollection(name, privacy === "public");

      // IMPORTANT: use stableImage, not raw image
      await toggleImageInCollection(c.id, stableImage, false);

      setCollections((prev) => [
        { ...c, itemCount: 1, coverUrl: null },
        ...prev,
      ]);
      setSelected((prev) => {
        const next = new Set(prev);
        next.add(c.id);
        return next;
      });

      // new collection should be treated as selected for sorting too
      setSortSelected((prev) => {
        const next = new Set(prev);
        next.add(c.id);
        return next;
      });

      setNewName("");
      requestCreateClose();

      // Toast sequencing:
      // 1) Collection created
      // 2) After a longer delay, photo added
      showToast(`Collection '${name}' Created`);
      if (followupToastTimerRef.current) {
        window.clearTimeout(followupToastTimerRef.current);
      }
      followupToastTimerRef.current = window.setTimeout(() => {
        showToast(`Photo added to Collection '${name}'`);
        followupToastTimerRef.current = null;
      }, 1150);
    } catch (e) {
      console.error("[AddToCollectionModal] create failed", e, {
        stableImage,
        name,
      });
      showToast(`Could not create collection: ${errText(e)}`);
    } finally {
      setBusyCreate(false);
    }
  }

  function handleCreateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  }

  async function toggleMembership(collectionId: string, collectionName: string) {
    if (!hasValidIdentity(stableImage)) {
      showToast("Cannot add this photo (missing identity)");
      return;
    }

    if (toggling) return;

    const wasOn = selected.has(collectionId);
    setToggling(collectionId);

    // optimistic selection (UI tick state) but DO NOT change sort yet
    const nextSelected = new Set(selected);
    if (wasOn) nextSelected.delete(collectionId);
    else nextSelected.add(collectionId);
    setSelected(nextSelected);

    setCollections((prev) =>
      prev.map((c) => {
        if (c.id === collectionId) {
          const currentCount = c.itemCount || 0;
          return {
            ...c,
            itemCount: wasOn ? Math.max(0, currentCount - 1) : currentCount + 1,
          };
        }
        return c;
      })
    );

    showToast(
      wasOn
        ? `Photo removed from Collection '${collectionName}'`
        : `Photo added to Collection '${collectionName}'`
    );

    try {
      // IMPORTANT: use stableImage, not raw image
      await toggleImageInCollection(collectionId, stableImage, wasOn);

      // spinner stops, tick is visible now
      setToggling(null);

      // after a short beat, reorder with a smooth move animation
      if (reorderTimerRef.current) window.clearTimeout(reorderTimerRef.current);
      reorderTimerRef.current = window.setTimeout(() => {
        setMovingId(collectionId);
        runFlipReorder(() => {
          setSortSelected(new Set(nextSelected));
        });
        reorderTimerRef.current = null;
      }, 180);
    } catch (e) {
      console.error("[AddToCollectionModal] toggle failed", e, {
        collectionId,
        collectionName,
        wasOn,
        stableImage,
      });

      // revert selection
      setSelected((prev) => {
        const next = new Set(prev);
        if (wasOn) next.add(collectionId);
        else next.delete(collectionId);
        return next;
      });

      // revert count
      setCollections((prev) =>
        prev.map((c) => {
          if (c.id === collectionId) {
            const currentCount = c.itemCount || 0;
            return {
              ...c,
              itemCount: wasOn
                ? currentCount + 1
                : Math.max(0, currentCount - 1),
            };
          }
          return c;
        })
      );

      showToast(`Failed to update ${collectionName}`);
      setToggling(null);

      setMovingId(null);
    }
  }

  function requestDelete(collectionId: string, name: string) {
    setCollectionToDelete({ id: collectionId, name });
  }

  async function confirmDelete() {
    if (!collectionToDelete) return;

    setIsDeleting(true);
    const { id, name } = collectionToDelete;

    try {
      await deletePhotoCollection(id);
      setCollections((prev) => prev.filter((c) => c.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSortSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast(`Deleted ${name}`);
      setCollectionToDelete(null);
    } catch (e) {
      console.error(e);
      showToast(`Could not delete collection: ${errText(e)}`);
    } finally {
      setIsDeleting(false);
    }
  }

  const onCardTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isNoSwipeTarget(e.target)) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartX.current = e.touches[0].clientX;
    dragStartTime.current = Date.now();
    dragCurrentY.current = 0;
    isDragging.current = true;
    dragDirectionLocked.current = null;
    const el = sheetRef.current;
    if (el) el.style.transition = "none";
  }, []);

  const onCardTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    const dx = e.touches[0].clientX - dragStartX.current;

    if (!dragDirectionLocked.current) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 4) {
        dragDirectionLocked.current = "horizontal";
      } else if (Math.abs(dy) > 4) {
        dragDirectionLocked.current = "vertical";
      }
    }

    if (dragDirectionLocked.current === "horizontal") {
      isDragging.current = false;
      const el = sheetRef.current;
      if (el) { el.style.transition = ""; el.style.transform = ""; }
      return;
    }

    if (dragDirectionLocked.current !== "vertical") return;

    if (dy < 0) {
      dragCurrentY.current = 0;
      const el = sheetRef.current;
      if (el) el.style.transform = "translateY(0)";
      return;
    }
    dragCurrentY.current = dy;
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${dy}px)`;
  }, []);

  const onCardTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const dy = dragCurrentY.current;
    const elapsed = Date.now() - dragStartTime.current;
    const velocity = dy / elapsed;

    const el = sheetRef.current;
    if (el) el.style.transition = "";

    if (dy >= 80 || velocity >= 0.4) {
      // Animate sheet off-screen directly without touching React state
      if (el) {
        el.style.transition = "transform 300ms cubic-bezier(0.32,0.72,0,1)";
        el.style.transform = "translateY(110%)";
      }
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => onClose(), 300);
    } else {
      if (el) el.style.transform = "translateY(0)";
    }

    dragStartY.current = null;
    dragCurrentY.current = 0;
  }, [requestClose]);

  const onCreateTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isNoSwipeTarget(e.target)) return;
    createDragStartY.current = e.touches[0].clientY;
    createDragStartX.current = e.touches[0].clientX;
    createDragStartTime.current = Date.now();
    createDragCurrentY.current = 0;
    createIsDragging.current = true;
    createDragDirectionLocked.current = null;
    const el = createSheetRef.current;
    if (el) el.style.transition = "none";
  }, []);

  const onCreateTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!createIsDragging.current || createDragStartY.current === null) return;
    const dy = e.touches[0].clientY - createDragStartY.current;
    const dx = e.touches[0].clientX - createDragStartX.current;

    if (!createDragDirectionLocked.current) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 4) {
        createDragDirectionLocked.current = "horizontal";
      } else if (Math.abs(dy) > 4) {
        createDragDirectionLocked.current = "vertical";
      }
    }

    if (createDragDirectionLocked.current === "horizontal") {
      createIsDragging.current = false;
      const el = createSheetRef.current;
      if (el) { el.style.transition = ""; el.style.transform = ""; }
      return;
    }

    if (createDragDirectionLocked.current !== "vertical") return;

    if (dy < 0) {
      createDragCurrentY.current = 0;
      const el = createSheetRef.current;
      if (el) el.style.transform = "translateY(0)";
      return;
    }
    createDragCurrentY.current = dy;
    const el = createSheetRef.current;
    if (el) el.style.transform = `translateY(${dy}px)`;
  }, []);

  const onCreateTouchEnd = useCallback(() => {
    if (!createIsDragging.current) return;
    createIsDragging.current = false;

    const dy = createDragCurrentY.current;
    const elapsed = Date.now() - createDragStartTime.current;
    const velocity = dy / elapsed;

    const el = createSheetRef.current;
    if (el) el.style.transition = "";

    if (dy >= 80 || velocity >= 0.4) {
      if (el) {
        el.style.transition = "transform 300ms cubic-bezier(0.32,0.72,0,1)";
        el.style.transform = "translateY(110%)";
      }
      if (createCloseTimerRef.current) window.clearTimeout(createCloseTimerRef.current);
      createCloseTimerRef.current = window.setTimeout(() => {
        setIsCreateVisible(false);
        setIsCreateOpen(false);
      }, 300);
    } else {
      if (el) el.style.transform = "translateY(0)";
    }

    createDragStartY.current = null;
    createDragCurrentY.current = 0;
  }, []);

  const identityOk = hasValidIdentity(stableImage);
  const anyToggleInFlight = Boolean(toggling);

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className={`fixed inset-0 z-[9999999999] transition-all duration-500 ease-in-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-modal="true"
        role="dialog"
        onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      >
        {/* Bottom sheet */}
        <div
          ref={sheetRef}
          className={`absolute bottom-0 left-0 right-0 bg-white shadow-2xl rounded-t-3xl h-[82dvh] flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
          }`}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={onCardTouchStart}
          onTouchMove={onCardTouchMove}
          onTouchEnd={onCardTouchEnd}
        >
          {/* Drag handle */}
          <div className="shrink-0 flex justify-center items-center h-10 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </div>
          {/* --- Delete Confirmation Overlay (Internal) --- */}
          {collectionToDelete && (
            <div className="absolute inset-0 z-[50] flex items-center justify-center bg-white/60 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
              <div className="bg-white border border-gray-100 shadow-2xl ring-1 ring-black/5 rounded-3xl p-6 w-full max-w-xs text-center transform scale-100 animate-in zoom-in-95 duration-200">
                <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 text-red-500">
                  <Icon name="trash" size={20} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Delete Collection?
                </h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  Are you sure you want to delete <br />
                  <span className="font-semibold text-gray-800">
                    “{collectionToDelete.name}”
                  </span>
                  ?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setCollectionToDelete(null)}
                    disabled={isDeleting}
                    className="px-4 py-3 rounded-2xl bg-gray-50 text-gray-700 font-semibold text-sm hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={isDeleting}
                    className="px-4 py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <Spinner size={14} className="border-white/80" />
                    ) : (
                      "Delete"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
            data-noswipe="true"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center">
                <Icon name="cards" className="text-[var(--brand-orange)]" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-gray-900">
                  Add Photo to Collection
                </h2>
                {!identityOk && (
                  <span className="text-xs text-red-500">
                    Photo identity missing (cannot add)
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={requestClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close modal"
            >
              <Icon name="times" size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 bg-white overflow-hidden flex flex-col sm:flex-row sm:gap-3">
            {/* Preview panel (desktop left) */}
            {hasPreview && (
              <div className="hidden sm:flex sm:flex-col sm:w-[300px] sm:border-r sm:border-gray-100 sm:bg-gray-50/30 sm:px-5 sm:py-5 sm:min-h-0">
                <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">
                  <div className="relative w-full aspect-square">
                    {!previewLoaded && (
                      <div className="absolute inset-0 z-[1] flex items-center justify-center bg-white/80">
                        <Spinner size={18} className="border-gray-300" />
                      </div>
                    )}
                    <NextImage
                      src={previewUrl as string}
                      alt={previewAlt}
                      fill
                      unoptimized
                      className={`object-cover transition-opacity duration-300 ${
                        previewLoaded ? "opacity-100" : "opacity-0"
                      }`}
                      sizes="300px"
                      priority
                    />
                  </div>
                </div>

                {(previewTitle || previewLocation) && (
                  <div className="mt-3 space-y-1">
                    {previewTitle && (
                      <div className="font-semibold text-sm text-gray-900 line-clamp-2">
                        {previewTitle}
                      </div>
                    )}
                    {previewLocation && (
                      <div className="text-xs text-gray-500 line-clamp-2">
                        {previewLocation}
                      </div>
                    )}
                  </div>
                )}

                {previewCaption && (
                  <div className="mt-2 text-xs text-gray-600 leading-relaxed line-clamp-3">
                    {previewCaption}
                  </div>
                )}
              </div>
            )}

            {/* Main content */}
            <div className="flex-1 flex flex-col min-h-0 px-6 py-5 overflow-hidden">
              {/* Preview row (mobile top) */}
              {hasPreview && (
                <div className="sm:hidden shrink-0 mb-4" data-noswipe="true">
                  <div className="flex items-start gap-4">
                    <div className="relative w-28 h-28 rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm flex-shrink-0">
                      {!previewLoaded && (
                        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-white/80">
                          <Spinner size={18} className="border-gray-300" />
                        </div>
                      )}
                      <NextImage
                        src={previewUrl as string}
                        alt={previewAlt}
                        fill
                        unoptimized
                        className={`object-cover transition-opacity duration-300 ${
                          previewLoaded ? "opacity-100" : "opacity-0"
                        }`}
                        sizes="112px"
                        priority
                      />
                    </div>

                    <div className="min-w-0 flex-1 pt-1">
                      {(previewTitle || previewLocation) && (
                        <div className="space-y-1">
                          {previewTitle && (
                            <div className="font-semibold text-sm text-gray-900 line-clamp-2">
                              {previewTitle}
                            </div>
                          )}
                          {previewLocation && (
                            <div className="text-xs text-gray-500 line-clamp-2">
                              {previewLocation}
                            </div>
                          )}
                        </div>
                      )}

                      {previewCaption && (
                        <div className="mt-2 text-xs text-gray-600 leading-relaxed line-clamp-3">
                          {previewCaption}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Search & List */}
              <div className="flex-1 flex flex-col min-h-0 space-y-2 overflow-hidden">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
                  Your Collections
                </label>

                <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-2xl bg-gray-100 overflow-hidden">
                  <div className="shrink-0 p-3 pb-0" data-noswipe="true">
                    <div className="relative group">
                      <Icon
                        name="search"
                        size={16}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[var(--brand-orange)] transition-colors pointer-events-none"
                      />
                      <input
                        type="text"
                        placeholder="Search your collections"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white border border-gray-300 text-gray-900 rounded-full pl-11 pr-5 py-3 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/20 focus:border-[var(--brand-orange)]/30 transition-all placeholder:text-gray-500"
                      />
                    </div>
                  </div>

                  <div
                    className="flex-1 overflow-y-scroll sm:overflow-y-auto custom-scrollbar p-3 pt-3 overscroll-contain touch-pan-y"
                    data-noswipe="true"
                  >
                    {loading ? (
                      <div className="relative">
                        <ul className="space-y-3">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <li
                              key={i}
                              className="flex items-center gap-4 p-3 border border-gray-100 rounded-2xl bg-white"
                            >
                              <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
                              <div className="flex-1 space-y-2">
                                <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
                                <div className="h-2 bg-gray-100 rounded w-1/4 animate-pulse" />
                              </div>
                            </li>
                          ))}
                        </ul>

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <Spinner size={18} className="border-gray-300" />
                        </div>
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                        <Icon
                          name="folder-open"
                          size={32}
                          className="mb-2 opacity-50"
                        />
                        <span className="text-sm">No collections found.</span>
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {filtered.map((c) => {
                          const isOn = selected.has(c.id);
                          const isBusy = toggling === c.id;

                          const dy = flipMap[c.id] ?? 0;

                          return (
                            <li
                              key={c.id}
                              ref={(el) => {
                                itemRefs.current[c.id] = el;
                              }}
                              className={`group relative flex items-center gap-4 p-3 pr-12 rounded-2xl border transition-all cursor-pointer ${
                                isOn
                                  ? "bg-orange-50/50 border-orange-200"
                                  : "bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm"
                              }`}
                              style={{
                                transform: dy
                                  ? `translateY(${dy}px)`
                                  : undefined,
                                transition: flipAnimating
                                  ? "transform 1000ms cubic-bezier(0.22, 1, 0.36, 1)"
                                  : "none",
                                zIndex:
                                  flipAnimating && movingId === c.id ? 20 : 0,
                              }}
                              onClick={() => {
                                if (!identityOk) {
                                  showToast(
                                    "Cannot add this photo (missing identity)"
                                  );
                                  return;
                                }
                                if (!isBusy && !anyToggleInFlight) {
                                  toggleMembership(c.id, c.name);
                                }
                              }}
                            >
                              <div
                                className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-all ${
                                  isOn
                                    ? "bg-[var(--brand-orange)] text-white shadow-md scale-100"
                                    : "bg-gray-100 text-gray-400 group-hover:bg-gray-200 scale-95 group-hover:scale-100"
                                }`}
                              >
                                {toggling === c.id ? (
                                  <Spinner
                                    size={16}
                                    className={
                                      isOn
                                        ? "border-white/70"
                                        : "border-gray-400"
                                    }
                                  />
                                ) : isOn ? (
                                  <Icon name="check" size={16} />
                                ) : (
                                  <Icon name="plus" size={16} />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div
                                  className={`font-semibold text-sm truncate ${
                                    isOn
                                      ? "text-[var(--brand-orange)]"
                                      : "text-gray-900"
                                  }`}
                                >
                                  {c.name}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                  <span>
                                    {c.is_public ? "Public" : "Private"}
                                  </span>
                                  <span className="text-gray-300">•</span>
                                  <span>{c.itemCount ?? 0} items</span>
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestDelete(c.id, c.name);
                                }}
                                disabled={isBusy || anyToggleInFlight}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                                title="Delete collection"
                              >
                                <Icon name="trash" size={14} />
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
          </div>

          {/* Footer */}
          <div
            className="px-4 pt-3 pb-8 border-t border-gray-100 shrink-0 bg-white"
            data-noswipe="true"
          >
            <button
              onClick={() => setIsCreateOpen(true)}
              className="w-full py-3 rounded-full bg-[var(--brand-orange)] text-white font-semibold text-[14px] active:scale-95 transition-all shadow-sm"
            >
              + Create New Collection
            </button>
          </div>
        </div>
      </div>

      {/* --- Create New Collection Modal --- */}
      {isCreateVisible && (
        <div
          className={`fixed inset-0 z-[99999999999] flex flex-col justify-end bg-black/40 transition-opacity duration-500 ${
            isCreateAnimatingOpen ? "opacity-100" : "opacity-0"
          }`}
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) requestCreateClose();
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) requestCreateClose();
          }}
        >
          <div
            ref={createSheetRef}
            className={`w-full h-[52dvh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-500 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${
              isCreateAnimatingOpen ? "translate-y-0" : "translate-y-full"
            }`}
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={onCreateTouchStart}
            onTouchMove={onCreateTouchMove}
            onTouchEnd={onCreateTouchEnd}
          >
            <div className="shrink-0 flex justify-center items-center h-10 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
            </div>
            <div className="px-4 py-3 shrink-0 text-center">
              <h3 className="text-base font-semibold text-gray-900">New Collection</h3>
            </div>

            <div className="px-4 pb-4 space-y-5 flex-1 overflow-y-auto pt-2">
              {!identityOk && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Cannot add this photo because identity is missing
                </div>
              )}

              <input
                type="text"
                placeholder="Collection name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleCreateKeyDown}
                autoFocus
                className="w-full bg-gray-100 text-gray-900 rounded-full px-5 py-3.5 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 transition-all placeholder:text-gray-400 text-[15px]"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setPrivacy("private")}
                  className={`flex-1 py-3 rounded-full text-sm font-medium transition-all ${privacy === "private" ? "bg-gray-200 text-gray-800" : "bg-gray-100 text-gray-400"}`}
                >
                  Private
                </button>
                <button
                  onClick={() => setPrivacy("public")}
                  className={`flex-1 py-3 rounded-full text-sm font-medium transition-all ${privacy === "public" ? "bg-gray-200 text-gray-800" : "bg-gray-100 text-gray-400"}`}
                >
                  Public
                </button>
              </div>
            </div>

            <div className="px-4 pt-3 pb-8 border-t border-gray-100 shrink-0 bg-white">
              <button
                onClick={handleCreate}
                disabled={busyCreate || !newName.trim() || !identityOk}
                className="w-full py-3 rounded-full bg-[var(--brand-orange)] text-white font-semibold text-[14px] disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
              >
                {busyCreate && <Spinner size={16} className="border-white/80" />}
                {busyCreate ? "Creating..." : "Create Collection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed inset-0 z-[9999999999] pointer-events-none flex items-end justify-center pb-14 sm:pb-12">
          <div
            className="px-6 py-3.5 rounded-2xl bg-gray-900 text-white shadow-2xl flex items-center gap-3 max-w-[90vw] sm:max-w-lg w-max"
            style={{
              transform: toastOpen ? "translateY(0)" : "translateY(16px)",
              opacity: toastOpen ? 1 : 0,
              transition: "transform 220ms ease, opacity 220ms ease",
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--brand-orange)] shrink-0" />
            <span className="font-medium text-[15px] leading-tight truncate">
              {toastMsg}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
