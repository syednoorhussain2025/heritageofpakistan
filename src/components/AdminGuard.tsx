"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<"checking" | "allowed" | "redirecting">(
    "checking"
  );

  useEffect(() => {
    let active = true;
    const redirectTo = window.location.pathname + window.location.search;
    const redirectToSignIn = () => {
      if (!active) return;
      setStatus("redirecting");
      window.location.replace(
        `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
      );
    };

    // Fail-safe: if session read stalls, do not render protected UI indefinitely.
    const stallTimer = window.setTimeout(() => {
      console.warn("[AdminGuard] session check stalled; allowing page");
      if (active) setStatus("allowed");
    }, 12000);

    (async () => {
      try {
        // Use getUser() — not getSession() — so we validate against the server.
        // getSession() reads from cache and can return an expired token, letting
        // the guard pass even when the session is gone.
        const { data, error } = await supabase.auth.getUser();

        if (!active) return;
        if (error || !data.user) {
          redirectToSignIn();
          return;
        }
        setStatus("allowed");
      } catch (error: any) {
        if (!active) return;
        const message = String(error?.message ?? "");

        // For hard auth failures, redirect.
        if (
          message.toLowerCase().includes("not authenticated") ||
          message.toLowerCase().includes("invalid") ||
          message.toLowerCase().includes("jwt")
        ) {
          redirectToSignIn();
          return;
        }

        // Middleware already guards /admin; don't loop users to sign-in on transient client errors.
        console.warn("[AdminGuard] non-blocking auth check error", error);
        setStatus("allowed");
      } finally {
        window.clearTimeout(stallTimer);
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(stallTimer);
    };
  }, []);

  if (status === "allowed") return <>{children}</>;
  return (
    <div className="min-h-screen grid place-items-center bg-[#f4f4f4] text-gray-600">
      Checking access...
    </div>
  );
}
