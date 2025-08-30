// src/app/heritage/[slug]/gallery/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import CollectHeart from "@/components/CollectHeart";
import AddToCollectionModal from "@/components/AddToCollectionModal"; // ✅ NEW

type Site = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
};
type ImageRow = {
  id: string;
  site_id: string;
  storage_path: string;
  alt_text?: string | null;
  caption?: string | null;
  credit?: string | null;
  sort_order: number;
  publicUrl?: string | null;
};

function Lightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
  siteId,
  onOpenCollections, // ✅ NEW
}: {
  images: ImageRow[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  siteId?: string | null;
  onOpenCollections: (img: ImageRow) => void; // ✅ NEW
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
      className={`fixed inset-0 z-[1000] flex items-center justify-center transition-opacity duration-300 ${
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
        {/* Close */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={requestClose}
          className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center"
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>

        {/* Prev / Next */}
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

        {/* Image */}
        <div className="w-full h-full flex items-center justify-center">
          {img?.publicUrl ? (
            <div className="relative">
              <img
                src={img.publicUrl}
                alt={img.alt_text || ""}
                className="max-w-[92vw] max-h-[78vh] object-contain shadow-2xl"
                onMouseDown={(e) => e.stopPropagation()}
              />

              {/* Heart over image (existing) */}
              <div
                className="absolute top-4 right-4 z-20"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <CollectHeart
                  variant="icon"
                  siteImageId={img.id}
                  storagePath={img.storage_path}
                  siteId={siteId ?? undefined}
                  altText={img.alt_text ?? undefined}
                  caption={img.caption ?? undefined}
                  credit={img.credit ?? undefined}
                  size={24}
                />
              </div>

              {/* ✅ NEW: Add to Collection button (over image) */}
              <div
                className="absolute top-4 right-16 z-20"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => onOpenCollections(img)}
                  className="px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white ring-1 ring-black/5 text-sm font-medium"
                >
                  Add to Collection
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full h-full bg-gray-200" />
          )}
        </div>

        {/* Caption in lightbox */}
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

export default function SiteGalleryPage() {
  const params = useParams();
  const slug = (params.slug as string) ?? "";

  const [site, setSite] = useState<Site | null>(null);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);

  // lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // ✅ NEW: modal state
  const [chooseOpen, setChooseOpen] = useState(false);
  const [chooseImage, setChooseImage] = useState<ImageRow | null>(null);

  const openLightbox = useCallback((idx: number) => {
    setActiveIndex(idx);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const prev = useCallback(
    () => setActiveIndex((i) => (i - 1 + images.length) % images.length),
    [images.length]
  );
  const next = useCallback(
    () => setActiveIndex((i) => (i + 1) % images.length),
    [images.length]
  );

  // open collections modal for the current (or passed) image
  const openCollectionsFor = useCallback((img: ImageRow) => {
    setChooseImage(img);
    setChooseOpen(true);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: s } = await supabase
        .from("sites")
        .select("id, slug, title, cover_photo_url")
        .eq("slug", slug)
        .single();
      if (!s) {
        setLoading(false);
        return;
      }
      setSite(s as Site);

      const { data: imgs } = await supabase
        .from("site_images")
        .select("*")
        .eq("site_id", s.id)
        .order("sort_order", { ascending: true });

      const withUrls: ImageRow[] = await Promise.all(
        (imgs || []).map(async (r: any) => ({
          ...r,
          publicUrl: r.storage_path
            ? supabase.storage.from("site-images").getPublicUrl(r.storage_path)
                .data.publicUrl
            : null,
        }))
      );

      setImages(withUrls);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!site) return <div className="p-6">Not found.</div>;

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* Header */}
      <div className="relative w-full h-64 md:h-80">
        {site.cover_photo_url ? (
          <img
            src={site.cover_photo_url}
            alt={site.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 pb-4 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-white text-2xl md:text-3xl font-bold">
              Photo Gallery — {site.title}
            </h1>
            <Link
              href={`/heritage/${site.slug}`}
              className="inline-block px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
            >
              ← Back to main article
            </Link>
          </div>
        </div>
      </div>

      {/* Masonry grid */}
      <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 py-6">
        {images.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6 text-gray-600">
            No photos uploaded yet for this site.
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
            {images.map((img, idx) => (
              <figure
                key={img.id}
                className="relative mb-4 break-inside-avoid rounded-xl shadow-sm bg-white overflow-hidden cursor-pointer group"
                onClick={() => img.publicUrl && openLightbox(idx)}
                title="Open"
              >
                {img.publicUrl ? (
                  <>
                    <img
                      src={img.publicUrl}
                      alt={img.alt_text || ""}
                      className="w-full h-auto object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    <CollectHeart
                      variant="overlay"
                      siteImageId={img.id}
                      storagePath={img.storage_path}
                      siteId={site.id}
                      altText={img.alt_text ?? undefined}
                      caption={img.caption ?? undefined}
                      credit={img.credit ?? undefined}
                    />
                  </>
                ) : (
                  <div className="w-full aspect-[4/3] bg-gray-200" />
                )}
                {/* Captions intentionally removed on grid cards */}
              </figure>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && images.length > 0 && (
        <Lightbox
          images={images}
          index={activeIndex}
          onClose={closeLightbox}
          onPrev={prev}
          onNext={next}
          siteId={site?.id}
          onOpenCollections={openCollectionsFor} // ✅ pass handler
        />
      )}

      {/* ✅ Add-to-Collection modal */}
      {chooseOpen && chooseImage && (
        <AddToCollectionModal
          onClose={() => setChooseOpen(false)}
          image={{
            siteImageId: chooseImage.id,
            storagePath: chooseImage.storage_path,
            siteId: chooseImage.site_id,
            altText: chooseImage.alt_text,
            caption: chooseImage.caption,
            credit: chooseImage.credit,
          }}
        />
      )}
    </div>
  );
}
