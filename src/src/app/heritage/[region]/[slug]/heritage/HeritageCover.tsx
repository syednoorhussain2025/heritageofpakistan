"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

type HeroCover = {
  url: string | null;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;      // still allowed, but not used here
  blurDataURL?: string | null;   // ✅ server-computed blur image
  caption?: string | null;
  credit?: string | null;
} | null;

export default function HeritageCover({
  site,
  hasPhotoStory,
  fadeImage = false,
}: {
  site: {
    id: string;
    slug: string;
    province_slug: string;
    title: string;
    tagline?: string | null;
    heritage_type?: string | null;
    location_free?: string | null;
    avg_rating?: number | null;
    review_count?: number | null;
    cover?: HeroCover;
  };
  hasPhotoStory: boolean;
  fadeImage?: boolean;
}) {
  const HEADER_FALLBACK_PX = 72;

  const [mounted, setMounted] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(!fadeImage);

  const heroRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  /* Fade-in on mount for overlay blocks */
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /* Scroll fade of overlay */
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

  const filled = Math.max(0, Math.min(5, Math.round(site.avg_rating ?? 0)));

  /* Heritage type → icon selector */
  const getHeritageIcon = (type?: string | null) => {
    const t = type?.toLowerCase() ?? "";
    if (t.includes("fort") || t.includes("palace")) return "chess-rook";
    if (t.includes("mosque")) return "mosque";
    if (t.includes("temple")) return "place-of-worship";
    if (t.includes("archaeological")) return "archway";
    if (t.includes("tomb") || t.includes("shrine")) return "landmark";
    return "landmark";
  };

  const cover = site.cover;

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
      {/* =================== Background Image =================== */}
      <div className="absolute inset-0 bg-gray-200">
        {cover?.url ? (
          <Image
            src={cover.url}
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
            // ✅ This is what makes the blur show instantly
            placeholder={cover.blurDataURL ? "blur" : "empty"}
            blurDataURL={cover.blurDataURL || undefined}
            onLoadingComplete={() => setImgLoaded(true)}
          />
        ) : (
          <div className="w-full h-full bg-gray-200" />
        )}
      </div>

      {/* Gradient at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* =================== Overlay Content =================== */}
      <div
        ref={overlayRef}
        className={`absolute inset-0 flex items-end hero-overlay ${
          mounted ? "blocks-in" : ""
        }`}
      >
        <div className="w-full pb-14 md:pb-20 lg:pb-24 grid grid-cols-1 md:grid-cols-2 gap-6 pl-[54px] pr-[24px] md:pl-[82px] md:pr-[36px] lg:pl-[109px] lg:pr-[48px] max-w-screen-2xl mx-auto">
          {/* LEFT CONTENT */}
          <div className="text-white hero-left">
            <h1 className="font-hero-title">{site.title}</h1>

            {(site.avg_rating != null || site.review_count != null) && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {/* Visual stars */}
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

                {/* Numeric + count with null-safe logic */}
                <span className="text-base md:text-lg font-medium">
                  {site.avg_rating != null
                    ? site.avg_rating.toFixed(1)
                    : undefined}
                  {site.avg_rating != null && site.review_count != null
                    ? " • "
                    : ""}
                  {site.review_count != null
                    ? `${site.review_count} review${
                        site.review_count === 1 ? "" : "s"
                      }`
                    : ""}
                </span>
              </div>
            )}

            {site.tagline && (
              <p className="mt-3 max-w-2xl font-hero-tagline">
                {site.tagline}
              </p>
            )}

            {hasPhotoStory && (
              <a
                href={`/heritage/${site.province_slug}/${site.slug}/photo-story`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white font-medium shadow-lg"
                style={{ background: "var(--brand-orange, #F78300)" }}
              >
                <Icon name="play" className="text-white text-lg" />
                <span>Photo Story</span>
              </a>
            )}
          </div>

          {/* RIGHT SIDE INFO */}
          <div className="text-white flex flex-col items-start gap-3 hero-right text-left justify-self-end translate-y-40 -translate-x-24">
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

      {/* CSS */}
      <style jsx>{`
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
          --initial-tx: 0px;
          opacity: 1;
        }

        .hero-fade-img {
          opacity: 0;
          transition: opacity 500ms ease-out;
        }
        .hero-fade-img--visible {
          opacity: 1;
        }

        .rating-star--filled {
          color: var(--brand-amber, #ffc107);
        }
      `}</style>
    </section>
  );
}
