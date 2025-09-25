"use client";

import { useMemo, useState } from "react";
import { useCollections } from "@/components/CollectionsProvider";
import { computeDedupeKey } from "@/lib/collections";

type Args = {
  siteImageId?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  siteId?: string | number | null;
  altText?: string | null;
  caption?: string | null;
  credit?: string | null;
};

export function useCollectHeart({
  siteImageId = null,
  storagePath = null,
  imageUrl = null,
  siteId = null,
  altText = null,
  caption = null,
  credit = null,
}: Args) {
  const { collected, toggleCollect, isLoaded } = useCollections();
  const [popping, setPopping] = useState(false);

  // Mirrors DB key: coalesce(site_image_id::text, storage_path, image_url)
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

  const toggle = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPopping(true);
    setTimeout(() => setPopping(false), 150);

    await toggleCollect({
      siteImageId: siteImageId ?? undefined,
      storagePath: storagePath ?? undefined,
      imageUrl: imageUrl ?? undefined,
      siteId: (siteId ?? undefined) as string | number | undefined,
      altText: altText ?? null,
      caption: caption ?? null,
      credit: credit ?? null,
    });
  };

  const title = isOn ? "Remove from My Collections" : "Add to My Collections";

  return { isOn, toggle, popping, title };
}
