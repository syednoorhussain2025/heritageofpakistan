"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { storagePublicUrl } from "@/lib/image/storagePublicUrl";
import { avatarSrc } from "@/lib/image/avatarSrc";
import { motion } from "framer-motion";
import Icon from "@/components/Icon";

type UserProfile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  badge: string | null;
  username: string | null;
  portfolio_theme?: "light" | "dark";
};

type Photo = {
  id: string;
  url: string;
  caption: string | null;
  order_index: number;
};

// Header component for the portfolio page
function PortfolioHeader({ profile }: { profile: UserProfile | null }) {
  const isDark = profile?.portfolio_theme === "dark";
  const themeClasses = isDark
    ? "bg-black/80 text-white backdrop-blur-sm"
    : "bg-white/80 text-black backdrop-blur-sm";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-20 h-14 flex items-center justify-between px-6 md:px-10 ${themeClasses} transition-colors duration-300`}
    >
      <div className="font-bold text-lg">Heritage of Pakistan</div>
      {profile?.full_name && (
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-full overflow-hidden">
            <Image
              src={avatarSrc(profile.avatar_url) || "/default-avatar.png"}
              alt="User avatar"
              layout="fill"
              objectFit="cover"
            />
          </div>
          <div className="text-sm md:text-base font-semibold">
            {profile.full_name}'s Photography Portfolio
          </div>
        </div>
      )}
    </header>
  );
}

// Lightbox component adapted from the gallery page
function Lightbox({
  photos,
  index,
  onClose,
  onPrev,
  onNext,
  profile,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  profile: UserProfile | null;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);
  const photo = photos[index];

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
      } bg-black/85 backdrop-blur-sm`}
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
          className="absolute -top-10 right-0 z-10 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center"
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>

        {/* Prev / Next */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white text-5xl font-thin transition-colors"
          aria-label="Previous"
          title="Previous"
        >
          ‹
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white text-5xl font-thin transition-colors"
          aria-label="Next"
          title="Next"
        >
          ›
        </button>

        {/* Image */}
        <div className="w-full h-full flex items-center justify-center">
          {photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={photo.caption || ""}
              className="max-w-[92vw] max-h-[85vh] object-contain shadow-2xl rounded-lg"
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="w-full h-full bg-gray-200" />
          )}
        </div>

        {/* Counter */}
        <div className="absolute top-4 left-4 z-10 text-sm text-white/95 bg-black/50 px-2 py-1 rounded-md">
          {index + 1} / {photos.length}
        </div>

        {/* Caption and Credit below image */}
        <div className="absolute left-0 right-0 -bottom-0 translate-y-full mt-3 text-center">
          <div className="inline-block bg-black/70 px-4 py-2 rounded-lg text-white/95 space-y-1">
            {photo?.caption && <p className="text-sm">{photo.caption}</p>}
            {profile?.full_name && (
              <p className="text-xs text-white/70">
                Shot by {profile.full_name}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
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

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const openLightbox = useCallback((idx: number) => {
    setActiveIndex(idx);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const prevImage = useCallback(
    () => setActiveIndex((i) => (i - 1 + photos.length) % photos.length),
    [photos.length]
  );
  const nextImage = useCallback(
    () => setActiveIndex((i) => (i + 1) % photos.length),
    [photos.length]
  );

  useEffect(() => {
    if (!userId) {
      setPageError("Invalid portfolio URL (missing userId).");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id, full_name, bio, avatar_url, badge, username, portfolio_theme"
          )
          .eq("id", userId)
          .single();

        if (profileError) throw profileError;
        setProfile(profileData as UserProfile);

        const { data: portfolioItems, error: portfolioError } = await supabase
          .from("user_portfolio")
          .select(
            "photo_id, order_index, review_photos (id, storage_path, caption)"
          )
          .eq("user_id", userId)
          .eq("is_public", true)
          .order("order_index", { ascending: true });

        if (portfolioError) throw portfolioError;

        const photoData = portfolioItems
          .map((item: any) => ({
            id: item.review_photos.id,
            url: storagePublicUrl(
              "user-photos",
              item.review_photos.storage_path
            ),
            caption: item.review_photos.caption,
            order_index: item.order_index,
          }))
          .sort((a, b) => a.order_index - b.order_index);

        setPhotos(photoData);
      } catch (e: any) {
        setPageError(e?.message ?? "Could not load portfolio.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, supabase]);

  const isDarkTheme = profile?.portfolio_theme === "dark";
  const themeClasses = isDarkTheme
    ? "bg-black text-gray-200"
    : "bg-gray-50 text-gray-800";

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
    <div
      className={`fixed inset-0 z-50 w-full h-full overflow-y-auto ${themeClasses} transition-colors duration-300`}
    >
      <PortfolioHeader profile={profile} />
      <main className="pt-24 pb-12 px-4 md:px-8">
        {/* User Profile Section */}
        {profile && (
          <div className="max-w-4xl mx-auto mb-10 flex flex-col md:flex-row items-center gap-4 md:gap-6">
            <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-4 border-orange-400 shadow-lg flex-shrink-0">
              <Image
                src={avatarSrc(profile.avatar_url) || "/default-avatar.png"}
                alt="User avatar"
                layout="fill"
                objectFit="cover"
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

        {photos.length === 0 ? (
          <p className="text-center">
            This user hasn’t made any photos public yet.
          </p>
        ) : (
          <>
            <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
              {photos.map((p, idx) => (
                <motion.figure
                  key={p.id}
                  className="break-inside-avoid cursor-pointer group"
                  onClick={() => openLightbox(idx)}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <div className="overflow-hidden rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <Image
                      src={p.url}
                      alt={p.caption ?? "portfolio photo"}
                      width={800}
                      height={600}
                      className="object-cover w-full transition-transform duration-300 group-hover:scale-105"
                      unoptimized
                    />
                  </div>
                  {p.caption && (
                    <figcaption
                      className={`text-sm px-1 pt-2 ${
                        isDarkTheme ? "text-gray-400" : "text-gray-700"
                      }`}
                    >
                      {p.caption}
                    </figcaption>
                  )}
                </motion.figure>
              ))}
            </div>
          </>
        )}
      </main>

      {lightboxOpen && photos.length > 0 && (
        <Lightbox
          photos={photos}
          index={activeIndex}
          onClose={closeLightbox}
          onPrev={prevImage}
          onNext={nextImage}
          profile={profile}
        />
      )}
    </div>
  );
}
