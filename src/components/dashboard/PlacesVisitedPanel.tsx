"use client";

import { useEffect, useState } from "react";
import { countUserVisits } from "@/lib/db/visited";
import { listUserReviews } from "@/lib/db/reviews";
import { progressToNextBadge } from "@/lib/db/badges";
import Image from "next/image";
import { createClient } from "@/lib/supabase/browser";
import { useProfile } from "@/components/ProfileProvider"; // ✅ Import the global profile hook

type Props = {
  userId: string;
};

// Helper to resolve avatar URL
function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  const supabase = createClient();
  const { data } = supabase.storage.from("avatars").getPublicUrl(avatar_url);
  return data.publicUrl;
}

export default function PlacesVisitedPanel({ userId }: Props) {
  const supabase = createClient();
  const { profile, loading: profileLoading } = useProfile(); // ✅ Get profile from context
  const [visitedCount, setVisitedCount] = useState(0);
  const [progress, setProgress] = useState<{
    current: string;
    next: string | null;
    remaining: number;
  }>({
    current: "Beginner",
    next: null,
    remaining: 0,
  });
  const [sites, setSites] = useState<
    { id: string; title: string; cover_photo_url: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const count = await countUserVisits(userId);
      setVisitedCount(count);
      setProgress(progressToNextBadge(count));

      const reviews = await listUserReviews(userId);
      const siteIds = Array.from(new Set(reviews.map((r) => r.site_id))).slice(
        0,
        6
      );

      if (siteIds.length) {
        const { data: siteRows, error } = await supabase
          .from("sites")
          .select("id, title, cover_photo_url")
          .in("id", siteIds);

        if (error) throw error;
        setSites(siteRows ?? []);
      } else {
        setSites([]);
      }

      setLoading(false);
    }
    if (userId) {
      load();
    }
  }, [userId, supabase]);

  if (loading || profileLoading) return <p>Loading visited places...</p>;

  const avatarSrc = resolveAvatarSrc(profile?.avatar_url);

  return (
    <div className="border rounded-lg p-6 shadow-sm bg-white">
      {/* ✅ NEW: Profile Header Section */}
      <div className="flex items-center gap-4 mb-6 pb-6 border-b">
        <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
          {avatarSrc && (
            <Image
              src={avatarSrc}
              alt="Profile avatar"
              width={64}
              height={64}
              className="object-cover w-full h-full"
            />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold">
            {profile?.full_name || "Traveler"}
          </h3>
          <p className="text-sm font-medium text-amber-700 bg-amber-100 inline-block px-2 py-0.5 rounded-full mt-1">
            {profile?.badge || "Beginner"}
          </p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-4">Places Visited</h2>

      {/* Badge and stats */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-3xl font-bold">{visitedCount}</p>
          <p className="text-sm text-gray-500">Heritage Sites Reviewed</p>
        </div>
        <div className="text-right">
          <p className="font-medium text-green-600">{progress.current} Badge</p>
          {progress.next && (
            <p className="text-xs text-gray-500">
              {progress.remaining} more sites → {progress.next}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress.next && visitedCount > 0 && (
        <div className="w-full bg-gray-200 h-3 rounded-full mb-6">
          <div
            className="bg-green-600 h-3 rounded-full"
            style={{
              width: `${Math.min(
                (visitedCount / (visitedCount + progress.remaining)) * 100,
                100
              )}%`,
            }}
          />
        </div>
      )}

      {/* Preview sites */}
      {sites.length > 0 && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {sites.map((s) => (
              <div
                key={s.id}
                className="relative w-full h-20 rounded overflow-hidden"
              >
                {s.cover_photo_url ? (
                  <Image
                    src={s.cover_photo_url}
                    alt={s.title}
                    fill
                    className="object-cover"
                    sizes="10vw"
                  />
                ) : (
                  <div className="bg-gray-300 w-full h-full" />
                )}
              </div>
            ))}
          </div>
          <a
            href="/dashboard/placesvisited"
            className="text-sm text-blue-600 underline"
          >
            View all
          </a>
        </div>
      )}
    </div>
  );
}
