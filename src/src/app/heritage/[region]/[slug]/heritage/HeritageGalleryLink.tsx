import HeritageSection from "./HeritageSection";
import { ImageRow } from "./heritagedata";
import Icon from "@/components/Icon";
import React from "react";

export default function HeritageGalleryLink({
  provinceSlug, // NEW: pass province/region slug when you have it
  siteSlug,
  gallery,
  hasPhotoStory = true,
  /** Optional explicit cover for Photo Story; falls back to first gallery image */
  storyCoverUrl,
}: {
  provinceSlug?: string | null;
  siteSlug: string;
  gallery: ImageRow[];
  hasPhotoStory?: boolean;
  storyCoverUrl?: string | null;
}) {
  const galleryHasImages = gallery && gallery.length > 0;
  const storyCover =
    storyCoverUrl ?? (galleryHasImages ? gallery[0]?.publicUrl ?? null : null);

  // Fallback: derive province slug from current URL if not passed
  const derivedProvince = React.useMemo(() => {
    if (provinceSlug) return provinceSlug;
    if (typeof window === "undefined") return null;
    const parts = window.location.pathname.split("/").filter(Boolean);
    // expect: /heritage/<province>/<slug>(/…)
    const idx = parts.indexOf("heritage");
    if (idx >= 0 && parts.length > idx + 1) return parts[idx + 1] || null;
    return null;
  }, [provinceSlug]);

  // Build routes safely
  const galleryHref = derivedProvince
    ? `/heritage/${derivedProvince}/${siteSlug}/gallery`
    : `/heritage/${siteSlug}/gallery`; // last-resort fallback

  const storyHref = derivedProvince
    ? `/heritage/${derivedProvince}/${siteSlug}/photo-story`
    : `/heritage/${siteSlug}/photo-story`; // last-resort fallback

  // mount flag to avoid SSR mismatch and to trigger entrance animation
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Shared card header (icon + title + subtitle + optional right icon)
  const CardHeader = ({
    icon,
    title,
    subtitle,
    rightIcon,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    rightIcon?: string;
  }) => (
    <div className="p-4 sm:p-5 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Icon
            name={icon}
            className="text-[var(--brand-orange,#F78300)] text-lg"
          />
          <h3
            className="text-base sm:text-lg font-semibold"
            style={{
              color: "var(--brand-blue, #1f6be0)",
              fontFamily: "var(--font-article-heading, inherit)",
            }}
          >
            {title}
          </h3>
        </div>
        {subtitle && (
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {rightIcon && <Icon name={rightIcon} className="text-xl text-black/40" />}
    </div>
  );

  return (
    // No outer white wrapper and no outer section heading; inner cards provide headers
    <HeritageSection id="gallery" noFrame hideHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* --------- Card: Photo Gallery (1st, earlier delay) --------- */}
        <div
          className={[
            "rounded-2xl border border-black/5 bg-white shadow-sm overflow-hidden",
            "card-enter",
            mounted ? "card-enter--in" : "",
          ].join(" ")}
          style={{ animationDelay: mounted ? "120ms" : undefined }}
        >
          <CardHeader
            icon="gallery" // keep your prior gallery icon
            title="Photo Gallery"
            subtitle="Browse all uploaded photos"
            rightIcon="chevron-right"
          />

          <div className="px-4 sm:px-5 pb-4">
            {galleryHasImages ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {gallery.slice(0, 6).map((img) => (
                  <figure
                    key={img.id}
                    className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100"
                    title={img.caption || undefined}
                  >
                    {img.publicUrl ? (
                      <img
                        src={img.publicUrl}
                        alt={img.alt_text || ""}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0" />
                    )}
                  </figure>
                ))}
              </div>
            ) : (
              <div
                className="text-[13px]"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                No photos uploaded yet.
              </div>
            )}

            <div className="mt-4">
              <a
                href={galleryHref}
                className={[
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                  galleryHasImages
                    ? "bg-black text-white hover:opacity-90"
                    : "bg-black/10 text-black/50 pointer-events-none",
                ].join(" ")}
              >
                <Icon name="gallery" className="text-current" />
                Open Photo Gallery
              </a>
            </div>
          </div>
        </div>

        {/* --------- Card: Photo Story (2nd, later delay) --------- */}
        <div
          className={[
            "rounded-2xl border border-black/5 bg-white shadow-sm overflow-hidden",
            "card-enter",
            mounted ? "card-enter--in" : "",
          ].join(" ")}
          style={{ animationDelay: mounted ? "280ms" : undefined }}
        >
          <CardHeader
            icon="play"
            title="Photo Story"
            subtitle="A curated, cinematic sequence of highlights"
            rightIcon="chevron-right"
          />

          <div className="px-4 sm:px-5 pb-4">
            {hasPhotoStory ? (
              <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-gray-100">
                {storyCover ? (
                  <img
                    src={storyCover}
                    alt="Photo story cover"
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0" />
                )}

                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white/90 backdrop-blur-sm">
                    <Icon name="play" className="text-xl text-black/80" />
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="text-[13px]"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                Photo story coming soon.
              </div>
            )}

            <div className="mt-4">
              <a
                href={storyHref}
                className={[
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                  hasPhotoStory
                    ? "text-white"
                    : "pointer-events-none text-white/60",
                ].join(" ")}
                style={{ background: "var(--brand-orange, #F78300)" }}
              >
                <Icon name="play" className="text-current" />
                Open Photo Story
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Component-scoped animation styles */}
      <style jsx>{`
        @media (prefers-reduced-motion: reduce) {
          .card-enter,
          .card-enter--in {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
        .card-enter {
          /* initial state before animation */
          opacity: 0;
          transform: translateY(18px);
        }
        .card-enter--in {
          animation: cardUpFade 560ms ease-out forwards;
        }
        @keyframes cardUpFade {
          0% {
            opacity: 0;
            transform: translateY(18px);
          }
          60% {
            opacity: 1;
            transform: translateY(2px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </HeritageSection>
  );
}
