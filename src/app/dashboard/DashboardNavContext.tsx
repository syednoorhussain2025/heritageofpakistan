"use client";
import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import type { PaneRoute } from "./DashboardPaneShell";

// Stable context — openPane/closePane never change reference.
// page.tsx reads from here. Does NOT re-render when activePane changes.
type DashboardNavActionsValue = {
  openPane: (route: PaneRoute) => void;
  closePane: () => void;
};

// Pane state context — only DashboardPaneShellConnected reads this.
type DashboardNavStateValue = {
  activePane: PaneRoute | null;
};

export const DashboardNavActionsContext = createContext<DashboardNavActionsValue>({
  openPane: () => {},
  closePane: () => {},
});

export const DashboardNavStateContext = createContext<DashboardNavStateValue>({
  activePane: null,
});

// Legacy combined hook — still works for any consumer that needs both
export function useDashboardNav() {
  const { openPane, closePane } = useContext(DashboardNavActionsContext);
  const { activePane } = useContext(DashboardNavStateContext);
  return { activePane, openPane, closePane };
}

// Actions-only hook — consumers only re-render when actions change (never)
export function useDashboardNavActions() {
  return useContext(DashboardNavActionsContext);
}

// State-only hook — only re-renders when activePane changes
export function useDashboardNavState() {
  return useContext(DashboardNavStateContext);
}

export function DashboardNavProvider({ children }: { children: ReactNode }) {
  const [activePane, setActivePane] = useState<PaneRoute | null>(null);

  const openPane = useCallback((route: PaneRoute) => {
    setActivePane(route);
  }, []);

  const closePane = useCallback(() => {
    setActivePane(null);
  }, []);

  const actions = useMemo(() => ({ openPane, closePane }), [openPane, closePane]);
  const state = useMemo(() => ({ activePane }), [activePane]);

  return (
    <DashboardNavActionsContext.Provider value={actions}>
      <DashboardNavStateContext.Provider value={state}>
        {children}
      </DashboardNavStateContext.Provider>
    </DashboardNavActionsContext.Provider>
  );
}
