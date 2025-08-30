// src/components/CollectionsProvider.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  ensureCollected,
  listCollections,
  makeCollectKey,
  makeCollectKeyFromRow,
  removeFromCollection,
  type CollectInput,
} from "@/lib/collections";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";

type Ctx = {
  collected: Set<string>;
  toggleCollect: (input: CollectInput) => Promise<void>;
  isLoaded: boolean;
};

const CollectionsCtx = createContext<Ctx>({
  collected: new Set(),
  toggleCollect: async () => {},
  isLoaded: false,
});

export const useCollections = () => useContext(CollectionsCtx);

export function CollectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = createClient();
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Helper that mirrors the old "getCollectedKeys" by using existing exports
  const fetchCollectedKeys = async (): Promise<Set<string>> => {
    const rows = await listCollections(500);
    const keys = new Set<string>();
    for (const r of rows as any[]) {
      keys.add(
        makeCollectKeyFromRow({
          site_image_id: r.site_image_id ?? null,
          storage_path: r.storage_path ?? null,
          image_url: r.image_url ?? null,
        })
      );
    }
    return keys;
  };

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        setIsLoaded(true);
        return;
      }
      const keys = await fetchCollectedKeys();
      setCollected(keys);
      setIsLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const toggleCollect = async (input: CollectInput) => {
    const key = makeCollectKey({
      siteImageId: input.siteImageId,
      storagePath: input.storagePath,
      imageUrl: input.imageUrl,
    });

    const has = collected.has(key);

    // optimistic UI
    setCollected((prev) => {
      const next = new Set(prev);
      if (has) next.delete(key);
      else next.add(key);
      return next;
    });

    // Updated toast copy
    showToast(
      has ? "Removed from Collected Photos" : "Added to Collected Photos"
    );

    try {
      if (has) {
        await removeFromCollection(key);
      } else {
        // idempotent add
        await ensureCollected(input);
      }
    } catch (e) {
      // revert on error
      setCollected((prev) => {
        const next = new Set(prev);
        if (has) next.add(key);
        else next.delete(key);
        return next;
      });
      showToast("Action failed. Please try again.");
      // optional: console.error(e);
    }
  };

  return (
    <CollectionsCtx.Provider value={{ collected, toggleCollect, isLoaded }}>
      {children}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 rounded-lg bg-black text-white shadow-lg">
          <div className="flex items-center gap-2">
            <Icon name="heart" className="text-[var(--brand-orange)]" />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </CollectionsCtx.Provider>
  );
}
