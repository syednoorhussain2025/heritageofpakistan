// src/app/api/admin/photo-tags/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env vars not set.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* GET /api/admin/photo-tags?action=vocabulary
   GET /api/admin/photo-tags?action=for-images&imageIds=id1,id2 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");
  const db = svc();

  if (action === "vocabulary") {
    const [{ data: dims, error: dimErr }, { data: vals, error: valErr }] = await Promise.all([
      db.from("photo_tag_dimensions").select("*").order("sort_order"),
      db.from("photo_tag_values").select("*").eq("is_active", true).order("sort_order"),
    ]);
    if (dimErr) return NextResponse.json({ error: dimErr.message }, { status: 500 });
    if (valErr) return NextResponse.json({ error: valErr.message }, { status: 500 });
    const merged = (dims ?? []).map((d: any) => ({
      ...d,
      values: (vals ?? []).filter((v: any) => v.dimension_id === d.id),
    }));
    return NextResponse.json(merged);
  }

  if (action === "for-images") {
    const ids = searchParams.get("imageIds")?.split(",").filter(Boolean) ?? [];
    if (!ids.length) return NextResponse.json([]);
    const { data, error } = await db
      .from("site_image_tags")
      .select("*")
      .in("site_image_id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/* POST /api/admin/photo-tags
   body: { action, ...payload } */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  const db = svc();

  if (action === "get-tags-for-images") {
    const ids: string[] = body.imageIds ?? [];
    if (!ids.length) return NextResponse.json([]);
    const { data, error } = await db
      .from("site_image_tags")
      .select("*")
      .in("site_image_id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (action === "save-ai-tags") {
    const suggestions: { imageId: string; tags: Record<string, string[]> }[] = body.suggestions ?? [];
    if (!suggestions.length) return NextResponse.json({ ok: true });

    const { data: dims } = await db.from("photo_tag_dimensions").select("id, slug");
    const slugToId = new Map((dims ?? []).map((d: any) => [d.slug, d.id]));

    const imageIds = suggestions.map((s) => s.imageId);
    await db.from("site_image_tags").delete().in("site_image_id", imageIds).eq("source", "ai");

    const rows: any[] = [];
    for (const s of suggestions) {
      for (const [slug, values] of Object.entries(s.tags)) {
        const dimensionId = slugToId.get(slug);
        if (!dimensionId) continue;
        for (const value of values) {
          if (!value?.trim()) continue;
          rows.push({ site_image_id: s.imageId, dimension_id: dimensionId, value: value.trim(), source: "ai" });
        }
      }
    }
    if (rows.length) {
      const { error } = await db.from("site_image_tags").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "add-manual-tag") {
    const { siteImageId, dimensionId, value } = body;
    if (!value?.trim()) return NextResponse.json({ error: "Empty value" }, { status: 400 });
    const { data, error } = await db
      .from("site_image_tags")
      .insert({ site_image_id: siteImageId, dimension_id: dimensionId, value: value.trim(), source: "manual" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "delete-tag") {
    const { tagId } = body;
    const { error } = await db.from("site_image_tags").delete().eq("id", tagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete-all-tags-for-site") {
    const { siteId } = body;
    const { data: images } = await db.from("site_images").select("id").eq("site_id", siteId);
    const imageIds = (images ?? []).map((r: any) => r.id);
    if (imageIds.length) {
      const { error } = await db.from("site_image_tags").delete().in("site_image_id", imageIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
