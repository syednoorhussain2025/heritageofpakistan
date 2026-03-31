// src/app/api/admin/photo-tags/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env vars not set.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Fetch all rows from a paginated Supabase query, bypassing the 1000-row default limit. */
async function fetchAllRows(
  db: ReturnType<typeof svc>,
  table: string,
  filter: (q: any) => any,
  select = "*"
): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    const query = filter(db.from(table).select(select)).range(from, from + PAGE - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    all = all.concat(data ?? []);
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/* GET /api/admin/photo-tags?action=vocabulary */
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/* POST /api/admin/photo-tags */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  const db = svc();

  if (action === "get-tags-for-images") {
    const ids: string[] = body.imageIds ?? [];
    if (!ids.length) return NextResponse.json([]);
    try {
      const all = await fetchAllRows(db, "site_image_tags", (q) => q.in("site_image_id", ids));
      return NextResponse.json(all);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === "get-tags-for-site") {
    const { siteId } = body;
    if (!siteId) return NextResponse.json([]);
    // Query site_image_tags joined to site_images on site_id — avoids passing 500 UUIDs to .in()
    // which causes Supabase to silently drop rows when the filter list is large.
    try {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await db
          .from("site_image_tags")
          .select("*, site_images!inner(site_id)")
          .eq("site_images.site_id", siteId)
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        // Strip the joined site_images column before returning
        const rows = (data ?? []).map(({ site_images: _si, ...rest }: any) => rest);
        all = all.concat(rows);
        if ((data ?? []).length < PAGE) break;
        from += PAGE;
      }
      return NextResponse.json(all);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === "save-ai-tags") {
    const suggestions: { imageId: string; tags: Record<string, string[]> }[] = body.suggestions ?? [];
    if (!suggestions.length) return NextResponse.json({ ok: true });

    const { data: dims } = await db.from("photo_tag_dimensions").select("id, slug");
    const slugToId = new Map((dims ?? []).map((d: any) => [d.slug, d.id]));

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
      const affectedIds = [...new Set(rows.map((r) => r.site_image_id))];
      // Delete existing AI tags for affected images only
      const { error: delErr } = await db
        .from("site_image_tags")
        .delete()
        .in("site_image_id", affectedIds)
        .eq("source", "ai");
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      // Insert in chunks of 500 to stay well within Supabase payload limits
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await db.from("site_image_tags").insert(rows.slice(i, i + CHUNK));
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
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
    try {
      const images = await fetchAllRows(db, "site_images", (q) => q.eq("site_id", siteId), "id");
      const imageIds = images.map((r: any) => r.id);
      if (imageIds.length) {
        const { error } = await db.from("site_image_tags").delete().in("site_image_id", imageIds);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
