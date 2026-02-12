"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuthUserId } from "@/hooks/useAuthUserId";

/**
 * Ensures an action only runs if the user is signed in.
 * If not signed in, redirects to /auth/sign-in with redirectTo.
 * Returns true if signed in, false otherwise.
 */
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

  const currentUrl = useMemo(() => {
    const qs = sp?.toString();
    const raw = qs ? `${pathname}?${qs}` : pathname;
    return safeRedirectTo(raw, "/");
  }, [pathname, sp]);

  function ensureSignedIn(): boolean {
    if (authLoading) return false;

    if (userId) {
      return true;
    }

    router.push(
      `/auth/sign-in?redirectTo=${encodeURIComponent(currentUrl)}`
    );

    return false;
  }

  return {
    ensureSignedIn,
    isSignedIn: !!userId,
    authLoading,
  };
}
