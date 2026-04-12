"use client";

import { useDashboardNavState, useDashboardNavActions } from "./DashboardNavContext";
import DashboardPaneShell from "./DashboardPaneShell";

// Reads activePane from the state-only context so only this component
// re-renders when pane state changes — page.tsx stays frozen.
export default function DashboardPaneShellConnected() {
  const { activePane } = useDashboardNavState();
  const { closePane } = useDashboardNavActions();
  return <DashboardPaneShell activeRoute={activePane} onClosed={closePane} />;
}
