// src/hooks/useSignedInActions.ts
"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { createClient } from "@/lib/supabase/browser";
import { withTimeout } from "@/lib/async/withTimeout";

const AUTH_SESSION_TIMEOUT_MS = 5000;

function safeRedirectTo(next: string, fallback: string) {
  const trimmed = (next || "").trim();
  if (!trimmed) return fallback;

  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("://")
  ) {
    return trimmed;
  }

  return fallback;
}

export function useSignedInActions() {
  const { userId, authLoading } = useAuthUserId();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const sb = useMemo(() => createClient(), []);

  const currentUrl = useMemo(() => {
    const qs = sp?.toString();
    const raw = qs ? `${pathname}?${qs}` : pathname;
    return safeRedirectTo(raw, "/");
  }, [pathname, sp]);

  async function ensureSignedIn(): Promise<boolean> {
    if (userId) return true;

    try {
      const { data } = await withTimeout(
        sb.auth.getSession(),
        AUTH_SESSION_TIMEOUT_MS,
        "signedInActions.getSession"
      );
      if (data.session?.user) {
        return true;
      }
    } catch {
      // fall through to redirect
    }

    router.push(`/auth/sign-in?redirectTo=${encodeURIComponent(currentUrl)}`);
    return false;
  }

  return {
    ensureSignedIn,
    isSignedIn: Boolean(userId),
    authLoading,
  };
}
