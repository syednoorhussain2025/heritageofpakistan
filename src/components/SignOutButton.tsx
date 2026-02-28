"use client";
import { createClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  const supabase = createClient();
  return (
    <button
      onClick={async () => {
        try { window.sessionStorage?.setItem("auth:justSignedOut", "1"); } catch {}
        await supabase.auth.signOut();
        window.location.href = "/";
      }}
      className="text-sm underline"
    >
      Sign out
    </button>
  );
}
