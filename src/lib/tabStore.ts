/**
 * tabStore — zero-React tab state for Instagram-level tab switching.
 *
 * Tab switching must not go through React or the Next.js router.
 * This module owns the active tab as a plain JS variable and notifies
 * DOM-level subscribers synchronously on the same frame as the tap.
 */

export type TabKey = "home" | "discover" | "explore" | "map";

const TAB_PATHS: Record<TabKey, string> = {
  home: "/",
  discover: "/discover",
  explore: "/explore",
  map: "/map",
};

const PATH_TO_TAB: Record<string, TabKey> = {
  "/": "home",
  "/discover": "discover",
  "/explore": "explore",
  "/map": "map",
};

function pathnameToTab(pathname: string): TabKey | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/discover")) return "discover";
  if (pathname.startsWith("/explore")) return "explore";
  if (pathname.startsWith("/map")) return "map";
  return null;
}

// ── Module-level state (never in React) ──────────────────────────────────────

let _activeTab: TabKey = pathnameToTab(
  typeof window !== "undefined" ? window.location.pathname : "/"
) ?? "home";

type Subscriber = (tab: TabKey) => void;
const _subscribers = new Set<Subscriber>();

// ── Public API ────────────────────────────────────────────────────────────────

export function getActiveTab(): TabKey {
  return _activeTab;
}

export function setTab(tab: TabKey): void {
  if (tab === _activeTab) return;
  _activeTab = tab;

  // Update URL silently — no router, no React re-render
  const path = TAB_PATHS[tab];
  try {
    history.replaceState(null, "", path);
  } catch {
    // Private mode or restrictions — safe to skip
  }

  // Notify all DOM subscribers synchronously
  _subscribers.forEach((fn) => fn(tab));
}

export function subscribeTab(fn: Subscriber): () => void {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

/** Re-sync from current URL — call on Next.js route changes (real navigations). */
export function syncTabFromPathname(pathname: string): void {
  const tab = pathnameToTab(pathname);
  if (tab && tab !== _activeTab) {
    _activeTab = tab;
    _subscribers.forEach((fn) => fn(tab));
  }
}

export { pathnameToTab };
