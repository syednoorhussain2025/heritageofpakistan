// src/components/loader-engine/LoaderEngineProvider.tsx
"use client";

import React, { createContext, useCallback, useContext } from "react";
import { usePathname, useRouter } from "next/navigation";

type Direction = "prev" | "next" | "forward" | "back" | null;
type LoaderVariant = "listing" | "simple";

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

export function LoaderEngineProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const startNavigation = useCallback(
    (href: string) => {
      if (!href || href === pathname) return;
      router.push(href);
    },
    [pathname, router]
  );

  const showLoader = useCallback(
    (_variant: LoaderVariant, _direction: Direction = "forward") => {
      // Full-screen loader intentionally disabled.
    },
    []
  );

  const hideLoader = useCallback(() => {
    // Full-screen loader intentionally disabled.
  }, []);

  return (
    <LoaderEngineContext.Provider
      value={{
        startNavigation,
        showLoader,
        hideLoader,
        isVisible: false,
        variant: null,
        direction: null,
      }}
    >
      {children}
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
