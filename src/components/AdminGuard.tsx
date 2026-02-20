"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

type GuardStatus = "checking" | "ok" | "redirecting" | "error";

const ADMIN_CACHE_TTL_MS = 60_000;

let adminCheckInFlight: Promise<{ userId: string | null; isAdmin: boolean }> | null =
  null;
let cachedAdmin: { userId: string; expiresAt: number } | null = null;

async function resolveAdminAccess() {
  const now = Date.now();
  if (cachedAdmin && cachedAdmin.expiresAt > now) {
    return { userId: cachedAdmin.userId, isAdmin: true };
  }

  if (adminCheckInFlight) return adminCheckInFlight;

  adminCheckInFlight = (async () => {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const userId = sessionData.session?.user?.id ?? null;
    if (!userId) {
      cachedAdmin = null;
      return { userId: null, isAdmin: false };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;

    const isAdmin = !!profile?.is_admin;
    if (isAdmin) {
      cachedAdmin = { userId, expiresAt: now + ADMIN_CACHE_TTL_MS };
    } else {
      cachedAdmin = null;
    }

    return { userId, isAdmin };
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
    cachedAdmin && cachedAdmin.expiresAt > Date.now() ? "ok" : "checking"
  );
  const [retryKey, setRetryKey] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const hasHotCache = !!(
        cachedAdmin && cachedAdmin.expiresAt > Date.now()
      );
      if (!hasHotCache) setStatus("checking");
      setErrorText(null);

      try {
        const { userId, isAdmin } = await resolveAdminAccess();
        if (cancelled) return;

        if (!userId) {
          setStatus("redirecting");
          const redirectTo = window.location.pathname + window.location.search;
          window.location.replace(
            `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
          );
          return;
        }

        if (!isAdmin) {
          setStatus("redirecting");
          window.location.replace("/");
          return;
        }

        setStatus("ok");
      } catch (error: any) {
        if (cancelled) return;
        console.error("[AdminGuard] access check failed", error);
        setErrorText(error?.message ?? "Unable to verify admin access.");
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
