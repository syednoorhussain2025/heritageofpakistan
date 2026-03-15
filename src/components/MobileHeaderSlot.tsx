"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type SlotConfig = {
  content: ReactNode | null;
  transparent?: boolean;
  mobileMinHeight?: string;
};

// Read context — changes whenever slot content changes (only Header consumes this)
const MobileHeaderSlotReadContext = createContext<SlotConfig>({ content: null });

// Write context — stable, never changes (pages call setMobileHeaderSlot)
const MobileHeaderSlotWriteContext = createContext<(config: SlotConfig | null) => void>(() => {});

// Search trigger context — Header registers openSearch; slot consumers call it
const MobileHeaderOpenSearchContext = createContext<(() => void) | null>(null);
const MobileHeaderRegisterOpenSearchContext = createContext<(fn: () => void) => void>(() => {});

export function MobileHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slotConfig, setSlotConfig] = useState<SlotConfig>({ content: null });
  const [openSearchFn, setOpenSearchFn] = useState<(() => void) | null>(null);

  const setMobileHeaderSlot = useCallback((config: SlotConfig | null) => {
    setSlotConfig(config ?? { content: null });
  }, []);

  const registerOpenSearch = useCallback((fn: () => void) => {
    setOpenSearchFn(() => fn);
  }, []);

  return (
    <MobileHeaderRegisterOpenSearchContext.Provider value={registerOpenSearch}>
      <MobileHeaderOpenSearchContext.Provider value={openSearchFn}>
        <MobileHeaderSlotWriteContext.Provider value={setMobileHeaderSlot}>
          <MobileHeaderSlotReadContext.Provider value={slotConfig}>
            {children}
          </MobileHeaderSlotReadContext.Provider>
        </MobileHeaderSlotWriteContext.Provider>
      </MobileHeaderOpenSearchContext.Provider>
    </MobileHeaderRegisterOpenSearchContext.Provider>
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

/** Used by Header to register its openSearch function */
export function useMobileHeaderRegisterOpenSearch() {
  return useContext(MobileHeaderRegisterOpenSearchContext);
}

/** Used by pages/components to trigger the header search overlay */
export function useMobileHeaderOpenSearch() {
  return useContext(MobileHeaderOpenSearchContext);
}
