"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { decode } from "blurhash";
import AddToTripModal from "@/components/AddToTripModal";
import { hapticLight } from "@/lib/haptics";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { getListsContainingSite } from "@/lib/wishlists";
import { Spinner } from "@/components/ui/Spinner";

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

type SlideshowPhoto = {
  url: string;
  thumbUrl?: string | null;
  blurhash?: string | null;
  blurDataURL?: string | null;
  width?: number | null;
  height?: number | null;
};

export default function HeritageCover({
  site,
  hasPhotoStory,
  galleryCount,
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

    slideshowPhotos?: SlideshowPhoto[] | null;
  };
  hasPhotoStory: boolean;
  galleryCount?: number | null;
}) {
  const router = useRouter();
  const cover = site.cover ?? null;

  // Priority:
  // 1) cover.url (hero variant from imagevariants)
  // 2) cover.heroUrl (legacy)
  // 3) sites.cover_photo_url (raw path or public URL fallback)
  const heroUrl: string | null =
    cover?.url || cover?.heroUrl || site.cover_photo_url || null;

  // Build slideshow frames: if slideshow photos are provided use them,
  // otherwise fall back to single cover photo.
  const rawSlideshow = site.slideshowPhotos;
  const slides: SlideshowPhoto[] =
    rawSlideshow && rawSlideshow.length > 0
      ? rawSlideshow
      : heroUrl
      ? [{ url: heroUrl, blurhash: cover?.blurhash, blurDataURL: cover?.blurDataURL, width: cover?.width, height: cover?.height }]
      : [];

  const hasSlideshow = slides.length > 1;
  const isSingleSlide = slides.length <= 1;

  // Derived hrefs (needed by touch effect closures — must be before effects)
  const baseHeritagePath = site.province_slug
    ? `/heritage/${site.province_slug}/${site.slug}`
    : `/heritage/${site.slug}`;
  const galleryHref = `${baseHeritagePath}/gallery`;

  const [slideIndex, setSlideIndex] = useState(0);
  const slideIndexRef = useRef(0);

  // Mobile sliding track ref + transform helper
  const mobileTrackRef = useRef<HTMLDivElement>(null);

  const applyMobileTrackTransform = useRef((dx: number, atIdx: number, animated: boolean) => {
    const el = mobileTrackRef.current;
    if (!el) return;
    const pct = slides.length > 1 ? -atIdx * (100 / slides.length) : 0;
    el.style.transition = animated ? "transform 0.3s cubic-bezier(0.22,1,0.36,1)" : "none";
    el.style.transform = `translateX(calc(${pct}% + ${dx}px))`;
  }).current;

  // Auto-advance in a ref so touch handlers can pause/resume it
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoAdvance = useRef(() => {
    if (!hasSlideshow) return;
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    autoTimerRef.current = setInterval(() => {
      setSlideIndex((prev) => {
        const next = (prev + 1) % slides.length;
        slideIndexRef.current = next;
        applyMobileTrackTransform(0, next, true);
        return next;
      });
    }, 5000);
  }).current;

  const stopAutoAdvance = useRef(() => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }).current;

  useEffect(() => {
    if (!hasSlideshow) return;
    startAutoAdvance();
    return () => stopAutoAdvance();
  }, [hasSlideshow, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause auto-advance when tab/page is hidden
  useEffect(() => {
    if (!hasSlideshow) return;
    const onVisChange = () => {
      if (document.hidden) stopAutoAdvance();
      else startAutoAdvance();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [hasSlideshow]); // eslint-disable-line react-hooks/exhaustive-deps

// Sync track position when slideIndex changes from dot clicks
  useEffect(() => {
    slideIndexRef.current = slideIndex;
    applyMobileTrackTransform(0, slideIndex, true);
  }, [slideIndex, applyMobileTrackTransform]);

  // Native touch listeners for mobile sliding track (disabled for single image)
  useEffect(() => {
    const container = mobileTrackRef.current?.parentElement;
    if (!container || !hasSlideshow || isSingleSlide) return;

    type GestureState = {
      startX: number; startY: number; dx: number;
      locked: "none" | "horizontal" | "vertical";
      currentIdx: number;
    };
    let g: GestureState | null = null;

    const onStart = (e: TouchEvent) => {
      stopAutoAdvance();
      const t = e.touches[0];
      g = { startX: t.clientX, startY: t.clientY, dx: 0, locked: "none", currentIdx: slideIndexRef.current };
    };

    const onMove = (e: TouchEvent) => {
      if (!g) return;
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      if (g.locked === "none") {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        g.locked = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
      }
      if (g.locked === "vertical") return;
      e.preventDefault();
      g.dx = dx;
      const atStart = g.currentIdx === 0 && dx > 0;
      const atEnd = g.currentIdx === slides.length - 1 && dx < 0;
      applyMobileTrackTransform((atStart || atEnd) ? dx * 0.25 : dx, g.currentIdx, false);
    };

    const onEnd = () => {
      if (!g) { startAutoAdvance(); return; }
      // Genuine tap (no significant movement) → open gallery
      if (g.locked === "none" && Math.abs(g.dx) < 10) {
        g = null;
        startAutoAdvance();
        void hapticLight();
        setShowGalleryLoader(true);
        router.push(galleryHref);
        return;
      }
      if (g.locked !== "horizontal") { g = null; startAutoAdvance(); return; }
      const dx = g.dx;
      let next = g.currentIdx;
      if (dx < -50 && g.currentIdx < slides.length - 1) next = g.currentIdx + 1;
      else if (dx > 50 && g.currentIdx > 0) next = g.currentIdx - 1;
      g = null;
      applyMobileTrackTransform(0, next, true);
      slideIndexRef.current = next;
      setSlideIndex(next);
      startAutoAdvance();
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
    };
  }, [hasSlideshow, isSingleSlide, slides.length, applyMobileTrackTransform, galleryHref]); // eslint-disable-line react-hooks/exhaustive-deps

  // For single-photo mode keep old loaded state; for slideshow track per slide
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(true);
  const [showGalleryLoader, setShowGalleryLoader] = useState(false);
  const [slidePressed, setSlidePressed] = useState(false);

  const heroRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const mobileSlideRef = useRef<HTMLDivElement | null>(null);
  const mobileFadeRef = useRef<HTMLDivElement | null>(null);

  // Mobile: fade slideshow to white as content scrolls over it
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 768) return;

    const onScroll = () => {
      const slide = mobileSlideRef.current;
      const fade = mobileFadeRef.current;
      if (!slide || !fade) return;

      // The slide is `sticky top-0`, so getBoundingClientRect().top is always 0 once stuck.
      // Use offsetTop from the document root to get its original resting position.
      const slideH = slide.offsetHeight;
      let slideTopAbs = 0;
      let el: HTMLElement | null = slide;
      while (el) { slideTopAbs += el.offsetTop; el = el.offsetParent as HTMLElement | null; }

      const fadeStart = slideH * 0.2;
      const fadeEnd = slideH * 0.85;
      const scrolledPast = window.scrollY - slideTopAbs;
      const opacity = Math.min(1, Math.max(0, (scrolledPast - fadeStart) / (fadeEnd - fadeStart)));
      fade.style.opacity = String(opacity);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
  const [isSaved, setIsSaved] = useState(false);
  const { userId } = useAuthUserId();

  useEffect(() => {
    if (!userId || !site.id) return;
    getListsContainingSite(site.id).then((lists) => {
      setIsSaved(Array.isArray(lists) && lists.length > 0);
    }).catch(() => {});
  }, [userId, site.id]);

  const lat = site.latitude != null ? Number(site.latitude) : null;
  const lng = site.longitude != null ? Number(site.longitude) : null;
  const mapsLink =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

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
      <section aria-label="Hero" className="block md:hidden bg-[#f8f8f8]">
        {slides.length > 0 ? (
          <div
            ref={mobileSlideRef}
            className="sticky top-0 z-0 relative w-full bg-black overflow-hidden"
            style={{ minHeight: 440, height: "120vw", maxHeight: 580, ...(isSingleSlide ? { cursor: "pointer" } : {}) }}
            onClick={isSingleSlide ? () => { void hapticLight(); setShowGalleryLoader(true); router.push(galleryHref); } : undefined}
          >
            {/* White fade overlay — animates on scroll */}
            <div ref={mobileFadeRef} className="absolute inset-0 z-20 pointer-events-none bg-[#f8f8f8]" style={{ opacity: 0 }} />

            {/* Dots loader while first image loads */}
            {showSpinner && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <Spinner variant="dots" size={120} />
              </div>
            )}

            {/* Dots loader on tap → gallery transition */}
            {showGalleryLoader && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.55))" }}>
                  <Spinner variant="dots" size={220} color="white" />
                </div>
              </div>
            )}

            {/* Tap-to-open-gallery: handled via onClick on the container div below
                (we track swipe distance and only navigate on genuine taps) */}

            {/* Sliding track */}
            <div
              ref={mobileTrackRef}
              className="flex h-full"
              style={{
                width: slides.length > 1 ? `${slides.length * 100}%` : "100%",
                willChange: "transform",
              }}
            >
              {slides.map((slide, i) => {
                const slideBlurDataURL = slide.blurDataURL ?? undefined;
                const slideBlurhash = slide.blurhash ?? null;
                const slideW = slide.width ?? null;
                const slideH = slide.height ?? null;
                return (
                  <div
                    key={slide.url + i}
                    className="relative h-full flex-shrink-0 overflow-hidden"
                    style={{ width: slides.length > 1 ? `${100 / slides.length}%` : "100%" }}
                  >
                    {slideBlurDataURL && (
                      <img
                        src={slideBlurDataURL}
                        alt=""
                        className={`absolute inset-0 w-full h-full object-cover blur-lg scale-105 transition-opacity duration-700 ${heroLoaded ? "opacity-0" : "opacity-100"}`}
                        draggable={false}
                      />
                    )}
                    {!slideBlurDataURL && slideBlurhash && slideW && slideH && (
                      <div className={`absolute inset-0 blur-lg scale-105 transition-opacity duration-700 ${heroLoaded ? "opacity-0" : "opacity-100"}`}>
                        <BlurhashImage hash={slideBlurhash} width={slideW} height={slideH} />
                      </div>
                    )}
                    <Image
                      src={slide.url}
                      alt={site.title}
                      width={slideW ?? 1600}
                      height={slideH ?? 900}
                      sizes="100vw"
                      priority={i === 0}
                      placeholder={slide.blurDataURL ? "blur" : "empty"}
                      blurDataURL={slide.blurDataURL ?? undefined}
                      unoptimized
                      className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ${heroLoaded ? "opacity-100" : "opacity-0"}`}
                      style={{ transform: "scale(1.078)", transformOrigin: "top center" }}
                      draggable={false}
                      onLoadingComplete={i === 0 ? handleHeroLoadComplete : undefined}
                    />
                  </div>
                );
              })}
            </div>

            {/* Pill dot indicators */}
            {hasSlideshow && (
              <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                {slides.map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-full transition-all duration-300 ${i === slideIndex ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/40"}`}
                  />
                ))}
              </div>
            )}

            {/* Photo count badge — bottom right, total gallery count */}
            {(galleryCount != null && galleryCount > 0) && (
              <button
                type="button"
                aria-label={`View all ${galleryCount} photos`}
                className="absolute bottom-7 right-3 z-10 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-2.5 active:bg-black/70 active:scale-95 transition-transform duration-100"
                onClick={() => { void hapticLight(); setShowGalleryLoader(true); router.push(galleryHref); }}
              >
                <Icon name="images" size={17} className="text-white/90 shrink-0" />
                <span className="text-white text-[14px] font-medium leading-none">
                  {galleryCount}
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="w-full bg-gray-200" style={{ minHeight: 440, height: "120vw", maxHeight: 580 }} />
        )}

        {/* Info block — overlaps hero with rounded top corners, slides over sticky hero */}
        <div
          className="relative bg-white rounded-t-3xl -mt-5 px-4 pt-5 pb-5 space-y-2 z-10"
          style={{ boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" }}
        >
          {/* Heritage Type pill — above title */}
          {site.heritage_type && (
            <div className="pb-0.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold text-[var(--brand-orange)] bg-[var(--brand-orange)]/10">
                <Icon name={getHeritageIcon(site.heritage_type)} size={11} className="text-[var(--brand-orange)]" />
                {site.heritage_type}
              </span>
            </div>
          )}

          <div className="flex items-start justify-between gap-2">
            <h1 className="font-hero-title text-3xl leading-tight text-black font-black flex-1">
              {site.title}
            </h1>
            <button
              type="button"
              onClick={() => { void hapticLight(); setShowWishlistModal(true); }}
              className={[
                "shrink-0 mt-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors",
                isSaved
                  ? "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] border border-[var(--brand-orange)]/30"
                  : "bg-gray-100 text-gray-600 border border-transparent",
              ].join(" ")}
              aria-label={isSaved ? "Saved to list" : "Save to list"}
            >
              <Icon name="heart" size={13} className={isSaved ? "text-[var(--brand-orange)]" : "text-gray-400"} />
              {isSaved ? "Saved" : "Save"}
            </button>
          </div>

          {/* Location — tappable, scrolls to map */}
          {site.location_free && (
            <button
              type="button"
              onClick={() => scrollToSection(["location"])}
              className="flex items-center gap-1.5 text-[14px] text-slate-500 active:text-[var(--brand-blue)] text-left"
            >
              <Icon name="map-pin-light" size={21} className="text-slate-400 shrink-0 self-center" />
              <span>{site.location_free}</span>
            </button>
          )}

          {/* Rating — amber pill + tappable row scrolls to reviews */}
          {hasRatingInfo && (
            <button
              type="button"
              onClick={() => scrollToSection(["reviews"])}
              className="flex items-center gap-2 pt-0.5 active:opacity-70"
            >
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className="text-[18px]"
                    style={{ color: i < filled ? "#f59e0b" : "#cbd5e1" }}
                  >
                    ★
                  </span>
                ))}
              </div>
              <span
                className="inline-flex items-center text-white text-[12px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "#f59e0b" }}
              >
                {site.avg_rating?.toFixed(1)}
              </span>
              <span className="text-[13px] text-slate-500">
                {site.review_count
                  ? `${site.review_count} review${site.review_count !== 1 ? "s" : ""}`
                  : "No reviews yet"}
              </span>
            </button>
          )}

          {site.tagline && (
            <div className="flex items-start gap-2 pt-1">
              <Icon name="book-open-text-light" size={21} className="text-slate-400 shrink-0 mt-[2px]" />
              <p className="text-[14px] leading-relaxed text-slate-500 italic">
                {site.tagline}
              </p>
            </div>
          )}
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
        <div className="absolute inset-0 pointer-events-none">
          {slides.length > 0 ? (
            <>
              {showSpinner && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <Spinner variant="dots" size={120} />
                </div>
              )}

              {/* Crossfade layers — one per slide */}
              {slides.map((slide, i) => {
                const isActive = i === slideIndex;
                const slideBlurDataURL = slide.blurDataURL ?? undefined;
                const slideBlurhash = slide.blurhash ?? null;
                const slideW = slide.width ?? null;
                const slideH = slide.height ?? null;
                return (
                  <div
                    key={slide.url + i}
                    className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${isActive ? "opacity-100 z-[2]" : "opacity-0 z-[1]"}`}
                  >
                    {slideBlurDataURL && (
                      <img
                        src={slideBlurDataURL}
                        alt=""
                        className={`absolute inset-0 w-full h-full object-cover object-top blur-lg scale-105 transition-opacity duration-700 ${
                          heroLoaded ? "opacity-0" : "opacity-100"
                        }`}
                        draggable={false}
                      />
                    )}
                    {!slideBlurDataURL && slideBlurhash && slideW && slideH && (
                      <div
                        className={`absolute inset-0 blur-lg scale-105 transition-opacity duration-700 ${
                          heroLoaded ? "opacity-0" : "opacity-100"
                        }`}
                      >
                        <BlurhashImage hash={slideBlurhash} width={slideW} height={slideH} />
                      </div>
                    )}
                    <Image
                      src={slide.url}
                      alt={site.title}
                      fill
                      sizes="100vw"
                      priority={false}
                      loading={i === 0 ? "eager" : "lazy"}
                      placeholder="empty"
                      unoptimized
                      className={`object-cover object-top transition-opacity duration-700 ${
                        heroLoaded ? "opacity-100" : "opacity-0"
                      }`}
                      draggable={false}
                      onLoadingComplete={i === 0 ? handleHeroLoadComplete : undefined}
                    />
                  </div>
                );
              })}
            </>
          ) : (
            <div className="w-full h-full bg-gray-200" />
          )}
        </div>

        {/* DOT INDICATORS — desktop slideshow */}
        {hasSlideshow && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[4] flex gap-2.5 pointer-events-auto">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSlideIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === slideIndex ? "true" : undefined}
                className={`rounded-full transition-all duration-300 ${
                  i === slideIndex
                    ? "h-3 w-3 bg-white shadow-md"
                    : "h-2.5 w-2.5 bg-white/50 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        )}

        {/* 1) DARK READABILITY GRADIENT */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[35%] z-[3]"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.65) 25%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* 2) PIXEL-CONTROLLED BLUR WITH FADED MASK */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] z-[3]"
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
          className={`absolute inset-0 flex items-end hero-overlay pointer-events-none z-[3] ${
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
              className="absolute z-10 left-[54px] md:left-[66px] lg:left-[82px] hero-left-meta-stack pointer-events-auto"
              style={{ top: leftMetaTop }}
            >
              {(site.heritage_type || site.location_free) && (
                <div className="hero-heritage-type-left">
                  <div className="hero-heritage-type-main hero-info-combined-main">
                    {site.heritage_type && (
                      <div className="hero-info-block">
                        <div className="hero-heritage-type-label">Heritage Type</div>
                        <div className="hero-heritage-type-value">
                          <Icon
                            name={getHeritageIcon(site.heritage_type)}
                            className="text-white/75"
                          />
                          <span>{site.heritage_type}</span>
                        </div>
                      </div>
                    )}
                    {site.location_free && (
                      <div
                        className={`hero-info-block${
                          site.heritage_type ? " hero-info-block--with-divider" : ""
                        }`}
                      >
                        <div className="hero-heritage-type-label">Location</div>
                        <div className="hero-heritage-type-value">
                          <Icon name="map-marker-alt" className="text-white/75" />
                          <span>{site.location_free}</span>
                        </div>
                      </div>
                    )}
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
                    <Icon name="adminmap" size={22} />
                  </span>
                  <span className="hero-action-label">Open in Maps</span>
                </a>
              ) : null}
            </div>
          )}

          <div className="w-full pb-8 md:pb-10 lg:pb-12 grid grid-cols-1 md:grid-cols-[minmax(0,1.65fr)_minmax(0,0.35fr)] md:items-end gap-6 pl-[54px] pr-[24px] md:pl-[66px] md:pr-[36px] lg:pl-[82px] lg:pr-[48px] max-w-screen-2xl mx-auto pointer-events-auto">
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
                    <Icon name="line-segments-light" size={18} />
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
            background: var(--brand-orange);
            color: #ffffff;
            border-color: var(--brand-orange);
          }

          .hero-action-btn--primary:hover {
            background: var(--brand-orange);
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

          .hero-left-maps-btn {
            align-self: center;
            min-width: 176px;
            padding: 8px 14px;
            font-size: 13px;
            background: var(--brand-blue);
            border-color: var(--brand-blue);
          }

          .hero-left-maps-btn:hover {
            background: var(--brand-blue);
            border-color: var(--brand-blue);
          }

          .hero-left-maps-btn .hero-action-icon {
            width: 22px;
            height: 22px;
          }

          .hero-heritage-type-main {
            padding: 9px 14px 10px;
            min-width: 0;
          }

          .hero-info-combined-main {
            width: 100%;
          }

          .hero-info-block + .hero-info-block {
            margin-top: 8px;
          }

          .hero-info-block--with-divider {
            padding-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.22);
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
          onClose={() => {
            setShowWishlistModal(false);
            if (userId && site.id) {
              getListsContainingSite(site.id).then((lists) => {
                setIsSaved(Array.isArray(lists) && lists.length > 0);
              }).catch(() => {});
            }
          }}
          site={{
            name: site.title,
            imageUrl: heroUrl ?? undefined,
            location: site.location_free ?? undefined,
          }}
        />
      )}
    </>
  );
}
