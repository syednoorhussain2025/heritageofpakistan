"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { listUserReviews } from "@/lib/db/reviews";
import {
  insertPortfolioItem,
  listPortfolio,
  updatePortfolioItem,
  reorderPortfolioItems,
} from "@/lib/db/portfolio";
import Image from "next/image";
import Link from "next/link";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { storagePublicUrl } from "@/lib/image/storagePublicUrl";
import { createClient } from "@/lib/supabaseClient";
import { avatarSrc } from "@/lib/image/avatarSrc";
import { motion, AnimatePresence } from "framer-motion";

type PhotoItem = {
  id: string; // review_photos.id
  review_id: string;
  storage_path: string;
  caption: string | null;
  publicUrl: string;
  is_public: boolean;
  order_index: number;
  portfolio_item_id: string | null;
};

type PortfolioTheme = "light" | "dark";
type PortfolioLayout = "grid" | "masonry";

type ProfileData = {
  full_name: string | null;
  badge: string | null;
  avatar_url: string | null;
  portfolio_theme: PortfolioTheme | null;
  portfolio_layout: PortfolioLayout | null;
};

function DotsHandle() {
  return (
    <div className="grid grid-cols-3 gap-[2px] p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-600/90" />
      ))}
    </div>
  );
}

export default function PortfolioManager() {
  const { userId, authLoading, authError } = useAuthUserId();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [portfolioTheme, setPortfolioTheme] = useState<PortfolioTheme>("light");
  const [portfolioLayout, setPortfolioLayout] =
    useState<PortfolioLayout>("masonry");

  const [isReorderMode, setIsReorderMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const supabase = createClient();

  const publicUrl = useMemo(() => {
    if (!userId || typeof window === "undefined") return "";
    return `${window.location.origin}/portfolio/${userId}`;
  }, [userId]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      alert("Public URL copied to clipboard.");
    } catch {
      alert("Could not copy. Please copy manually.");
    }
  };

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setPageError(null);

      const [portfolio, reviews, profileRes] = await Promise.all([
        listPortfolio(userId),
        listUserReviews(userId),
        supabase
          .from("profiles")
          .select(
            "full_name, badge, avatar_url, portfolio_theme, portfolio_layout"
          )
          .eq("id", userId)
          .single(),
      ]);

      const prof = profileRes.data as ProfileData;
      setProfile(prof);
      if (prof?.portfolio_theme) setPortfolioTheme(prof.portfolio_theme);
      if (prof?.portfolio_layout) setPortfolioLayout(prof.portfolio_layout);

      const reviewIds = reviews.map((r) => r.id);
      let allReviewPhotos: any[] = [];
      if (reviewIds.length > 0) {
        const { data, error } = await supabase
          .from("review_photos")
          .select("*")
          .in("review_id", reviewIds);
        if (error) throw error;
        allReviewPhotos = data ?? [];
      }

      const combined: PhotoItem[] = allReviewPhotos.map((p) => {
        const existing = portfolio.find((pf) => pf.photo_id === p.id);
        return {
          id: p.id,
          review_id: p.review_id,
          storage_path: p.storage_path,
          caption: p.caption,
          publicUrl: storagePublicUrl("user-photos", p.storage_path),
          is_public: existing ? !!existing.is_public : true,
          order_index: existing ? existing.order_index : 999,
          portfolio_item_id: existing ? existing.id : null,
        };
      });

      combined.sort((a, b) => a.order_index - b.order_index);
      setPhotos(combined);
    } catch (e: any) {
      console.error(e);
      setPageError(e?.message ?? "Error loading portfolio");
    } finally {
      setLoading(false);
    }
  }, [userId, supabase]);

  useEffect(() => {
    if (!authLoading) void loadData();
  }, [authLoading, loadData]);

  // Save prefs through a server route (ensures cookies are used)
  async function savePrefs(
    patch: Partial<Pick<ProfileData, "portfolio_theme" | "portfolio_layout">>
  ) {
    const res = await fetch("/api/portfolio/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to save preferences");
  }

  async function savePortfolioTheme(theme: PortfolioTheme) {
    if (!userId) return;
    try {
      setPortfolioTheme(theme);
      await savePrefs({ portfolio_theme: theme });
    } catch (error: any) {
      console.error("Failed to save theme:", error?.message ?? error);
      alert(`Could not save theme: ${error?.message ?? "Unknown error"}`);
    }
  }

  async function savePortfolioLayout(layout: PortfolioLayout) {
    if (!userId) return;
    try {
      setPortfolioLayout(layout);
      await savePrefs({ portfolio_layout: layout });
    } catch (error: any) {
      console.error("Failed to save layout:", error?.message ?? error);
      alert(`Could not save layout: ${error?.message ?? "Unknown error"}`);
    }
  }

  const persistOrder = useCallback(
    async (currentItems: PhotoItem[]) => {
      if (!userId) return;
      setSavingOrder(true);
      try {
        const updates = currentItems.map((item, index) => ({
          photo_id: item.id,
          order_index: index, // 0..N-1 numbering
        }));
        await reorderPortfolioItems(userId, updates);
        setOrderDirty(false);
      } catch (e: any) {
        console.error("Failed to save order", e?.message ?? e);
        alert(`Could not save order: ${e?.message ?? "Unknown error"}`);
      } finally {
        setSavingOrder(false);
      }
    },
    [userId]
  );

  async function togglePublic(photo: PhotoItem) {
    if (!userId) return;
    const snapshot = [...photos];
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photo.id ? { ...p, is_public: !p.is_public } : p
      )
    );
    try {
      await insertPortfolioItem(
        userId,
        photo.id,
        photo.order_index,
        !photo.is_public ? true : false
      );
    } catch (e: any) {
      console.error(e?.message ?? e);
      setPhotos(snapshot);
      alert(
        `Could not update portfolio visibility: ${
          e?.message ?? "Unknown error"
        }`
      );
    }
  }

  function arrayMove<T>(arr: T[], from: number, to: number) {
    const a = arr.slice();
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    return a;
  }

  if (authLoading || loading) return <p>Loading portfolio...</p>;
  if (authError) return <p className="text-red-600">Auth error: {authError}</p>;
  if (!userId) return <p>Please sign in to manage your portfolio.</p>;
  if (pageError) return <p className="text-red-600">Error: {pageError}</p>;

  return (
    <div>
      <div className="bg-gray-100 rounded-lg p-4 mb-6 border">
        <h2 className="text-xl font-semibold mb-4">My Portfolio Manager</h2>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {/* LEFT: Profile card */}
          {profile && (
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-orange-400">
                <Image
                  src={avatarSrc(profile.avatar_url) || "/default-avatar.png"}
                  alt="User avatar"
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <div className="font-semibold text-lg">{profile.full_name}</div>
                {profile.badge && (
                  <div className="text-md text-green-600">{profile.badge}</div>
                )}
              </div>
            </div>
          )}

          {/* RIGHT: Controls column (Public URL at top, then switches) */}
          <div className="flex flex-col gap-4 items-start md:items-end w-full md:w-auto">
            {/* Public URL (moved ABOVE the buttons on the right) */}
            <div className="w-full md:w-auto">
              <label className="text-sm font-medium block mb-1">
                Public URL
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-700 break-all bg-white px-2 py-1 rounded border max-w-[28rem]">
                  {publicUrl}
                </span>
                <button
                  onClick={copyUrl}
                  className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
                >
                  Copy
                </button>
                <Link
                  href={`/portfolio/${userId}`}
                  className="px-3 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold"
                >
                  Open
                </Link>
              </div>
            </div>

            {/* Switchers */}
            <div className="flex items-center gap-6">
              <div>
                <label className="text-sm font-medium">Portfolio Theme</label>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => savePortfolioTheme("light")}
                    className={`px-3 py-1 text-sm rounded-full ${
                      portfolioTheme === "light"
                        ? "bg-blue-600 text-white"
                        : "bg-white border"
                    }`}
                  >
                    Light
                  </button>
                  <button
                    onClick={() => savePortfolioTheme("dark")}
                    className={`px-3 py-1 text-sm rounded-full ${
                      portfolioTheme === "dark"
                        ? "bg-blue-600 text-white"
                        : "bg-white border"
                    }`}
                  >
                    Dark
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Public Layout</label>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => savePortfolioLayout("grid")}
                    className={`px-3 py-1 text-sm rounded-full ${
                      portfolioLayout === "grid"
                        ? "bg-blue-600 text-white"
                        : "bg-white border"
                    }`}
                  >
                    Grid
                  </button>
                  <button
                    onClick={() => savePortfolioLayout("masonry")}
                    className={`px-3 py-1 text-sm rounded-full ${
                      portfolioLayout === "masonry"
                        ? "bg-blue-600 text-white"
                        : "bg-white border"
                    }`}
                  >
                    Masonry
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reorder / Photos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Manage Photos</h2>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (isReorderMode && orderDirty) await persistOrder(photos);
                setIsReorderMode(!isReorderMode);
              }}
              className={`px-4 py-2 text-sm rounded-lg font-semibold ${
                isReorderMode ? "bg-red-500 text-white" : "bg-gray-200"
              }`}
            >
              {isReorderMode ? "Done Reordering" : "Reorder Photos"}
            </button>
            {savingOrder && (
              <span className="text-sm text-gray-600">Saving…</span>
            )}
          </div>
        </div>

        {photos.length === 0 && <p>No photos uploaded yet.</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <AnimatePresence initial={false}>
            {photos.map((p, idx) => (
              <motion.div
                key={p.id}
                layout
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                  mass: 0.6,
                }}
                className={`relative group rounded-xl overflow-hidden bg-gray-100 ring-1 ring-black/5 ${
                  isReorderMode ? "cursor-grab active:cursor-grabbing" : ""
                }`}
              >
                {/* 👇 Native HTML5 drag props moved here to avoid Framer Motion type clash */}
                <div
                  className="contents"
                  draggable={isReorderMode}
                  onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                    if (!isReorderMode) return;
                    setDragIndex(idx);
                    const img = new window.Image();
                    img.src =
                      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
                    e.dataTransfer.setDragImage(img, 0, 0);
                  }}
                  onDragEnter={(e) => {
                    if (!isReorderMode) return;
                    e.preventDefault();
                    setPhotos((prev) => {
                      if (dragIndex === null || dragIndex === idx) return prev;
                      const a = prev.slice();
                      const [m] = a.splice(dragIndex, 1);
                      a.splice(idx, 0, m);
                      setDragIndex(idx);
                      return a;
                    });
                    setOrderDirty(true);
                  }}
                  onDragOver={(e) => {
                    if (isReorderMode) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!isReorderMode) return;
                    e.preventDefault();
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  {isReorderMode && (
                    <div className="absolute left-2 top-2 z-10 rounded-md bg-white/90 text-gray-700 ring-1 ring-black/5 opacity-80 pointer-events-none">
                      <DotsHandle />
                    </div>
                  )}
                  <div
                    className={`transition-opacity ${
                      p.is_public ? "" : "opacity-40"
                    }`}
                  >
                    <Image
                      src={p.publicUrl}
                      alt={p.caption ?? "photo"}
                      width={400}
                      height={300}
                      className="object-cover w-full h-48"
                      unoptimized
                    />
                  </div>
                  <div className="p-2 bg-white">
                    <button
                      onClick={() => togglePublic(p)}
                      className={`w-full text-xs rounded py-1 ${
                        p.is_public
                          ? "bg-gray-200 text-gray-700"
                          : "bg-green-600 text-white"
                      }`}
                    >
                      {p.is_public
                        ? "Remove from Portfolio"
                        : "Add to Portfolio"}
                    </button>
                  </div>
                </div>
                {/* ☝️ End native drag wrapper */}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
