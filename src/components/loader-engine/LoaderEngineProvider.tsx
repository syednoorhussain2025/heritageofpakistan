// src/components/loader-engine/LoaderEngineProvider.tsx
"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type Direction = "prev" | "next" | "forward" | "back" | null;
type LoaderVariant = "listing" | "simple";

export type NavOverlayMode = "white" | "transparent" | null;

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

  // Clear overlay when route actually changes
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      // Fade out — let CSS transition handle it then hide
      setSlideIn(false);
      const t = setTimeout(() => setOverlayMode(null), 250);
      return () => clearTimeout(t);
    }
  }, [pathname]);

  const startNavigation = useCallback(
    (href: string, options?: { direction?: Direction; variantOverride?: LoaderVariant; overlay?: NavOverlayMode }) => {
      if (!href) return;

      const mode = options?.overlay ?? null;
      if (mode) {
        setOverlayMode(mode);
        // Trigger slide-in on next frame so CSS transition fires
        requestAnimationFrame(() => setSlideIn(true));
      }

      try {
        router.push(href);
      } catch {
        if (typeof window !== "undefined") window.location.href = href;
      }
    },
    [router]
  );

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
  // Lazy-import Spinner only on client to avoid SSR issues
  const [SpinnerComp, setSpinnerComp] = useState<React.ComponentType<{ size?: number }> | null>(null);
  useEffect(() => {
    import("@/components/ui/Spinner").then((m) => setSpinnerComp(() => m.Spinner));
  }, []);

  if (!mode) return null;

  const isWhite = mode === "white";

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center pointer-events-none"
      style={{
        backgroundColor: isWhite ? "white" : "transparent",
        transform: slideIn ? "translateX(0)" : "translateX(100%)",
        transition: slideIn
          ? "transform 0.28s cubic-bezier(0.4,0,0.2,1)"
          : "opacity 0.18s ease",
        opacity: slideIn ? 1 : 0,
      }}
    >
      {SpinnerComp && <SpinnerComp size={72} />}
    </div>
  );
}

export function useLoaderEngine() {
  const ctx = useContext(LoaderEngineContext);
  if (!ctx) throw new Error("useLoaderEngine must be used within LoaderEngineProvider");
  return ctx;
}
