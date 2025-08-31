"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { storagePublicUrl } from "@/lib/image/storagePublicUrl";
import { avatarSrc } from "@/lib/image/avatarSrc";
import { motion } from "framer-motion";

/* —— Universal Lightbox —— */
import { Lightbox } from "@/components/ui/Lightbox";
import type { LightboxPhoto } from "@/types/lightbox";

type PortfolioLayout = "grid" | "masonry";

type UserProfile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  badge: string | null;
  username: string | null;
  portfolio_theme?: "light" | "dark";
  portfolio_layout?: PortfolioLayout | null;
};

type PortfolioRow = {
  photo_id: string;
  order_index: number;
};

type ReviewPhotoRow = {
  id: string;
  review_id: string;
  storage_path: string;
  caption: string | null;
  width?: number | null;
  height?: number | null;
};

type ReviewRow = {
  id: string;
  site_id: string;
};

type SiteRow = {
  id: string;
  title: string;
  slug: string;
  location_free?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function PortfolioHeader({ profile }: { profile: UserProfile | null }) {
  const isDark = profile?.portfolio_theme === "dark";
  const themeClasses = isDark
    ? "bg-black/80 text-white backdrop-blur-sm"
    : "bg-white/80 text-black backdrop-blur-sm";
  return (
    <header
      className={`fixed top-0 left-0 right-0 z-20 h-16 flex items-center justify-between px-6 md:px-10 shadow-md ${themeClasses}`}
    >
      <div className="font-bold text-lg">Heritage of Pakistan</div>
      {profile?.full_name && (
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-full overflow-hidden">
            <Image
              src={avatarSrc(profile.avatar_url) || "/default-avatar.png"}
              alt="User avatar"
              fill
              className="object-cover"
            />
          </div>
          <div className="text-sm md:text-base font-semibold">
            {profile.full_name}&apos;s Photography Portfolio
          </div>
        </div>
      )}
    </header>
  );
}

/* ---------- Row-major masonry helpers ---------- */

const ROW_PX = 8; // auto-rows size
const GAP_PX = 16; // gap-4
const CAPTION_PX = 22; // fixed caption block (single line)

const RATIO_PORTRAIT = 2 / 3; // 0.666…
const RATIO_LANDSCAPE = 4 / 3; // 1.333…

function isPortrait(p: { width?: number | null; height?: number | null }) {
  if (p.width && p.height) return p.height >= p.width;
  return false; // treat square as landscape
}

function CanonicalTile({
  p,
  i,
  isDark,
  onOpen,
}: {
  p: {
    url: string;
    caption: string | null;
    width?: number | null;
    height?: number | null;
  };
  i: number;
  isDark: boolean;
  onOpen: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [span, setSpan] = useState(1);

  const targetRatio = isPortrait(p) ? RATIO_PORTRAIT : RATIO_LANDSCAPE; // width / height

  const recompute = useCallback(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    if (w <= 0) return;
    const imgHeight = w / targetRatio;
    const total = imgHeight + (p.caption ? CAPTION_PX : 0);
    const s = Math.ceil((total + GAP_PX) / (ROW_PX + GAP_PX));
    if (s !== span) setSpan(s);
  }, [p.caption, span, targetRatio]);

  useEffect(() => {
    const id = setTimeout(recompute, 0);
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(id);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [recompute]);

  return (
    <motion.figure
      className="rounded-lg overflow-hidden bg-white/5 cursor-zoom-in"
      style={{ gridRowEnd: `span ${span}` }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onClick={onOpen}
    >
      <div ref={containerRef}>
        <div
          className="relative w-full overflow-hidden group rounded-lg"
          style={{ aspectRatio: `${targetRatio}` }}
        >
          <Image
            src={p.url}
            alt={p.caption ?? "portfolio photo"}
            fill
            quality={85}
            sizes="(min-width:1280px) 20vw, (min-width:1024px) 25vw, (min-width:768px) 33vw, (min-width:640px) 50vw, 100vw"
            className="object-cover w-full h-full transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover:scale-110"
          />
        </div>

        {p.caption && (
          <figcaption
            className={`text-sm px-1 py-1 leading-5 ${
              isDark ? "text-gray-400" : "text-gray-700"
            } line-clamp-1`}
            style={{ height: CAPTION_PX }}
          >
            {p.caption}
          </figcaption>
        )}
      </div>
    </motion.figure>
  );
}

export default function PublicPortfolioPage() {
  const params = useParams<{ userId: string }>();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const supabase = createClient();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [photos, setPhotos] = useState<LightboxPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) {
      setPageError("Invalid portfolio URL (missing userId).");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // 1) Load portfolio owner
        const { data: profileData, error: perr } = await supabase
          .from("profiles")
          .select(
            "id, full_name, bio, avatar_url, badge, username, portfolio_theme, portfolio_layout"
          )
          .eq("id", userId)
          .single();
        if (perr) throw perr;
        const owner = profileData as UserProfile;
        setProfile(owner);

        // 2) Portfolio order
        const { data: pfRows, error: pfErr } = await supabase
          .from("user_portfolio")
          .select("photo_id, order_index")
          .eq("user_id", userId)
          .eq("is_public", true)
          .order("order_index", { ascending: true });
        if (pfErr) throw pfErr;

        const orderedPortfolio = (pfRows ?? []) as PortfolioRow[];
        if (!orderedPortfolio.length) {
          setPhotos([]);
          setLoading(false);
          return;
        }

        const photoIds = orderedPortfolio.map((r) => r.photo_id);

        // 3) review_photos (+ review_id to link to sites)
        const { data: phData, error: phErr } = await supabase
          .from("review_photos")
          .select("id, review_id, storage_path, caption, width, height")
          .in("id", photoIds);
        if (phErr) throw phErr;

        const reviewIds = Array.from(
          new Set(
            (phData ?? [])
              .map((p) => (p as ReviewPhotoRow).review_id)
              .filter(Boolean)
          )
        ) as string[];

        // 4) reviews → sites
        const { data: reviewRows, error: rErr } = await supabase
          .from("reviews")
          .select("id, site_id")
          .in("id", reviewIds);
        if (rErr) throw rErr;

        const siteIds = Array.from(
          new Set(
            (reviewRows ?? [])
              .map((r) => (r as ReviewRow).site_id)
              .filter(Boolean)
          )
        ) as string[];

        const { data: siteRows, error: sErr } = await supabase
          .from("sites")
          .select("id, title, slug, location_free, latitude, longitude")
          .in("id", siteIds);
        if (sErr) throw sErr;

        // Index helpers
        const reviewById = new Map(
          (reviewRows ?? []).map((r) => [(r as ReviewRow).id, r as ReviewRow])
        );
        const siteById = new Map(
          (siteRows ?? []).map((s) => [(s as SiteRow).id, s as SiteRow])
        );

        const authorName = owner.full_name || owner.username || "User";
        const authorProfileUrl = owner.username
          ? `/u/${owner.username}`
          : undefined;

        // 5) Shape into LightboxPhoto[], respecting portfolio order
        const photoById = new Map(
          (phData ?? []).map((p) => [
            (p as ReviewPhotoRow).id,
            p as ReviewPhotoRow,
          ])
        );

        const shaped: LightboxPhoto[] = orderedPortfolio
          .map(({ photo_id }) => {
            const ph = photoById.get(photo_id);
            if (!ph) return null;

            const rv = ph.review_id ? reviewById.get(ph.review_id) : null;
            const st = rv?.site_id ? siteById.get(rv.site_id) : null;

            const shapedPhoto: LightboxPhoto = {
              id: ph.id,
              url: storagePublicUrl("user-photos", ph.storage_path),
              storagePath: ph.storage_path,
              caption: ph.caption || null,
              // width/height are included in your LightboxPhoto type in this app;
              // if they’re optional, these assignments are still valid:
              width: ph.width ?? undefined,
              height: ph.height ?? undefined,
              isBookmarked: false, // not used here (no bookmark button)
              site: {
                id: st?.id ?? "",
                name: st?.title || "",
                location: st?.location_free || "",
                region: "",
                categories: [],
                // Use null (not undefined) to satisfy LightboxPhoto typing
                latitude: st?.latitude ?? null,
                longitude: st?.longitude ?? null,
              },
              author: {
                name: authorName,
                profileUrl: authorProfileUrl,
              },
            };

            return shapedPhoto;
          })
          .filter(Boolean) as LightboxPhoto[];

        setPhotos(shaped);
      } catch (e: any) {
        setPageError(e?.message ?? "Could not load portfolio.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, supabase]);

  const isDarkTheme = profile?.portfolio_theme === "dark";
  const themeClasses = isDarkTheme
    ? "bg-[#0F1B2A] text-gray-200"
    : "bg-gray-50 text-gray-800";
  const layout: PortfolioLayout =
    (profile?.portfolio_layout as PortfolioLayout) || "masonry";

  if (loading)
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center ${themeClasses}`}
      >
        Loading portfolio...
      </div>
    );
  if (pageError)
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center ${themeClasses}`}
      >
        Error: {pageError}
      </div>
    );

  return (
    <div className={`min-h-screen ${themeClasses}`}>
      <PortfolioHeader profile={profile} />

      <main className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto">
        {/* Profile header */}
        {profile && (
          <div className="max-w-4xl mx-auto mb-10 flex flex-col md:flex-row items-center gap-4 md:gap-6">
            <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-4 border-orange-400 shadow-lg flex-shrink-0">
              <Image
                src={avatarSrc(profile.avatar_url) || "/default-avatar.png"}
                alt="User avatar"
                fill
                className="object-cover"
              />
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-2xl md:text-3xl font-bold">
                {profile.full_name}
              </h1>
              {profile.badge && (
                <p className="mt-1 text-md font-semibold text-green-500">
                  {profile.badge}
                </p>
              )}
              {profile.bio && (
                <p
                  className={`mt-2 max-w-xl text-sm ${
                    isDarkTheme ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {profile.bio}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Photos */}
        {photos.length === 0 ? (
          <p className="text-center">
            This user hasn’t made any photos public yet.
          </p>
        ) : layout === "grid" ? (
          // Strict grid
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {photos.map((p, i) => (
              <motion.figure
                key={p.id}
                className="rounded-lg overflow-hidden bg-white/5 cursor-zoom-in"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                onClick={() => setLightboxIndex(i)}
              >
                <div className="relative w-full h-60 overflow-hidden group rounded-lg">
                  <Image
                    src={p.url}
                    alt={p.caption ?? "portfolio photo"}
                    fill
                    quality={85}
                    className="object-cover w-full h-full transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover:scale-110"
                  />
                </div>
                {p.caption && (
                  <figcaption
                    className={`text-sm px-1 mt-1 ${
                      isDarkTheme ? "text-gray-400" : "text-gray-700"
                    }`}
                  >
                    {p.caption}
                  </figcaption>
                )}
              </motion.figure>
            ))}
          </div>
        ) : (
          // Row-major masonry
          <div
            className="
            grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4
            auto-rows-[8px] grid-flow-row
          "
          >
            {photos.map((p, i) => (
              <CanonicalTile
                key={p.id}
                p={{
                  url: p.url,
                  caption: p.caption,
                  width: (p as any).width,
                  height: (p as any).height,
                }}
                i={i}
                isDark={isDarkTheme}
                onOpen={() => setLightboxIndex(i)}
              />
            ))}
          </div>
        )}
      </main>

      {/* —— Universal Lightbox —— */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          /* Intentionally NOT passing:
             - onBookmarkToggle (hides bookmark button)
             - onAddToCollection (hides collection button)
             GPS pin visibility is controlled by passing null lat/long above.
          */
        />
      )}
    </div>
  );
}
