"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/* ----------------------------- Types ----------------------------- */

type CollectedImage = {
  id: string;
  user_id: string;
  site_image_id?: string | null;
  dedupe_key?: string | null;
  storage_path: string;
  image_url?: string | null;
  site_id?: string | null;
  alt_text?: string | null;
  caption?: string | null;
  credit?: string | null;
  created_at?: string;
};

type PhotoCollection = {
  id: string;
  user_id: string;
  name: string;
  is_public?: boolean | null;
  cover_collected_id?: string | null;
  notes?: string | null;
  created_at?: string;
};

type PhotoCollectionItem = {
  id: string;
  user_id: string;
  collection_id: string;
  collected_id: string;
  sort_order?: number | null;
  created_at?: string;
};

export type PickerInsertItem = {
  id: string;
  src: string;
  alt?: string | null;
  title?: string | null;
};

/* ----------------------------- Utils ----------------------------- */

function useSupabase() {
  const [client] = useState(() => createClient());
  return client;
}

/** Normalize any stored path into an object path inside 'site-images'. */
function normalizeObjectPath(raw?: string) {
  let p = (raw || "").trim();
  // strip full public prefix if present
  p = p.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\//i, "");
  // strip bucket prefix if present
  p = p.replace(/^site-images\//i, "");
  // strip leading slashes
  p = p.replace(/^\/+/, "");
  return p;
}

/** Build a public URL from the site-images bucket (or provided bucket). */
function publicUrlForStoragePath(
  supabase: ReturnType<typeof createClient>,
  storage_path: string,
  defaultBucket = "site-images"
) {
  if (!storage_path) return "";
  // If caller passed "bucket/path/to/object", preserve that bucket
  const firstSlash = storage_path.indexOf("/");
  if (firstSlash > 0) {
    const maybeBucket = storage_path.slice(0, firstSlash);
    if (maybeBucket && maybeBucket !== defaultBucket) {
      const objectPath = storage_path.slice(firstSlash + 1);
      return (
        supabase.storage.from(maybeBucket).getPublicUrl(objectPath).data
          .publicUrl || ""
      );
    }
    if (maybeBucket === defaultBucket) {
      const objectPath = normalizeObjectPath(storage_path);
      return (
        supabase.storage.from(defaultBucket).getPublicUrl(objectPath).data
          .publicUrl || ""
      );
    }
  }
  const objectPath = normalizeObjectPath(storage_path);
  return (
    supabase.storage.from(defaultBucket).getPublicUrl(objectPath).data
      .publicUrl || ""
  );
}

/* --------------------------- Small UI ---------------------------- */

function TinySpinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent"
      aria-hidden="true"
    />
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gray-200 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
      <style jsx>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

/* --------------------------- Component --------------------------- */

export default function AddFromCollectionsModal({
  open,
  onClose,
  onInsert,
  bucket = "site-images",
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (items: PickerInsertItem[]) => void;
  bucket?: string;
}) {
  const supabase = useSupabase();

  // animation mount/unmount
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // data & ui
  const [tab, setTab] = useState<"photos" | "collections">("photos");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [isInserting, setIsInserting] = useState(false);

  const [photos, setPhotos] = useState<CollectedImage[]>([]);
  const [collections, setCollections] = useState<PhotoCollection[]>([]);
  const [collectionCovers, setCollectionCovers] = useState<
    Record<string, string>
  >({});
  const [activeCollection, setActiveCollection] =
    useState<PhotoCollection | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");

  // cache of public preview URLs
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  // per-image loaded state for skeletons
  const [imgLoaded, setImgLoaded] = useState<Record<string, boolean>>({});

  // show modal with fade-in
  useEffect(() => {
    if (open) {
      setVisible(true);
      setLeaving(false);
      setSelected({});
      setActiveCollection(null);
      setTab("photos");
      void loadInitial(true);
    } else if (visible) {
      setLeaving(true);
      const t = setTimeout(() => {
        setVisible(false);
        setLeaving(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // build preview URLs on photo set
  useEffect(() => {
    if (!visible) return;
    const map: Record<string, string> = {};
    for (const p of photos) {
      const url =
        (p.image_url && /^https?:\/\//i.test(p.image_url) ? p.image_url : "") ||
        publicUrlForStoragePath(supabase, p.storage_path, bucket);
      map[p.id] = url;
    }
    setPreviewMap(map);
    setImgLoaded({});
  }, [photos, bucket, supabase, visible]);

  async function loadInitial(withOptimistic = false) {
    setErrMsg(null);
    setLoading(true);
    try {
      const {
        data: { user },
        error: uerr,
      } = await supabase.auth.getUser();
      if (uerr) throw uerr;
      const uid = user?.id;
      if (!uid) {
        setErrMsg("You are not signed in.");
        setPhotos([]);
        setCollections([]);
        return;
      }

      if (withOptimistic) setPhotos([]);

      // All Photos (full row for preview + alt/caption)
      const { data: pData, error: pErr } = await supabase
        .from("collected_images")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (pErr) throw pErr;
      setPhotos((pData as CollectedImage[]) ?? []);

      // Collections
      const { data: cData, error: cErr } = await supabase
        .from("photo_collections")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;
      const cols = (cData as PhotoCollection[]) ?? [];
      setCollections(cols);

      // Covers: cover_collected_id or first item per collection
      const noCoverIds = cols
        .filter((c) => !c.cover_collected_id)
        .map((c) => c.id);
      let firstItemByCollection = new Map<string, string>();
      if (noCoverIds.length) {
        const { data: items } = await supabase
          .from("photo_collection_items")
          .select("collection_id,collected_id,sort_order")
          .in("collection_id", noCoverIds)
          .order("sort_order", { ascending: true });
        (items as PhotoCollectionItem[] | null)?.forEach((it) => {
          if (!firstItemByCollection.has(it.collection_id)) {
            firstItemByCollection.set(it.collection_id, it.collected_id);
          }
        });
      }

      const coverCollectedIds = new Set<string>();
      cols.forEach((c) => {
        const cid = c.cover_collected_id || firstItemByCollection.get(c.id);
        if (cid) coverCollectedIds.add(cid);
      });

      if (coverCollectedIds.size) {
        const { data: coverImgs } = await supabase
          .from("collected_images")
          .select("*")
          .in("id", Array.from(coverCollectedIds));
        const byId = new Map<string, CollectedImage>();
        (coverImgs as CollectedImage[] | null)?.forEach((x) =>
          byId.set(x.id, x)
        );

        const map: Record<string, string> = {};
        cols.forEach((c) => {
          const cid = c.cover_collected_id || firstItemByCollection.get(c.id);
          if (!cid) return;
          const rec = byId.get(cid);
          if (!rec) return;
          map[c.id] =
            (rec.image_url && /^https?:\/\//i.test(rec.image_url)
              ? rec.image_url
              : "") ||
            publicUrlForStoragePath(supabase, rec.storage_path, bucket);
        });
        setCollectionCovers(map);
      } else {
        setCollectionCovers({});
      }
    } catch (e: any) {
      console.error(e);
      setErrMsg(
        typeof e?.message === "string"
          ? e.message
          : "Failed to load photos/collections."
      );
      setPhotos([]);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }

  async function openCollection(c: PhotoCollection) {
    setLoading(true);
    setErrMsg(null);
    setActiveCollection(c);
    setPhotos([]); // optimistic skeletons
    try {
      const { data: items, error: iErr } = await supabase
        .from("photo_collection_items")
        .select("collected_id")
        .eq("collection_id", c.id)
        .order("sort_order", { ascending: true });
      if (iErr) throw iErr;

      const ids = (items as { collected_id: string }[] | null)
        ?.map((r) => r.collected_id)
        .filter(Boolean) as string[];

      if (!ids || ids.length === 0) {
        setPhotos([]);
        setTab("collections");
        return;
      }

      const { data: pData, error: pErr } = await supabase
        .from("collected_images")
        .select("*")
        .in("id", ids);
      if (pErr) throw pErr;

      setPhotos((pData as CollectedImage[]) ?? []);
      setTab("collections");
    } catch (e: any) {
      console.error(e);
      setErrMsg(
        typeof e?.message === "string"
          ? e.message
          : "Failed to load collection."
      );
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function insertSelected() {
    if (isInserting) return;
    setIsInserting(true);
    requestAnimationFrame(() => {
      const chosen = photos.filter((p) => selected[p.id]);
      const payload: PickerInsertItem[] = chosen.map((p) => ({
        id: p.id,
        src:
          previewMap[p.id] ||
          (p.image_url && /^https?:\/\//i.test(p.image_url)
            ? p.image_url
            : "") ||
          publicUrlForStoragePath(supabase, p.storage_path, bucket),
        alt: p.caption ?? p.alt_text ?? null,
        title: p.caption ?? null,
      }));
      onInsert(payload);
      setIsInserting(false);
      setLeaving(true);
      setTimeout(() => {
        setLeaving(false);
        onClose();
      }, 200);
    });
  }

  const filteredPhotos = useMemo(() => {
    if (!q.trim()) return photos;
    const needle = q.toLowerCase();
    return photos.filter((p) =>
      [
        p.caption ?? "",
        p.alt_text ?? "",
        p.storage_path ?? "",
        p.image_url ?? "",
        p.credit ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [q, photos]);

  if (!visible && !leaving) return null;

  const showSkeletonGrid =
    loading ||
    (tab === "collections" && activeCollection && photos.length === 0);

  return (
    <div
      className={`fixed inset-0 z-[2147483648] flex items-center justify-center bg-black/35 backdrop-blur-md ${
        leaving ? "animate-fadeOut" : "animate-fadeIn"
      }`}
    >
      <div
        className={`flex flex-col bg-white shadow-xl ring-1 ring-black/10 overflow-hidden 
          w-full h-full rounded-none 
          sm:w-[95vw] sm:max-w-5xl sm:h-auto sm:rounded-2xl
          ${leaving ? "animate-popOut" : "animate-popIn"}
        `}
      >
        {/* Header */}
        <div className="flex-none flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              className={`px-3 py-1 rounded-lg text-sm ${
                tab === "photos" && !activeCollection
                  ? "bg-black text-white"
                  : "bg-gray-100"
              }`}
              onClick={() => {
                setTab("photos");
                setActiveCollection(null);
                setPhotos([]);
                void loadInitial(true);
              }}
            >
              All Photos
            </button>
            <button
              className={`px-3 py-1 rounded-lg text-sm ${
                tab === "collections" && !activeCollection
                  ? "bg-black text-white"
                  : "bg-gray-100"
              }`}
              onClick={() => {
                setTab("collections");
                setActiveCollection(null);
              }}
            >
              Collections
            </button>
            {activeCollection && (
              <span className="hidden sm:inline text-sm text-gray-500">
                / {activeCollection.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {loading && <TinySpinner />}
            <input
              placeholder="Search..."
              className="h-9 w-24 sm:w-56 rounded-lg border px-3 text-sm transition-all focus:w-40 sm:focus:w-56"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              onClick={() => {
                setLeaving(true);
                setTimeout(() => {
                  setLeaving(false);
                  onClose();
                }, 200);
              }}
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50 whitespace-nowrap"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden sm:flex-none sm:h-[520px]">
          <div className="h-full overflow-auto p-4">
            {errMsg ? (
              <div className="py-6">
                <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                  <div className="font-semibold mb-0.5">
                    Couldn’t load items
                  </div>
                  <div>{errMsg}</div>
                </div>
              </div>
            ) : tab === "collections" && !activeCollection ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {showSkeletonGrid && collections.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <div key={`csk-${i}`} className="rounded-xl border">
                      <SkeletonBlock className="aspect-[4/3] w-full rounded-t-xl" />
                      <div className="border-t p-2">
                        <SkeletonBlock className="h-3 rounded w-2/3" />
                      </div>
                    </div>
                  ))
                ) : collections.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-sm text-gray-500">
                    No collections yet.
                  </div>
                ) : (
                  collections.map((c) => {
                    const cover = collectionCovers[c.id];
                    return (
                      <button
                        key={c.id}
                        className="group overflow-hidden rounded-xl border text-left transition hover:shadow focus:outline-none focus:ring-2 focus:ring-black/10"
                        onClick={() => openCollection(c)}
                      >
                        <div className="relative aspect-[4/3] w-full bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {cover ? (
                            <img
                              src={cover}
                              alt={c.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <SkeletonBlock className="absolute inset-0" />
                          )}
                          <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">
                            Collection
                          </div>
                        </div>
                        <div className="border-t px-3 py-2">
                          <div className="truncate text-sm font-medium">
                            {c.name}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {showSkeletonGrid ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={`psk-${i}`}
                      className="overflow-hidden rounded-xl border"
                    >
                      <SkeletonBlock className="aspect-[4/3] w-full" />
                      <div className="border-t px-3 py-1">
                        <SkeletonBlock className="h-3 rounded w-1/2" />
                      </div>
                    </div>
                  ))
                ) : filteredPhotos.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-sm text-gray-500">
                    No photos found.
                  </div>
                ) : (
                  filteredPhotos.map((p) => {
                    const url = previewMap[p.id] || "";
                    const isSel = !!selected[p.id];
                    const loaded = imgLoaded[p.id];

                    return (
                      <button
                        key={p.id}
                        className={`group relative overflow-hidden rounded-xl border transition hover:shadow ${
                          isSel ? "ring-2 ring-black" : ""
                        }`}
                        onClick={() => toggleSelect(p.id)}
                        type="button"
                        title={p.caption ?? p.alt_text ?? ""}
                      >
                        <div className="relative aspect-[4/3] w-full bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {url ? (
                            <>
                              {!loaded && (
                                <SkeletonBlock className="absolute inset-0" />
                              )}
                              <img
                                src={url}
                                alt={p.alt_text ?? p.caption ?? ""}
                                loading="lazy"
                                className={`h-full w-full object-cover transition-opacity ${
                                  loaded ? "opacity-100" : "opacity-0"
                                }`}
                                onLoad={() =>
                                  setImgLoaded((m) => ({
                                    ...m,
                                    [p.id]: true,
                                  }))
                                }
                              />
                            </>
                          ) : (
                            <SkeletonBlock className="absolute inset-0" />
                          )}
                        </div>
                        {(p.caption || p.alt_text) && (
                          <div className="truncate border-t px-3 py-1 text-xs text-gray-600">
                            {p.caption ?? p.alt_text}
                          </div>
                        )}
                        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] shadow">
                          {isSel ? "Selected" : "Select"}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none flex items-center justify-between border-t px-4 py-3">
          <div className="text-xs text-gray-500">
            {Object.values(selected).filter(Boolean).length} selected
            {activeCollection ? ` · ${activeCollection.name}` : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLeaving(true);
                setTimeout(() => {
                  setLeaving(false);
                  onClose();
                }, 200);
              }}
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={insertSelected}
              disabled={
                Object.values(selected).filter(Boolean).length === 0 ||
                isInserting
              }
              className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isInserting && <TinySpinner />}
              Insert
            </button>
          </div>
        </div>
      </div>

      {/* animations */}
      <style jsx global>{`
        .animate-fadeIn {
          animation: fadeIn 180ms ease-out both;
        }
        .animate-fadeOut {
          animation: fadeOut 180ms ease-in both;
        }
        .animate-popIn {
          animation: popIn 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        .animate-popOut {
          animation: popOut 160ms ease-in both;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        @keyframes popIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes popOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
        }
      `}</style>
    </div>
  );
}