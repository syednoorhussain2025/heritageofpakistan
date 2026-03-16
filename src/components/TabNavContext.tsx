"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type TabNavContextValue = {
  optimisticHref: string | null;
  setOptimisticHref: (href: string | null) => void;
};

const TabNavContext = createContext<TabNavContextValue>({
  optimisticHref: null,
  setOptimisticHref: () => {},
});

export function TabNavProvider({ children }: { children: ReactNode }) {
  const [optimisticHref, setOptimisticHrefState] = useState<string | null>(null);

  const setOptimisticHref = useCallback((href: string | null) => {
    setOptimisticHrefState(href);
  }, []);

  return (
    <TabNavContext.Provider value={{ optimisticHref, setOptimisticHref }}>
      {children}
    </TabNavContext.Provider>
  );
}

export function useTabNav() {
  return useContext(TabNavContext);
}
