"use client";

import { useEffect, useState } from "react";
import { countUserVisits } from "@/lib/db/visited";
import { listUserReviews } from "@/lib/db/reviews"; // Import listUserReviews
import { progressToNextBadge } from "@/lib/db/badges";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";

type Props = {
  userId: string;
};

export default function PlacesVisitedPanel({ userId }: Props) {
  const supabase = createClient();
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

      // Count active reviews (this function already correctly points to the reviews table)
      const count = await countUserVisits(userId);
      setVisitedCount(count);
      setProgress(progressToNextBadge(count));

      // Load sites from the user's most recent reviews
      const reviews = await listUserReviews(userId);
      // Get unique site IDs from the reviews,slice to get the last 6
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
    load();
  }, [userId, supabase]);

  if (loading) return <p>Loading visited places...</p>;

  return (
    <div className="border rounded-lg p-6 shadow-sm bg-white">
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
