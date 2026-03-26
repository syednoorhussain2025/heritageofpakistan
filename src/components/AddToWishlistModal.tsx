// src/components/AddToWishlistModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import Icon from "@/components/Icon";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useBottomSheetParallax } from "@/hooks/useBottomSheetParallax";
import { useWishlists } from "@/components/WishlistProvider";
import {
  addItemToWishlist,
  createWishlist,
  removeItemFromWishlist,
  getListsContainingSite,
  deleteWishlist,
} from "@/lib/wishlists";

export type WishlistSitePreview = {
  name?: string | null;
  imageUrl?: string | null;
  location?: string | null;
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

function isNoSwipeTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest("[data-noswipe='true']")) return true;
  if (
    el.closest(
      "button, a, input, textarea, select, option, label, summary, details"
    )
  ) {
    return true;
  }
  if (el.closest("[contenteditable='true'], [role='button'], [role='link']")) {
    return true;
  }
  return false;
}

export default function AddToWishlistModal({
  siteId,
  onClose,
  site,
}: {
  siteId: string;
  onClose: () => void;
  site?: WishlistSitePreview;
}) {
  const { wishlists, refresh, loading } = useWishlists();
  useBodyScrollLock();

  const [isOpen, setIsOpen] = useState(false);
  useBottomSheetParallax(isOpen);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "public">("private");
  const [busyCreate, setBusyCreate] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<string | null>(null);
  const [sortSelected, setSortSelected] = useState<Set<string>>(new Set());

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateVisible, setIsCreateVisible] = useState(false);
  const [isCreateAnimatingOpen, setIsCreateAnimatingOpen] = useState(false);

  const [listToDelete, setListToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastCleanupRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const createCloseTimerRef = useRef<number | null>(null);
  const reorderTimerRef = useRef<number | null>(null);
  const followupToastTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const [previewLoaded, setPreviewLoaded] = useState(false);

  const swipeStartRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startedOnNoSwipe: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startedOnNoSwipe: false,
  });

  const previewUrl = site?.imageUrl?.trim() || null;
  const previewTitle = site?.name?.trim() || "";
  const previewLocation = site?.location?.trim() || "";
  const hasPreview = !!(previewUrl || previewTitle);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);
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
    void hapticLight();
    setIsOpen(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => onClose(), 250);
  }, [onClose]);

  const requestCreateClose = useCallback(() => {
    void hapticLight();
    setIsCreateAnimatingOpen(false);
    if (createCloseTimerRef.current)
      window.clearTimeout(createCloseTimerRef.current);
    createCloseTimerRef.current = window.setTimeout(() => {
      setIsCreateVisible(false);
      setIsCreateOpen(false);
    }, 500);
  }, []);

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
        if (listToDelete) setListToDelete(null);
        else requestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [listToDelete, isCreateOpen, requestClose, requestCreateClose]);

  function onOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) requestClose();
  }

  useEffect(() => {
    (async () => {
      try {
        const ids = await getListsContainingSite(siteId);
        setSelected(new Set(ids));
        setSortSelected(new Set(ids));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [siteId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let res = wishlists;
    if (q) {
      res = wishlists.filter((w) => w.name?.toLowerCase().includes(q));
    }
    return [...res].sort((a, b) => {
      const aSel = sortSelected.has(a.id);
      const bSel = sortSelected.has(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return 0;
    });
  }, [wishlists, search, sortSelected]);

  function showToast(message: string) {
    if (!mountedRef.current) return;
    setToastMsg(message);
    setToastOpen(false);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);
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
    void hapticMedium();
    setBusyCreate(true);
    try {
      const list = await createWishlist(name, privacy === "public");
      await addItemToWishlist(list.id, siteId);
      setSelected((prev) => {
        const next = new Set(prev);
        next.add(list.id);
        return next;
      });
      setSortSelected((prev) => {
        const next = new Set(prev);
        next.add(list.id);
        return next;
      });
      setNewName("");
      await refresh();
      requestCreateClose();
      showToast(`List "${name}" created`);
      if (followupToastTimerRef.current)
        window.clearTimeout(followupToastTimerRef.current);
      followupToastTimerRef.current = window.setTimeout(() => {
        showToast(`Site added to "${name}"`);
        followupToastTimerRef.current = null;
      }, 1150);
    } catch (e) {
      console.error(e);
      showToast(`Could not create list: ${errText(e)}`);
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

  async function toggleMembership(listId: string, listName: string) {
    if (toggling) return;
    void hapticMedium();
    const wasOn = selected.has(listId);
    setToggling(listId);
    const nextSelected = new Set(selected);
    if (wasOn) nextSelected.delete(listId);
    else nextSelected.add(listId);
    setSelected(nextSelected);
    showToast(
      wasOn
        ? `Removed from "${listName}"`
        : `Added to "${listName}"`
    );
    try {
      if (wasOn) {
        await removeItemFromWishlist(listId, siteId);
      } else {
        await addItemToWishlist(listId, siteId);
      }
      setToggling(null);
      if (reorderTimerRef.current) window.clearTimeout(reorderTimerRef.current);
      reorderTimerRef.current = window.setTimeout(() => {
        setSortSelected(new Set(nextSelected));
        reorderTimerRef.current = null;
      }, 180);
    } catch (e) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (wasOn) next.add(listId);
        else next.delete(listId);
        return next;
      });
      showToast(`Failed to update ${listName}`);
      setToggling(null);
    }
  }

  function requestDelete(id: string, name: string) {
    void hapticMedium();
    setListToDelete({ id, name });
  }

  async function confirmDelete() {
    if (!listToDelete) return;
    setIsDeleting(true);
    const { id, name } = listToDelete;
    try {
      await deleteWishlist(id);
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
      await refresh();
      showToast(`Deleted ${name}`);
      setListToDelete(null);
    } catch (e) {
      console.error(e);
      showToast(`Could not delete list: ${errText(e)}`);
    } finally {
      setIsDeleting(false);
    }
  }

  function onCardTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    swipeStartRef.current = {
      active: true,
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
      lastY: t.clientY,
      startedOnNoSwipe: isNoSwipeTarget(e.target),
    };
  }

  function onCardTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!swipeStartRef.current.active) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    swipeStartRef.current.lastX = t.clientX;
    swipeStartRef.current.lastY = t.clientY;
  }

  function onCardTouchEnd() {
    const s = swipeStartRef.current;
    swipeStartRef.current.active = false;
    if (s.startedOnNoSwipe) return;
    const dx = s.lastX - s.startX;
    const dy = s.startY - s.lastY;
    if (dy > 90 && Math.abs(dx) < 60) requestClose();
  }

  const anyToggleInFlight = Boolean(toggling);
  const itemCount = (w: { wishlist_items?: { count?: number }[] }) =>
    w.wishlist_items?.[0]?.count ?? 0;

  return (
    <>
      <div
        ref={overlayRef}
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
          onTouchStart={onCardTouchStart}
          onTouchMove={onCardTouchMove}
          onTouchEnd={onCardTouchEnd}
        >
          {/* Drag handle */}
          <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          {listToDelete && (
            <div className="absolute inset-0 z-[50] flex items-center justify-center bg-white/60 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
              <div className="bg-white border border-gray-100 shadow-2xl ring-1 ring-black/5 rounded-3xl p-6 w-full max-w-xs text-center transform scale-100 animate-in zoom-in-95 duration-200">
                <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 text-red-500">
                  <Icon name="trash" size={20} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Delete list?
                </h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-gray-800">
                    &quot;{listToDelete.name}&quot;
                  </span>
                  ?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setListToDelete(null)}
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
          <div className="px-4 pt-3 pb-3 border-b border-gray-200/60 shrink-0" data-noswipe="true">
            {/* Row 1: icon + title centered as a group */}
            <div className="flex items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                <Icon name="layout-list" size={16} className="text-[var(--brand-orange)]" />
              </div>
              <span className="text-[17px] font-bold text-gray-900 text-center">Save to List</span>
            </div>
            {/* Row 2: site thumbnail + name + location — matches action sheet header */}
            {hasPreview && (
              <div className="flex items-center gap-3 mt-3">
                {previewUrl && (
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                    {!previewLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                        <Spinner size={14} className="border-gray-300" />
                      </div>
                    )}
                    <NextImage
                      src={previewUrl}
                      alt={previewTitle || "Site preview"}
                      fill
                      unoptimized
                      className={`object-cover transition-opacity duration-300 ${previewLoaded ? "opacity-100" : "opacity-0"}`}
                      sizes="48px"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {previewTitle && (
                    <p className="text-[15px] font-semibold text-gray-900 leading-snug truncate">{previewTitle}</p>
                  )}
                  {previewLocation && (
                    <p className="text-[12px] text-gray-500 truncate mt-0.5">{previewLocation}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 bg-white overflow-hidden flex flex-col">
            <div className="flex-1 flex flex-col min-h-0 px-4 py-3 overflow-hidden">
              <div className="flex-1 flex flex-col min-h-0 space-y-2 overflow-hidden">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
                  Your Saved Lists
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
                        placeholder="Search your wishlists"
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
                        <Icon name="folder-open" size={32} className="mb-2 opacity-50" />
                        <span className="text-sm">No lists yet</span>
                        <span className="text-xs mt-0.5">Tap below to create one</span>
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {filtered.map((w) => {
                          const isOn = selected.has(w.id);
                          const isBusy = toggling === w.id;
                          return (
                            <li
                              key={w.id}
                              className={`group relative flex items-center gap-4 p-3 pr-12 rounded-2xl border transition-all cursor-pointer ${
                                isOn
                                  ? "bg-orange-50/50 border-orange-200"
                                  : "bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm"
                              }`}
                              onClick={() => {
                                if (!isBusy && !anyToggleInFlight) {
                                  toggleMembership(w.id, w.name);
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
                                {toggling === w.id ? (
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
                                  {w.name}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                  <span>
                                    {w.is_public ? "Public" : "Private"}
                                  </span>
                                  <span className="text-gray-300">•</span>
                                  <span>{itemCount(w)} items</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestDelete(w.id, w.name);
                                }}
                                disabled={isBusy || anyToggleInFlight}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                                title="Delete list"
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

          <div
            className="px-4 pt-3 pb-8 border-t border-gray-100 shrink-0 bg-white"
            data-noswipe="true"
          >
            <button
              onClick={() => { void hapticLight(); setIsCreateOpen(true); }}
              className="w-full py-3 rounded-full bg-[var(--brand-orange)] text-white font-semibold text-[14px] active:scale-95 transition-all shadow-sm"
            >
              + Create New List
            </button>
          </div>
        </div>
      </div>

      {isCreateVisible && (
        <div
          className={`fixed inset-0 z-[99999999999] transition-all duration-500 ease-in-out ${
            isCreateAnimatingOpen ? "opacity-100" : "opacity-0"
          }`}
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) requestCreateClose();
          }}
        >
          <div
            className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl h-[82vh] max-h-[82vh] flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isCreateAnimatingOpen
                ? "translate-y-0 opacity-100"
                : "translate-y-full opacity-0"
            }`}
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            onMouseDown={(e) => e.stopPropagation()}
            data-noswipe="true"
          >
            {/* Drag handle */}
            <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            {/* Header — centered title */}
            <div className="px-4 pt-3 pb-4 border-b border-gray-100 shrink-0 flex items-center justify-center">
              <h3 className="text-[17px] font-bold text-gray-900">New List</h3>
            </div>
            <div className="p-5 space-y-5 flex-1 overflow-y-auto">
              {/* Name input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
                  List Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Must see, Family trip…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={handleCreateKeyDown}
                  autoFocus
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-full px-5 py-3.5 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/20 focus:border-[var(--brand-orange)]/40 transition-all placeholder:text-gray-400 text-[15px]"
                />
              </div>
              {/* Privacy pill toggle */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
                  Privacy
                </label>
                <div className="flex bg-gray-100 rounded-full p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => { void hapticLight(); setPrivacy("private"); }}
                    className={`flex-1 py-2.5 rounded-full text-[14px] font-semibold transition-all ${
                      privacy === "private"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500"
                    }`}
                  >
                    Private
                  </button>
                  <button
                    type="button"
                    onClick={() => { void hapticLight(); setPrivacy("public"); }}
                    className={`flex-1 py-2.5 rounded-full text-[14px] font-semibold transition-all ${
                      privacy === "public"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500"
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
                {busyCreate && (
                  <Spinner size={16} className="border-white/80" />
                )}
                {busyCreate ? "Creating…" : "Create List"}
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
