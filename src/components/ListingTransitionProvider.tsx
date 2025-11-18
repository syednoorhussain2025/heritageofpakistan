// src/components/ListingTransitionProvider.tsx
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";

type Direction = "prev" | "next" | "forward" | "back" | null;

type ListingTransitionContextValue = {
  isLoading: boolean;
  direction: Direction;
  navigateWithListingTransition: (target: string, dir?: Direction) => void;
};

const ListingTransitionContext = createContext<
  ListingTransitionContextValue | undefined
>(undefined);

export function ListingTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [isLoading, setIsLoading] = useState(false);
  const [direction, setDirection] = useState<Direction>(null);
  const [entered, setEntered] = useState(false);

  const timeoutRef = useRef<number | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const navigateWithListingTransition = useCallback(
    (target: string, dir: Direction = "next") => {
      // prevent useless / broken transitions
      if (!target || isLoading || target === pathname) return;

      setDirection(dir);
      setIsLoading(true);
      setEntered(false);

      // Kick off slide animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });

      timeoutRef.current = window.setTimeout(() => {
        router.push(target);
      }, 320);
    },
    [router, isLoading, pathname]
  );

  // When the pathname changes, we consider navigation "complete" and hide the overlay
  useEffect(() => {
    // On any route change, reset the transition state
    setIsLoading(false);
    setEntered(false);
    setDirection(null);
  }, [pathname]);

  const loaderTransformClass =
    direction === "next" || direction === "forward"
      ? entered
        ? "translate-x-0"
        : "translate-x-full"
      : direction === "prev" || direction === "back"
      ? entered
        ? "translate-x-0"
        : "-translate-x-full"
      : "translate-x-0";

  return (
    <ListingTransitionContext.Provider
      value={{ isLoading, direction, navigateWithListingTransition }}
    >
      {children}

      {/* GLOBAL FULLSCREEN OVERLAY */}
      {isLoading && (
        <div className="fixed inset-0 z-[20] bg-[#f8f8f8] overflow-hidden">
          <div
            className={`
              relative w-full h-full
              transition-transform duration-300 ease-out
              ${loaderTransformClass}
            `}
          >
            <div className="w-full h-full bg-white flex flex-col">
              {/* COVER IMAGE SKELETON */}
              <div className="w-full bg-neutral-200 animate-pulse pt-[70%]" />

              {/* INFO SECTION */}
              <div className="px-4 pt-4 pb-8 space-y-5">
                {/* Title */}
                <div className="h-10 w-4/5 rounded-md bg-neutral-200 animate-pulse" />

                {/* Ratings row — circular stars */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-5 w-5 rounded-full bg-neutral-200 animate-pulse"
                      />
                    ))}
                  </div>
                </div>

                {/* Tagline paragraph */}
                <div className="space-y-2">
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-11/12 rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-9/12 rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-8/12 rounded bg-neutral-200 animate-pulse" />
                </div>
              </div>
            </div>

            {/* CENTERED SPINNER */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="h-12 w-12 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin" />
              <p
                className="mt-3 text-sm text-neutral-700 tracking-wide"
                aria-live="polite"
              >
                Loading site…
              </p>
            </div>
          </div>
        </div>
      )}
    </ListingTransitionContext.Provider>
  );
}

export function useListingTransition() {
  const ctx = useContext(ListingTransitionContext);
  if (!ctx) {
    throw new Error(
      "useListingTransition must be used within a ListingTransitionProvider"
    );
  }
  return ctx;
}
