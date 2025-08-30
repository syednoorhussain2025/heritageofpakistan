"use client";
import { createClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  const supabase = createClient();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        window.location.href = "/";
      }}
      className="text-sm underline"
    >
      Sign out
    </button>
  );
}
