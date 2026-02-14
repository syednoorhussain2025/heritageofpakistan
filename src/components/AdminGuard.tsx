// src/components/AdminGuard.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<"checking" | "ok" | "redirecting">(
    "checking"
  );

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setStatus("redirecting");
        window.location.href = "/admin/login";
        return;
      }
      // UPDATED: Now querying the new 'profiles' table
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (error || !profile?.is_admin) {
        setStatus("redirecting");
        window.location.href = "/admin/login";
        return;
      }
      setStatus("ok");
    })();
  }, []);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-gray-200">
        <p>Checking access…</p>
      </div>
    );
  }

  if (status === "redirecting") return null;

  return <>{children}</>;
}
