"use client";
import { createContext, useContext } from "react";
import type { PaneRoute } from "./DashboardPaneShell";

type DashboardNavContextValue = {
  activePane: PaneRoute | null;
  openPane: (route: PaneRoute) => void;
  closePane: () => void;
};

export const DashboardNavContext = createContext<DashboardNavContextValue>({
  activePane: null,
  openPane: () => {},
  closePane: () => {},
});

export function useDashboardNav() {
  return useContext(DashboardNavContext);
}
