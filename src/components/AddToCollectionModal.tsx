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
  
  // Delete Confirmation State
  const [collectionToDelete, setCollectionToDelete] = useState<{id: string, name: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    
    // 1. Filter
    let res = collections;
    if (q) {
      res = collections.filter((c) => c.name?.toLowerCase().includes(q));
    }

    // 2. Sort: Selected items first
    return [...res].sort((a, b) => {
      const aSel = selected.has(a.id);
      const bSel = selected.has(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return 0; 
    });
  }, [collections, search, selected]);

  function showToast(message: string) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(null), 3500);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusyCreate(true);
    try {
      // 1. Create the collection
      const c = await createPhotoCollection(name, privacy === "public");
      
      // 2. Automatically add the current photo
      await toggleImageInCollection(c.id, image, false);

      // 3. Update state
      setCollections((prev) => [
        { ...c, itemCount: 1, coverUrl: null },
        ...prev,
      ]);
      setSelected((prev) => {
        const next = new Set(prev);
        next.add(c.id);
        return next;
      });

      setNewName("");
      showToast(`Photo added to Collection '${name}'`);
    } catch (e) {
      console.error(e);
      alert(`Could not create collection: ${errText(e)}`);
    } finally {
      setBusyCreate(false);
    }
  }

  // Handle Enter Key for Create
  function handleCreateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  }

  async function toggleMembership(
    collectionId: string,
    collectionName: string
  ) {
    const isOn = selected.has(collectionId);
    setToggling(collectionId);

    // 1. Optimistic UI - Toggle Selection
    setSelected((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });

    // 2. Optimistic UI - Update Count immediately
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id === collectionId) {
          const currentCount = c.itemCount || 0;
          return {
            ...c,
            itemCount: isOn
              ? Math.max(0, currentCount - 1)
              : currentCount + 1,
          };
        }
        return c;
      })
    );

    // 3. Show Toast
    showToast(
      isOn
        ? `Photo removed from Collection '${collectionName}'`
        : `Photo added to Collection '${collectionName}'`
    );

    try {
      await toggleImageInCollection(collectionId, image, isOn);
    } catch (e) {
      // Revert selection on error
      setSelected((prev) => {
        const next = new Set(prev);
        if (isOn) next.add(collectionId);
        else next.delete(collectionId);
        return next;
      });

      // Revert count on error
      setCollections((prev) =>
        prev.map((c) => {
          if (c.id === collectionId) {
            const currentCount = c.itemCount || 0;
            return {
              ...c,
              itemCount: isOn
                ? currentCount + 1
                : Math.max(0, currentCount - 1),
            };
          }
          return c;
        })
      );

      console.error(e);
      showToast(`Failed to update ${collectionName}`);
    } finally {
      setToggling(null);
    }
  }

  // Trigger Confirmation Modal
  function requestDelete(collectionId: string, name: string) {
    setCollectionToDelete({ id: collectionId, name });
  }

  // Execute Delete
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
      showToast(`Deleted ${name}`);
      setCollectionToDelete(null); // Close confirmation
    } catch (e) {
      console.error(e);
      alert(`Could not delete collection: ${errText(e)}`);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        onMouseDown={onOverlayMouseDown}
        className={`fixed inset-0 z-[9999999999] flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-modal="true"
        role="dialog"
      >
        {/* Card */}
        <div
          className={`relative w-full h-[100dvh] sm:h-[600px] sm:max-h-[90vh] sm:max-w-xl sm:mx-3 bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-300 transform rounded-none sm:rounded-3xl flex flex-col overflow-hidden ${
            isOpen
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-4"
          }`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* --- Delete Confirmation Overlay (Internal) --- */}
          {collectionToDelete && (
             <div className="absolute inset-0 z-[50] flex items-center justify-center bg-white/60 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
                <div className="bg-white border border-gray-100 shadow-2xl ring-1 ring-black/5 rounded-3xl p-6 w-full max-w-xs text-center transform scale-100 animate-in zoom-in-95 duration-200">
                    <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 text-red-500">
                        <Icon name="trash" size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Collection?</h3>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                        Are you sure you want to delete <br/>
                        <span className="font-semibold text-gray-800">“{collectionToDelete.name}”</span>?
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
                            {isDeleting ? <Spinner size={14} className="border-white/80"/> : "Delete"}
                        </button>
                    </div>
                </div>
             </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center">
                <Icon name="retro" className="text-[var(--brand-orange)]" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                Add Photo to Collection
              </h2>
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
          <div className="flex-1 flex flex-col min-h-0 px-6 py-6 bg-white overflow-hidden">
            
            {/* 1. Create new collection */}
            <div className="shrink-0 space-y-2 mb-6">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
                Create New
              </label>
              <div className="border border-gray-200 rounded-2xl p-3 bg-gray-50/50 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                <input
                  type="text"
                  placeholder="Collection Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={handleCreateKeyDown}
                  className="bg-white border border-gray-300 text-gray-900 rounded-xl px-4 py-3 outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-100 transition-all placeholder:text-gray-500"
                />
                <select
                  value={privacy}
                  onChange={(e) =>
                    setPrivacy(e.target.value as "private" | "public")
                  }
                  className="bg-white border border-gray-300 text-gray-900 rounded-xl px-4 py-3 outline-none focus:border-gray-400 cursor-pointer"
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
                {/* Create Button: w-full on mobile, w-28 on sm+ */}
                <button
                  onClick={handleCreate}
                  disabled={busyCreate}
                  className="w-full sm:w-28 py-3 rounded-xl bg-[var(--brand-orange)] text-white font-medium hover:brightness-95 disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                >
                  {busyCreate && (
                    <Spinner size={14} className="border-white/80" />
                  )}
                  {busyCreate ? "Creating" : "Create"}
                </button>
              </div>
            </div>

            {/* 2. Search & List Section */}
            <div className="flex-1 flex flex-col min-h-0 space-y-2 overflow-hidden">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
                Your Collections
              </label>

              <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-2xl bg-gray-50/50 overflow-hidden">
                <div className="shrink-0 p-3 pb-0">
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

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 pt-4">
                  {loading ? (
                    <ul className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
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
                        
                        return (
                          <li
                            key={c.id}
                            className={`group relative flex items-center gap-4 p-3 pr-12 rounded-2xl border transition-all cursor-pointer ${
                              isOn
                                ? "bg-orange-50/50 border-orange-200"
                                : "bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm"
                            }`}
                            onClick={() => toggleMembership(c.id, c.name)}
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
                              disabled={isBusy}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
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

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0 bg-gray-50/80 sm:rounded-b-3xl backdrop-blur-md">
            <button
              onClick={requestClose}
              className="px-5 py-2.5 rounded-xl text-gray-600 font-medium hover:bg-gray-100 transition-colors text-sm"
            >
              Close
            </button>
            <Link
              href="/dashboard/mycollections"
              target="_blank"
              onClick={requestClose}
              className="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-medium hover:bg-black transition-all shadow-lg shadow-gray-200 text-sm"
            >
              My Collections
            </Link>
          </div>
        </div>
      </div>

      {/* Black toast with updated alignment: Center on Mobile, Right on Desktop */}
      {toastMsg && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 z-[9999999999] px-5 py-3 rounded-xl bg-gray-900 text-white shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[90vw] sm:max-w-md w-max">
          <div className="w-2 h-2 rounded-full bg-[var(--brand-orange)] shrink-0" />
          <span className="font-medium text-sm truncate">{toastMsg}</span>
        </div>
      )}
    </>
  );
}