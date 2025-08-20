// src/app/heritage/[slug]/gallery/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Site = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
};
type ImageRow = {
  id: string;
  site_id: string;
  storage_path: string;
  alt_text?: string | null;
  caption?: string | null;
  credit?: string | null;
  sort_order: number;
  publicUrl?: string | null;
};

export default function SiteGalleryPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug;
  const [site, setSite] = useState<Site | null>(null);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // 1) Load the site by slug
      const { data: s } = await supabase
        .from("sites")
        .select("id, slug, title, cover_photo_url")
        .eq("slug", slug)
        .single();
      if (!s) {
        setLoading(false);
        return;
      }
      setSite(s as Site);

      // 2) Load all images for this site (from site_images table)
      const { data: imgs } = await supabase
        .from("site_images")
        .select("*")
        .eq("site_id", s.id)
        .order("sort_order", { ascending: true });

      const withUrls: ImageRow[] = await Promise.all(
        (imgs || []).map(async (r: any) => ({
          ...r,
          publicUrl: r.storage_path
            ? supabase.storage.from("site-images").getPublicUrl(r.storage_path)
                .data.publicUrl
            : null,
        }))
      );

      setImages(withUrls);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!site) return <div className="p-6">Not found.</div>;

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* Header banner (full width, shorter than main hero) */}
      <div className="relative w-full h-64 md:h-80">
        {site.cover_photo_url ? (
          <img
            src={site.cover_photo_url}
            alt={site.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 pb-4 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-white text-2xl md:text-3xl font-bold">
              Photo Gallery — {site.title}
            </h1>
            <Link
              href={`/heritage/${site.slug}`}
              className="inline-block px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
            >
              ← Back to main article
            </Link>
          </div>
        </div>
      </div>

      {/* Content container (same ~100px side margins) */}
      <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 py-6">
        {images.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6 text-gray-600">
            No photos uploaded yet for this site.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {images.map((img) => (
              <figure
                key={img.id}
                className="bg-white rounded-xl shadow-sm overflow-hidden"
              >
                {img.publicUrl ? (
                  <img
                    src={img.publicUrl}
                    alt={img.alt_text || ""}
                    className="w-full aspect-[4/3] object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] bg-gray-200" />
                )}
                {(img.caption || img.credit) && (
                  <figcaption className="px-3 py-2 text-xs text-gray-700">
                    {img.caption}
                    {img.credit ? (
                      <span className="ml-1 text-gray-500">({img.credit})</span>
                    ) : null}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
