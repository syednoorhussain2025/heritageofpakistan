"use client";

import { useEffect, useState } from "react";

export default function ConnectivityBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Set initial state from browser
    if (typeof navigator !== "undefined") {
      setOffline(!navigator.onLine);
    }

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    // Capacitor Network plugin — handles launch-time check on iOS/Android
    // where the WebView may not fire browser events reliably on cold start
    let removeCapacitorListener: (() => void) | null = null;

    (async () => {
      try {
        const { Network } = await import("@capacitor/network");

        // Check current status immediately (catches hang-on-launch)
        const status = await Network.getStatus();
        setOffline(!status.connected);

        // Listen for changes
        const handle = await Network.addListener("networkStatusChange", (s) => {
          setOffline(!s.connected);
        });
        removeCapacitorListener = () => handle.remove();
      } catch {
        // Not running in Capacitor — browser events are sufficient
      }
    })();

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      removeCapacitorListener?.();
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-red-600 px-4 py-3 text-white text-sm font-medium"
      style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom, 0px))" }}
      role="alert"
      aria-live="assertive"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      Connectivity Error. Please check your internet.
    </div>
  );
}
