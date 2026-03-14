"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

// Read context — changes whenever slot content changes (only Header consumes this)
const MobileHeaderSlotReadContext = createContext<ReactNode | null>(null);

// Write context — stable, never changes (pages call setMobileHeaderSlot)
const MobileHeaderSlotWriteContext = createContext<(node: ReactNode | null) => void>(() => {});

export function MobileHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [mobileHeaderSlot, setSlot] = useState<ReactNode | null>(null);

  const setMobileHeaderSlot = useCallback((node: ReactNode | null) => {
    setSlot(node);
  }, []);

  return (
    <MobileHeaderSlotWriteContext.Provider value={setMobileHeaderSlot}>
      <MobileHeaderSlotReadContext.Provider value={mobileHeaderSlot}>
        {children}
      </MobileHeaderSlotReadContext.Provider>
    </MobileHeaderSlotWriteContext.Provider>
  );
}

/** Used by Header to render the slot content */
export function useMobileHeaderSlotContent() {
  return useContext(MobileHeaderSlotReadContext);
}

/** Used by pages to register/clear their mobile header content */
export function useMobileHeaderSlot() {
  return useContext(MobileHeaderSlotWriteContext);
}
