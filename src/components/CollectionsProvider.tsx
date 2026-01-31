// src/components/CollectionsProvider.tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  listCollections,
  computeDedupeKey,
  makeCollectKeyFromRow,
  ensureCollected,
  removeFromCollection,
  type CollectInput,
} from "@/lib/collections";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";

type Ctx = {
  collected: Set<string>; // dedupe_keys currently collected
  toggleCollect: (input: CollectInput) => Promise<void>;
  isLoaded: boolean; // whether the initial fetch completed
};

const CollectionsCtx = createContext<Ctx>({
  collected: new Set(),
  toggleCollect: async () => {},
  isLoaded: false,
});

export const useCollections = () => useContext(CollectionsCtx);

// Small helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4)); // ±20%

export function CollectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = createClient();
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Track in-flight writes per key so multiple rapid clicks don’t spawn races
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        setIsLoaded(true);
        return;
      }
      try {
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
        setCollected(keys);
      } finally {
        setIsLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2000);
  };

  const toggleCollect = async (input: CollectInput) => {
    const key = computeDedupeKey({
      siteImageId: input.siteImageId,
      storagePath: input.storagePath,
      imageUrl: input.imageUrl,
    });

    // If a write is already running for this key, ignore a new click.
    if (inFlightRef.current.has(key)) return;

    const currentlyOn = collected.has(key);
    const targetOn = !currentlyOn;

    // Optimistic UI: flip immediately
    setCollected((prev) => {
      const next = new Set(prev);
      if (targetOn) next.add(key);
      else next.delete(key);
      return next;
    });

    inFlightRef.current.add(key);

    // Retry policy: 1 immediate try + 2 retries with backoff
    const attempts = 3;
    const backoffs = [0, 600, 1500]; // ms

    let success = false;
    let lastErr: any = null;

    for (let i = 0; i < attempts; i++) {
      try {
        if (i > 0) await sleep(jitter(backoffs[i]));
        if (targetOn) {
          await ensureCollected(input); // idempotent add
        } else {
          await removeFromCollection(input); // idempotent remove
        }
        success = true;
        break;
      } catch (e) {
        lastErr = e;
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
      }
    }

    inFlightRef.current.delete(key);

    if (success) {
      showToast(
        targetOn
          ? "Added to Collected Photos"
          : "Removed from Collected Photos"
      );
      return;
    }

    // Total failure: revert optimistic change and notify
    setCollected((prev) => {
      const next = new Set(prev);
      if (targetOn) next.delete(key);
      else next.add(key);
      return next;
    });
    showToast("Failed to save image. Please try again.");
    // Optional: console.error(lastErr);
  };

  return (
    <CollectionsCtx.Provider value={{ collected, toggleCollect, isLoaded }}>
      {children}

      {toast && (
        <button
          onClick={() => setToast(null)} // click-to-dismiss (optional)
          role="status"
          aria-live="polite"
          // UPDATED: bottom-24 to move up, z-[2147483647] to be in front of everything
          className="fixed bottom-30 right-5 z-[2147483647] px-4 py-2 rounded-lg bg-black text-white shadow-lg"
          title="Dismiss"
        >
          <div className="flex items-center gap-2">
            <Icon name="heart" className="text-[var(--brand-orange)]" />
            <span>{toast}</span>
          </div>
        </button>
      )}
    </CollectionsCtx.Provider>
  );
}