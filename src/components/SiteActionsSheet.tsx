"use client";

import { useState, useCallback } from "react";
import { Drawer } from "vaul";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import AddToTripModal from "@/components/AddToTripModal";
import ReviewModal from "@/components/reviews/ReviewModal";
import ReviewSuccessPopup from "@/components/reviews/ReviewSuccessPopup";
import BadgeEarnedPopup from "@/components/reviews/BadgeEarnedPopup";
import { supabase } from "@/lib/supabase/browser";
import { buildPlacesNearbyURL } from "@/lib/placesNearby";
import { getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { nativeShare } from "@/lib/nativeShare";
import { useAuthUserId } from "@/hooks/useAuthUserId";

export type SiteActionsSheetSite = {
  id: string;
  slug: string;
  province_slug?: string | null;
  title: string;
  cover_photo_url?: string | null;
  cover_photo_thumb_url?: string | null;
  location_free?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

interface Props {
  site: SiteActionsSheetSite;
  isOpen: boolean;
  onClose: () => void;
  /** When provided, "Places Nearby" calls this instead of navigating to /explore */
  onPlacesNearby?: (site: { id: string; title: string; latitude: number; longitude: number }) => void;
  /** Called after review success popup finishes — opens AllReviewsPanel with pinned user */
  onReviewSuccess?: (userId: string) => void;
  /** Hide the Add Review button (e.g. when opened from SiteBottomSheet) */
  hideReview?: boolean;
}

export default function SiteActionsSheet({ site, isOpen, onClose, onPlacesNearby, onReviewSuccess, hideReview }: Props) {
  const router = useRouter();
  const { userId } = useAuthUserId();

  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [showReviewSuccess, setShowReviewSuccess] = useState(false);
  const [badgeEarned, setBadgeEarned] = useState<{ badge: string; count: number } | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  const provinceSlug = site.province_slug;
  const detailHref = provinceSlug
    ? `/heritage/${provinceSlug}/${site.slug}`
    : `/heritage/${site.slug}`;
  const galleryHref = provinceSlug
    ? `/heritage/${provinceSlug}/${site.slug}/gallery`
    : `/heritage/${site.slug}/gallery`;
  const photoStoryHref = provinceSlug
    ? `/heritage/${provinceSlug}/${site.slug}/photo-story`
    : `/heritage/${site.slug}/photo-story`;
  const googleMapsHref =
    site.latitude != null && site.longitude != null &&
    !Number.isNaN(site.latitude) && !Number.isNaN(site.longitude)
      ? `https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`
      : null;

  const handlePlacesNearby = useCallback(async () => {
    let lat = site.latitude;
    let lng = site.longitude;

    if ((lat == null || lng == null) && site.id) {
      try {
        const { data, error } = await supabase
          .from("sites")
          .select("latitude, longitude")
          .eq("id", site.id)
          .maybeSingle();
        if (!error && data) {
          lat = data.latitude ?? null;
          lng = data.longitude ?? null;
        }
      } catch { /* ignore */ }
    }

    if (lat == null || lng == null) return;

    onClose();

    if (onPlacesNearby) {
      onPlacesNearby({ id: site.id, title: site.title, latitude: Number(lat), longitude: Number(lng) });
      return;
    }

    const href = buildPlacesNearbyURL({ siteId: site.id, lat, lng, radiusKm: 5, basePath: "/explore" });
    try {
      router.push(href);
    } catch {
      if (typeof window !== "undefined") window.location.assign(href);
    }
  }, [site, onClose, onPlacesNearby, router]);

  async function handleShare() {
    void hapticMedium();
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}${detailHref}`;
    const result = await nativeShare(site.title, url);
    if (result === "copied") {
      setShareToast("Link copied");
      setTimeout(() => setShareToast(null), 2200);
    }
    onClose();
  }

  return (
    <>
      {shareToast && (
        <div className="pointer-events-none fixed left-1/2 top-5 -translate-x-1/2 z-[9999] rounded-lg bg-gray-900/90 text-white text-sm px-4 py-2.5 shadow-lg">
          {shareToast}
        </div>
      )}

      <Drawer.Root
        open={isOpen}
        onOpenChange={(open) => { if (!open) onClose(); }}
        shouldScaleBackground
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[4000] bg-black/20" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[4001] bg-white rounded-t-3xl max-h-[82vh] flex flex-col outline-none">

            <Drawer.Title className="sr-only">Actions for {site.title}</Drawer.Title>

            {/* Drag handle */}
            <div className="w-full flex justify-center pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 bg-gray-400/40 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 pt-3 pb-3 border-b border-gray-200/60 shrink-0">
              <div className="flex items-center justify-center gap-2">
                <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center">
                  <Icon name="plus" size={15} className="text-[var(--brand-orange)]" />
                </div>
                <span className="text-[17px] font-bold text-gray-900">Actions</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                {(site.cover_photo_thumb_url || site.cover_photo_url) && (
                  <img
                    src={getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") || site.cover_photo_thumb_url || ""}
                    alt={site.title}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-200"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-gray-900 leading-snug truncate">{site.title}</p>
                  {site.location_free && (
                    <p className="text-[12px] text-gray-500 truncate mt-0.5">{site.location_free}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto">
              {/* Primary actions */}
              <div className="mx-4 mt-3 mb-3 bg-white rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => { void hapticMedium(); onClose(); setTimeout(() => setShowWishlistModal(true), 520); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <Icon name="layout-list" size={22} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Save to List</span>
                </button>
                <div className="mx-4 h-[0.5px] bg-gray-100" />
                <button
                  type="button"
                  onClick={() => { void hapticMedium(); onClose(); setTimeout(() => setShowTripModal(true), 520); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <Icon name="line-segments-light" size={22} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Add to Trip</span>
                </button>
                {!hideReview && (
                  <>
                    <div className="mx-4 h-[0.5px] bg-gray-100" />
                    <button
                      type="button"
                      onClick={() => { void hapticMedium(); onClose(); setTimeout(() => { setReviewRating(0); setShowReviewModal(true); }, 520); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                        <Icon name="star-light" size={22} className="text-gray-700" />
                      </div>
                      <span className="text-[15px] font-medium text-gray-900">Add Review</span>
                    </button>
                  </>
                )}
                <div className="mx-4 h-[0.5px] bg-gray-100" />
                <button
                  type="button"
                  onClick={() => { void hapticMedium(); void handlePlacesNearby(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <Icon name="map-pin-area-light" size={22} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Places Nearby</span>
                </button>
                <div className="mx-4 h-[0.5px] bg-gray-100" />
                <button
                  type="button"
                  onClick={() => { void handleShare(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <Icon name="share-arrow" size={22} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Share</span>
                </button>
              </div>

              {/* Secondary actions */}
              <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden">
                <a
                  href={galleryHref}
                  onClick={() => { void hapticLight(); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <Icon name="images" size={22} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Gallery</span>
                </a>
                <div className="mx-4 h-[0.5px] bg-gray-100" />
                <a
                  href={photoStoryHref}
                  onClick={() => { void hapticLight(); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <Icon name="play-circle-light" size={22} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Photo Story</span>
                </a>
                {googleMapsHref && (
                  <>
                    <div className="mx-4 h-[0.5px] bg-gray-100" />
                    <a
                      href={googleMapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => { void hapticLight(); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                        <Icon name="map-pin-light" size={22} className="text-gray-700" />
                      </div>
                      <span className="text-[15px] font-medium text-gray-900">Open in Google Maps</span>
                    </a>
                  </>
                )}
              </div>

              {/* Cancel */}
              <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => { void hapticLight(); onClose(); }}
                  className="w-full px-4 py-4 text-[15px] font-semibold text-[var(--brand-blue)] active:bg-gray-50"
                >
                  Cancel
                </button>
              </div>

              <div className="pb-[env(safe-area-inset-bottom,0.5rem)]" />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {showWishlistModal && (
        <AddToWishlistModal
          siteId={site.id}
          onClose={() => setShowWishlistModal(false)}
          site={{
            name: site.title,
            imageUrl: site.cover_photo_thumb_url ?? getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") ?? undefined,
            location: site.location_free ?? undefined,
          }}
        />
      )}
      {showTripModal && (
        <AddToTripModal
          siteId={site.id}
          onClose={() => setShowTripModal(false)}
          site={{
            name: site.title,
            imageUrl: site.cover_photo_url,
            location: site.location_free,
          }}
        />
      )}
      {showReviewModal && (
        <ReviewModal
          open={showReviewModal}
          siteId={site.id}
          rating={reviewRating}
          onRatingChange={setReviewRating}
          onClose={() => { setShowReviewModal(false); }}
          onSuccess={() => {
            setShowReviewModal(false);
            onClose();
            setShowReviewSuccess(true);
          }}
          onBadgeEarned={(badge, count) => setBadgeEarned({ badge, count })}
        />
      )}
      {showReviewSuccess && (
        <ReviewSuccessPopup
          onDone={() => {
            setShowReviewSuccess(false);
            if (!badgeEarned) onReviewSuccess?.(userId ?? "");
          }}
        />
      )}
      {badgeEarned && !showReviewSuccess && (
        <BadgeEarnedPopup
          badge={badgeEarned.badge}
          reviewCount={badgeEarned.count}
          onDone={() => {
            setBadgeEarned(null);
            onReviewSuccess?.(userId ?? "");
          }}
        />
      )}
    </>
  );
}
