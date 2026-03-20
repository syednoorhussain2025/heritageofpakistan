// src/app/dashboard/mywishlists/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";
import { hapticLight, hapticHeavy } from "@/lib/haptics";
import type { BottomSheetSite } from "@/components/SiteBottomSheet";

const SiteBottomSheet = dynamic(() => import("@/components/SiteBottomSheet"), { ssr: false });

type SiteRef = {
  id: string;
  title: string | null;
  slug: string | null;
  cover_photo_url: string | null;
  cover_photo_thumb_url?: string | null;
  cover_blur_data_url?: string | null;
  cover_slideshow_image_ids?: string[] | null;
  avg_rating?: number | null;
  review_count?: number | null;
  heritage_type?: string | null;
  location_free?: string | null;
  tagline?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  province_slug?: string | null;
};
type Item = { id: string; site_id: string; sites: SiteRef | null };
type Wishlist = { id: string; name: string; is_public: boolean };

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="w-14 h-14 rounded-xl bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  );
}

export default function WishlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const router = useRouter();

  const [wl, setWl] = useState<Wishlist | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Bottom sheet
  const [sheetSite, setSheetSite] = useState<BottomSheetSite | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: w } = await supabase
          .from("wishlists")
          .select("id, name, is_public")
          .eq("id", id)
          .maybeSingle();
        setWl((w as any) ?? null);

        const { data: it } = await supabase
          .from("wishlist_items")
          .select(`id, site_id, sites(
            id, title, slug, cover_photo_url, cover_photo_thumb_url,
            cover_blur_data_url, cover_slideshow_image_ids,
            avg_rating, review_count, heritage_type, location_free,
            tagline, latitude, longitude, province_slug
          )`)
          .eq("wishlist_id", id)
          .order("created_at", { ascending: true });
        setItems((it as any[]) ?? []);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function removeItem(itemId: string) {
    void hapticHeavy();
    setRemovingId(itemId);
    try {
      await supabase.from("wishlist_items").delete().eq("id", itemId);
      setItems((prev) => prev.filter((x) => x.id !== itemId));
    } finally {
      setRemovingId(null);
    }
  }

  function openSheet(site: SiteRef) {
    void hapticLight();
    const bsSite: BottomSheetSite = {
      id: site.id,
      slug: site.slug ?? "",
      province_slug: site.province_slug ?? null,
      title: site.title ?? "",
      cover_photo_url: site.cover_photo_url,
      cover_photo_thumb_url: site.cover_photo_thumb_url,
      cover_blur_data_url: site.cover_blur_data_url,
      cover_slideshow_image_ids: site.cover_slideshow_image_ids,
      avg_rating: site.avg_rating,
      review_count: site.review_count,
      heritage_type: site.heritage_type,
      location_free: site.location_free,
      tagline: site.tagline,
      latitude: site.latitude,
      longitude: site.longitude,
    };
    setSheetSite(bsSite);
    setSheetOpen(true);
  }

  if (!loading && !wl) {
    return (
      <div className="px-4 py-8 text-center text-gray-500 text-sm">
        List not found.{" "}
        <button onClick={() => router.push("/dashboard/mywishlists")} className="text-[#00b78b] font-medium">
          Go back
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Title row (back button is in the teal shell header) */}
      <div className="px-4 pb-1">
        {wl ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium">
              {wl.is_public ? "public" : "private"} · {items.length} {items.length === 1 ? "site" : "sites"}
            </span>
          </div>
        ) : (
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        )}
      </div>

      {/* Items list */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        {loading ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-400 text-sm">
            No sites in this list yet.
          </div>
        ) : (
          items.map((item, i) => {
            const site = item.sites;
            return (
              <div key={item.id} className="relative">
                {i > 0 && <span className="absolute top-0 right-0 left-[72px] h-px bg-gray-100" />}
                <div
                  className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors"
                  onTouchStart={() => {/* handled on tap */}}
                  onClick={() => site && openSheet(site)}
                >
                  {/* Site thumbnail */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                    {site?.cover_photo_url ? (
                      <img
                        src={site.cover_photo_url}
                        alt={site.title ?? ""}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Icon name="image" size={20} />
                      </div>
                    )}
                  </div>

                  {/* Title + location */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-[#1a1a1a] leading-tight line-clamp-2">
                      {site?.title ?? "Untitled site"}
                    </div>
                    {site?.location_free && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{site.location_free}</div>
                    )}
                    {site?.avg_rating != null && site.avg_rating > 0 && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <span className="text-amber-400 text-xs">{"★".repeat(Math.round(site.avg_rating))}</span>
                        <span className="text-[10px] text-gray-400 ml-0.5">{site.avg_rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  {/* Red trash button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeItem(item.id);
                    }}
                    disabled={removingId === item.id}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-red-400 active:bg-red-50 transition-colors shrink-0 disabled:opacity-50"
                    aria-label="Remove from list"
                  >
                    {removingId === item.id ? (
                      <span className="inline-block rounded-full border-2 border-red-300 border-t-transparent animate-spin w-4 h-4" />
                    ) : (
                      <Icon name="trash" size={15} />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Site detail bottom sheet */}
      <SiteBottomSheet
        site={sheetSite}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
