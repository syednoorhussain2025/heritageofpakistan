// src/app/dashboard/mywishlists/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";
import { updateWishlistNotes, updateWishlistCoverURL } from "@/lib/wishlists";

/** Small spinner */
function Spinner() {
  return (
    <span className="inline-block rounded-full border-2 border-gray-300 border-t-transparent animate-spin w-4 h-4" />
  );
}

type SiteRef = {
  title: string | null;
  slug: string | null;
  cover_photo_url?: string | null;
};
type Item = { id: string; site_id: string; sites: SiteRef | null };
type Wishlist = {
  id: string;
  name: string;
  is_public: boolean;
  cover_image_url?: string | null;
  notes?: string | null;
};

/** Modal for picking a cover from candidate images */
function CoverPicker({
  open,
  onClose,
  onSelect,
  candidates,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  candidates: { url: string; alt?: string | null }[];
  loading: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      className="fixed inset-0 z-[1000] bg-black/30 backdrop-blur-[1px] flex items-center justify-center"
    >
      <div
        className="w-full max-w-3xl mx-3 bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Select a cover image</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
            aria-label="Close"
          >
            <Icon name="times" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl bg-gray-200 animate-pulse"
              />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-gray-600">
            No images found from the list items.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {candidates.map((c, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(c.url)}
                className="aspect-square rounded-xl overflow-hidden ring-1 ring-black/5 hover:ring-[var(--brand-orange)] focus:outline-none"
                title="Use this image"
              >
                <img
                  src={c.url}
                  alt={c.alt ?? ""}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
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

  // notes state
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // cover picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<
    { url: string; alt?: string | null }[]
  >([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [settingCover, setSettingCover] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data: w } = await supabase
        .from("wishlists")
        .select("id, name, is_public, cover_image_url, notes")
        .eq("id", id)
        .maybeSingle();
      const wlData = (w as any) || null;
      setWl(wlData);
      setNotes(wlData?.notes ?? "");

      const { data: it } = await supabase
        .from("wishlist_items")
        .select("id, site_id, sites(title, slug, cover_photo_url)")
        .eq("wishlist_id", id)
        .order("created_at", { ascending: true });
      setItems((it as any[]) || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const itemCount = useMemo(() => items.length, [items]);

  // open picker and fetch up to 10 images from list item galleries
  async function openPicker() {
    setPickerOpen(true);
    setLoadingCandidates(true);
    try {
      const siteIds = items.map((i) => i.site_id);
      if (siteIds.length === 0) {
        setCandidates([]);
      } else {
        const { data: imgs } = await supabase
          .from("site_images")
          .select("site_id, storage_path, alt_text, is_cover, sort_order")
          .in("site_id", siteIds)
          .limit(60); // fetch generously; we'll rank then slice

        const rows = (imgs as any[]) || [];
        // rank: cover first, then by sort_order, then by original order
        rows.sort((a, b) => {
          const ac = a.is_cover ? 0 : 1;
          const bc = b.is_cover ? 0 : 1;
          if (ac !== bc) return ac - bc;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        });
        const uniq: { [k: string]: boolean } = {};
        const out: { url: string; alt?: string | null }[] = [];
        for (const r of rows) {
          if (!r.storage_path) continue;
          if (uniq[r.storage_path]) continue;
          uniq[r.storage_path] = true;
          const { data } = supabase.storage
            .from("site-images")
            .getPublicUrl(r.storage_path);
          if (data?.publicUrl)
            out.push({ url: data.publicUrl, alt: r.alt_text });
          if (out.length >= 10) break;
        }
        setCandidates(out);
      }
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function selectCover(url: string) {
    setSettingCover(true);
    try {
      await updateWishlistCoverURL(id as string, url);
      setWl((prev) => (prev ? { ...prev, cover_image_url: url } : prev));
      setPickerOpen(false);
    } catch (e) {
      alert("Could not set cover image.");
      console.error(e);
    } finally {
      setSettingCover(false);
    }
  }

  // Debounced notes save
  useEffect(() => {
    if (wl === null) return;
    const t = setTimeout(async () => {
      setSavingNotes(true);
      try {
        await updateWishlistNotes(id as string, notes);
      } catch (e) {
        console.error(e);
      } finally {
        setSavingNotes(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [id, notes, wl]);

  async function removeItem(itemId: string) {
    await supabase.from("wishlist_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((x) => x.id !== itemId));
  }

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }
  if (!wl) {
    return (
      <div className="p-6">
        <Link href="/dashboard/mywishlists" className="text-orange-600">
          ← Back
        </Link>
        <div className="mt-4">List not found or you don’t have access.</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-6">
      {/* Header row (Back on right) */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{wl.name}</h1>
          <span className="text-sm text-gray-500">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
        </div>
        <button
          onClick={() => router.back()}
          className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-8">
        {/* Left: Items list (no box borders, subtle separators, delete X at end) */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          {items.length === 0 ? (
            <div className="p-6 text-gray-600">No items yet.</div>
          ) : (
            <ul>
              {items.map((it, idx) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between px-5 py-4 border-b last:border-b-0 border-gray-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold">
                      {idx + 1}
                    </div>
                    <Link
                      href={it.sites?.slug ? `/heritage/${it.sites.slug}` : "#"}
                      className="hover:text-[var(--brand-orange)]"
                    >
                      {it.sites?.title ?? "Untitled site"}
                    </Link>
                  </div>
                  <button
                    onClick={() => removeItem(it.id)}
                    className="w-8 h-8 rounded-lg border hover:bg-gray-50 flex items-center justify-center"
                    title="Remove"
                    aria-label="Remove"
                  >
                    <Icon name="times" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: cover + notes */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-5">
            <div className="flex flex-col items-center gap-3">
              <div className="w-36 h-36 rounded-full bg-gray-100 ring-1 ring-black/5 overflow-hidden flex items-center justify-center">
                {wl.cover_image_url ? (
                  <img
                    src={wl.cover_image_url}
                    alt={wl.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Icon name="image" className="text-gray-400" />
                )}
              </div>
              <button
                onClick={openPicker}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
                disabled={settingCover}
              >
                {settingCover ? <Spinner /> : <Icon name="image" />}
                {settingCover ? "Saving…" : "Select image"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-5">
            <div className="mb-2 font-medium">Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-36 border rounded-lg p-3 outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40"
              placeholder="Add personal notes…"
            />
            <div className="mt-2 text-xs text-gray-500 h-4">
              {savingNotes ? "Saving…" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Cover picker modal */}
      <CoverPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={selectCover}
        candidates={candidates}
        loading={loadingCandidates}
      />
    </div>
  );
}
