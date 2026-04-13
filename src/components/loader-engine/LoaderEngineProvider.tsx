// src/components/loader-engine/LoaderEngineProvider.tsx
"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";

type Direction = "prev" | "next" | "forward" | "back" | null;
type LoaderVariant = "listing" | "simple";

export type NavOverlayMode = "white" | "white-silent" | "white-silent-back" | "transparent" | null;

type LoaderEngineContextValue = {
  startNavigation: (href: string, options?: { direction?: Direction; variantOverride?: LoaderVariant; overlay?: NavOverlayMode }) => void;
  showLoader: (variant: LoaderVariant, direction?: Direction) => void;
  hideLoader: () => void;
  isVisible: boolean;
  variant: LoaderVariant | null;
  direction: Direction;
  overlayMode: NavOverlayMode;
};

const LoaderEngineContext = createContext<LoaderEngineContextValue | undefined>(undefined);

export function LoaderEngineProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);

  const [overlayMode, setOverlayMode] = useState<NavOverlayMode>(null);
  const [slideIn, setSlideIn] = useState(false);
  // Earliest time (ms) the overlay is allowed to start fading out
  const dismissAfterRef = useRef<number>(0);
  const dismissTimersRef = useRef<{ t1: number; t2: number } | null>(null);

  const scheduleDismiss = useCallback(() => {
    if (dismissTimersRef.current) {
      clearTimeout(dismissTimersRef.current.t1);
      clearTimeout(dismissTimersRef.current.t2);
    }
    const delay = Math.max(0, dismissAfterRef.current - Date.now());
    const t1 = window.setTimeout(() => setSlideIn(false), delay);
    const t2 = window.setTimeout(() => setOverlayMode(null), delay + 300);
    dismissTimersRef.current = { t1, t2 };
  }, []);

  // Clear overlay when route actually changes
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      scheduleDismiss();
    }
  }, [pathname, scheduleDismiss]);

  const startNavigation = useCallback(
    (href: string, options?: { direction?: Direction; variantOverride?: LoaderVariant; overlay?: NavOverlayMode }) => {
      if (!href || href === pathname) return;

      const mode = options?.overlay ?? null;
      if (mode === "white" || mode === "white-silent" || mode === "white-silent-back") {
        setOverlayMode(mode);
        // Slide takes 220ms — don't allow dismiss until slide is done + 150ms buffer
        dismissAfterRef.current = Date.now() + 220 + 150;
        requestAnimationFrame(() => requestAnimationFrame(() => setSlideIn(true)));
      } else if (mode === "transparent") {
        setOverlayMode("transparent");
        dismissAfterRef.current = 0;
      }

      try {
        router.push(href);
      } catch {
        if (typeof window !== "undefined") window.location.href = href;
      }
    },
    [router, pathname, scheduleDismiss]
  );

  useEffect(() => () => {
    if (dismissTimersRef.current) {
      clearTimeout(dismissTimersRef.current.t1);
      clearTimeout(dismissTimersRef.current.t2);
    }
  }, []);

  const showLoader = useCallback((_variant: LoaderVariant, _direction: Direction = "forward") => {}, []);
  const hideLoader = useCallback(() => {}, []);

  return (
    <LoaderEngineContext.Provider
      value={{
        startNavigation,
        showLoader,
        hideLoader,
        isVisible: false,
        variant: null,
        direction: null,
        overlayMode,
      }}
    >
      {children}
      <NavOverlay mode={overlayMode} slideIn={slideIn} />
    </LoaderEngineContext.Provider>
  );
}

function NavOverlay({ mode, slideIn }: { mode: NavOverlayMode; slideIn: boolean }) {
  if (!mode) return null;

  if (mode === "transparent") {
    return (
      <div className="fixed inset-0 z-[5000] flex items-center justify-center pointer-events-none">
        <Spinner size={72} />
      </div>
    );
  }

  const silent = mode === "white-silent" || mode === "white-silent-back";
  const fromLeft = mode === "white-silent-back";

  // White mode: slides in from right (forward) or left (back), fades out softly
  return (
    <div
      className="fixed inset-0 z-[5000] pointer-events-none bg-white"
      style={{
        transform: slideIn ? "translateX(0)" : `translateX(${fromLeft ? "-100%" : "100%"})`,
        opacity: slideIn ? 1 : 0,
        transition: slideIn
          ? "transform 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0s"
          : silent
          ? "opacity 0.3s cubic-bezier(0.4,0,0.2,1), transform 0s 0.3s"
          : "opacity 0.18s ease, transform 0s 0.18s",
      }}
    >
      <div className="w-full h-full flex items-center justify-center">
        <Spinner variant="dots" size={72} />
      </div>
    </div>
  );
}

export function useLoaderEngine() {
  const ctx = useContext(LoaderEngineContext);
  if (!ctx) throw new Error("useLoaderEngine must be used within LoaderEngineProvider");
  return ctx;
}
