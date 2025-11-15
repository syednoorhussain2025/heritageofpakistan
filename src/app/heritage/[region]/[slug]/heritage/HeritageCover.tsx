"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { decode } from "blurhash";

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
    categories_heritage_type?: { id: string; name: string; icon_key?: string | null }[] | null;
    cover?: {
      url: string | null;
      width?: number | null;
      height?: number | null;
      blurhash?: string | null;
      blurDataURL?: string | null;
    } | null;
  };
  hasPhotoStory: boolean;
  fadeImage?: boolean;
}) {
  const HEADER_FALLBACK_PX = 72;

  const cover = site.cover ?? null;
  const heroUrl = cover?.url ?? null;

  const activeBlurDataURL = cover?.blurDataURL ?? undefined;
  const activeBlurhash = cover?.blurhash ?? null;
  const activeWidth = cover?.width ?? null;
  const activeHeight = cover?.height ?? null;

  const hasBlurDataURL = !!activeBlurDataURL;
  const hasBlurhashFallback =
    !!activeBlurhash && !!activeWidth && !!activeHeight;

  const shouldFade = fadeImage && !hasBlurDataURL && !!heroUrl;
  const [imgLoaded, setImgLoaded] = useState(!shouldFade);
  const heroRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
    <section
      ref={heroRef}
      aria-label="Hero"
      style={{
        marginTop: `calc(-1 * (var(--header-offset, var(--header-height, ${HEADER_FALLBACK_PX}px))))`,
        height: `calc(94svh + (var(--header-offset, var(--header-height, ${HEADER_FALLBACK_PX}px))))`,
      }}
      className="relative w-full overflow-hidden"
    >
      {/* IMAGE */}
      <div className="absolute inset-0">
        {heroUrl ? (
          <>
            {!hasBlurDataURL &&
              hasBlurhashFallback &&
              activeWidth &&
              activeHeight && (
                <BlurhashImage
                  hash={activeBlurhash!}
                  width={activeWidth}
                  height={activeHeight}
                />
              )}
            <Image
              src={heroUrl}
              alt={site.title}
              fill
              priority
              quality={90}
              placeholder={hasBlurDataURL ? "blur" : "empty"}
              blurDataURL={activeBlurDataURL}
              className={[
                "object-cover object-top transition-opacity duration-700",
                shouldFade
                  ? imgLoaded
                    ? "opacity-100"
                    : "opacity-0"
                  : "opacity-100",
              ].join(" ")}
              draggable={false}
              onLoad={() => shouldFade && setImgLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-full bg-gray-200" />
        )}
      </div>

      {/* DARK + BLUR LAYERS */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%]"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.65) 25%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%]"
        style={{
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
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
        {/* RATING */}
        {(site.avg_rating != null || site.review_count != null) && (
          <div
            className="absolute z-10 flex items-center gap-3 text-white bg-black/45 rounded-full px-4 py-2 shadow-lg"
            style={{
              top: `calc(var(--header-offset, var(--header-height, ${HEADER_FALLBACK_PX}px)) + 12px)`,
              right: "min(24px, 4vw)",
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

        <div className="w-full pb-8 md:pb-10 lg:pb-12 grid grid-cols-1 md:grid-cols-2 gap-6 pl-[54px] pr-[24px] md:pl-[82px] md:pr-[36px] lg:pl-[109px] lg:pr-[48px] max-w-screen-2xl mx-auto">

          {/* LEFT */}
          <div className="text-white hero-left">
            <h1 className="font-hero-title text-4xl md:text-5xl lg:text-6xl leading-tight">
              {site.title}
            </h1>

            {site.tagline && (
              <p className="mt-4 max-w-2xl font-hero-tagline">{site.tagline}</p>
            )}

            {/* HERITAGE CATEGORY CHIPS (added) */}
            {Array.isArray(site.categories_heritage_type) &&
              site.categories_heritage_type.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {site.categories_heritage_type.slice(0, 4).map((c) => (
                    <a
                      key={c.id}
                      href={`/explore?cats=${c.id}`}
                      className="px-4 py-1.5 rounded-full border border-white/35 text-white text-sm font-medium
                                 hover:bg-white/15 hover:border-white/60 transition-colors duration-200
                                 flex items-center gap-1.5 backdrop-blur-sm"
                    >
                      {c.icon_key && (
                        <Icon
                          name={c.icon_key}
                          className="text-white/70 text-[14px]"
                        />
                      )}
                      {c.name}
                    </a>
                  ))}
                </div>
              )}
          </div>

          {/* RIGHT */}
          <div className="text-white flex flex-col items-start gap-4 hero-right text-left justify-self-end -translate-x-24 translate-y-6">
            {hasPhotoStory && (
              <a
                href={`/heritage/${site.province_slug}/${site.slug}/photo-story`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white font-medium shadow-lg"
                style={{ background: "var(--brand-orange, #F78300)" }}
              >
                <Icon name="play" className="text-white text-lg" />
                <span>Photo Story</span>
              </a>
            )}

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
                <div className="uppercase text-white/80 text-xs">Location</div>
                <div className="flex items-center gap-1.5 font-semibold text-base md:text-lg">
                  <Icon name="map-marker-alt" className="text-white/60" />
                  <span>{site.location_free}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STYLES */}
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
      `}</style>
    </section>
  );
}
