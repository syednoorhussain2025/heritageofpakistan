"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { storagePublicUrl } from "@/lib/image/storagePublicUrl";
import { avatarSrc } from "@/lib/image/avatarSrc";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/Icon";

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

type Photo = {
  id: string;
  url: string;
  caption: string | null;
  order_index: number;
  width?: number | null;
  height?: number | null;
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

function Lightbox({
  photos,
  index,
  onClose,
  setIndex,
  isDark,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  setIndex: (n: number) => void;
  isDark: boolean;
}) {
  const photo = photos[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((index + 1) % photos.length);
      if (e.key === "ArrowLeft")
        setIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, setIndex]);

  return (
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 z-[100] ${
          isDark ? "bg-black/90" : "bg-black/85"
        } flex items-center justify-center`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white"
          onClick={onClose}
          aria-label="Close"
        >
          <Icon name="xmark" />
        </button>
        <button
          className="absolute left-2 md:left-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"
          onClick={() => setIndex((index - 1 + photos.length) % photos.length)}
          aria-label="Previous"
        >
          <Icon name="chevron-left" />
        </button>
        <div className="max-w-[95vw] max-h-[85vh]">
          <Image
            src={photo.url}
            alt={photo.caption ?? "photo"}
            width={1600}
            height={1200}
            quality={90}
            className="object-contain w-auto h-auto max-w-[95vw] max-h-[75vh] rounded-lg shadow-2xl"
          />
          {photo.caption && (
            <p className="text-center mt-3 text-sm text-gray-200">
              {photo.caption}
            </p>
          )}
        </div>
        <button
          className="absolute right-2 md:right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"
          onClick={() => setIndex((index + 1) % photos.length)}
          aria-label="Next"
        >
          <Icon name="chevron-right" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------- Row-major masonry with canonical tile sizes + faster, sharper hover ---------- */

const ROW_PX = 8; // auto-rows size
const GAP_PX = 16; // gap-4
const CAPTION_PX = 22; // fixed caption block (single line)

const RATIO_PORTRAIT = 2 / 3; // 0.666…
const RATIO_LANDSCAPE = 4 / 3; // 1.333…

function isPortrait(p: Photo) {
  if (p.width && p.height) return p.height >= p.width;
  return false; // treat square as landscape
}

function CanonicalTile({
  p,
  i,
  isDark,
  onOpen,
}: {
  p: Photo;
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
  const [photos, setPhotos] = useState<Photo[]>([]);
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
        const { data: profileData, error: perr } = await supabase
          .from("profiles")
          .select(
            "id, full_name, bio, avatar_url, badge, username, portfolio_theme, portfolio_layout"
          )
          .eq("id", userId)
          .single();
        if (perr) throw perr;
        setProfile(profileData as UserProfile);

        const { data: pfRows, error: pfErr } = await supabase
          .from("user_portfolio")
          .select("photo_id, order_index")
          .eq("user_id", userId)
          .eq("is_public", true)
          .order("order_index", { ascending: true });
        if (pfErr) throw pfErr;

        const rows = (pfRows ?? []) as {
          photo_id: string;
          order_index: number;
        }[];
        if (!rows.length) {
          setPhotos([]);
          return;
        }

        const ids = rows.map((r) => r.photo_id);
        const { data: phData, error: phErr } = await supabase
          .from("review_photos")
          .select("id, storage_path, caption, width, height")
          .in("id", ids);
        if (phErr) throw phErr;

        const byId = new Map(
          (phData ?? []).map((p: any) => [
            p.id,
            {
              id: p.id as string,
              url: storagePublicUrl("user-photos", p.storage_path),
              caption: p.caption as string | null,
              width: p.width as number | null,
              height: p.height as number | null,
            },
          ])
        );

        const ordered: Photo[] = rows
          .map(({ photo_id, order_index }) => {
            const base = byId.get(photo_id);
            if (!base) return null;
            return { ...base, order_index } as Photo;
          })
          .filter(Boolean) as Photo[];

        setPhotos(ordered);
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
          // Strict grid with faster, sharper hover
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
          // Row-major masonry with canonical sizes + faster, sharper hover
          <div
            className="
            grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4
            auto-rows-[8px] grid-flow-row
          "
          >
            {photos.map((p, i) => (
              <CanonicalTile
                key={p.id}
                p={p}
                i={i}
                isDark={isDarkTheme}
                onOpen={() => setLightboxIndex(i)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          setIndex={(n) => setLightboxIndex(n)}
          onClose={() => setLightboxIndex(null)}
          isDark={isDarkTheme}
        />
      )}
    </div>
  );
}
