// src/lib/trips.ts
import { supabase } from "@/lib/supabaseClient";

/* ───────────────────── Types ───────────────────── */

export type Trip = {
  id: string;
  user_id: string;
  name: string;
  slug?: string | null;
  creator_name?: string | null; // ⬅️ new column
  is_public: boolean | null;
  created_at: string;
  updated_at: string;
};

export type TripWithCover = Trip & {
  cover_photo_url?: string | null;
};

export type TripItem = {
  id: string;
  trip_id: string;
  site_id: string;
  order_index: number;
  day_id: string | null;
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
  tagline: string | null; // ⬅️ ensure we fetch this
};

export type TripDay = {
  id: string;
  trip_id: string;
  order_index: number;
  title: string | null;
  the_date: string | null; // 'YYYY-MM-DD'
  created_at: string;
  updated_at: string;
};

export type TravelMode = "airplane" | "bus" | "car" | "walk" | "train";

export type TravelLeg = {
  id: string;
  trip_id: string;
  order_index: number;
  day_id: string | null;
  from_region_id: string | null;
  to_region_id: string | null;
  mode: TravelMode;
  duration_minutes: number | null;
  distance_km: number | null;
  notes: string | null;
  travel_start_at?: string | null;
  travel_end_at?: string | null;
  created_at: string;
  updated_at: string;
  from_region_name?: string | null;
  to_region_name?: string | null;
};

export type TimelineItem =
  | (TripDay & { kind: "day" })
  | (TripItem & { kind: "site" })
  | (TravelLeg & { kind: "travel" });

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
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { count, error } = await supabase
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("slug", candidate);

    if (error) throw error;
    if (!count) return candidate;

    n += 1;
    candidate = `${base}-${n}`;
  }
}

const safeNum = (v: any): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

/* ───────────────────── Trips (Gallery helpers) ───────────────────── */

/** For each trip, choose the first site with a cover (by order_index) via a single join. */
async function deriveTripCoversFromFirstSite(
  tripIds: string[]
): Promise<Record<string, string | null>> {
  if (tripIds.length === 0) return {};

  const { data, error } = await supabase
    .from("trip_items")
    .select("trip_id, order_index, sites:site_id(cover_photo_url)")
    .in("trip_id", tripIds)
    .order("trip_id", { ascending: true })
    .order("order_index", { ascending: true });

  if (error) throw error;

  const coverByTripId: Record<string, string | null> = Object.fromEntries(
    tripIds.map((id) => [id, null])
  );

  for (const row of data ?? []) {
    const tripId = row.trip_id as string;
    if (coverByTripId[tripId]) continue;
    const cover = (row as any)?.sites?.cover_photo_url as
      | string
      | null
      | undefined;
    if (cover) coverByTripId[tripId] = cover;
  }

  return coverByTripId;
}

/**
 * List trips for the **current session** (RLS-enforced).
 * We intentionally ignore the `username` filter on the client:
 * - RLS `user_id = auth.uid()` already scopes rows to the signed-in user.
 * - This avoids cross-table lookups that can be blocked by RLS and cause “Not authenticated”.
 */
export async function listTripsByUsername(
  _username: string
): Promise<TripWithCover[]> {
  const { data: tripsData, error } = await supabase
    .from("trips")
    .select(
      "id, user_id, name, slug, creator_name, is_public, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    // Treat RLS/no-session as empty result for a clean UI
    if (msg.includes("not authenticated") || msg.includes("permission")) {
      return [];
    }
    throw error;
  }

  const trips = (tripsData ?? []) as Trip[];
  if (trips.length === 0) return [];

  const coverByTripId = await deriveTripCoversFromFirstSite(
    trips.map((t) => t.id)
  );

  return trips.map((t) => ({
    ...t,
    cover_photo_url: coverByTripId[t.id] ?? null,
  }));
}

/** Per-trip counts for UI badges. */
export async function countTripItems(tripId: string) {
  const [{ count: sites }, { count: travels }] = await Promise.all([
    supabase
      .from("trip_items")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
    supabase
      .from("trip_travel")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId),
  ]);
  return { sites: sites ?? 0, travels: travels ?? 0 };
}

/** Delete an entire trip (ensure RLS and FK cascades/cleanup are configured). */
export async function deleteTrip(tripId: string) {
  const { error } = await supabase.from("trips").delete().eq("id", tripId);
  if (error) throw error;
}

/* ───────────────────── Queries (Trips & Sites) ───────────────────── */

export async function getUserTrips() {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Trip[];
}

/** Create a trip with a unique per-user slug so we can route via /[username]/trip/[tripSlug] */
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

/** Update trip core fields (used by finalize/builder page) */
export async function updateTrip(
  tripId: string,
  patch: { name?: string; creator_name?: string | null }
) {
  const { data, error } = await supabase
    .from("trips")
    .update(patch)
    .eq("id", tripId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function addSiteToTrip({
  tripId,
  siteId,
  orderIndex,
  dayId = null,
}: {
  tripId: string;
  siteId: string;
  orderIndex: number;
  dayId?: string | null;
}) {
  const { data, error } = await supabase
    .from("trip_items")
    .insert([
      {
        trip_id: tripId,
        site_id: siteId,
        order_index: orderIndex,
        day_id: dayId,
      },
    ])
    .select("*")
    .single();
  if (error) throw error;
  return data as TripItem;
}

/** Resolve a trip by human-readable path: /[username]/trip/[tripSlug]
 *  Tolerant: if the profile row for username is missing/unreadable, fall back to resolving by slug.
 */
export async function getTripByUsernameSlug(
  username: string,
  tripSlug: string
) {
  // Try to resolve profile; don't fail the whole call if it doesn't exist
  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (pErr) throw pErr;

  if (prof?.id) {
    const { data: trip, error: tErr } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", prof.id)
      .eq("slug", tripSlug)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!trip) throw new Error("Trip not found");
    return trip as Trip;
  }

  // Fallback: resolve by slug only (RLS still protects access)
  const { data: trip, error: tErr } = await supabase
    .from("trips")
    .select("*")
    .eq("slug", tripSlug)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!trip) throw new Error("Trip not found");
  return trip as Trip;
}

/** Build the pretty URL for a trip id (or return null if we can't). -> "/[username]/trip/[tripSlug]" */
export async function getTripUrlById(id: string): Promise<string | null> {
  const { data: t, error: tErr } = await supabase
    .from("trips")
    .select("slug, user_id")
    .eq("id", id)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!t?.slug || !t?.user_id) return null;

  const { data: p, error: pErr } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", t.user_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!p?.username) return null;

  return `/${p.username}/trip/${t.slug}`;
}

/** Existing helper that returns trip + site items with denormalized info. */
export async function getTripWithItems(tripId: string) {
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (tripErr) throw tripErr;
  if (!trip) throw new Error("Trip not found");

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
      .select("id, slug, title, province_id, cover_photo_url, tagline") // ⬅️ include tagline
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
    items: (items ?? []).map(
      (it) =>
        ({
          ...it,
          site: sitesById[it.site_id] || null,
          provinceName:
            (sitesById[it.site_id]?.province_id &&
              provinceById[sitesById[it.site_id]!.province_id!]) ||
            null,
          experience: categoriesBySite[it.site_id] || [],
        } as any)
    ),
  };
}

export async function updateTripItemsBatch(
  items: Array<{
    id: string;
    order_index?: number;
    date_in?: string | null;
    date_out?: string | null;
    notes?: string | null;
    day_id?: string | null; // allow day reassignment
  }>
) {
  const updates = items.map(async (it) => {
    const patch: any = {};
    if (it.order_index !== undefined) patch.order_index = it.order_index;
    if ("date_in" in it) patch.date_in = it.date_in;
    if ("date_out" in it) patch.date_out = it.date_out;
    if ("notes" in it) patch.notes = it.notes;
    if ("day_id" in it) patch.day_id = it.day_id;

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

/* ───────────────────── Day APIs ───────────────────── */

export async function getNextOrderIndex(trip_id: string): Promise<number> {
  const [ti, tt, td] = await Promise.all([
    supabase
      .from("trip_items")
      .select("order_index")
      .eq("trip_id", trip_id)
      .order("order_index", { ascending: false })
      .limit(1),
    supabase
      .from("trip_travel")
      .select("order_index")
      .eq("trip_id", trip_id)
      .order("order_index", { ascending: false })
      .limit(1),
    supabase
      .from("trip_days")
      .select("order_index")
      .eq("trip_id", trip_id)
      .order("order_index", { ascending: false })
      .limit(1),
  ]);

  const maxA = (ti.data?.[0]?.order_index ?? 0) as number;
  const maxB = (tt.data?.[0]?.order_index ?? 0) as number;
  const maxC = (td.data?.[0]?.order_index ?? 0) as number;
  return Math.max(maxA, maxB, maxC) + 1;
}

export async function addTripDay(params: {
  trip_id: string;
  title?: string | null;
  the_date?: string | null;
}) {
  const order_index = await getNextOrderIndex(params.trip_id);
  const payload = {
    trip_id: params.trip_id,
    order_index,
    title: params.title ?? null,
    the_date: params.the_date ?? null,
  };
  const { data, error } = await supabase
    .from("trip_days")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as TripDay;
}

export async function updateTripDay(
  id: string,
  patch: Partial<Pick<TripDay, "title" | "the_date" | "order_index">>
) {
  const { data, error } = await supabase
    .from("trip_days")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TripDay;
}

export async function deleteTripDay(id: string) {
  // FK is ON DELETE SET NULL for children; so this simply un-groups items.
  const { error } = await supabase.from("trip_days").delete().eq("id", id);
  if (error) throw error;
}

/** Attach items (sites and/or travel) to a day. Pass null dayId to ungroup. */
export async function attachItemsToDay(params: {
  dayId: string | null;
  itemIds?: string[];
  travelIds?: string[];
}) {
  if (params.itemIds?.length) {
    const { error } = await supabase
      .from("trip_items")
      .update({ day_id: params.dayId })
      .in("id", params.itemIds);
    if (error) throw error;
  }

  if (params.travelIds?.length) {
    const { error } = await supabase
      .from("trip_travel")
      .update({ day_id: params.dayId })
      .in("id", params.travelIds);
    if (error) throw error;
  }
}

/** Set a Day's date and propagate the same date to all *site* items in that Day. */
export async function setDayDateAndPropagate(day_id: string, dateISO: string) {
  const upDay = await supabase
    .from("trip_days")
    .update({ the_date: dateISO })
    .eq("id", day_id);
  if (upDay.error) throw upDay.error;

  const upItems = await supabase
    .from("trip_items")
    .update({ date_in: dateISO, date_out: dateISO })
    .eq("day_id", day_id);
  if (upItems.error) throw upItems.error;
}

/* ───────────────────── Travel ───────────────────── */

export async function addTravelLeg(params: {
  trip_id: string;
  day_id?: string | null;
  from_region_id?: string | null;
  to_region_id?: string | null;
  mode?: TravelMode;
  duration_minutes?: number | null;
  distance_km?: number | null;
  notes?: string | null;
  travel_start_at?: string | null;
  travel_end_at?: string | null;
}) {
  const order_index = await getNextOrderIndex(params.trip_id);
  const payload = {
    trip_id: params.trip_id,
    order_index,
    day_id: params.day_id ?? null,
    from_region_id: params.from_region_id ?? null,
    to_region_id: params.to_region_id ?? null,
    mode: (params.mode ?? "car") as TravelMode,
    duration_minutes: params.duration_minutes ?? null,
    distance_km: safeNum(params.distance_km),
    notes: params.notes ?? null,
    travel_start_at: params.travel_start_at ?? null,
    travel_end_at: params.travel_end_at ?? null,
  };
  const { data, error } = await supabase
    .from("trip_travel")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;

  const out: TravelLeg = {
    ...(data as any),
    distance_km: safeNum((data as any)?.distance_km),
  };
  return out;
}

/** Update a travel leg (partial) */
export async function updateTravelLeg(
  id: string,
  patch: Partial<
    Pick<
      TravelLeg,
      | "from_region_id"
      | "to_region_id"
      | "mode"
      | "duration_minutes"
      | "distance_km"
      | "notes"
      | "order_index"
      | "travel_start_at"
      | "travel_end_at"
      | "day_id"
    >
  >
) {
  const fixed: any = { ...patch };
  if (fixed.distance_km !== undefined)
    fixed.distance_km = safeNum(fixed.distance_km);

  const { data, error } = await supabase
    .from("trip_travel")
    .update(fixed)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  const out: TravelLeg = {
    ...(data as any),
    distance_km: safeNum((data as any)?.distance_km),
  };
  return out;
}

/** Delete a travel leg */
export async function deleteTravelLeg(id: string) {
  const { error } = await supabase.from("trip_travel").delete().eq("id", id);
  if (error) throw error;
}

/** Bulk reorder across day/site/travel without RPCs */
export async function updateTimelineOrder(
  items: Array<{
    kind: "day" | "site" | "travel";
    id: string;
    order_index: number;
  }>
) {
  const dayUpdates = items
    .filter((x) => x.kind === "day")
    .map((x) => ({ id: x.id, order_index: x.order_index }));
  const siteUpdates = items
    .filter((x) => x.kind === "site")
    .map((x) => ({ id: x.id, order_index: x.order_index }));
  const travelUpdates = items
    .filter((x) => x.kind === "travel")
    .map((x) => ({ id: x.id, order_index: x.order_index }));

  if (dayUpdates.length) {
    await Promise.all(
      dayUpdates.map((d) =>
        supabase
          .from("trip_days")
          .update({ order_index: d.order_index })
          .eq("id", d.id)
      )
    );
  }
  if (siteUpdates.length) {
    await updateTripItemsBatch(siteUpdates);
  }
  if (travelUpdates.length) {
    await Promise.all(
      travelUpdates.map((t) =>
        supabase
          .from("trip_travel")
          .update({ order_index: t.order_index })
          .eq("id", t.id)
      )
    );
  }
}

/** Regions search for location picker */
export async function searchRegions(query: string) {
  const q = (query || "").trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("regions")
    .select("id,name,slug,parent_id,icon_key")
    .ilike("name", `%${q}%`)
    .order("sort_order", { ascending: true })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

/* Helper: hydrate region names for travel rows */
async function hydrateRegionNames<
  T extends TravelLeg | (TravelLeg & { kind: "travel" })
>(rows: T[]): Promise<T[]> {
  const ids = Array.from(
    new Set(
      rows
        .flatMap((t) => [t.from_region_id, t.to_region_id])
        .filter(Boolean) as string[]
    )
  );
  if (!ids.length) return rows;

  const { data, error } = await supabase
    .from("regions")
    .select("id,name")
    .in("id", ids);
  if (error) throw error;

  const byId = Object.fromEntries(
    (data ?? []).map((r) => [r.id, r.name as string])
  );

  return rows.map((t) => ({
    ...t,
    from_region_name: t.from_region_id ? byId[t.from_region_id] ?? null : null,
    to_region_name: t.to_region_id ? byId[t.to_region_id] ?? null : null,
  }));
}

/** Unified timeline (day + sites + travel) ordered by order_index.
 * If the trip_timeline view lacks some travel fields, we hydrate from trip_travel.
 */
export async function getTripTimeline(
  trip_id: string
): Promise<TimelineItem[]> {
  const viewTry = await supabase
    .from("trip_timeline")
    .select("*")
    .eq("trip_id", trip_id)
    .order("order_index", { ascending: true });

  const ensureNames = async (rows: (TravelLeg & { kind: "travel" })[]) => {
    const hydrated = await hydrateRegionNames(rows);
    return new Map(hydrated.map((t) => [t.id, t]));
  };

  if (!viewTry.error && Array.isArray(viewTry.data)) {
    let arr = (viewTry.data as any[]).map((row) => {
      if (row.kind === "travel") {
        const travel_start_at = row.travel_start_at ?? row.start_at ?? null;
        const travel_end_at = row.travel_end_at ?? row.end_at ?? null;
        return {
          ...row,
          kind: "travel",
          distance_km: safeNum(row.distance_km),
          travel_start_at,
          travel_end_at,
        } as TimelineItem;
      }
      if (row.kind === "site") return { ...row } as TimelineItem;
      if (row.kind === "day") return { ...row } as TimelineItem;
      return row as TimelineItem;
    });

    const viewHasDay = (arr as TimelineItem[]).some((x) => x.kind === "day");
    if (!viewHasDay) {
      const { data: days, error: daysErr } = await supabase
        .from("trip_days")
        .select("*")
        .eq("trip_id", trip_id);
      if (daysErr) throw daysErr;
      arr = [
        ...arr,
        ...(days ?? []).map(
          (d) => ({ kind: "day", ...(d as any) } as TimelineItem)
        ),
      ];
    }

    const travelRows = arr.filter((x) => x.kind === "travel") as (TravelLeg & {
      kind: "travel";
    })[];

    if (travelRows.length) {
      const namesById = await ensureNames(travelRows);
      arr = arr.map((x) =>
        x.kind === "travel" ? ({ ...namesById.get(x.id), ...x } as any) : x
      );

      const ids = travelRows.map((t) => t.id);
      const { data: tt, error } = await supabase
        .from("trip_travel")
        .select("id, day_id, travel_start_at, travel_end_at, start_at, end_at")
        .in("id", ids);

      if (!error && Array.isArray(tt)) {
        const byId = new Map(
          tt.map((r: any) => [
            r.id,
            {
              day_id: r.day_id ?? null,
              travel_start_at: r.travel_start_at ?? r.start_at ?? null,
              travel_end_at: r.travel_end_at ?? r.end_at ?? null,
            },
          ])
        );

        arr = arr.map((x) =>
          x.kind === "travel"
            ? ({
                ...x,
                day_id: (x as any).day_id ?? byId.get(x.id)?.day_id ?? null,
                travel_start_at:
                  (x as any).travel_start_at ??
                  byId.get(x.id)?.travel_start_at ??
                  null,
                travel_end_at:
                  (x as any).travel_end_at ??
                  byId.get(x.id)?.travel_end_at ??
                  null,
              } as any)
            : x
        );
      }
    }

    return (arr as TimelineItem[]).sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
    );
  }

  // Fallback: direct tables (include days)
  const [daysRes, sitesRes, travelRes] = await Promise.all([
    supabase.from("trip_days").select("*").eq("trip_id", trip_id),
    supabase
      .from("trip_items")
      .select(
        "id, trip_id, site_id, order_index, day_id, date_in, date_out, notes, created_at, updated_at"
      )
      .eq("trip_id", trip_id),
    supabase
      .from("trip_travel")
      .select(
        "id, trip_id, order_index, day_id, from_region_id, to_region_id, mode, duration_minutes, distance_km, notes, travel_start_at, travel_end_at, start_at, end_at, created_at, updated_at"
      )
      .eq("trip_id", trip_id),
  ]);

  if (daysRes.error) throw daysRes.error;
  if (sitesRes.error) throw sitesRes.error;
  if (travelRes.error) throw travelRes.error;

  const days: TimelineItem[] =
    (daysRes.data ?? []).map((d: any) => ({ kind: "day", ...d })) ?? [];
  const sites: TimelineItem[] =
    (sitesRes.data ?? []).map((s: any) => ({ kind: "site", ...s })) ?? [];

  let travel: (TravelLeg & { kind: "travel" })[] =
    (travelRes.data ?? []).map((t: any) => ({
      kind: "travel",
      ...t,
      travel_start_at: t.travel_start_at ?? t.start_at ?? null,
      travel_end_at: t.travel_end_at ?? t.end_at ?? null,
      distance_km: safeNum(t.distance_km),
    })) ?? [];

  travel = await hydrateRegionNames(travel);

  return [...days, ...sites, ...travel].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
  );
}
