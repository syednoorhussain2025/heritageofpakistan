// src/components/AuthPendingToast.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const AUTH_RETURN_FLAG = "auth:returning";

export default function AuthPendingToast() {
  const sb = useMemo(() => createClient(), []);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [toastId, setToastId] = useState(0);
  const safetyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const hasFlag = (() => {
      try {
        return (
          typeof window !== "undefined" &&
          window.sessionStorage?.getItem(AUTH_RETURN_FLAG) === "1"
        );
      } catch {
        return false;
      }
    })();

    if (!hasFlag) return;

    setVisible(true);
    setToastId((n) => n + 1);
    setOpen(false);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setOpen(true));
    });

    const clearFlagAndHide = () => {
      try {
        window.sessionStorage?.removeItem(AUTH_RETURN_FLAG);
      } catch {}

      setOpen(false);
      window.setTimeout(() => setVisible(false), 220);
    };

    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user) clearFlagAndHide();
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user) clearFlagAndHide();
    });

    if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = window.setTimeout(() => {
      clearFlagAndHide();
    }, 15000);

    return () => {
      subscription.unsubscribe();
      if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    };
  }, [sb]);

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
