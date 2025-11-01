// src/app/heritage/[region]/[slug]/heritage/HeritageCover.tsx
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

export default function HeritageCover({
  site,
  hasPhotoStory,
  /** Optional: if true, the hero image itself will fade in after load. Off by default to preserve LCP. */
  fadeImage = false,
}: {
  site: {
    id: string;
    slug: string;
    province_slug: string; // ✅ required for new URL structure
    title: string;
    tagline?: string | null;
    cover_photo_url?: string | null;
    heritage_type?: string | null;
    location_free?: string | null;
    avg_rating?: number | null; // expected 0..5
    review_count?: number | null;
  };
  hasPhotoStory: boolean;
  fadeImage?: boolean;
}) {
  const HEADER_FALLBACK_PX = 72;

  const [mounted, setMounted] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(!fadeImage);

  const heroRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Scroll-driven graceful exit (no parallax)
  useEffect(() => {
    const hero = heroRef.current;
    const overlay = overlayRef.current;
    if (!hero || !overlay) return;

    let raf = 0;

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const h = rect.height || 1;
        const p = Math.min(1, Math.max(0, -rect.top / h)); // 0..1

        // Begin the exit halfway; finish near the end
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

  const filled = Math.max(0, Math.min(5, Math.round(site.avg_rating ?? 0)));

  /**
   * Returns an appropriate icon name based on the heritage type string.
   * @param type The heritage type from the site data.
   * @returns A string representing a Font Awesome icon name.
   */
  const getHeritageIcon = (type?: string | null): string => {
    const lowerType = type?.toLowerCase() ?? "";

    if (lowerType.includes("fort") || lowerType.includes("palace")) {
      return "chess-rook"; // Represents a castle/fortress tower
    }
    if (lowerType.includes("mosque")) {
      return "mosque";
    }
    if (lowerType.includes("temple")) {
      return "place-of-worship"; // Generic for religious sites
    }
    if (lowerType.includes("archaeological")) {
      return "archway";
    }
    if (lowerType.includes("tomb") || lowerType.includes("shrine")) {
      return "landmark"; // Good for tombs, monuments
    }

    return "landmark"; // Default for everything else
  };

  return (
    <section
      ref={heroRef}
      aria-label="Hero"
      style={{
        marginTop: `calc(-1 * (var(--header-offset, var(--header-height, ${HEADER_FALLBACK_PX}px))))`,
        height: `calc(100svh + (var(--header-offset, var(--header-height, ${HEADER_FALLBACK_PX}px))))`,
      }}
      className="relative w-full overflow-hidden"
    >
      {/* Hero image (no parallax) */}
      {site.cover_photo_url ? (
        <Image
          src={site.cover_photo_url}
          alt={site.title}
          fill
          priority
          quality={90}
          className={[
            "object-cover object-top",
            fadeImage ? "hero-fade-img" : "",
            imgLoaded ? "hero-fade-img--visible" : "",
          ].join(" ")}
          draggable={false}
          onLoad={() => setImgLoaded(true)}
        />
      ) : (
        <div className="w-full h-full bg-gray-200" />
      )}

      {/* Dark gradient for bottom 25% */}
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Overlay content (fade only on scroll) */}
      <div
        ref={overlayRef}
        className={`absolute inset-0 flex items-end hero-overlay ${
          mounted ? "blocks-in" : ""
        }`}
      >
        {/* Asymmetric padding + justify-self-end pushes the right block closer to the edge */}
        <div className="w-full pb-14 md:pb-20 lg:pb-24 grid grid-cols-1 md:grid-cols-2 gap-6 pl-[54px] pr-[24px] md:pl-[82px] md:pr-[36px] lg:pl-[109px] lg:pr-[48px] max-w-screen-2xl mx-auto">
          {/* Left: title, ratings, tagline, and now Photo Story button */}
          <div className="text-white hero-left">
            <h1 className="font-hero-title">{site.title}</h1>

            {/* Rating block directly below title */}
            {(site.avg_rating != null || site.review_count != null) && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {/* Visual stars (5 total) — bigger & brighter */}
                <div className="flex items-center gap-1" aria-label="rating">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={
                        i < filled
                          ? "rating-star--filled text-[28px] md:text-[30px] leading-none"
                          : "text-white/60 text-[28px] md:text-[30px] leading-none"
                      }
                    >
                      ★
                    </span>
                  ))}
                </div>
                {/* Numeric + count — bigger */}
                <span className="text-base md:text-lg font-medium">
                  {site.avg_rating != null ? site.avg_rating.toFixed(1) : ""}
                  {site.review_count != null
                    ? ` • ${site.review_count} review${
                        site.review_count === 1 ? "" : "s"
                      }`
                    : ""}
                </span>
              </div>
            )}

            {site.tagline && (
              <p className="mt-3 max-w-2xl font-hero-tagline">{site.tagline}</p>
            )}

            {hasPhotoStory && (
              <a
                href={`/heritage/${site.province_slug}/${site.slug}/photo-story`} // ✅ new route
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white font-medium shadow-lg transition-colors self-start"
                style={{
                  background: "var(--brand-orange, #F78300)",
                }}
              >
                <Icon name="play" className="text-white text-lg" />
                <span>Photo Story</span>
              </a>
            )}
          </div>

          {/* Right: details block (shifted) */}
          <div className="text-white flex flex-col items-start gap-3 hero-right text-left justify-self-end translate-y-40 -translate-x-24">
            {site.heritage_type && (
              <div>
                <div className="uppercase tracking-wide text-white/80 text-xs">
                  Heritage Type
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-base md:text-lg">
                  <Icon
                    name={getHeritageIcon(site.heritage_type)}
                    className="text-white/60 text-base"
                  />
                  <span>{site.heritage_type}</span>
                </div>
              </div>
            )}

            {site.location_free && (
              <div>
                <div className="uppercase tracking-wide text-white/80 text-xs">
                  Location
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-base md:text-lg">
                  <Icon
                    name="map-marker-alt"
                    className="text-white/60 text-base"
                  />
                  <span>{site.location_free}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Component-scoped animations & transforms */}
      <style jsx>{`
        /* ---------------- Accessibility ---------------- */
        @media (prefers-reduced-motion: reduce) {
          .hero-fade-img,
          .hero-overlay,
          .hero-left,
          .hero-right {
            animation: none !important;
            transition: none !important;
            transform: none !important;
          }
        }

        /* ---------------- Main overlay and block animations ---------------- */
        .hero-overlay {
          --exit: 0;
          opacity: calc(1 - var(--exit)); /* This handles the scroll fade */
          will-change: opacity;
        }

        .hero-left,
        .hero-right {
          /* Define initial (pre-mount) state */
          opacity: 0;
          will-change: transform, opacity;
        }

        .hero-left {
          --initial-tx: -32px; /* Start off-screen to the left */
          transform: translateX(
            var(--initial-tx)
          ); /* Removed scroll movement */
          transition: opacity 600ms ease-out 150ms,
            transform 600ms ease-out 150ms;
        }

        .hero-right {
          --initial-tx: 32px; /* Start off-screen to the right */
          transform: translateX(
            var(--initial-tx)
          ); /* Removed scroll movement */
          transition: opacity 600ms ease-out 250ms,
            transform 600ms ease-out 250ms;
        }

        /* On mount, transition to the final state */
        .hero-overlay.blocks-in .hero-left,
        .hero-overlay.blocks-in .hero-right {
          --initial-tx: 0px; /* Slide to final position */
          opacity: 1;
        }

        /* Optional: hero image fade after load (keep off for best LCP) */
        .hero-fade-img {
          opacity: 0;
          transition: opacity 500ms ease-out;
          will-change: opacity;
        }
        .hero-fade-img--visible {
          opacity: 1;
        }

        /* Brighter star color (fallback to #FFC107 amber) */
        .rating-star--filled {
          color: var(--brand-amber, #ffc107);
        }
      `}</style>
    </section>
  );
}
