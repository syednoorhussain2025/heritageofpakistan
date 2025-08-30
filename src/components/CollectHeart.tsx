// src/components/CollectHeart.tsx
"use client";

import { useMemo, useState } from "react";
import { useCollections } from "@/components/CollectionsProvider";
import { makeCollectKey } from "@/lib/collections";
import Icon from "@/components/Icon";

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

function Spinner({ size = 16 }: { size?: number }) {
  const s = `${size}px`;
  return (
    <span
      className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
      style={{ width: s, height: s }}
      aria-hidden="true"
    />
  );
}

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
  const [busy, setBusy] = useState(false);

  const key = useMemo(
    () => makeCollectKey({ siteImageId, storagePath, imageUrl }),
    [siteImageId, storagePath, imageUrl]
  );
  const isOn = isLoaded && collected.has(key);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true); // instant spinner
    try {
      await toggleCollect({
        key,
        siteImageId: siteImageId ?? undefined,
        storagePath: storagePath ?? undefined,
        imageUrl: imageUrl ?? undefined,
        siteId: siteId ?? undefined,
        altText,
        caption,
        credit,
      });
    } finally {
      setBusy(false);
    }
  }

  const color = isOn ? "text-[var(--brand-orange)]" : "text-gray-300";
  const hover = isOn ? "" : "hover:text-[var(--brand-orange)]";
  const base =
    "cursor-pointer transition-transform duration-150 hover:scale-110 select-none";

  const wrapper =
    variant === "overlay"
      ? `absolute top-2 right-2 z-10 ${base} ${className}`
      : `${base} ${className}`;

  return (
    <button
      onClick={onClick}
      aria-pressed={isOn}
      title={isOn ? "Remove from My Collections" : "Add to My Collections"}
      className={wrapper}
    >
      {busy ? (
        <span className={`${color}`}>
          <Spinner size={size} />
        </span>
      ) : (
        <Icon name="heart" size={size} className={`${color} ${hover}`} />
      )}
    </button>
  );
}
