// src/app/dashboard/bookmarks/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import SitePreviewCard from "@/components/SitePreviewCard";
import Icon from "@/components/Icon";

type BookmarkedSite = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
};

export default function BookmarksPage() {
  const supabase = createClient();
  const [bookmarkedSites, setBookmarkedSites] = useState<BookmarkedSite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookmarkedSites = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data, error } = await supabase
          .from("bookmarks")
          .select("sites(*)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (data) {
          setBookmarkedSites(data.map((b: any) => b.sites));
        }
      }
      setLoading(false);
    };

    fetchBookmarkedSites();
  }, [supabase]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">My Bookmarks</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-full h-72 bg-gray-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">My Bookmarks</h1>
      {bookmarkedSites.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Icon name="heart" size={48} className="text-gray-400 mx-auto" />
          <p className="mt-4 text-gray-600">
            You haven't bookmarked any sites yet.
          </p>
          <p className="text-sm text-gray-500">
            Click the heart icon on a site to save it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bookmarkedSites.map((site) => (
            <SitePreviewCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </div>
  );
}
