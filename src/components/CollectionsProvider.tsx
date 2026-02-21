// src/components/CollectionsProvider.tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
const jitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4)); // +/-20%
const ATTEMPT_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== null) window.clearTimeout(timer);
  }) as Promise<T>;
}

export function CollectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = useMemo(() => createClient(), []);
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const collectedRef = useRef<Set<string>>(new Set());

  // Toast (match AddToCollectionModal)
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastId, setToastId] = useState(0);
  const toastTimerRef = useRef<number | null>(null);
  const toastCleanupRef = useRef<number | null>(null);

  // Track in-flight writes per key so multiple rapid clicks do not spawn races
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    collectedRef.current = collected;
  }, [collected]);

  // Fetch initial collected set (if signed in)
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const {
          data: sessionData,
          error: sessionError,
        } = await withTimeout(
          sb.auth.getSession(),
          ATTEMPT_TIMEOUT_MS,
          "getSession"
        );

        if (sessionError) throw sessionError;

        const user = sessionData.session?.user ?? null;

        if (!active) return;
        if (!user) {
          setCollected(new Set());
          setIsLoaded(true);
          return;
        }

        const rows = await listCollections(500);
        if (!active) return;

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
      } catch (e) {
        if (!active) return;
        console.warn("[CollectionsProvider] initial load skipped:", e);
        setCollected(new Set());
      } finally {
        if (!active) return;
        setIsLoaded(true);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep collected state in sync with auth transitions (SIGNED_OUT, SIGNED_IN)
  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      if (
        event !== "INITIAL_SESSION" &&
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      ) {
        return;
      }

      if (!session?.user) {
        // Signed out: clear client state so UI cannot behave signed-in
        inFlightRef.current.clear();
        setCollected(new Set());
        setIsLoaded(true);

        // Also dismiss any active toast
        setToastOpen(false);
        setToastMsg(null);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);
        toastTimerRef.current = null;
        toastCleanupRef.current = null;
        return;
      }

      // Signed in: reload keys so the UI matches the account immediately
      setIsLoaded(false);
      try {
        const rows = await listCollections(500);
        if (!active) return;
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
      } catch {
        if (!active) return;
        setCollected(new Set());
      } finally {
        if (!active) return;
        setIsLoaded(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);
    };
  }, []);

  function showToast(message: string) {
    setToastId((n) => n + 1); // force a fresh mount so entry always animates
    setToastMsg(message);
    setToastOpen(false);

    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (toastCleanupRef.current) window.clearTimeout(toastCleanupRef.current);

    // Ensure the "closed" state paints before opening, so slide-in is visible
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setToastOpen(true));
    });

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
    let key: string;
    try {
      key = computeDedupeKey({
        siteImageId: input.siteImageId,
        storagePath: input.storagePath,
        imageUrl: input.imageUrl,
      });
    } catch {
      showToast("Failed to save image. Missing image identity.");
      return;
    }

    // If a write is already running for this key, ignore a new click.
    if (inFlightRef.current.has(key)) return;

    const currentlyOn = collectedRef.current.has(key);
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

    try {
      for (let i = 0; i < attempts; i++) {
        try {
          if (i > 0) await sleep(jitter(backoffs[i]));

          if (targetOn) {
            await withTimeout(
              ensureCollected(input),
              ATTEMPT_TIMEOUT_MS,
              "ensureCollected"
            );
          } else {
            await withTimeout(
              removeFromCollection(input),
              ATTEMPT_TIMEOUT_MS,
              "removeFromCollection"
            );
          }

          success = true;
          break;
        } catch (e) {
          lastErr = e;
          if (typeof navigator !== "undefined" && !navigator.onLine) break;
        }
      }
    } finally {
      // Always release lock to avoid a permanently dead button for this photo.
      inFlightRef.current.delete(key);
    }

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
    console.error("[CollectionsProvider] toggleCollect failed:", lastErr);
  };

  return (
    <CollectionsCtx.Provider value={{ collected, toggleCollect, isLoaded }}>
      {children}

      {toastMsg && (
        <div className="fixed inset-0 z-[2147483647] pointer-events-none flex items-end justify-center pb-14 sm:pb-12">
          <div
            key={toastId}
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
