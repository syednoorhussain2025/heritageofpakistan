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

  // Toast (match AddToCollectionModal)
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastCleanupRef = useRef<number | null>(null);

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
      if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);
    };
  }, []);

  function showToast(message: string) {
    setToastMsg(message);
    setToastOpen(false);

    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);

    // Trigger slide-in after mount
    window.requestAnimationFrame(() => setToastOpen(true));

    // Match timing: 1900ms visible, 220ms exit, 220ms transition
    toastTimerRef.current = window.setTimeout(() => {
      setToastOpen(false);
      toastCleanupRef.current = window.setTimeout(() => {
        setToastMsg(null);
        toastTimerRef.current = null;
        toastCleanupRef.current = null;
      }, 220);
    }, 1900);
  }

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
        targetOn ? "Added to Collected Photos" : "Removed from Collected Photos"
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

      {toastMsg && (
        <div className="fixed inset-0 z-[2147483647] pointer-events-none flex items-end justify-center pb-14 sm:pb-12">
          <div
            className="px-6 py-3.5 rounded-2xl bg-gray-900 text-white shadow-2xl flex items-center gap-3 max-w-[90vw] sm:max-w-lg w-max"
            style={{
              transform: toastOpen ? "translateY(0)" : "translateY(16px)",
              opacity: toastOpen ? 1 : 0,
              transition: "transform 220ms ease, opacity 220ms ease",
            }}
            role="status"
            aria-live="polite"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--brand-orange)] shrink-0" />
            <span className="font-medium text-[15px] leading-tight truncate">
              {toastMsg}
            </span>
          </div>
        </div>
      )}
    </CollectionsCtx.Provider>
  );
}
