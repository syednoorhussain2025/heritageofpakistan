// src/app/api/reviews/bulk-delete/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  try {
    const cookieStore: any = (cookies as unknown as () => any)();
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        get(name: string) { return cookieStore.get?.(name)?.value; },
        set() {},
        remove() {},
      },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Collect all review IDs and their photo storage paths
    const { data: reviews, error: revErr } = await supabase
      .from("reviews")
      .select("id")
      .eq("user_id", user.id)
      .neq("status", "deleted");
    if (revErr) return NextResponse.json({ error: revErr.message }, { status: 400 });

    const reviewIds = (reviews ?? []).map((r: any) => r.id);
    if (!reviewIds.length) return NextResponse.json({ ok: true, deleted: 0 });

    // Collect all photo storage paths
    let storagePaths: string[] = [];
    {
      const { data: photos } = await supabase
        .from("review_photos")
        .select("storage_path")
        .in("review_id", reviewIds);
      if (photos) storagePaths = photos.map((p: any) => p.storage_path);
    }

    // Delete all reviews via RPC for each (uses SECURITY DEFINER ownership check)
    for (const id of reviewIds) {
      const { error } = await supabase.rpc("hard_delete_review", {
        in_review_id: id,
        in_caller_id: user.id,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Best-effort storage cleanup
    if (storagePaths.length) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/remove`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(storagePaths),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, deleted: reviewIds.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
