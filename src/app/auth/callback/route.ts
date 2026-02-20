// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeRedirectTo(next: string | null, fallback: string) {
  if (!next) return fallback;
  const trimmed = next.trim();
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

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = safeRedirectTo(searchParams.get("next"), "/dashboard");

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=missing_code", origin)
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Error exchanging code for session:", error.message);
    return NextResponse.redirect(
      new URL(`/auth/sign-in?error=auth_error`, origin)
    );
  }

  // NOTE: The logic to manually create a profile has been removed.
  // The `on_auth_user_created` database trigger you created earlier
  // now handles this automatically and more reliably.

  return NextResponse.redirect(new URL(next, origin));
}
