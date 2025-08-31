// src/app/heritage/[slug]/story/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation"; // ✅ useParams for client components
import { supabase } from "@/lib/supabaseClient";

type Site = { id: string; slug: string; title: string };

type PhotoStory = {
  site_id: string;
  hero_photo_url?: string | null;
  subtitle?: string | null;
};

type PhotoStoryItem = {
  id: string;
  site_id: string;
  image_url?: string | null;
  text_block?: string | null;
  sort_order: number;
};

/* ───────────── Skeletons (dark theme) ───────────── */

function SkBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-white/10 ${className}`}
      aria-hidden
    />
  );
}

function SkCircle({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-white/10 ${className}`}
      aria-hidden
    />
  );
}

function TopBarSkeleton() {
  return (
    <div className="w-full flex justify-between items-center px-6 py-4 bg-black sticky top-0 z-10">
      <div className="space-y-2">
        <SkBar className="h-6 w-56" />
        <SkBar className="h-4 w-72" />
      </div>
      <SkBar className="h-8 w-40 rounded" />
    </div>
  );
}

function HeroSkeleton() {
  return (
    <figure className="mb-12">
      <SkBar className="w-full h-screen" />
    </figure>
  );
}

function ItemImageSkeleton() {
  return (
    <figure className="mb-12">
      <SkBar className="w-full h-screen" />
      <SkBar className="h-4 w-64 mx-auto mt-3 rounded" />
    </figure>
  );
}

function ItemTextSkeleton() {
  return (
    <div className="mb-12">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-3">
        <SkBar className="h-4 w-full rounded" />
        <SkBar className="h-4 w-5/6 rounded" />
        <SkBar className="h-4 w-2/3 rounded" />
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-black text-white">
      <TopBarSkeleton />
      <HeroSkeleton />
      <div className="w-full">
        <ItemImageSkeleton />
        <ItemTextSkeleton />
        <ItemImageSkeleton />
      </div>
    </div>
  );
}

/* ───────────── Page ───────────── */

export default function SitePhotoStoryPage() {
  const params = useParams();
  const slug = (params?.slug as string) ?? ""; // ✅ fixes “params is a Promise” warning

  const [site, setSite] = useState<Site | null>(null);
  const [story, setStory] = useState<PhotoStory | null>(null);
  const [items, setItems] = useState<PhotoStoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    (async () => {
      setLoading(true);

      const { data: s, error: siteErr } = await supabase
        .from("sites")
        .select("id, slug, title")
        .eq("slug", slug)
        .single();

      if (!s || siteErr) {
        setLoading(false);
        return;
      }
      setSite(s as Site);

      const { data: st } = await supabase
        .from("photo_stories")
        .select("site_id, hero_photo_url, subtitle")
        .eq("site_id", s.id)
        .maybeSingle();

      setStory((st as PhotoStory) || null);

      const { data: itms } = await supabase
        .from("photo_story_items")
        .select("id, site_id, image_url, text_block, sort_order")
        .eq("site_id", s.id)
        .order("sort_order", { ascending: true });

      setItems((itms as PhotoStoryItem[]) || []);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <PageSkeleton />;
  if (!site)
    return (
      <div className="min-h-screen bg-black text-white p-6">Not found.</div>
    );

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="w-full flex justify-between items-center px-6 py-4 bg-black sticky top-0 z-10">
        <div>
          <h1 className="text-lg md:text-xl font-semibold">
            {site.title} — Photo Story
          </h1>
          {story?.subtitle ? (
            <p className="text-sm md:text-base opacity-80">{story.subtitle}</p>
          ) : null}
        </div>
        <Link
          href={`/heritage/${site.slug}`}
          className="px-3 py-1 bg-white text-black rounded text-sm font-medium"
        >
          ← Back to article
        </Link>
      </div>

      {/* Optional hero photo */}
      {story?.hero_photo_url ? (
        <figure className="mb-12">
          <img
            src={story.hero_photo_url}
            alt=""
            className="w-full h-screen object-cover"
          />
        </figure>
      ) : null}

      {/* Story items */}
      <div className="w-full">
        {items.length === 0 ? (
          <p className="text-center py-20">No photo story items added yet.</p>
        ) : (
          items.map((it) => {
            const hasImg = !!it.image_url;
            const hasText = !!it.text_block;

            if (hasImg) {
              return (
                <figure key={it.id} className="mb-12">
                  <img
                    src={it.image_url as string}
                    alt={it.text_block || ""}
                    className="w-full h-screen object-cover"
                    loading="lazy"
                  />
                  {hasText ? (
                    <figcaption className="text-center mt-3 text-white text-sm md:text-base italic">
                      {it.text_block}
                    </figcaption>
                  ) : null}
                </figure>
              );
            }

            return (
              <div key={it.id} className="mb-12">
                <p className="max-w-3xl mx-auto px-6 text-center text-white text-base md:text-lg leading-relaxed">
                  {it.text_block}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
