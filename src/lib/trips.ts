// src/lib/trips.ts
import { supabase } from "@/lib/supabaseClient";

/* ───────────────────── Types ───────────────────── */

export type Trip = {
  id: string;
  user_id: string;
  name: string;
  slug?: string | null;
  is_public: boolean | null;
  created_at: string;
  updated_at: string;
};

export type TripItem = {
  id: string;
  trip_id: string;
  site_id: string;
  order_index: number;
  date_in: string | null;
  date_out: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SiteLite = {
  id: string;
  slug: string;
  title: string;
  province_id: number | null;
  cover_photo_url: string | null;
};

/* ───────────────────── Helpers ───────────────────── */

function slugify(input: string) {
  const s = (input || "trip")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
  return s || "trip";
}

async function ensureUniqueTripSlug(userId: string, baseName: string) {
  const base = slugify(baseName);
  let candidate = base;
  let n = 1;

  // try base, then base-2, base-3, ...
  // uses count from Supabase (with head:true) which is fast
  // and doesn't return row data.
  // In supabase-js v2, { data: null, count: number }
  // is expected for head:true.
  /* eslint-disable no-constant-condition */
  while (true) {
    const { count, error } = await supabase
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("slug", candidate);

    if (error) throw error;
    if (!count) return candidate; // 0 or undefined → available

    n += 1;
    candidate = `${base}-${n}`;
  }
  /* eslint-enable no-constant-condition */
}

/* ───────────────────── Queries ───────────────────── */

export async function getUserTrips() {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Trip[];
}

/**
 * Create a trip with a unique per-user slug so we can route via /[username]/trip/[tripSlug]
 */
export async function createTrip(name: string, isPublic?: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const slug = await ensureUniqueTripSlug(userId, name);

  const { data, error } = await supabase
    .from("trips")
    .insert({ name, slug, is_public: isPublic ?? null })
    .select("*")
    .single();

  if (error) throw error;
  return data as Trip;
}

export async function addSiteToTrip({
  tripId,
  siteId,
  orderIndex,
}: {
  tripId: string;
  siteId: string;
  orderIndex: number;
}) {
  const { data, error } = await supabase
    .from("trip_items")
    .insert([{ trip_id: tripId, site_id: siteId, order_index: orderIndex }])
    .select("*")
    .single();
  if (error) throw error;
  return data as TripItem;
}

/**
 * Resolve a trip by human-readable path: /[username]/trip/[tripSlug]
 * Returns the Trip row (throws if not found).
 */
export async function getTripByUsernameSlug(
  username: string,
  tripSlug: string
) {
  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();
  if (pErr) throw pErr;
  if (!prof?.id) throw new Error("Profile not found");

  const { data: trip, error: tErr } = await supabase
    .from("trips")
    .select("*")
    .eq("user_id", prof.id)
    .eq("slug", tripSlug)
    .single();
  if (tErr) throw tErr;
  if (!trip) throw new Error("Trip not found");

  return trip as Trip;
}

/**
 * Build the pretty URL for a trip id (or return null if we can't).
 * -> "/[username]/trip/[tripSlug]"
 */
export async function getTripUrlById(id: string): Promise<string | null> {
  const { data: t, error: tErr } = await supabase
    .from("trips")
    .select("slug, user_id")
    .eq("id", id)
    .single();
  if (tErr) throw tErr;
  if (!t?.slug || !t?.user_id) return null;

  const { data: p, error: pErr } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", t.user_id)
    .single();
  if (pErr) throw pErr;
  if (!p?.username) return null;

  return `/${p.username}/trip/${t.slug}`;
}

export async function getTripWithItems(tripId: string) {
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();
  if (tripErr) throw tripErr;

  const { data: items, error: itemsErr } = await supabase
    .from("trip_items")
    .select("*")
    .eq("trip_id", tripId)
    .order("order_index", { ascending: true });
  if (itemsErr) throw itemsErr;

  const siteIds = (items ?? []).map((i) => i.site_id);
  let sitesById: Record<string, SiteLite> = {};
  let provinceById: Record<number, string> = {};
  let categoriesBySite: Record<string, string[]> = {};

  if (siteIds.length > 0) {
    const { data: sites, error: sitesErr } = await supabase
      .from("sites")
      .select("id, slug, title, province_id, cover_photo_url")
      .in("id", siteIds);
    if (sitesErr) throw sitesErr;
    sitesById = Object.fromEntries(
      (sites ?? []).map((s) => [s.id, s as SiteLite])
    );

    const provinceIds = Array.from(
      new Set((sites ?? []).map((s) => s.province_id).filter(Boolean))
    ) as number[];

    if (provinceIds.length > 0) {
      const { data: provs, error: provErr } = await supabase
        .from("provinces")
        .select("id, name")
        .in("id", provinceIds);
      if (provErr) throw provErr;
      provinceById = Object.fromEntries(
        (provs ?? []).map((p: any) => [p.id, p.name as string])
      );
    }

    const { data: cats, error: catsErr } = await supabase
      .from("site_categories")
      .select("site_id, categories(name)")
      .in("site_id", siteIds);
    if (catsErr) throw catsErr;

    const map: Record<string, string[]> = {};
    (cats ?? []).forEach((row: any) => {
      const n = row.categories?.name as string | undefined;
      if (!n) return;
      map[row.site_id] = map[row.site_id] || [];
      if (map[row.site_id].length < 2) map[row.site_id].push(n);
    });
    categoriesBySite = map;
  }

  return {
    trip,
    items: (items ?? []).map((it) => ({
      ...it,
      site: sitesById[it.site_id] || null,
      provinceName:
        (sitesById[it.site_id]?.province_id &&
          provinceById[sitesById[it.site_id]!.province_id!]) ||
        null,
      experience: categoriesBySite[it.site_id] || [],
    })),
  };
}

export async function updateTripItemsBatch(
  items: Array<{
    id: string;
    order_index?: number;
    date_in?: string | null;
    date_out?: string | null;
    notes?: string | null;
  }>
) {
  const updates = items.map(async (it) => {
    const patch: any = {};
    if (it.order_index !== undefined) patch.order_index = it.order_index;
    if ("date_in" in it) patch.date_in = it.date_in;
    if ("date_out" in it) patch.date_out = it.date_out;
    if ("notes" in it) patch.notes = it.notes;

    if (Object.keys(patch).length === 0) return null;

    const { error } = await supabase
      .from("trip_items")
      .update(patch)
      .eq("id", it.id);
    if (error) throw error;
    return true;
  });

  await Promise.all(updates);
}

export async function deleteTripItem(id: string) {
  const { error } = await supabase.from("trip_items").delete().eq("id", id);
  if (error) throw error;
}
