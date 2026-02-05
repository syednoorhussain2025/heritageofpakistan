// src/components/AddToCollectionModal.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import {
  listPhotoCollections,
  getCollectionsMembership,
  toggleImageInCollection,
  createPhotoCollection,
  deletePhotoCollection,
} from "@/lib/photoCollections";

/* Match the shape we pass from the Lightbox */
type ImageIdentity = {
  siteImageId?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  siteId?: string | null;
  altText?: string | null;
  caption?: string | null;
  credit?: string | null;
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

export default function AddToCollectionModal({
  image,
  onClose,
}: {
  image: ImageIdentity;
  onClose: () => void;
}) {
  // Mount/fade animation
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Data
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search/create
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "public">("private");
  const [busyCreate, setBusyCreate] = useState(false);

  // Membership + item UI states
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Fade in when mounted
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

  // Load collections + membership for this photo
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cols, mem] = await Promise.all([
          listPhotoCollections(),
          getCollectionsMembership(image),
        ]);
        setCollections(cols);
        setSelected(mem);
      } finally {
        setLoading(false);
      }
    })();
  }, [image]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.name?.toLowerCase().includes(q));
  }, [collections, search]);

  function showToast(message: string) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(null), 3500); // slightly longer retention
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusyCreate(true);
    try {
      const c = await createPhotoCollection(name, privacy === "public");
      setCollections((prev) => [
        ...prev,
        { ...c, itemCount: 0, coverUrl: null },
      ]);
      setNewName("");
      showToast(`Created “${name}”`);
    } catch (e) {
      console.error(e);
      alert(`Could not create collection: ${errText(e)}`);
    } finally {
      setBusyCreate(false);
    }
  }

  async function toggleMembership(
    collectionId: string,
    collectionName: string
  ) {
    const isOn = selected.has(collectionId);
    setToggling(collectionId);

    // optimistic UI
    setSelected((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
    showToast(`${isOn ? "Removed from" : "Added to"} ${collectionName}`);

    try {
      await toggleImageInCollection(collectionId, image, isOn);
    } catch (e) {
      // revert on error
      setSelected((prev) => {
        const next = new Set(prev);
        if (isOn) next.add(collectionId);
        else next.delete(collectionId);
        return next;
      });
      console.error(e);
      showToast(`Failed to update ${collectionName}`);
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(collectionId: string, name: string) {
    if (
      !confirm(`Delete collection “${name}”? This won’t affect your library.`)
    )
      return;
    setDeletingId(collectionId);
    try {
      await deletePhotoCollection(collectionId);
      setCollections((prev) => prev.filter((c) => c.id !== collectionId));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(collectionId);
        return next;
      });
      showToast(`Deleted ${name}`);
    } catch (e) {
      console.error(e);
      alert(`Could not delete collection: ${errText(e)}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Overlay (same tone/blur as wishlist modal) */}
      <div
        ref={overlayRef}
        onMouseDown={onOverlayMouseDown}
        className={`fixed inset-0 z-[9999999999] flex items-center justify-center bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 ${
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
                <Icon name="images" className="text-[var(--brand-orange)]" />
              </div>
              <h2 className="text-lg font-semibold">Add to Collection</h2>
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
                placeholder="Search your collections"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40"
              />
            </div>

            {/* Create new collection */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <input
                type="text"
                placeholder="New collection name"
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
                Create collection
              </button>
            </div>

            {/* Collections list */}
            <div className="max-h-80 overflow-y-auto pr-1">
              {loading ? (
                // Skeletons
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
                  No collections found.
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((c) => {
                    const isOn = selected.has(c.id);
                    const isBusy = toggling === c.id || deletingId === c.id;
                    return (
                      <li
                        key={c.id}
                        className={`group flex items-center gap-3 p-3 border rounded-xl bg-white transition-colors hover:bg-gray-50 hover:shadow-sm cursor-pointer ${
                          isOn ? "border-[var(--brand-orange)]/40" : ""
                        }`}
                        onClick={() => toggleMembership(c.id, c.name)}
                        title={
                          isOn ? "Remove from collection" : "Add to collection"
                        }
                      >
                        {/* Toggle icon button (list-style, like wishlist) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMembership(c.id, c.name);
                          }}
                          disabled={isBusy}
                          className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all ${
                            isOn
                              ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                              : "bg-white group-hover:bg-gray-100 text-gray-600"
                          }`}
                          aria-label={
                            isOn
                              ? "Remove from collection"
                              : "Add to collection"
                          }
                          title={
                            isOn
                              ? "Remove from collection"
                              : "Add to collection"
                          }
                        >
                          {toggling === c.id ? (
                            <Spinner size={14} className="border-white/70" />
                          ) : (
                            <Icon name="list-ul" size={16} />
                          )}
                        </button>

                        {/* Name + meta */}
                        <div className="flex-1 select-none">
                          <div className="font-medium leading-5">{c.name}</div>
                          <div className="text-xs text-gray-500">
                            {(c.is_public ? "public" : "private") +
                              " • " +
                              (c.itemCount ?? 0) +
                              " items"}
                          </div>
                        </div>

                        {/* Delete collection (X) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c.id, c.name);
                          }}
                          disabled={isBusy}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Delete collection"
                          title="Delete collection"
                        >
                          {deletingId === c.id ? (
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
              href="/dashboard/mycollections"
              onClick={requestClose}
              className="px-4 py-2 rounded-lg bg-black text-white hover:brightness-95"
            >
              My Collections
            </Link>
          </div>
        </div>
      </div>

      {/* Black toast (same style + retention as wishlist) */}
      {toastMsg && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1300] px-4 py-2 rounded-lg bg-black text-white shadow-lg transition-opacity duration-200">
          {toastMsg}
        </div>
      )}
    </>
  );
}
