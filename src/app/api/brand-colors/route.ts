import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { revalidateTag } from "next/cache";

const BRAND_ROW_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data, error } = await supabase
      .from("brand_colors")
      .select("*")
      .eq("id", BRAND_ROW_ID)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch brand colors" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );

    // Verify admin session
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const allowed = [
      "brand_green", "brand_orange", "brand_blue", "brand_black",
      "brand_dark_grey", "brand_light_grey", "brand_very_light_grey", "brand_illustration"
    ] as const;

    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (k in body && typeof body[k] === "string") patch[k] = body[k];
    }

    const { error } = await supabase
      .from("brand_colors")
      .update(patch)
      .eq("id", BRAND_ROW_ID);
    if (error) throw error;

    // Invalidate the server-side cache so next request gets fresh colors
    revalidateTag("brand-colors");

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save brand colors" }, { status: 500 });
  }
}
