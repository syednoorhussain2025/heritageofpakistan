// src/components/reviews/ReviewsTab.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import NextImage from "next/image";
import { createClient } from "@/lib/supabase/browser";
import { useAuthUserId } from "@/hooks/useAuthUserId";

/** Universal Lightbox */
import { Lightbox } from "@/components/ui/Lightbox";
import type { LightboxPhoto } from "@/types/lightbox";

/** Direct public URL from Supabase storage (no transforms) */
function storagePublicUrl(bucket: string, path?: string | null) {
  if (!path) return null;
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Avatar resolver: absolute URL stays, otherwise treat as path in "avatars" */
function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  return storagePublicUrl("avatars", avatar_url);
}

// Review row with joined profile fields (from your view)
type ReviewWithProfile = {
  id: string;
  site_id: string;
  user_id: string;
  rating: number;
  review_text: string | null;
  visited_month: number | null;
  visited_year: number | null;
  created_at: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  badge: string | null;
};

type ReviewPhoto = {
  id: string;
  review_id: string;
  storage_path: string;
  caption: string | null;
};

type SiteInfo = {
  id: string;
  title: string;
  location_free: string | null;
};

type Props = {
  siteId: string;
  /** If set, pin this user's review to the top */
  pinnedUserId?: string | null;
  /** If set, show only top N helpful reviews + a "Show All" button */
  previewCount?: number;
  onShowAll?: () => void;
};

export default function ReviewsTab({ siteId, pinnedUserId, previewCount, onShowAll }: Props) {
  const supabase = createClient();
  const { userId } = useAuthUserId();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reviews, photos, helpful votes
  const [reviews, setReviews] = useState<ReviewWithProfile[]>([]);
  const [photosByReview, setPhotosByReview] = useState<
    Record<string, ReviewPhoto[]>
  >({});
  const [helpfulCount, setHelpfulCount] = useState<Record<string, number>>({});
  const [userVoted, setUserVoted] = useState<Set<string>>(new Set());
  const [pendingVote, setPendingVote] = useState<Set<string>>(new Set());

  // Site info (for Lightbox right panel)
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);

  // Lightbox state
  const [lightboxPhotos, setLightboxPhotos] = useState<LightboxPhoto[] | null>(
    null
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Site info (name and location shown in Lightbox panel)
        const { data: siteRow, error: sErr } = await supabase
          .from("sites")
          .select("id, title, location_free")
          .eq("id", siteId)
          .single();
        if (sErr) throw sErr;
        setSiteInfo(siteRow as SiteInfo);

        // Reviews (with profile fields) from the view
        const { data: revs, error: rErr } = await supabase
          .from("reviews_with_profiles")
          .select("*")
          .eq("site_id", siteId)
          .order("created_at", { ascending: false });
        if (rErr) throw rErr;

        const reviewRows = (revs ?? []) as ReviewWithProfile[];
        setReviews(reviewRows);

        const reviewIds = reviewRows.map((r) => r.id);

        // Fetch photos and helpful counts in parallel
        const [photoMap, { counts, voted }] = await Promise.all([
          // Photos
          (async () => {
            if (!reviewIds.length) return {};
            const { data: phRows, error: phErr } = await supabase
              .from("review_photos")
              .select("id, review_id, storage_path, caption")
              .in("review_id", reviewIds);
            if (phErr) throw phErr;
            const pMap: Record<string, ReviewPhoto[]> = {};
            (phRows ?? []).forEach((p: any) => {
              if (!pMap[p.review_id]) pMap[p.review_id] = [];
              pMap[p.review_id].push(p);
            });
            return pMap;
          })(),
          // Helpful counts and user vote state
          (async () => {
            if (!reviewIds.length)
              return { counts: {}, voted: new Set<string>() };
            const { data: hvRows, error: hErr } = await supabase
              .from("helpful_votes")
              .select("review_id, voter_id")
              .in("review_id", reviewIds);
            if (hErr) throw hErr;

            const voteCounts: Record<string, number> = {};
            const userVotes = new Set<string>();
            (hvRows ?? []).forEach((row: any) => {
              voteCounts[row.review_id] = (voteCounts[row.review_id] || 0) + 1;
              if (row.voter_id && row.voter_id === userId)
                userVotes.add(row.review_id);
            });
            return { counts: voteCounts, voted: userVotes };
          })(),
        ]);

        setPhotosByReview(photoMap);
        setHelpfulCount(counts);
        setUserVoted(voted);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to load reviews.");
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId, userId, supabase]);

  async function toggleHelpful(reviewId: string) {
    if (!userId) {
      alert("Please sign in to vote.");
      return;
    }
    if (pendingVote.has(reviewId)) return;

    const hasVoted = userVoted.has(reviewId);

    // optimistic UI
    setPendingVote((s) => new Set(s).add(reviewId));
    setUserVoted((prev) => {
      const cp = new Set(prev);
      if (hasVoted) cp.delete(reviewId);
      else cp.add(reviewId);
      return cp;
    });
    setHelpfulCount((prev) => ({
      ...prev,
      [reviewId]: Math.max(0, (prev[reviewId] || 0) + (hasVoted ? -1 : +1)),
    }));

    try {
      if (hasVoted) {
        const { error } = await supabase
          .from("helpful_votes")
          .delete()
          .eq("review_id", reviewId)
          .eq("voter_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("helpful_votes")
          .upsert(
            { review_id: reviewId, voter_id: userId },
            { onConflict: "review_id,voter_id", ignoreDuplicates: false }
          );
        if (error) throw error;
      }
    } catch (e: any) {
      // revert on failure
      setUserVoted((prev) => {
        const cp = new Set(prev);
        if (hasVoted) cp.add(reviewId);
        else cp.delete(reviewId);
        return cp;
      });
      setHelpfulCount((prev) => ({
        ...prev,
        [reviewId]: Math.max(0, (prev[reviewId] || 0) + (hasVoted ? +1 : -1)),
      }));
      alert(e?.message || "Could not update vote. Please try again.");
      console.error("Helpful vote error:", e);
    } finally {
      setPendingVote((s) => {
        const cp = new Set(s);
        cp.delete(reviewId);
        return cp;
      });
    }
  }

  // Sort: pinned user first, then by helpful count desc
  const rows = useMemo(() => {
    const sorted = [...reviews].sort((a, b) => {
      const aVotes = helpfulCount[a.id] || 0;
      const bVotes = helpfulCount[b.id] || 0;
      return bVotes - aVotes;
    });
    if (pinnedUserId) {
      const idx = sorted.findIndex((r) => r.user_id === pinnedUserId);
      if (idx > 0) {
        const [pinned] = sorted.splice(idx, 1);
        sorted.unshift(pinned);
      }
    }
    return sorted;
  }, [reviews, helpfulCount, pinnedUserId]);

  // Build Lightbox photos for a given review and open at a specific index
  const openLightboxForReview = useCallback(
    (r: ReviewWithProfile, startIndex: number) => {
      const album = photosByReview[r.id] ?? [];
      const authorName = r.full_name || r.username || "Traveler";
      const authorProfileUrl = r.username ? `/u/${r.username}` : undefined;

      const siteName = siteInfo?.title || "";
      const siteLocation = siteInfo?.location_free || "";

      const lbPhotos = album
        .map((p): LightboxPhoto | null => {
          const url = storagePublicUrl("user-photos", p.storage_path);
          if (!url) return null;
          return {
            id: p.id,
            url,
            storagePath: p.storage_path,
            caption: p.caption,
            isBookmarked: false,
            site: {
              id: r.site_id,
              name: siteName,
              location: siteLocation,
              region: "",
              categories: [],
              latitude: null,
              longitude: null,
            },
            author: { name: authorName, profileUrl: authorProfileUrl },
          };
        })
        .filter(Boolean) as LightboxPhoto[];

      if (!lbPhotos.length) return;
      setLightboxPhotos(lbPhotos);
      setLightboxIndex(startIndex);
    },
    [photosByReview, siteInfo]
  );

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    setLightboxPhotos(null);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-center py-3">
          <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-full bg-gray-200" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-full bg-gray-200 rounded mb-2" />
            <div className="h-4 w-5/6 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-2/3 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }

  const WriteReviewButton = () => (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("hop:write-review"))}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--brand-orange)] text-white text-[13px] font-semibold active:opacity-80 transition-opacity"
    >
      <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
      Write a Review
    </button>
  );

  if (!rows.length) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-gray-500 text-[13px]">No reviews yet. Be the first!</p>
        <WriteReviewButton />
      </div>
    );
  }

  const visibleRows = previewCount ? rows.slice(0, previewCount) : rows;

  /* Shared review card renderer */
  function ReviewCard({ r, carousel }: { r: ReviewWithProfile; carousel?: boolean }) {
    const avatar = resolveAvatarSrc(r.avatar_url);
    const voteCount = helpfulCount[r.id] || 0;
    const voted = userVoted.has(r.id);
    const album = photosByReview[r.id] || [];

    return (
      <article
        className={`rounded-xl border border-gray-200 bg-white shadow-sm p-4 ${carousel ? "flex-shrink-0 w-[82vw] max-w-[320px]" : ""}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-200 shrink-0">
              {avatar ? (
                <NextImage
                  src={avatar}
                  alt="profile"
                  fill
                  className="object-cover"
                  sizes="48px"
                  unoptimized
                />
              ) : null}
            </div>
            <div>
              <div className="font-semibold text-[14px] text-gray-900 leading-tight">
                {r.full_name || r.username || "Traveler"}
              </div>
              {r.badge && (
                <div className="text-[12px] text-green-700">{r.badge}</div>
              )}
            </div>
          </div>
          <time className="text-[12px] text-gray-400 shrink-0 mt-0.5">
            {new Date(r.created_at).toLocaleDateString()}
          </time>
        </div>

        {/* Stars + rating */}
        <div className="mt-2 flex items-center gap-1.5">
          <div className="text-amber-500 text-base leading-none">
            {"★".repeat(Math.round(r.rating))}
            <span className="text-gray-300">
              {"★".repeat(5 - Math.round(r.rating))}
            </span>
          </div>
          <div className="text-[12px] text-gray-500">{r.rating}/5</div>
        </div>

        {/* Review text — clamp to 3 lines in carousel preview */}
        {r.review_text && (
          <p className={`mt-1.5 text-[13px] text-gray-700 whitespace-pre-wrap ${carousel ? "line-clamp-3" : ""}`}>
            {r.review_text}
          </p>
        )}

        {/* Photos */}
        {album.length ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {album.slice(0, 3).map((p, idx) => {
              const url = storagePublicUrl("user-photos", p.storage_path);
              return (
                <button
                  type="button"
                  key={p.id}
                  className="group relative w-full aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 cursor-zoom-in active:opacity-90 focus:outline-none"
                  onClick={() => openLightboxForReview(r, idx)}
                  title="Open photo"
                >
                  {url ? (
                    <img
                      src={url}
                      alt={p.caption ?? "review photo"}
                      className="w-full h-full object-cover transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200" />
                  )}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Helpful */}
        <div className="mt-2.5 flex items-center gap-3">
          <button
            onClick={() => toggleHelpful(r.id)}
            disabled={pendingVote.has(r.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[13px] transition
              ${voted ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}
              ${pendingVote.has(r.id) ? "opacity-60 cursor-not-allowed" : ""}`}
            aria-pressed={voted}
          >
            <span>👍</span>
            <span>{voted ? "Helpful" : "Mark Helpful"}</span>
          </button>
          <span className="text-[13px] text-gray-500">{voteCount}</span>
        </div>
      </article>
    );
  }

  return (
    <>
      {/* CAROUSEL — only in preview mode */}
      {previewCount ? (
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none" }}
        >
          {visibleRows.map((r) => (
            <div key={r.id} className="snap-start">
              <ReviewCard r={r} carousel />
            </div>
          ))}
        </div>
      ) : (
        /* FULL LIST — in AllReviewsPanel */
        <div className="space-y-4">
          {visibleRows.map((r) => (
            <ReviewCard key={r.id} r={r} />
          ))}
        </div>
      )}

      {/* Show All button — only in preview mode when there are more reviews */}
      {previewCount && onShowAll && rows.length > 0 && (
        <button
          type="button"
          onClick={() => onShowAll()}
          className="mt-3 w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-slate-200 text-[14px] font-semibold text-[var(--brand-blue)]"
        >
          <span>Show All Reviews ({rows.length})</span>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" className="text-slate-400">
            <path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z" />
          </svg>
        </button>
      )}

      {/* Write a Review — always shown in preview mode */}
      {previewCount && (
        <div className="mt-3 flex justify-start">
          <WriteReviewButton />
        </div>
      )}

      {/* Universal Lightbox */}
      {lightboxPhotos && lightboxIndex !== null && (
        <Lightbox
          photos={lightboxPhotos}
          startIndex={lightboxIndex}
          onClose={closeLightbox}
        />
      )}
    </>
  );
}
