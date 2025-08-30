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

  // 1) Exchange the code for a session cookie
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code
  );
  if (exchangeError) {
    return NextResponse.redirect(
      new URL(
        `/auth/sign-in?error=${encodeURIComponent(exchangeError.message)}`,
        origin
      )
    );
  }

  // 2) Ensure a profiles row exists (minimal, schema-safe)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: existing, error: readErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing && !readErr) {
      const insertRow = {
        id: user.id,
        email: user.email ?? null,
        full_name: (user.user_metadata as any)?.full_name ?? null,
        avatar_url: (user.user_metadata as any)?.avatar_url ?? null,
      };
      await supabase
        .from("profiles")
        .insert(insertRow)
        .single()
        .catch(() => {});
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
