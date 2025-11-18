// src/components/GlobalSimpleLoaderProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { usePathname } from "next/navigation";

type SimpleLoaderContextValue = {
  showSimpleLoader: () => void;
  hideSimpleLoader: () => void;
};

const SimpleLoaderContext = createContext<SimpleLoaderContextValue | undefined>(
  undefined
);

export function GlobalSimpleLoaderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const pathname = usePathname();
  const hideTimeoutRef = useRef<number | null>(null);

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const showSimpleLoader = useCallback(() => {
    if (visible) return;

    clearHideTimeout();
    setVisible(true);
    setEntered(false);

    // Trigger slide-in on the next frames
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
  }, [visible]);

  const hideSimpleLoader = useCallback(() => {
    if (!visible && !entered) return;

    setEntered(false);
    clearHideTimeout();

    // Wait for slide-out animation, then unmount
    hideTimeoutRef.current = window.setTimeout(() => {
      setVisible(false);
    }, 220);
  }, [visible, entered]);

  // Auto-hide loader when the route (pathname) changes
  useEffect(() => {
    if (!pathname) return;
    if (visible) {
      hideSimpleLoader();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, []);

  const slideClass = entered ? "translate-x-0" : "translate-x-full";

  return (
    <SimpleLoaderContext.Provider value={{ showSimpleLoader, hideSimpleLoader }}>
      {children}

      {visible && (
        <div className="fixed inset-0 z-[9999] overflow-hidden bg-white">
          <div
            className={`
              w-full h-full flex items-center justify-center
              transition-transform duration-200 ease-out
              ${slideClass}
            `}
          >
            {/* Blank white card with a faster spinner in the center */}
            <div
              className="h-12 w-12 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin"
              style={{ animationDuration: "0.5s" }} // faster spin
            />
          </div>
        </div>
      )}
    </SimpleLoaderContext.Provider>
  );
}

export function useSimpleLoader() {
  const ctx = useContext(SimpleLoaderContext);
  if (!ctx) {
    throw new Error(
      "useSimpleLoader must be used within GlobalSimpleLoaderProvider"
    );
  }
  return ctx;
}
