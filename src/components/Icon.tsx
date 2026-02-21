// src/components/Icon.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

// --- Types ---
type IconData = {
  name: string;
  svg_content: string;
};

type IconContextType = {
  icons: Map<string, string>;
  isLoaded: boolean;
};

// --- Cache keys ---
const ICONS_CACHE_KEY = "hop:icons:cache:v1";
const ICONS_CACHE_HASH_KEY = "hop:icons:cachehash:v1";
const ICONS_CACHE_TIME_KEY = "hop:icons:cachedat:v1";

// --- Utils ---
function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function stableHashFromPairs(pairs: Array<[string, string]>) {
  // Small deterministic hash so we can compare cached vs fetched quickly
  // Not cryptographic, just a change detector.
  let h = 2166136261;
  for (const [k, v] of pairs) {
    const s = `${k}\u0000${v}\u0001`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  // Force unsigned
  return String(h >>> 0);
}

function loadCachedIconPairs(): Array<[string, string]> | null {
  if (typeof window === "undefined") return null;
  const pairs = safeParseJson<Array<[string, string]>>(window.localStorage.getItem(ICONS_CACHE_KEY));
  if (!pairs || !Array.isArray(pairs)) return null;
  // Basic sanity check
  for (const p of pairs) {
    if (!Array.isArray(p) || typeof p[0] !== "string" || typeof p[1] !== "string") return null;
  }
  return pairs;
}

function saveCachedIconPairs(pairs: Array<[string, string]>, hash: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ICONS_CACHE_KEY, JSON.stringify(pairs));
    window.localStorage.setItem(ICONS_CACHE_HASH_KEY, hash);
    window.localStorage.setItem(ICONS_CACHE_TIME_KEY, String(Date.now()));
  } catch {
    // Ignore storage quota or disabled storage
  }
}

// --- React Context ---
const IconContext = createContext<IconContextType>({
  icons: new Map(),
  isLoaded: false,
});

/**
 * Provider behavior:
 * 1) Hydrate icons immediately from localStorage if present
 * 2) Render immediately (no DB dependency for first paint if cached exists)
 * 3) Revalidate from Supabase in the background and update cache if changed
 */
export function IconProvider({ children }: { children: React.ReactNode }) {
  // Keep first client render identical to server render to avoid hydration mismatch.
  const [icons, setIcons] = useState<Map<string, string>>(new Map());
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchIconsAndUpdateCache() {
      // Step 1: hydrate quickly from local cache on the client after mount.
      const cached = loadCachedIconPairs();
      if (!cancelled && cached && cached.length > 0) {
        setIcons(new Map(cached));
        setIsLoaded(true);
      }

      // Step 2: always revalidate from Supabase and update only if changed.
      try {
        const { data, error } = await supabase.from("icons").select("name, svg_content");
        if (error) {
          // Do not break UI if DB is slow or fails
          console.error("Failed to fetch icons:", error);
          if (!cancelled) setIsLoaded(true);
          return;
        }

        const rows = (data || []) as IconData[];

        // Build stable sorted pairs
        const pairs: Array<[string, string]> = rows
          .filter((r) => !!r?.name && typeof r.svg_content === "string")
          .map((r) => [r.name, r.svg_content]);

        pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

        const nextHash = stableHashFromPairs(pairs);

        const prevHash =
          typeof window !== "undefined" ? window.localStorage.getItem(ICONS_CACHE_HASH_KEY) : null;

        // Update state only if changed (prevents pointless rerenders)
        if (!prevHash || prevHash !== nextHash) {
          if (!cancelled) {
            setIcons(new Map(pairs));
          }
          saveCachedIconPairs(pairs, nextHash);
        } else {
          // Mark cache as refreshed
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(ICONS_CACHE_TIME_KEY, String(Date.now()));
            } catch {}
          }
        }

        if (!cancelled) setIsLoaded(true);
      } catch (e) {
        console.error("Icon fetch crashed:", e);
        if (!cancelled) setIsLoaded(true);
      }
    }

    void fetchIconsAndUpdateCache();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ icons, isLoaded }), [icons, isLoaded]);

  return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}

// --- Custom Hook ---
export const useIcons = () => useContext(IconContext);

// --- The Universal <Icon /> Component ---
interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: number | string;
}

/**
 * Renders an SVG icon from the global icon cache.
 * Fallback behavior:
 * - If icon not found, render an invisible placeholder that does not block layout
 * - Never throws, so a missing icon cannot crash the app
 */
export default function Icon({ name, size, className, ...props }: IconProps) {
  const { icons } = useIcons();
  const svgContent = icons.get(name);

  if (!svgContent) {
    return (
      <span
        className={`inline-block bg-transparent ${className || ""}`}
        style={{ width: size || "1em", height: size || "1em" }}
        aria-label={`Icon: ${name}`}
        {...props}
      />
    );
  }

  return (
    <span
      className={`inline-block ${className || ""}`}
      style={{ fontSize: size }}
      // svg_content should already be sanitized at creation time
      dangerouslySetInnerHTML={{ __html: svgContent }}
      {...props}
    />
  );
}
