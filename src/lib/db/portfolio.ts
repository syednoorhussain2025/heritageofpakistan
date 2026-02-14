import { createClient } from "@/lib/supabase/browser";

export type PortfolioRow = {
  id: string;
  user_id: string;
  photo_id: string;
  is_public: boolean;
  order_index: number;
  caption_override: string | null;
  created_at: string;
};

export async function listPortfolio(userId: string): Promise<PortfolioRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_portfolio")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as PortfolioRow[];
}

export async function insertPortfolioItem(
  userId: string,
  photo_id: string,
  order_index = 999,
  is_public = true
) {
  const supabase = createClient();

  // Ensure row exists
  const { data: existing, error: selErr } = await supabase
    .from("user_portfolio")
    .select("id")
    .eq("user_id", userId)
    .eq("photo_id", photo_id)
    .maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    const { error: insErr } = await supabase
      .from("user_portfolio")
      .insert([{ user_id: userId, photo_id }]);
    if (insErr) throw insErr;
  }

  const { data, error } = await supabase
    .from("user_portfolio")
    .update({ order_index, is_public })
    .eq("user_id", userId)
    .eq("photo_id", photo_id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as PortfolioRow | null;
}

export async function updatePortfolioItem(
  photo_id: string,
  patch: Partial<
    Pick<PortfolioRow, "is_public" | "order_index" | "caption_override">
  >
) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) throw new Error("Not authenticated");

  // Ensure row exists
  const { data: existing, error: selErr } = await supabase
    .from("user_portfolio")
    .select("id")
    .eq("user_id", uid)
    .eq("photo_id", photo_id)
    .maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    const { error: insErr } = await supabase
      .from("user_portfolio")
      .insert([{ user_id: uid, photo_id }]);
    if (insErr) throw insErr;
  }

  const { data, error } = await supabase
    .from("user_portfolio")
    .update(patch)
    .eq("user_id", uid)
    .eq("photo_id", photo_id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as PortfolioRow | null;
}

/** Save order 0..N-1 via server API (uses cookies → authenticated) */
export async function reorderPortfolioItems(
  _userId: string,
  updates: { photo_id: string; order_index: number }[]
) {
  if (!updates?.length) return { count: 0 };

  const res = await fetch("/api/portfolio/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to save order");
  return { count: json.count as number };
}
