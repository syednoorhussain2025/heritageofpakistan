// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=missing_code", origin)
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/auth/sign-in?error=${encodeURIComponent(error.message)}`,
        origin
      )
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}
