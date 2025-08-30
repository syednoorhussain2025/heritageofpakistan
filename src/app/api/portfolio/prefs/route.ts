import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const allowed = ["portfolio_theme", "portfolio_layout"] as const;
    const patch: Record<string, any> = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value } }
    );

    const { data: auth, error: uerr } = await supabase.auth.getUser();
    if (uerr || !auth?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", auth.user.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, ...patch });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
