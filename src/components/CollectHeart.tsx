// src/components/CollectHeart.tsx
"use client";

import { useMemo, useState } from "react";
import { useCollections } from "@/components/CollectionsProvider";
import { computeDedupeKey } from "@/lib/collections";
import Icon from "@/components/Icon";
import { motion } from "framer-motion";

type Props = {
  siteImageId?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  siteId?: string | null;
  altText?: string | null;
  caption?: string | null;
  credit?: string | null;

  /** "overlay" positions top-right absolutely; "icon" renders inline */
  variant?: "overlay" | "icon";
  className?: string;
  size?: number; // icon size
};

export default function CollectHeart({
  siteImageId,
  storagePath,
  imageUrl,
  siteId,
  altText,
  caption,
  credit,
  variant = "overlay",
  className = "",
  size = 18,
}: Props) {
  const { collected, toggleCollect, isLoaded } = useCollections();
  const [popping, setPopping] = useState(false);

  // Mirrors DB: coalesce(site_image_id::text, storage_path, image_url)
  const key = useMemo(
    () =>
      computeDedupeKey({
        siteImageId: siteImageId ?? undefined,
        storagePath: storagePath ?? undefined,
        imageUrl: imageUrl ?? undefined,
      }),
    [siteImageId, storagePath, imageUrl]
  );

  const isOn = isLoaded && collected.has(key);

  // MODIFIED: Conditionally choose icon name for filled or outline style
  const iconName = isOn ? "heart" : "heart-outline";
  const color = isOn ? "text-[var(--brand-orange)]" : "white";
  const hover = isOn ? "" : "hover:text-[var(--brand-orange)]";
  const base =
    "cursor-pointer transition-transform duration-150 hover:scale-110 select-none";
  const wrapper =
    variant === "overlay"
      ? `absolute top-2 right-2 z-10 ${base} ${className}`
      : `${base} ${className}`;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // trigger popping animation
    setPopping(true);
    setTimeout(() => setPopping(false), 150); // quick reset

    // delegate background add/remove to provider
    void toggleCollect({
      siteImageId: siteImageId ?? undefined,
      storagePath: storagePath ?? undefined,
      imageUrl: imageUrl ?? undefined,
      siteId: siteId ?? undefined,
      altText: altText ?? null,
      caption: caption ?? null,
      credit: credit ?? null,
    });
  }

  return (
    <motion.button
      onClick={handleClick}
      aria-pressed={isOn}
      title={isOn ? "Remove from My Collections" : "Add to My Collections"}
      className={wrapper}
      animate={popping ? { scale: 1.4 } : { scale: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {/* MODIFIED: Use the dynamic iconName variable */}
      <Icon name={iconName} size={size} className={`${color} ${hover}`} />
    </motion.button>
  );
}
