"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// PERFORMANCE OPTIMIZATION:
// Use dynamic imports so these loader components (which might have heavy SVGs/animations)
// are NOT included in the initial JavaScript bundle. This lowers TBT (Total Blocking Time).
const ListingLoader = dynamic(
  () => import("./ListingLoader").then((mod) => mod.ListingLoader),
  { ssr: false }
);
const SimpleLoader = dynamic(
  () => import("./SimpleLoader").then((mod) => mod.SimpleLoader),
  { ssr: false }
);

type Direction = "prev" | "next" | "forward" | "back" | null;
type LoaderVariant = "listing" | "simple";
type Phase = "entering" | "active" | "exiting";

type StartNavigationOptions = {
  direction?: Direction;
  variantOverride?: LoaderVariant;
};

type LoaderEngineContextValue = {
  startNavigation: (href: string, options?: StartNavigationOptions) => void;
  showLoader: (variant: LoaderVariant, direction?: Direction) => void;
  hideLoader: () => void;
  isVisible: boolean;
  variant: LoaderVariant | null;
  direction: Direction;
};

const LoaderEngineContext = createContext<
  LoaderEngineContextValue | undefined
>(undefined);

function getVariantForHref(href: string): LoaderVariant {
  if (href.startsWith("/heritage")) return "listing";
  return "simple";
}

export function LoaderEngineProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [visible, setVisible] = useState(false);
  const [variant, setVariant] = useState<LoaderVariant | null>(null);
  const [direction, setDirection] = useState<Direction>("forward");
  const [phase, setPhase] = useState<Phase>("active");

  const navTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const clearNavTimeout = () => {
    if (navTimeoutRef.current !== null) {
      window.clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }
  };

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const showLoader = useCallback(
    (v: LoaderVariant, dir: Direction = "forward") => {
      if (visible && variant === v && direction === dir) return;

      clearNavTimeout();
      clearHideTimeout();

      setVariant(v);
      setDirection(dir);
      setVisible(true);
      setPhase("entering");

      // Promote to active after a couple of frames for a snappy slide in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("active"));
      });
    },
    [visible, variant, direction]
  );

  const hideLoader = useCallback(() => {
    if (!visible) return;

    setPhase("exiting");
    clearHideTimeout();

    // Allow fade out to complete
    hideTimeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      setVariant(null);
      setPhase("active");
    }, 220);
  }, [visible]);

  const startNavigation = useCallback(
    (href: string, options?: StartNavigationOptions) => {
      if (!href || href === pathname) return;

      const chosenVariant =
        options?.variantOverride ?? getVariantForHref(href);
      const dir = options?.direction ?? "forward";

      showLoader(chosenVariant, dir);

      clearNavTimeout();
      navTimeoutRef.current = window.setTimeout(() => {
        router.push(href);
      }, 260);
    },
    [pathname, router, showLoader]
  );

  // Auto hide when route changes
  useEffect(() => {
    if (!pathname) return;
    if (visible) {
      hideLoader();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearNavTimeout();
      clearHideTimeout();
    };
  }, []);

  const renderActiveLoader = () => {
    if (!variant) return null;
    if (variant === "listing") {
      return <ListingLoader direction={direction} phase={phase} />;
    }
    // SimpleLoader currently does not accept props, so do not pass phase
    return <SimpleLoader />;
  };

  return (
    <LoaderEngineContext.Provider
      value={{
        startNavigation,
        showLoader,
        hideLoader,
        isVisible: visible,
        variant,
        direction,
      }}
    >
      {children}

      {visible && (
        // Transparent overlay, no white flash
        <div className="fixed inset-0 z-[20] pointer-events-none">
          <div className="relative w-full h-full pointer-events-auto">
            {renderActiveLoader()}
          </div>
        </div>
      )}
    </LoaderEngineContext.Provider>
  );
}

export function useLoaderEngine() {
  const ctx = useContext(LoaderEngineContext);
  if (!ctx) {
    throw new Error(
      "useLoaderEngine must be used within LoaderEngineProvider"
    );
  }
  return ctx;
}