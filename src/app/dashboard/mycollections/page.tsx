// src/app/dashboard/mycollections/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import {
  listPhotoCollections,
  deletePhotoCollection,
} from "@/lib/photoCollections";
import {
  listCollections as listCollectedPhotos,
  removeFromCollection as removeFromLibrary,
  makeCollectKey,
} from "@/lib/collections";

/* Lightbox for Collected Photos */
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

type Album = {
  id: string;
  name: string;
  is_public: boolean;
  coverUrl?: string | null;
  itemCount?: number;
};

export default function MyCollectionsDashboard() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

  useEffect(() => {
    (async () => {
      setLoadingAlbums(true);
      try {
        setAlbums(await listPhotoCollections());
      } finally {
        setLoadingAlbums(false);
      }
    })();
    (async () => {
      setLoadingPhotos(true);
      try {
        setPhotos(await listCollectedPhotos(200));
      } finally {
        setLoadingPhotos(false);
      }
    })();
  }, []);

  async function deleteAlbum(id: string, name: string) {
    if (
      !confirm(
        `Delete collection “${name}”? This will not affect your library.`
      )
    )
      return;
    setDeletingId(id);
    try {
      await deletePhotoCollection(id);
      setAlbums((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function removeLibraryRow(it: any) {
    const key = makeCollectKey({
      siteImageId: it.site_image_id ?? undefined,
      storagePath: it.storage_path ?? undefined,
      imageUrl: it.image_url ?? undefined,
    });
    await removeFromLibrary(key);
    setPhotos((prev) => prev.filter((p) => p.id !== it.id));
  }

  const openLightbox = useCallback((idx: number) => {
    setLbIndex(idx);
    setLbOpen(true);
  }, []);
  const prev = useCallback(
    () => setLbIndex((i) => (i - 1 + photos.length) % photos.length),
    [photos.length]
  );
  const next = useCallback(
    () => setLbIndex((i) => (i + 1) % photos.length),
    [photos.length]
  );

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">My Collections</h1>

      {/* Collections */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Collections</h2>
        </div>

        {loadingAlbums ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm animate-pulse h-28"
              />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="text-gray-600">
            You have no collections. Use “Add to Collection” from a photo.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {albums.map((a) => (
              <Link
                key={a.id}
                href={`/dashboard/mycollections/${a.id}`}
                className="group relative block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteAlbum(a.id, a.name);
                  }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Delete collection"
                >
                  {deletingId === a.id ? (
                    <span className="inline-block rounded-full border-2 border-gray-300 border-t-transparent animate-spin w-4 h-4" />
                  ) : (
                    <Icon name="times" />
                  )}
                </button>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full ring-1 ring-black/5 flex items-center justify-center overflow-hidden bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
                    {a.coverUrl ? (
                      <img
                        src={a.coverUrl}
                        alt={a.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon name="images" size={20} />
                    )}
                  </div>
                  <div>
                    <div className="text-lg font-semibold group-hover:text-[var(--brand-orange)] transition-colors">
                      {a.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {a.is_public ? "public" : "private"} • {a.itemCount ?? 0}{" "}
                      items
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Collected Photos */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Collected Photos</h2>

        {loadingPhotos ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-gray-200 h-40 animate-pulse"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-gray-600">
            No photos yet. Tap the heart on any image to save it.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {photos.map((it, idx) => (
              <div
                key={it.id}
                className="relative group rounded-xl overflow-hidden bg-gray-100 ring-1 ring-black/5 cursor-zoom-in"
                onClick={() => openLightbox(idx)}
                title="Open"
              >
                {/* Transform the wrapper, not the image (avoids pixel jitter) */}
                <div
                  className="transition-transform duration-200 transform-gpu group-hover:scale-[1.01] will-change-transform"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <img
                    src={it.publicUrl}
                    alt={it.alt_text || ""}
                    className="w-full h-40 object-cover select-none"
                    draggable={false}
                  />
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLibraryRow(it);
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white text-gray-700 hover:bg-red-50 hover:text-red-600 shadow ring-1 ring-black/5 flex items-center justify-center"
                  title="Remove from library"
                >
                  <Icon name="times" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {lbOpen && photos.length > 0 && (
        <Lightbox
          images={photos}
          index={lbIndex}
          onClose={() => setLbOpen(false)}
          onPrev={prev}
          onNext={next}
        />
      )}
    </div>
  );
}
