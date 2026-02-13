// src/components/AuthPendingToast.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const AUTH_JUST_SIGNED_IN = "auth:justSignedIn";
const MIN_VISIBLE_MS = 1000;

export default function AuthPendingToast() {
  const sb = useMemo(() => createClient(), []);
  const pathname = usePathname();

  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [toastId, setToastId] = useState(0);

  const shownAtRef = useRef<number>(0);
  const hideTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Never show on auth routes
    if ((pathname || "").startsWith("/auth")) return;

    const hasJustSignedIn = (() => {
      try {
        return (
          typeof window !== "undefined" &&
          window.sessionStorage?.getItem(AUTH_JUST_SIGNED_IN) === "1"
        );
      } catch {
        return false;
      }
    })();

    if (!hasJustSignedIn) return;

    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);

    setVisible(true);
    setToastId((n) => n + 1);
    setOpen(false);
    shownAtRef.current = Date.now();

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setOpen(true));
    });

    const clearFlag = () => {
      try {
        window.sessionStorage?.removeItem(AUTH_JUST_SIGNED_IN);
      } catch {}
    };

    const hideNow = () => {
      clearFlag();
      setOpen(false);
      window.setTimeout(() => setVisible(false), 220);
    };

    const hideWithMinimum = () => {
      const elapsed = Date.now() - shownAtRef.current;
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        hideNow();
      }, wait);
    };

    // Close once a real session is confirmed
    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user) hideWithMinimum();
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user) hideWithMinimum();
    });

    // Safety so it cannot get stuck
    safetyTimerRef.current = window.setTimeout(() => {
      hideNow();
    }, 15000);

    return () => {
      subscription.unsubscribe();
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
      hideTimerRef.current = null;
      safetyTimerRef.current = null;
    };
  }, [sb, pathname]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[2147483647] pointer-events-none flex items-end justify-center pb-14 sm:pb-12">
      <div
        key={toastId}
        className="px-6 py-3.5 rounded-2xl bg-gray-900 text-white shadow-2xl flex items-center gap-3 max-w-[90vw] sm:max-w-lg w-max"
        style={{
          transform: open ? "translateY(0)" : "translateY(16px)",
          opacity: open ? 1 : 0,
          transition: "transform 220ms ease, opacity 220ms ease",
        }}
        role="status"
        aria-live="polite"
      >
        <span
          className="inline-block rounded-full animate-spin"
          style={{
            width: 16,
            height: 16,
            borderWidth: "2px",
            borderStyle: "solid",
            borderColor: "rgba(255,255,255,0.45)",
            borderTopColor: "transparent",
          }}
        />
        <span className="font-medium text-[15px] leading-tight truncate">
          Signing you in…
        </span>
      </div>
    </div>
  );
}
