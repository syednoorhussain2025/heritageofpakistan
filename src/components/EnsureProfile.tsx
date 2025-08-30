// src/components/EnsureProfile.tsx
// Server Component: guarantees a profile row exists for the signed-in user.
// Safe to render at the top of your dashboard layout; returns nothing visible.

import { createClient } from "@/lib/supabase/server";

export default async function EnsureProfile() {
  const supabase = createClient();

  // If not signed in, nothing to do
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  // Try to find existing profile
  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  // If no row (or RLS hid it), attempt to insert a minimal row
  if (!existing && !readErr) {
    const insertRow = {
      id: user.id,
      email: user.email ?? null,
      full_name: (user.user_metadata as any)?.full_name ?? null,
      avatar_url: (user.user_metadata as any)?.avatar_url ?? null,
      // We intentionally omit username/travel_style/etc. to avoid constraints on first login.
    };

    // Ignore unique/constraint races; the goal is simply "have a row".
    await supabase
      .from("profiles")
      .insert(insertRow)
      .single()
      .catch(() => {});
  }

  return null;
}
