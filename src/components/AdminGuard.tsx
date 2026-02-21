"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { withTimeout } from "@/lib/async/withTimeout";

type GuardStatus = "checking" | "ok" | "redirecting" | "error";

const ADMIN_CACHE_TTL_MS = 60_000;
const ADMIN_CHECK_TIMEOUT_MS = 10000;

let adminCheckInFlight: Promise<{ userId: string | null; hasAccess: boolean }> | null =
  null;
let cachedAccess: { userId: string; expiresAt: number } | null = null;

async function resolveAdminAccess() {
  const now = Date.now();
  if (cachedAccess && cachedAccess.expiresAt > now) {
    return { userId: cachedAccess.userId, hasAccess: true };
  }

  if (adminCheckInFlight) return adminCheckInFlight;

  adminCheckInFlight = (async () => {
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      ADMIN_CHECK_TIMEOUT_MS,
      "admin.getSession"
    );
    if (sessionError) throw sessionError;

    const userId = sessionData.session?.user?.id ?? null;
    if (!userId) {
      cachedAccess = null;
      return { userId: null, hasAccess: false };
    }

    // Authorization is enforced by middleware on /admin routes.
    // Keep client guard lightweight so admin UI never deadlocks on profile query timeouts.
    cachedAccess = { userId, expiresAt: now + ADMIN_CACHE_TTL_MS };
    return { userId, hasAccess: true };
  })();

  try {
    return await adminCheckInFlight;
  } finally {
    adminCheckInFlight = null;
  }
}

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<GuardStatus>(() =>
    cachedAccess && cachedAccess.expiresAt > Date.now() ? "ok" : "checking"
  );
  const [retryKey, setRetryKey] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const hasHotCache = !!(
        cachedAccess && cachedAccess.expiresAt > Date.now()
      );
      if (!hasHotCache) setStatus("checking");
      setErrorText(null);

      try {
        const { userId, hasAccess } = await resolveAdminAccess();
        if (cancelled) return;

        if (!userId) {
          setStatus("redirecting");
          const redirectTo = window.location.pathname + window.location.search;
          window.location.replace(
            `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
          );
          return;
        }

        if (!hasAccess) {
          setStatus("redirecting");
          window.location.replace("/");
          return;
        }

        setStatus("ok");
      } catch (error: any) {
        if (cancelled) return;
        const message = String(error?.message ?? "");
        if (message.toLowerCase().includes("timed out")) {
          // Middleware already enforces admin access on /admin routes.
          // Do not block the page when this secondary client check times out.
          console.warn("[AdminGuard] timeout; allowing page", message);
          setStatus("ok");
          return;
        }

        console.error("[AdminGuard] access check failed", error);
        setErrorText(message || "Unable to verify admin access.");
        setStatus("error");
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-gray-200">
        <p>Checking access...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 px-6 text-gray-200">
        <div className="max-w-md text-center">
          <p className="text-sm text-red-300">
            {errorText ?? "Unable to verify admin access."}
          </p>
          <button
            type="button"
            onClick={() => setRetryKey((v) => v + 1)}
            className="mt-4 rounded-md bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (status === "redirecting") return null;

  return <>{children}</>;
}
