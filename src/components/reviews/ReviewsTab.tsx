// src/components/reviews/ReviewsTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { useAuthUserId } from "@/hooks/useAuthUserId";

/** Direct public URL from Supabase storage (no transforms) */
function storagePublicUrl(bucket: string, path?: string | null) {
  if (!path) return null;
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Avatar resolver: absolute URL stays; otherwise treat as path in "avatars" */
function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  return storagePublicUrl("avatars", avatar_url);
}

// ✅ UPDATED: A single type that includes both review and profile data from the view
type ReviewWithProfile = {
  id: string;
  site_id: string;
  user_id: string;
  rating: number;
  review_text: string | null;
  visited_month: number | null;
  visited_year: number | null;
  created_at: string;
  // Joined fields from the 'profiles' table
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

type Props = { siteId: string };

export default function ReviewsTab({ siteId }: Props) {
  const supabase = createClient();
  const { userId } = useAuthUserId();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ SIMPLIFIED: Only need one state for reviews, as profile data is included
  const [reviews, setReviews] = useState<ReviewWithProfile[]>([]);

  const [photosByReview, setPhotosByReview] = useState<
    Record<string, ReviewPhoto[]>
  >({});
  const [helpfulCount, setHelpfulCount] = useState<Record<string, number>>({});
  const [userVoted, setUserVoted] = useState<Set<string>>(new Set());
  const [pendingVote, setPendingVote] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ UPDATED: Fetch reviews and profiles in a single query from the view
        const { data: revs, error: rErr } = await supabase
          .from("reviews_with_profiles") // Use the view
          .select("*") // It contains all review and profile columns
          .eq("site_id", siteId)
          .order("created_at", { ascending: false });
        if (rErr) throw rErr;

        const reviewRows = (revs ?? []) as ReviewWithProfile[];
        setReviews(reviewRows);

        const reviewIds = reviewRows.map((r) => r.id);

        // Fetch photos and helpful counts in parallel
        const [photoMap, { counts, voted }] = await Promise.all([
          // Fetch photos
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
          // Fetch helpful counts and user's vote state
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

  const rows = useMemo(() => reviews, [reviews]);

  if (loading) return <div className="p-4">Loading reviews…</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (!rows.length)
    return <div className="p-4 text-gray-600">No reviews yet.</div>;

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        // ✅ SIMPLIFIED: Profile data is now part of the review 'r' object
        const avatar = resolveAvatarSrc(r.avatar_url);
        const voteCount = helpfulCount[r.id] || 0;
        const voted = userVoted.has(r.id);

        return (
          <article
            key={r.id}
            className="rounded-xl border border-gray-200 shadow-sm p-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-full overflow-hidden bg-gray-200">
                  {avatar ? (
                    <NextImage
                      src={avatar}
                      alt="profile"
                      fill
                      className="object-cover"
                      sizes="56px"
                      unoptimized
                    />
                  ) : null}
                </div>

                <div>
                  <div className="font-medium text-gray-900">
                    {r.full_name || r.username || "Traveler"}
                  </div>
                  {r.badge && (
                    <div className="text-sm text-green-700">{r.badge}</div>
                  )}
                </div>
              </div>
              <time className="text-sm text-gray-500">
                {new Date(r.created_at).toLocaleDateString()}
              </time>
            </div>

            {/* Rating + text */}
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <div className="text-amber-500 text-lg leading-none">
                  {"★".repeat(Math.round(r.rating))}
                  <span className="text-gray-300">
                    {"★".repeat(5 - Math.round(r.rating))}
                  </span>
                </div>
                <div className="text-sm text-gray-600">{r.rating}/5</div>
              </div>

              {r.review_text && (
                <p className="mt-2 text-gray-800 whitespace-pre-wrap">
                  {r.review_text}
                </p>
              )}
            </div>

            {/* Photos */}
            {photosByReview[r.id]?.length ? (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {photosByReview[r.id].slice(0, 3).map((p) => {
                  const url = storagePublicUrl("user-photos", p.storage_path);
                  return (
                    <div
                      key={p.id}
                      className="relative w-full aspect-[4/3] overflow-hidden rounded-lg bg-gray-100"
                    >
                      {url ? (
                        <img
                          src={url}
                          alt={p.caption ?? "review photo"}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Helpful */}
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => toggleHelpful(r.id)}
                disabled={pendingVote.has(r.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition
                   ${
                     voted
                       ? "bg-amber-50 border-amber-300 text-amber-700"
                       : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                   } 
                   ${
                     pendingVote.has(r.id)
                       ? "opacity-60 cursor-not-allowed"
                       : ""
                   }`}
                aria-pressed={voted}
              >
                <span>👍</span>
                <span>{voted ? "Helpful" : "Mark Helpful"}</span>
              </button>
              <span className="text-sm text-gray-600">{voteCount}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
