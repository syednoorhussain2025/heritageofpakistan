import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type ReorderUpdate = { photo_id: string; order_index: number };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const updates: ReorderUpdate[] = body?.updates || [];
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // NEXT 15: cookies() can be async; await it.
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          // set/remove are not required for this route; omit to keep Readonly cookies happy
        },
      }
    );

    // Auth
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = userRes.user.id;

    // Upsert + update order_index for each item
    for (const { photo_id, order_index } of updates) {
      // Ensure row exists (user_id + photo_id)
      const { data: existing, error: selErr } = await supabase
        .from("user_portfolio")
        .select("id")
        .eq("user_id", userId)
        .eq("photo_id", photo_id)
        .maybeSingle();

      if (selErr) {
        return NextResponse.json({ error: selErr.message }, { status: 400 });
      }

      if (!existing) {
        const { error: insErr } = await supabase
          .from("user_portfolio")
          .insert([{ user_id: userId, photo_id }]);
        if (insErr) {
          return NextResponse.json({ error: insErr.message }, { status: 400 });
        }
      }

      const { error: updErr } = await supabase
        .from("user_portfolio")
        .update({ order_index })
        .eq("user_id", userId)
        .eq("photo_id", photo_id);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, count: updates.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
