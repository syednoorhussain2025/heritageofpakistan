// src/components/AddToWishlistModal.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useWishlists } from "@/components/WishlistProvider";
import {
  addItemToWishlist,
  createWishlist,
  removeItemFromWishlist,
  getListsContainingSite,
  deleteWishlist,
} from "@/lib/wishlists";

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

export default function AddToWishlistModal({
  siteId,
  onClose,
}: {
  siteId: string;
  onClose: () => void;
}) {
  const { wishlists, refresh, loading } = useWishlists();

  // UI state
  const [isOpen, setIsOpen] = useState(false); // for fade-in/out
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // search / create
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "public">("private");
  const [busyCreate, setBusyCreate] = useState(false);

  // membership toggle per list
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Mount animation
  useEffect(() => {
    const t = setTimeout(() => setIsOpen(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Close with fade-out
  function requestClose() {
    setIsOpen(false);
    setTimeout(() => onClose(), 250); // match transition duration
  }

  // Close on outside click
  function onOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) {
      requestClose();
    }
  }

  // Preload lists that already contain this site
  useEffect(() => {
    (async () => {
      try {
        const ids = await getListsContainingSite(siteId);
        setSelected(new Set(ids));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [siteId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wishlists;
    return wishlists.filter((w) => w.name?.toLowerCase().includes(q));
  }, [wishlists, search]);

  function showToast(message: string) {
    setToastMsg(message);
    // ⬆️ increased retention time
    setTimeout(() => setToastMsg(null), 3500);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusyCreate(true);
    const name = newName.trim();
    try {
      await createWishlist(name, privacy === "public");
      setNewName("");
      await refresh();
      // ✅ toast on create
      showToast(`Created “${name}”`);
    } catch (e) {
      console.error(e);
      alert(`Could not create list: ${errText(e)}`);
    } finally {
      setBusyCreate(false);
    }
  }

  async function toggleMembership(listId: string, listName: string) {
    const isOn = selected.has(listId);
    setToggling(listId);

    // optimistic UI
    setSelected((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(listId);
      else next.add(listId);
      return next;
    });
    showToast(`${isOn ? "Removed from" : "Added to"} ${listName}`);

    try {
      if (isOn) {
        await removeItemFromWishlist(listId, siteId);
      } else {
        await addItemToWishlist(listId, siteId);
      }
    } catch (e) {
      // revert on error
      setSelected((prev) => {
        const next = new Set(prev);
        if (isOn) next.add(listId);
        else next.delete(listId);
        return next;
      });
      showToast(`Failed to update ${listName}`);
      console.error(e);
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(listId: string, listName: string) {
    if (
      !confirm(
        `Delete list “${listName}”? This will remove it from your wishlists.`
      )
    ) {
      return;
    }
    setDeletingId(listId);
    try {
      await deleteWishlist(listId);
      // remove locally and refresh
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(listId);
        return next;
      });
      await refresh();
      showToast(`Deleted ${listName}`);
    } catch (e) {
      console.error(e);
      alert(`Could not delete list: ${errText(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Overlay (reduced blur & lighter) */}
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
          {/* Header (removed top 'My Wishlists' button as requested) */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)]/10 flex items-center justify-center">
                <Icon name="list-ul" className="text-[var(--brand-orange)]" />
              </div>
              <h2 className="text-lg font-semibold">Add to Wishlist</h2>
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
                placeholder="Search your lists"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40"
              />
            </div>

            {/* Create new list */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <input
                type="text"
                placeholder="New list name"
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
                Create new list
              </button>
            </div>

            {/* Lists */}
            <div className="max-h-80 overflow-y-auto pr-1">
              {loading ? (
                // Skeleton loaders
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
                      <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
                    </li>
                  ))}
                </ul>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-gray-500 px-1 py-2">
                  No lists found.
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((w) => {
                    const isOn = selected.has(w.id);
                    const isBusy = toggling === w.id || deletingId === w.id;
                    return (
                      <li
                        key={w.id}
                        className={`group flex items-center gap-3 p-3 border rounded-xl bg-white transition-colors hover:bg-gray-50 hover:shadow-sm cursor-pointer ${
                          isOn ? "border-[var(--brand-orange)]/40" : ""
                        }`}
                        onClick={() => toggleMembership(w.id, w.name)}
                        title={isOn ? "Remove from list" : "Add to list"}
                      >
                        {/* Toggle button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMembership(w.id, w.name);
                          }}
                          disabled={isBusy}
                          className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all ${
                            isOn
                              ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                              : "bg-white group-hover:bg-gray-100 text-gray-600"
                          }`}
                          aria-label={isOn ? "Remove from list" : "Add to list"}
                          title={isOn ? "Remove from list" : "Add to list"}
                        >
                          {toggling === w.id ? (
                            <Spinner size={14} className="border-white/70" />
                          ) : (
                            <Icon name="list-ul" size={16} />
                          )}
                        </button>

                        {/* Name + meta */}
                        <div className="flex-1 select-none">
                          <div className="font-medium leading-5">{w.name}</div>
                          <div className="text-xs text-gray-500">
                            {(w.is_public ? "public" : "private") +
                              " • " +
                              (w.wishlist_items?.[0]?.count ?? 0) +
                              " items"}
                          </div>
                        </div>

                        {/* Delete list (X) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(w.id, w.name);
                          }}
                          disabled={isBusy}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Delete list"
                          title="Delete list"
                        >
                          {deletingId === w.id ? (
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
            <Link
              href="/dashboard/mywishlists"
              onClick={requestClose}
              className="px-4 py-2 rounded-lg bg-black text-white hover:brightness-95"
            >
              My Wishlists
            </Link>
          </div>
        </div>
      </div>

      {/* Black toast (retention increased) */}
      {toastMsg && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 rounded-lg bg-black text-white shadow-lg transition-opacity duration-200">
          {toastMsg}
        </div>
      )}
    </>
  );
}
