"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { avatarSrc } from "@/lib/image/avatarSrc";
import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/Icon";
import { motion, AnimatePresence } from "framer-motion";
import { listAllUserPhotos, updatePhotoCaption } from "@/lib/db/reviewPhotos";
import {
  listPortfolio,
  reorderPortfolioItems,
  updatePortfolioItem,
  insertPortfolioItem,
} from "@/lib/db/portfolio";
import { storagePublicUrl } from "@/lib/image/storagePublicUrl";

type PhotoItem = {
  id: string;
  review_id: string;
  storage_path: string;
  caption: string | null;
  publicUrl: string;
  is_public: boolean;
  order_index: number;
  portfolio_item_id: string | null;
};

type ProfileData = {
  full_name: string | null;
  badge: string | null;
  avatar_url: string | null;
  portfolio_theme?: "light" | "dark";
};

function DotsHandle() {
  return (
    <div className="grid grid-cols-2 gap-[2px] p-1 cursor-grab active:cursor-grabbing">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-gray-500" />
      ))}
    </div>
  );
}

// Helper function to reorder arrays, from your working example
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const newArr = [...arr];
  const [item] = newArr.splice(from, 1);
  newArr.splice(to, 0, item);
  return newArr;
}

export default function PortfolioManager() {
  const { userId, authLoading } = useAuthUserId();
  const supabase = createClient();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("Copy Public Link");

  const [dragIndex, setDragIndex] = useState<{
    item: PhotoItem;
    index: number;
  } | null>(null);

  const publicPortfolioUrl =
    typeof window !== "undefined" && userId
      ? `${window.location.origin}/portfolio/${userId}`
      : "";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(publicPortfolioUrl).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus("Copy Public Link"), 2000);
    });
  };

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const [profileData, portfolioItems, allPhotosData] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, badge, avatar_url, portfolio_theme")
          .eq("id", userId)
          .single(),
        listPortfolio(userId),
        listAllUserPhotos(userId),
      ]);

      if (profileData.error) throw profileData.error;
      setProfile(profileData.data);

      const portfolioMap = new Map(
        portfolioItems.map((item) => [item.photo_id, item])
      );

      const allPhotoItems = allPhotosData.map((p) => {
        const portfolioItem = portfolioMap.get(p.id);
        return {
          id: p.id,
          review_id: p.review_id,
          storage_path: p.storage_path,
          caption: p.caption,
          publicUrl: storagePublicUrl("user-photos", p.storage_path),
          is_public: portfolioItem ? portfolioItem.is_public : true, // Default to public
          order_index: portfolioItem ? portfolioItem.order_index : 999,
          portfolio_item_id: portfolioItem ? portfolioItem.id : null,
        };
      });

      allPhotoItems.sort((a, b) => a.order_index - b.order_index);
      setPhotos(allPhotoItems);
    } catch (e: any) {
      setPageError(e?.message ?? "Error loading portfolio");
    } finally {
      setLoading(false);
    }
  }, [userId, supabase]);

  useEffect(() => {
    if (!authLoading && userId) {
      loadData();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, userId, loadData]);

  const setTheme = async (theme: "light" | "dark") => {
    if (!userId) return;
    setProfile((p) => (p ? { ...p, portfolio_theme: theme } : null));
    await supabase
      .from("profiles")
      .update({ portfolio_theme: theme })
      .eq("id", userId);
  };

  const togglePublic = async (photoId: string) => {
    if (!userId) return;
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return;

    const isCurrentlyPublic = photo.is_public;
    setPhotos((currentPhotos) =>
      currentPhotos.map((p) =>
        p.id === photoId
          ? {
              ...p,
              is_public: !isCurrentlyPublic,
              portfolio_item_id: p.portfolio_item_id || "temp",
            }
          : p
      )
    );

    try {
      if (photo.portfolio_item_id) {
        await updatePortfolioItem(photoId, { is_public: !isCurrentlyPublic });
      } else {
        const newItem = await insertPortfolioItem(
          userId,
          photoId,
          photos.length
        );
        setPhotos((current) =>
          current.map((p) =>
            p.id === photoId ? { ...p, portfolio_item_id: newItem.id } : p
          )
        );
      }
    } catch (e) {
      setPhotos((currentPhotos) =>
        currentPhotos.map((p) =>
          p.id === photoId ? { ...p, is_public: isCurrentlyPublic } : p
        )
      );
      console.error("Failed to toggle public status", e);
    }
  };

  const handleSaveCaption = async (photoId: string, newCaption: string) => {
    setPhotos((currentPhotos) =>
      currentPhotos.map((p) =>
        p.id === photoId ? { ...p, caption: newCaption } : p
      )
    );
    await updatePhotoCaption(photoId, newCaption);
  };

  const handleReorder = useCallback(
    async (reorderedPhotos: PhotoItem[]) => {
      if (!userId) return;
      // Update state immediately for smooth UI
      setPhotos(reorderedPhotos);
      // Persist the new order to the database
      const publicPhotoIds = reorderedPhotos
        .filter((p) => p.is_public)
        .map((p) => p.id);
      await reorderPortfolioItems(userId, publicPhotoIds);
    },
    [userId]
  );

  if (authLoading || loading) return <p>Loading portfolio...</p>;
  if (!userId) return <p>Please sign in to manage your portfolio.</p>;

  return (
    <div className="space-y-8">
      {/* My Portfolio Manager */}
      <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          My Portfolio Manager
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-6">
          {/* Left Side: User Profile */}
          {profile && (
            <div className="flex items-center gap-4">
              <Image
                src={avatarSrc(profile.avatar_url) || "/default-avatar.png"}
                alt="User avatar"
                width={64}
                height={64}
                className="rounded-full"
              />
              <div>
                <div className="font-semibold text-lg">{profile.full_name}</div>
                <div className="text-sm text-green-600">{profile.badge}</div>
              </div>
            </div>
          )}

          {/* Right Side: Actions */}
          <div className="flex flex-wrap items-center gap-6">
            {/* Public Link Section */}
            <div className="flex items-center gap-4">
              <Link
                href={publicPortfolioUrl}
                target="_blank"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 flex-shrink-0"
              >
                <Icon name="external-link-alt" size={12} />
                View
              </Link>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicPortfolioUrl}
                  className="w-full sm:w-64 text-sm bg-gray-50 border border-gray-300 rounded-md px-2 py-1"
                />
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-1 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-800 w-36 text-center flex-shrink-0"
                >
                  {copyStatus}
                </button>
              </div>
            </div>

            {/* Separator */}
            <div className="h-10 w-px bg-gray-200 self-center hidden md:block"></div>

            {/* Theme Section */}
            <div className="space-y-2 text-center md:text-left">
              <div className="text-sm font-semibold text-gray-700">
                Portfolio Theme
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme("light")}
                  className={`px-4 py-1.5 text-sm rounded-md border transition-all ${
                    profile?.portfolio_theme !== "dark"
                      ? "bg-white ring-2 ring-blue-500 shadow"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`px-4 py-1.5 text-sm rounded-md border transition-all ${
                    profile?.portfolio_theme === "dark"
                      ? "bg-gray-800 text-white ring-2 ring-blue-500 shadow"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Manage Photos */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Manage Photos</h2>
          <button
            onClick={() => setIsReorderMode(!isReorderMode)}
            className={`px-4 py-2 text-sm rounded-md flex items-center gap-2 ${
              isReorderMode ? "bg-green-600 text-white" : "bg-gray-200"
            }`}
          >
            <Icon name={isReorderMode ? "check" : "sort"} size={14} />
            {isReorderMode ? "Done Reordering" : "Reorder Photos"}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <AnimatePresence>
            {photos.map((p, idx) => (
              <motion.div
                key={p.id}
                layoutId={p.id}
                draggable={isReorderMode && p.is_public}
                onDragStart={() => {
                  if (!isReorderMode || !p.is_public) return;
                  setDragIndex({ item: p, index: idx });
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                }}
                onDragOver={(e) => {
                  if (!isReorderMode || !p.is_public || !dragIndex) return;
                  e.preventDefault();
                  if (dragIndex.index !== idx) {
                    const newOrder = arrayMove(photos, dragIndex.index, idx);
                    setDragIndex({ item: dragIndex.item, index: idx });
                    handleReorder(newOrder);
                  }
                }}
                className={`border rounded-lg overflow-hidden flex flex-col`}
              >
                <div
                  className={`relative aspect-square ${
                    !p.is_public && "opacity-50"
                  }`}
                >
                  {isReorderMode && p.is_public && (
                    <div className="absolute top-2 left-2 z-10 bg-white/80 rounded-md p-1">
                      <DotsHandle />
                    </div>
                  )}
                  <Image
                    src={p.publicUrl}
                    alt={p.caption || "photo"}
                    layout="fill"
                    objectFit="cover"
                  />
                  <button
                    onClick={() => togglePublic(p.id)}
                    className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white text-lg transition ${
                      p.is_public ? "bg-green-600" : "bg-gray-500"
                    }`}
                    title={
                      p.is_public ? "Included in Portfolio" : "Not in Portfolio"
                    }
                  >
                    {p.is_public ? (
                      <Icon name="check" size={14} />
                    ) : (
                      <Icon name="plus" size={14} />
                    )}
                  </button>
                </div>
                <div className="p-2 border-t bg-gray-50 flex-grow">
                  <textarea
                    defaultValue={p.caption ?? ""}
                    placeholder="Add caption..."
                    onBlur={(e) => handleSaveCaption(p.id, e.target.value)}
                    className="w-full border rounded p-1 text-xs resize-none h-16"
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
