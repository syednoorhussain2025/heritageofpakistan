// src/components/GlobalSimpleLoaderProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";

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

  const showSimpleLoader = useCallback(() => {
    if (visible) return;

    setVisible(true);
    setEntered(false);

    // trigger slide-in on next frames
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
  }, [visible]);

  const hideSimpleLoader = useCallback(() => {
    // slide out, then unmount
    setEntered(false);
    setTimeout(() => {
      setVisible(false);
    }, 220);
  }, []);

  const slideClass = entered ? "translate-x-0" : "translate-x-full";

  return (
    <SimpleLoaderContext.Provider value={{ showSimpleLoader, hideSimpleLoader }}>
      {children}

      {visible && (
        <div className="fixed inset-0 z-[20] overflow-hidden bg-white">
          <div
            className={`
              w-full h-full flex items-center justify-center
              transition-transform duration-200 ease-out
              ${slideClass}
            `}
          >
            {/* Blank white card with centered spinner */}
            <div className="h-12 w-12 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin" />
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
