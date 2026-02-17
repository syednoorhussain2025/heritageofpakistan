"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { decode } from "blurhash";
import AddToTripModal from "@/components/AddToTripModal";
import { useBookmarks } from "@/components/BookmarkProvider";

/* -------------------------------------------------------
   BLURHASH FALLBACK (only if we have a hash and metadata)
--------------------------------------------------------*/
function BlurhashImage({
  hash,
  width,
  height,
}: {
  hash: string;
  width: number;
  height: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) return;
    const w = 32;
    const h = Math.round((height / width) * 32) || 32;

    const pixels = decode(hash, w, h);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(w, h);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);

    setUrl(canvas.toDataURL());
  }, [hash, width, height]);

  if (!url) return null;

  return (
    <img
      src={url}
      alt="blur preview"
      className="absolute inset-0 w-full h-full object-cover"
      draggable={false}
    />
  );
}

/* -------------------------------------------------------
   MAIN COMPONENT
   Rule: hero comes from site.cover.url (hero variant from
   cover_photo_url), cover_photo_url is a fallback.
--------------------------------------------------------*/
export default function HeritageCover({
  site,
  hasPhotoStory,
}: {
  site: {
    id: string;
    slug: string;
    province_slug?: string | null;
    title: string;
    tagline?: string | null;
    heritage_type?: string | null;
    location_free?: string | null;
    avg_rating?: number | null;
    review_count?: number | null;
    latitude?: string | number | null;
    longitude?: string | number | null;

    cover_photo_url?: string | null;

    cover?:
      | {
          url: string;
          heroUrl?: string | null;
          thumbUrl?: string | null;
          width?: number | null;
          height?: number | null;
          blurhash?: string | null;
          blurDataURL?: string | null;
        }
      | null;
  };
  hasPhotoStory: boolean;
}) {
  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();
  const cover = site.cover ?? null;

  // Priority:
  // 1) cover.url (hero variant from imagevariants)
  // 2) cover.heroUrl (legacy)
  // 3) sites.cover_photo_url (raw path or public URL fallback)
  const heroUrl: string | null =
    cover?.url || cover?.heroUrl || site.cover_photo_url || null;

  // Blur metadata only from cover if available
  const activeBlurDataURL = cover?.blurDataURL ?? undefined;
  const activeBlurhash = cover?.blurhash ?? null;
  const activeWidth = cover?.width ?? null;
  const activeHeight = cover?.height ?? null;

  const hasBlurDataURL = !!activeBlurDataURL;
  const hasBlurhashFallback =
    !!activeBlurhash && !!activeWidth && !!activeHeight;

  const [heroLoaded, setHeroLoaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(true);

  const heroRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Scroll-driven overlay fade only on desktop and larger
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;

    const hero = heroRef.current;
    const overlay = overlayRef.current;
    if (!hero || !overlay) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const h = rect.height || 1;
        const p = Math.min(1, Math.max(0, -rect.top / h));
        const start = 0.2;
        const end = 0.85;
        const e = Math.min(1, Math.max(0, (p - start) / (end - start)));
        overlay.style.setProperty("--exit", String(e));
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const handleHeroLoadComplete = () => {
    setHeroLoaded(true);
  };

  useEffect(() => {
    if (!heroLoaded) return;
    const t = setTimeout(() => setShowSpinner(false), 200);
    return () => clearTimeout(t);
  }, [heroLoaded]);

  const filled = Math.max(0, Math.min(5, Math.round(site.avg_rating ?? 0)));
  const hasRatingInfo =
    site.avg_rating != null || site.review_count != null;
  const isBookmarked =
    isLoaded && site?.id ? bookmarkedIds.has(site.id) : false;
  const [showTripModal, setShowTripModal] = useState(false);

  const lat = site.latitude != null ? Number(site.latitude) : null;
  const lng = site.longitude != null ? Number(site.longitude) : null;
  const mapsLink =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const baseHeritagePath = site.province_slug
    ? `/heritage/${site.province_slug}/${site.slug}`
    : `/heritage/${site.slug}`;
  const galleryHref = `${baseHeritagePath}/gallery`;
  const photoStoryHref = `${baseHeritagePath}/photo-story`;

  const getHeritageIcon = (type?: string | null) => {
    const t = type?.toLowerCase() ?? "";
    if (t.includes("fort") || t.includes("palace")) return "chess-rook";
    if (t.includes("mosque")) return "mosque";
    if (t.includes("temple")) return "place-of-worship";
    if (t.includes("archaeological")) return "archway";
    if (t.includes("tomb") || t.includes("shrine")) return "landmark";
    return "landmark";
  };

  return (
    <>
      {/* ---------- MOBILE HERO (phones) ---------- */}
      <section aria-label="Hero" className="block md:hidden bg-white">
        {heroUrl ? (
          <div className="relative w-full bg-black aspect-[5/4] overflow-hidden">
            {showSpinner && (
              <div className="absolute inset-0 z-20 flex items-center justify-center">
                <div className="h-10 w-10 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
              </div>
            )}

            {hasBlurDataURL && (
              <img
                src={activeBlurDataURL}
                alt={site.title}
                className={`absolute inset-0 w-full h-full object-cover blur-lg scale-105 transition-opacity duration-700 ${
                  heroLoaded ? "opacity-0" : "opacity-100"
                }`}
                draggable={false}
              />
            )}

            {!hasBlurDataURL &&
              hasBlurhashFallback &&
              activeWidth &&
              activeHeight && (
                <div
                  className={`absolute inset-0 blur-lg scale-105 transition-opacity duration-700 ${
                    heroLoaded ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <BlurhashImage
                    hash={activeBlurhash!}
                    width={activeWidth}
                    height={activeHeight}
                  />
                </div>
              )}

            <Image
              src={heroUrl}
              alt={site.title}
              width={activeWidth ?? 1600}
              height={activeHeight ?? 900}
              sizes="100vw"
              priority
              placeholder="empty"
              unoptimized
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
                heroLoaded ? "opacity-100" : "opacity-0"
              }`}
              draggable={false}
              onLoadingComplete={handleHeroLoadComplete}
            />
          </div>
        ) : (
          <div className="w-full aspect-[5/4] bg-gray-200" />
        )}

        {/* Info block below image */}
        <div className="px-4 pt-4 pb-5 space-y-3">
          <h1 className="font-hero-title text-3xl leading-tight text-black">
            {site.title}
          </h1>

          {hasRatingInfo && (
            <div className="flex items-center gap-2 text-[15px] text-slate-800">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={
                      i < filled
                        ? "rating-star--filled text-[18px]"
                        : "text-slate-300 text-[18px]"
                    }
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="font-medium">
                {site.avg_rating?.toFixed(1)} • {site.review_count} reviews
              </span>
            </div>
          )}

          {site.tagline && (
            <p className="text-[15px] leading-relaxed text-slate-700">
              {site.tagline}
            </p>
          )}

          {site.heritage_type && (
            <div className="pt-1">
              <div className="uppercase text-slate-500 text-[11px]">
                Heritage Type
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-[15px] text-slate-900">
                <Icon
                  name={getHeritageIcon(site.heritage_type)}
                  className="text-slate-500"
                  size={16}
                />
                <span>{site.heritage_type}</span>
              </div>
            </div>
          )}

          {site.location_free && (
            <div className="pt-1">
              <div className="uppercase text-slate-500 text-[11px]">
                Location
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-[15px] text-slate-900">
                <Icon
                  name="map-marker-alt"
                  className="text-slate-500"
                  size={16}
                />
                <span>{site.location_free}</span>
              </div>
            </div>
          )}

          {/* Reserved space for Photo Story button to avoid layout shift */}
          <div className="pt-3 min-h-[52px]">
            {hasPhotoStory && (
              <a
                href={`/heritage/${site.province_slug}/${site.slug}/photo-story`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-medium shadow-md"
                style={{ background: "var(--brand-orange, #F78300)" }}
              >
                <Icon name="play" className="text-white text-lg" />
                <span>Photo Story</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ---------- DESKTOP/TABLET HERO ---------- */}
      <section
        ref={heroRef}
        aria-label="Hero"
        className="relative w-full overflow-hidden hidden md:block"
        style={{
          height: "99svh",
          marginTop: "calc(-1 * var(--sticky-offset, 72px))",
        }}
      >
        {/* IMAGE + PLACEHOLDERS */}
        <div className="absolute inset-0">
          {heroUrl ? (
            <>
              {showSpinner && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <div className="h-11 w-11 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                </div>
              )}

              {hasBlurDataURL && (
                <img
                  src={activeBlurDataURL}
                  alt={site.title}
                  className={`absolute inset-0 w-full h-full object-cover blur-lg scale-105 transition-opacity duration-700 ${
                    heroLoaded ? "opacity-0" : "opacity-100"
                  }`}
                  draggable={false}
                />
              )}

              {!hasBlurDataURL &&
                hasBlurhashFallback &&
                activeWidth &&
                activeHeight && (
                  <div
                    className={`absolute inset-0 blur-lg scale-105 transition-opacity duration-700 ${
                      heroLoaded ? "opacity-0" : "opacity-100"
                    }`}
                  >
                    <BlurhashImage
                      hash={activeBlurhash!}
                      width={activeWidth}
                      height={activeHeight}
                    />
                  </div>
                )}

              <Image
                src={heroUrl}
                alt={site.title}
                fill
                sizes="100vw"
                priority={false}
                loading="lazy"
                placeholder="empty"
                unoptimized
                className={`object-cover object-top transition-opacity duration-700 ${
                  heroLoaded ? "opacity-100" : "opacity-0"
                }`}
                draggable={false}
                onLoadingComplete={handleHeroLoadComplete}
              />
            </>
          ) : (
            <div className="w-full h-full bg-gray-200" />
          )}
        </div>

        {/* 1) DARK READABILITY GRADIENT */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%]"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.65) 25%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* 2) PIXEL-CONTROLLED BLUR WITH FADED MASK */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%]"
          style={{
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            WebkitMaskImage:
              "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 38%, rgba(0,0,0,0) 100%)",
            maskImage:
              "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 38%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* OVERLAY CONTENT */}
        <div
          ref={overlayRef}
          className={`absolute inset-0 flex items-end hero-overlay ${
            mounted ? "blocks-in" : ""
          }`}
        >
          {hasRatingInfo && (
            <div
              className="absolute z-10 flex items-center gap-3 text-white bg-black/45 rounded-full px-4 py-2 shadow-lg"
              style={{
                top: "calc(var(--sticky-offset, 72px) + 12px)",
                left: "min(24px, 4vw)",
              }}
            >
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={
                      i < filled
                        ? "rating-star--filled text-[22px] md:text-[24px]"
                        : "text-white/60 text-[22px] md:text-[24px]"
                    }
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="text-sm md:text-base font-medium">
                {site.avg_rating?.toFixed(1)} • {site.review_count} reviews
              </span>
            </div>
          )}

          <div className="w-full pb-8 md:pb-10 lg:pb-12 grid grid-cols-1 md:grid-cols-2 md:items-end gap-6 pl-[54px] pr-[24px] md:pl-[82px] md:pr-[36px] lg:pl-[109px] lg:pr-[48px] max-w-screen-2xl mx-auto">
            <div className="text-white hero-left self-end">
              <h1 className="font-hero-title text-4xl md:text-5xl lg:text-6xl leading-tight">
                {site.title}
              </h1>

              {site.tagline && (
                <p className="mt-4 max-w-2xl font-hero-tagline">
                  {site.tagline}
                </p>
              )}
            </div>

            <div className="text-white flex flex-col items-start gap-4 hero-right text-left justify-self-end self-end w-[min(276px,30vw)]">
              <div className="hero-actions-stack">
                {mapsLink ? (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hero-action-btn hero-action-btn--maps"
                  >
                    <Icon name="map-marker-alt" size={16} />
                    <span>Open in Maps</span>
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => toggleBookmark(site.id)}
                  aria-pressed={isBookmarked}
                  className={[
                    "hero-action-btn",
                    isBookmarked ? "hero-action-btn--active" : "",
                  ].join(" ")}
                >
                  <Icon name="bookmark" size={16} />
                  <span>{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTripModal(true)}
                  className="hero-action-btn"
                >
                  <Icon name="route" size={16} />
                  <span>Add to Trip</span>
                </button>

                <a
                  href={galleryHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hero-action-btn"
                >
                  <Icon name="gallery" size={16} />
                  <span>Gallery</span>
                </a>

                {hasPhotoStory && (
                  <a
                    href={photoStoryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hero-action-btn hero-action-btn--story"
                  >
                    <Icon name="play" size={16} />
                    <span>Photo Story</span>
                  </a>
                )}
              </div>

              {site.heritage_type && (
                <div>
                  <div className="uppercase text-white/80 text-xs">
                    Heritage Type
                  </div>
                  <div className="flex items-center gap-1.5 font-semibold text-base md:text-lg">
                    <Icon
                      name={getHeritageIcon(site.heritage_type)}
                      className="text-white/60"
                    />
                    <span>{site.heritage_type}</span>
                  </div>
                </div>
              )}

              {site.location_free && (
                <div>
                  <div className="uppercase text-white/80 text-xs">
                    Location
                  </div>
                  <div className="flex items-center gap-1.5 font-semibold text-base md:text-lg">
                    <Icon name="map-marker-alt" className="text-white/60" />
                    <span>{site.location_free}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <style jsx>{`
          @media (prefers-reduced-motion: reduce) {
            .hero-overlay,
            .hero-left,
            .hero-right {
              animation: none !important;
              transition: none !important;
              transform: none !important;
            }
          }

          .hero-overlay {
            --exit: 0;
            opacity: calc(1 - var(--exit));
          }

          .hero-left,
          .hero-right {
            opacity: 0;
            will-change: transform, opacity;
          }

          .hero-left {
            --initial-tx: -32px;
            transform: translateX(var(--initial-tx));
            transition: opacity 600ms ease-out 150ms,
              transform 600ms ease-out 150ms;
          }

          .hero-right {
            --initial-tx: 32px;
            transform: translateX(var(--initial-tx));
            transition: opacity 600ms ease-out 250ms,
              transform 600ms ease-out 250ms;
          }

          .hero-overlay.blocks-in .hero-left,
          .hero-overlay.blocks-in .hero-right {
            opacity: 1;
            transform: translateX(0px);
          }

          .rating-star--filled {
            color: var(--brand-amber, #ffc107);
          }

          .hero-actions-stack {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 4px;
          }

          .hero-action-btn {
            width: 100%;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.24);
            color: #f8fafc;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            box-shadow: 0 10px 24px rgba(2, 6, 23, 0.28);
            font-size: 14px;
            font-weight: 600;
            line-height: 1.2;
            transition: background 180ms ease, border-color 180ms ease,
              transform 180ms ease, box-shadow 180ms ease;
          }

          .hero-action-btn:hover {
            background: rgba(30, 41, 59, 0.72);
            border-color: rgba(255, 255, 255, 0.35);
            transform: translateY(-1px);
            box-shadow: 0 14px 26px rgba(2, 6, 23, 0.34);
          }

          .hero-action-btn:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35),
              0 0 0 5px rgba(15, 23, 42, 0.5);
          }

          .hero-action-btn--maps {
            background: rgba(248, 250, 252, 0.96);
            color: #0f172a;
            border-color: rgba(255, 255, 255, 0.92);
          }

          .hero-action-btn--maps:hover {
            background: #ffffff;
            border-color: #ffffff;
          }

          .hero-action-btn--active {
            border-color: rgba(247, 131, 0, 0.72);
            background: rgba(53, 24, 3, 0.62);
          }

          .hero-action-btn--story {
            background: rgba(247, 131, 0, 0.9);
            border-color: rgba(255, 193, 111, 0.9);
          }

          .hero-action-btn--story:hover {
            background: rgba(247, 131, 0, 1);
            border-color: #ffd9a4;
          }
        `}</style>
      </section>

      {showTripModal && (
        <AddToTripModal
          siteId={site.id}
          onClose={() => setShowTripModal(false)}
        />
      )}
    </>
  );
}
