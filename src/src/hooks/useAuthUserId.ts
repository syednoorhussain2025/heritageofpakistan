// src/hooks/useAuthUserId.ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function useAuthUserId() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!mounted) return;

        // Supabase returns "Auth session missing!" when simply signed out.
        // Treat that as "no user", not an error.
        if (error && error.message !== "Auth session missing!") {
          setAuthError(error.message);
        }

        setUserId(data.user?.id ?? null);
      } catch (e: any) {
        if (mounted) setAuthError(e?.message ?? "Auth error");
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return { userId, authLoading, authError };
}
