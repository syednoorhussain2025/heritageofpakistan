"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;
        if (error || !data.session?.user) {
          setRedirecting(true);
          const redirectTo = window.location.pathname + window.location.search;
          window.location.replace(
            `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
          );
        }
      } catch (error: any) {
        if (!active) return;
        const message = String(error?.message ?? "");

        // For hard auth failures, redirect.
        if (
          message.toLowerCase().includes("not authenticated") ||
          message.toLowerCase().includes("invalid") ||
          message.toLowerCase().includes("jwt")
        ) {
          setRedirecting(true);
          const redirectTo = window.location.pathname + window.location.search;
          window.location.replace(
            `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
          );
          return;
        }

        console.warn("[AdminGuard] non-blocking auth check error", error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (redirecting) return null;
  return <>{children}</>;
}
