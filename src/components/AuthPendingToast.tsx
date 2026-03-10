// src/components/AuthPendingToast.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { withTimeout } from "@/lib/async/withTimeout";

const AUTH_JUST_SIGNED_IN = "auth:justSignedIn";
const AUTH_JUST_SIGNED_OUT = "auth:justSignedOut";
const MIN_VISIBLE_MS = 1000;
const AUTH_SESSION_TIMEOUT_MS = 5000;

export default function AuthPendingToast() {
  const sb = useMemo(() => createClient(), []);
  const pathname = usePathname();

  // ── Sign-in toast ──
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [toastId, setToastId] = useState(0);

  const shownAtRef = useRef<number>(0);
  const hideTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  // ── Sign-out toast ──
  const [outVisible, setOutVisible] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const outHideRef = useRef<number | null>(null);

  // Sign-in toast logic
  useEffect(() => {
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
      hideTimerRef.current = window.setTimeout(() => hideNow(), wait);
    };

    withTimeout(
      sb.auth.getSession(),
      AUTH_SESSION_TIMEOUT_MS,
      "authPendingToast.getSession"
    )
      .then(({ data }) => {
        if (data.session?.user) hideWithMinimum();
      })
      .catch((error) => {
        console.warn("[AuthPendingToast] getSession failed", error);
      });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user) hideWithMinimum();
    });

    safetyTimerRef.current = window.setTimeout(() => hideNow(), 15000);

    return () => {
      subscription.unsubscribe();
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
      hideTimerRef.current = null;
      safetyTimerRef.current = null;
    };
  }, [sb, pathname]);

  // Sign-out toast logic
  useEffect(() => {
    const hasJustSignedOut = (() => {
      try {
        return (
          typeof window !== "undefined" &&
          window.sessionStorage?.getItem(AUTH_JUST_SIGNED_OUT) === "1"
        );
      } catch {
        return false;
      }
    })();

    if (!hasJustSignedOut) return;

    try { window.sessionStorage?.removeItem(AUTH_JUST_SIGNED_OUT); } catch {}

    if (outHideRef.current) window.clearTimeout(outHideRef.current);

    setOutVisible(true);
    setOutOpen(false);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setOutOpen(true));
    });

    outHideRef.current = window.setTimeout(() => {
      setOutOpen(false);
      window.setTimeout(() => setOutVisible(false), 220);
    }, 2500);

    return () => {
      if (outHideRef.current) window.clearTimeout(outHideRef.current);
    };
  }, [pathname]);

  return (
    <>
      {/* Sign-in pending toast */}
      {visible && (
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
      )}

      {/* Sign-out toast */}
      {outVisible && (
        <div className="fixed inset-0 z-[2147483647] pointer-events-none flex items-end justify-center pb-14 sm:pb-12">
          <div
            className="px-6 py-3.5 rounded-2xl bg-gray-900 text-white shadow-2xl flex items-center gap-3 max-w-[90vw] sm:max-w-lg w-max"
            style={{
              transform: outOpen ? "translateY(0)" : "translateY(16px)",
              opacity: outOpen ? 1 : 0,
              transition: "transform 220ms ease, opacity 220ms ease",
            }}
            role="status"
            aria-live="polite"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="7.5" stroke="rgba(255,255,255,0.45)" />
              <path
                d="M4.5 8.5L7 11L11.5 5.5"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-medium text-[15px] leading-tight truncate">
              Signed out successfully
            </span>
          </div>
        </div>
      )}
    </>
  );
}
