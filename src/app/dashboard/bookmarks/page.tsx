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
      <div>
        <h1 className="text-xl font-bold mb-4">My Bookmarks</h1>
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-full aspect-[3/4] bg-gray-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">My Bookmarks</h1>
      {bookmarkedSites.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-gray-50">
          <Icon name="heart" size={40} className="text-gray-300 mx-auto" />
          <p className="mt-3 text-gray-500 font-medium">No bookmarks yet</p>
          <p className="text-sm text-gray-400 mt-1">Tap the heart icon on any site to save it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-6">
          {bookmarkedSites.map((site) => (
            <SitePreviewCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </div>
  );
}
