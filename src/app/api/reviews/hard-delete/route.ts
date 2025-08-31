// src/app/api/reviews/hard-delete/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Server not configured: missing public Supabase env" },
      { status: 500 }
    );
  }
  if (!SERVICE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" },
      { status: 500 }
    );
  }

  try {
    const { reviewId } = (await req.json()) as { reviewId?: string };
    if (!reviewId) {
      return NextResponse.json({ error: "Missing reviewId" }, { status: 400 });
    }

    // NOTE: In Next 15, cookies() can be async-typed in route handlers.
    const cookieStore = (await (cookies() as unknown as Promise<
      ReturnType<typeof cookies>
    >)) as ReturnType<typeof cookies>;

    // Auth via anon client, backed by request cookies
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        // In a route handler we don't need to set/remove cookies on the response
        set: () => {},
        remove: () => {},
      },
    });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr)
      return NextResponse.json({ error: authErr.message }, { status: 401 });
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Collect photo storage paths BEFORE deletion (best-effort)
    let storagePaths: string[] = [];
    {
      const { data, error } = await supabase
        .from("review_photos")
        .select("storage_path")
        .eq("review_id", reviewId);
      if (!error && data) storagePaths = data.map((r) => r.storage_path);
    }

    // Hard delete through SECURITY DEFINER RPC (bypasses RLS but enforces ownership)
    {
      const { error } = await supabase.rpc("hard_delete_review", {
        in_review_id: reviewId,
        in_caller_id: user.id,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    // Best-effort Storage cleanup with service role
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

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
