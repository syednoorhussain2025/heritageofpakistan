import { createClient } from "@/lib/supabaseClient";

export type PortfolioRow = {
  id: string;
  user_id: string;
  photo_id: string;
  is_public: boolean;
  order_index: number;
};

export async function listPortfolio(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_portfolio")
    .select("*")
    .eq("user_id", userId)
    .order("order_index", { ascending: true })
    .returns<PortfolioRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function insertPortfolioItem(
  userId: string,
  photoId: string,
  order_index: number = 999
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_portfolio")
    .insert({
      user_id: userId,
      photo_id: photoId,
      is_public: true,
      order_index,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data!;
}

export async function updatePortfolioItem(
  photoId: string,
  patch: {
    is_public?: boolean;
    order_index?: number;
  }
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_portfolio")
    .update(patch)
    .eq("photo_id", photoId)
    .select("*")
    .single();
  if (error) throw error;
  return data!;
}

export async function reorderPortfolioItems(
  userId: string,
  photoIds: string[]
) {
  const supabase = createClient();

  // Call the dedicated database function 'reorder_portfolio_items'
  // This is a more robust and direct way to handle reordering.
  const { error } = await supabase.rpc("reorder_portfolio_items", {
    p_user_id: userId,
    p_photo_ids: photoIds,
  });

  if (error) {
    console.error("Error reordering portfolio items:", error);
    throw error;
  }

  return { success: true };
}
