"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Icon from "@/components/Icon";
import { decode } from "blurhash";
import AddToTripModal from "@/components/AddToTripModal";

const AddToWishlistModal = dynamic(
  () => import("@/components/AddToWishlistModal"),
  { ssr: false }
);

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
  const [showTripModal, setShowTripModal] = useState(false);
  const [showWishlistModal, setShowWishlistModal] = useState(false);

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

  const scrollToSection = (ids: string[]) => {
    if (typeof window === "undefined") return;

    const stickyOffsetRaw = getComputedStyle(document.documentElement)
      .getPropertyValue("--sticky-offset")
      .trim();
    const stickyOffset = Number(stickyOffsetRaw.replace("px", "")) || 72;

    const target = ids
      .map((id) => document.getElementById(id))
      .find((el): el is HTMLElement => !!el);
    if (!target) return;

    const y = window.scrollY + target.getBoundingClientRect().top - stickyOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  const leftMetaTop = hasRatingInfo
    ? "calc(var(--sticky-offset, 72px) + 74px)"
    : "calc(var(--sticky-offset, 72px) + 12px)";

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
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[35%]"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.65) 25%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* 2) PIXEL-CONTROLLED BLUR WITH FADED MASK */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%]"
          style={{
            backdropFilter: "blur(1px)",
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
              className="absolute z-10 left-[54px] md:left-[66px] lg:left-[82px] flex items-center gap-3 text-white bg-black/45 rounded-full px-4 py-2 shadow-lg"
              style={{
                top: "calc(var(--sticky-offset, 72px) + 12px)",
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

          {(site.heritage_type || site.location_free || mapsLink) && (
            <div
              className="absolute z-10 left-[54px] md:left-[66px] lg:left-[82px] hero-left-meta-stack"
              style={{ top: leftMetaTop }}
            >
              {site.heritage_type && (
                <div className="hero-heritage-type-left">
                  <div className="hero-heritage-type-main">
                    <div className="hero-heritage-type-label">Heritage Type</div>
                    <div className="hero-heritage-type-value">
                      <Icon
                        name={getHeritageIcon(site.heritage_type)}
                        className="text-white/75"
                      />
                      <span>{site.heritage_type}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="hero-heritage-see-all"
                    data-tooltip="Heritage Categories"
                    aria-label="See all heritage categories"
                    onClick={() => scrollToSection(["categories"])}
                  >
                    See all
                  </button>
                </div>
              )}

              {site.location_free && (
                <div className="hero-heritage-type-left hero-location-left">
                  <div className="hero-heritage-type-main">
                    <div className="hero-heritage-type-label">Location</div>
                    <div className="hero-heritage-type-value">
                      <Icon name="map-marker-alt" className="text-white/75" />
                      <span>{site.location_free}</span>
                    </div>
                  </div>
                </div>
              )}

              {mapsLink ? (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hero-action-btn hero-action-btn--primary hero-left-maps-btn"
                >
                  <span className="hero-action-icon" aria-hidden="true">
                    <Icon name="adminmap" size={20} />
                  </span>
                  <span className="hero-action-label">Open in Maps</span>
                </a>
              ) : null}
            </div>
          )}

          <div className="w-full pb-8 md:pb-10 lg:pb-12 grid grid-cols-1 md:grid-cols-[minmax(0,1.65fr)_minmax(0,0.35fr)] md:items-end gap-6 pl-[54px] pr-[24px] md:pl-[66px] md:pr-[36px] lg:pl-[82px] lg:pr-[48px] max-w-screen-2xl mx-auto">
            <div className="text-white hero-left self-end">
              <h1 className="font-hero-title text-4xl md:text-5xl lg:text-6xl leading-tight">
                {site.title}
              </h1>

              <div className="hero-tagline-row">
                {site.tagline && (
                  <p className="hero-tagline-text font-hero-tagline">
                    {site.tagline}
                  </p>
                )}

                <div className="hero-bottom-quicklinks" aria-label="Quick links">
                  <a
                    href={galleryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hero-quick-circle"
                    title="Gallery"
                    data-tooltip="Gallery"
                    aria-label="Open Gallery"
                >
                  <Icon name="gallery" size={26} />
                </a>
                  {hasPhotoStory && (
                    <a
                      href={photoStoryHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hero-quick-circle"
                      title="Photo Story"
                      data-tooltip="Photo Story"
                      aria-label="Open Photo Story"
                    >
                      <Icon name="play" size={26} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => scrollToSection(["history", "architecture", "climate"])}
                    className="hero-quick-circle"
                    title="Article"
                    data-tooltip="Article"
                    aria-label="Jump to Article"
                >
                  <Icon name="history-background" size={26} />
                </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection(["travel"])}
                    className="hero-quick-circle"
                    title="Travel Guide"
                    data-tooltip="Travel Guide"
                    aria-label="Jump to Travel Guide"
                >
                  <Icon name="travel-guide" size={26} />
                </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection(["climate-topography", "climate"])}
                    className="hero-quick-circle"
                    title="Climate & Topography"
                    data-tooltip="Climate & Topography"
                    aria-label="Jump to Climate & Topography"
                >
                  <Icon name="climate-topography" size={26} />
                </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection(["nearby"])}
                    className="hero-quick-circle"
                    title="Places Nearby"
                    data-tooltip="Places Nearby"
                    aria-label="Jump to Places Nearby"
                >
                  <Icon name="regiontax" size={26} />
                </button>
                </div>
              </div>
            </div>

            <div
              className="absolute z-10 right-[24px] md:right-[36px] lg:right-[48px] text-white flex flex-col items-start gap-5 hero-right text-left w-auto"
              style={{ top: "calc(var(--sticky-offset, 72px) + 12px)" }}
            >
              <div className="hero-actions-stack">
                <button
                  type="button"
                  onClick={() => setShowTripModal(true)}
                  className="hero-action-btn hero-action-btn--primary"
                >
                  <span className="hero-action-icon" aria-hidden="true">
                    <Icon name="route" size={18} />
                  </span>
                  <span className="hero-action-label">Add to Trip</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowWishlistModal(true)}
                  className="hero-action-btn hero-action-btn--secondary"
                >
                  <span className="hero-action-icon" aria-hidden="true">
                    <Icon name="bookmark" size={18} />
                  </span>
                  <span className="hero-action-label">Save</span>
                </button>
              </div>
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
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
            margin-bottom: 4px;
          }

          .hero-action-btn {
            display: inline-flex;
            align-items: center;
            gap: 11px;
            min-width: 180px;
            padding: 10px 16px;
            border-radius: 9999px;
            border: 2px solid transparent;
            color: #ffffff;
            background: rgba(15, 23, 42, 0.22);
            box-shadow: none;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.2;
            transition: background 220ms ease, border-color 220ms ease,
              transform 220ms ease, box-shadow 220ms ease, filter 220ms ease;
          }

          .hero-action-btn:hover {
            transform: translateY(-1px);
            box-shadow: none;
            filter: saturate(1.06);
          }

          .hero-action-btn:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35),
              0 0 0 5px rgba(15, 23, 42, 0.5);
          }

          .hero-action-btn--primary {
            background: #f78300;
            color: #ffffff;
            border-color: #f78300;
          }

          .hero-action-btn--primary:hover {
            background: #f78300;
            border-color: rgba(255, 231, 183, 0.72);
          }

          .hero-action-btn--secondary {
            color: rgba(255, 255, 255, 0.9);
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.84);
          }

          .hero-action-btn--secondary:hover {
            border-color: rgba(255, 255, 255, 1);
            background: rgba(255, 255, 255, 0.14);
          }

          .hero-action-btn--active {
            border-color: rgba(255, 255, 255, 0.98);
            color: #ffffff;
          }

          .hero-action-icon {
            width: 26px;
            height: 26px;
            border-radius: 9999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            background: transparent;
            color: currentColor;
          }

          .hero-action-btn--primary .hero-action-icon {
            color: #ffffff;
          }

          .hero-action-btn--secondary .hero-action-icon {
            color: rgba(255, 255, 255, 0.9);
          }

          .hero-action-label {
            white-space: nowrap;
          }

          .hero-meta-top {
            display: grid;
            gap: 12px;
            margin-bottom: 4px;
          }

          .hero-left-meta-stack {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }

          .hero-heritage-type-left {
            display: inline-flex;
            align-items: stretch;
            border-radius: 14px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.26);
            background: rgba(8, 14, 25, 0.44);
            backdrop-filter: blur(1px);
            -webkit-backdrop-filter: blur(1px);
            color: #ffffff;
            max-width: min(470px, calc(100vw - 124px));
          }

          .hero-location-left {
            max-width: min(470px, calc(100vw - 124px));
          }

          .hero-left-maps-btn {
            min-width: 192px;
          }

          .hero-heritage-type-main {
            padding: 9px 14px 10px;
            min-width: 0;
          }

          .hero-heritage-type-label {
            text-transform: uppercase;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 2px;
            letter-spacing: 0.02em;
          }

          .hero-heritage-type-value {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 15px;
            font-weight: 600;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .hero-heritage-see-all {
            position: relative;
            border: 0;
            border-left: 1px solid rgba(255, 255, 255, 0.24);
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.01em;
            padding: 0 12px;
            min-width: 72px;
            cursor: pointer;
            transition: background-color 160ms ease, color 160ms ease;
          }

          .hero-heritage-see-all:hover,
          .hero-heritage-see-all:focus-visible {
            background: rgba(255, 255, 255, 0.16);
            color: #ffffff;
          }

          .hero-heritage-see-all:focus-visible {
            outline: none;
            box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.38);
          }

          .hero-heritage-see-all::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 50%;
            bottom: calc(100% + 10px);
            transform: translateX(-50%) translateY(4px);
            background: rgba(0, 0, 0, 0.9);
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            line-height: 1;
            padding: 7px 9px;
            border-radius: 6px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 160ms ease, transform 160ms ease;
            z-index: 20;
          }

          .hero-heritage-see-all::before {
            content: "";
            position: absolute;
            left: 50%;
            bottom: calc(100% + 4px);
            transform: translateX(-50%) translateY(4px);
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid rgba(0, 0, 0, 0.9);
            opacity: 0;
            pointer-events: none;
            transition: opacity 160ms ease, transform 160ms ease;
            z-index: 20;
          }

          .hero-heritage-see-all:hover::after,
          .hero-heritage-see-all:hover::before,
          .hero-heritage-see-all:focus-visible::after,
          .hero-heritage-see-all:focus-visible::before {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }

          .hero-tagline-row {
            margin-top: 16px;
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 20px;
            width: 100%;
            max-width: 100%;
          }

          .hero-tagline-text {
            margin: 0;
            max-width: clamp(70rem, 78vw, 108rem);
            flex: 1;
            min-width: 0;
          }

          .hero-bottom-quicklinks {
            display: flex;
            justify-content: flex-start;
            gap: 20px;
            flex-shrink: 0;
            margin-left: auto;
            padding-right: 0;
            transform: translateX(clamp(260px, 16vw, 480px));
          }

          .hero-quick-circle {
            width: 60px;
            height: 60px;
            border-radius: 9999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            line-height: 0;
            position: relative;
            cursor: pointer;
            border: 0px;
            background: rgba(0, 0, 0, 0.53);
            backdrop-filter: blur(1px);
            -webkit-backdrop-filter: blur(1px);
            color: #ffffff;
            box-shadow: none;
            transition: transform 180ms ease, box-shadow 180ms ease,
              background 180ms ease;
          }

          .hero-quick-circle :global(span) {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            line-height: 0;
          }

          .hero-quick-circle :global(svg) {
            width: 32px;
            height: 32px;
            display: block;
            transition: transform 180ms ease;
          }

          .hero-quick-circle:hover {
            transform: translateY(-1px);
            background: linear-gradient(180deg, #11b99f 0%, #0e9f89 100%);
            box-shadow: none;
          }

          .hero-quick-circle:hover :global(svg),
          .hero-quick-circle:focus-visible :global(svg) {
            transform: scale(1.15);
          }

          .hero-quick-circle:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.38),
              0 0 0 5px rgba(15, 23, 42, 0.45);
          }

          .hero-quick-circle::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 50%;
            bottom: calc(100% + 10px);
            transform: translateX(-50%) translateY(4px);
            background: rgba(0, 0, 0, 0.9);
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            line-height: 1;
            padding: 7px 9px;
            border-radius: 6px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 160ms ease, transform 160ms ease;
            z-index: 20;
          }

          .hero-quick-circle::before {
            content: "";
            position: absolute;
            left: 50%;
            bottom: calc(100% + 4px);
            transform: translateX(-50%) translateY(4px);
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid rgba(0, 0, 0, 0.9);
            opacity: 0;
            pointer-events: none;
            transition: opacity 160ms ease, transform 160ms ease;
            z-index: 20;
          }

          .hero-quick-circle:hover::after,
          .hero-quick-circle:hover::before,
          .hero-quick-circle:focus-visible::after,
          .hero-quick-circle:focus-visible::before {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }

          @media (max-width: 1279px) {
            .hero-tagline-row {
              display: block;
            }

            .hero-tagline-text {
              margin-bottom: 14px;
              max-width: 54rem;
            }

            .hero-bottom-quicklinks {
              padding-right: 0;
              gap: 12px;
              transform: none;
            }
          }
        `}</style>
      </section>

      {showTripModal && (
        <AddToTripModal
          siteId={site.id}
          onClose={() => setShowTripModal(false)}
        />
      )}

      {showWishlistModal && (
        <AddToWishlistModal
          siteId={site.id}
          onClose={() => setShowWishlistModal(false)}
        />
      )}
    </>
  );
}
