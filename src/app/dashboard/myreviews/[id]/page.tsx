// src/app/dashboard/myreviews/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/browser";
import { hardDeleteReview } from "@/lib/db/hardDelete";
import { hapticHeavy, hapticLight } from "@/lib/haptics";
import { Lightbox } from "@/components/ui/Lightbox";
import type { LightboxPhoto } from "@/types/lightbox";
import Icon from "@/components/Icon";

function getPublicUrl(bucket: string, path: string) {
  const supabase = createClient();
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function Stars({ value }: { value: number }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={`h-5 w-5 ${value >= i + 1 ? "text-amber-500" : "text-gray-200"}`} fill="currentColor">
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
      <span className="ml-1 text-sm text-gray-700 font-medium">{value.toFixed(1)}</span>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [review, setReview] = useState<any>(null);
  const [site, setSite] = useState<any>(null);
  const [photos, setPhotos] = useState<LightboxPhoto[]>([]);
  const [helpful, setHelpful] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch review
        const { data: r } = await supabase
          .from("reviews_with_profiles")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (!r) { setLoading(false); return; }
        setReview(r);

        // Fetch site
        const { data: s } = await supabase
          .from("sites")
          .select("id, title, slug, location_free")
          .eq("id", r.site_id)
          .maybeSingle();
        setSite(s ?? null);

        // Fetch photos
        const { data: ph } = await supabase
          .from("review_photos")
          .select("id, review_id, storage_path, caption")
          .eq("review_id", id);

        setPhotos(
          (ph ?? []).map((p: any) => ({
            id: p.id,
            url: getPublicUrl("user-photos", p.storage_path),
            caption: p.caption,
            author: { name: r.full_name || "Traveler" },
            site: {
              id: s?.id || "",
              name: s?.title || "",
              location: s?.location_free || "",
              latitude: null,
              longitude: null,
              region: "",
              categories: [],
            },
            storagePath: p.storage_path,
          }))
        );

        // Helpful count
        let hcount = 0;
        try {
          const { count } = await supabase
            .from("review_helpful")
            .select("id", { count: "exact", head: true })
            .eq("review_id", id);
          if (typeof count === "number") hcount = count;
        } catch {
          try {
            const { count } = await supabase
              .from("review_likes")
              .select("id", { count: "exact", head: true })
              .eq("review_id", id);
            if (typeof count === "number") hcount = count;
          } catch {}
        }
        setHelpful(hcount);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDelete() {
    if (!confirm("Permanently delete this review and its photos? This cannot be undone.")) return;
    void hapticHeavy();
    setDeleting(true);
    try {
      await hardDeleteReview(id);
      router.push("/dashboard/myreviews");
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete review.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 pb-24">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="py-8 text-center text-gray-500 text-sm">
        Review not found.{" "}
        <button onClick={() => router.push("/dashboard/myreviews")} className="text-[var(--brand-green)] font-medium">Go back</button>
      </div>
    );
  }

  const avatarSrc = review.avatar_url ? getPublicUrl("avatars", review.avatar_url) : null;
  const visitedStr = review.visited_month && review.visited_year
    ? `${String(review.visited_month).padStart(2, "0")}/${review.visited_year}`
    : null;

  return (
    <div className="pb-28 space-y-4">
      {/* Site + rating header */}
      <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <div className="flex items-start gap-3">
          {avatarSrc ? (
            <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-amber-400/60 shrink-0">
              <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0 flex items-center justify-center text-gray-400">
              <Icon name="user-round" size={20} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px] text-gray-900">{review.full_name || "Traveler"}</div>
            {review.badge && (
              <span className="inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs">
                {review.badge}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="text-base font-bold text-[var(--brand-blue)]">{site?.title ?? "Unknown site"}</div>
          {site?.location_free && <div className="text-xs text-gray-400 mt-0.5">{site.location_free}</div>}
          <div className="mt-2 flex items-center justify-between">
            <Stars value={review.rating} />
            {visitedStr && <span className="text-xs text-gray-400">Visited {visitedStr}</span>}
          </div>
        </div>
      </div>

      {/* Review text */}
      {review.review_text && (
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{review.review_text}</p>
        </div>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Photos</div>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { void hapticLight(); setLbIndex(idx); setLbOpen(true); }}
                className="relative aspect-square rounded-xl overflow-hidden bg-gray-100"
              >
                <Image src={p.url} alt={p.caption ?? "photo"} fill className="object-cover" sizes="33vw" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Helpful count */}
      <div className="bg-white rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-gray-600" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <span className="text-emerald-600">👍</span>
        <span>{helpful}</span>
        <span className="text-gray-400">·</span>
        <span className="text-gray-500">people found this helpful</span>
      </div>

      {/* Delete button — fixed at bottom */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-[500] bg-white border-t border-gray-100 px-4 py-3"
        style={{ paddingBottom: "calc(52px + var(--safe-bottom, 0px) + 12px)" }}
      >
        <button
          type="button"
          onClick={() => { void hapticHeavy(); void handleDelete(); }}
          disabled={deleting}
          className="w-full rounded-full py-3.5 font-bold text-white active:opacity-80 transition disabled:opacity-50 bg-red-500"
        >
          {deleting ? "Deleting…" : "Delete Review"}
        </button>
      </div>

      {/* Desktop delete */}
      <div className="hidden lg:block pt-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-50"
        >
          <Icon name="trash" size={14} />
          {deleting ? "Deleting…" : "Delete Review"}
        </button>
      </div>

      {lbOpen && photos.length > 0 && (
        <Lightbox photos={photos} startIndex={lbIndex} onClose={() => setLbOpen(false)} />
      )}
    </div>
  );
}
