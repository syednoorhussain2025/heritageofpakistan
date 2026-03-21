// src/components/loader-engine/LoaderEngineProvider.tsx
"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";

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
  // slideIn only used for white mode
  const [slideIn, setSlideIn] = useState(false);

  // Clear overlay when route actually changes
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      setSlideIn(false);
      const t = setTimeout(() => setOverlayMode(null), 200);
      return () => clearTimeout(t);
    }
  }, [pathname]);

  const startNavigation = useCallback(
    (href: string, options?: { direction?: Direction; variantOverride?: LoaderVariant; overlay?: NavOverlayMode }) => {
      if (!href) return;

      const mode = options?.overlay ?? null;
      if (mode === "white") {
        setOverlayMode("white");
        // Two rAFs: first paints the element, second triggers the transition
        requestAnimationFrame(() => requestAnimationFrame(() => setSlideIn(true)));
      } else if (mode === "transparent") {
        // Pop instantly — no animation needed
        setOverlayMode("transparent");
      }

      // Navigate immediately — no delay
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
  if (!mode) return null;

  if (mode === "transparent") {
    return (
      <div className="fixed inset-0 z-[5000] flex items-center justify-center pointer-events-none">
        <Spinner size={72} />
      </div>
    );
  }

  // White mode: slides in from right, fades out on exit
  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center pointer-events-none bg-white"
      style={{
        transform: slideIn ? "translateX(0)" : "translateX(100%)",
        opacity: slideIn ? 1 : 0,
        transition: slideIn
          ? "transform 0.26s cubic-bezier(0.4,0,0.2,1), opacity 0s"
          : "opacity 0.18s ease, transform 0s 0.18s",
      }}
    >
      <Spinner size={72} />
    </div>
  );
}

export function useLoaderEngine() {
  const ctx = useContext(LoaderEngineContext);
  if (!ctx) throw new Error("useLoaderEngine must be used within LoaderEngineProvider");
  return ctx;
}
