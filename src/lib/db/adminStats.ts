// lib/db/adminStats.ts
import { supabase } from "@/lib/supabase/browser";

export async function getTotalSites() {
  const { count, error } = await supabase
    .from("sites")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function getSitesByProvince() {
  const { data, error } = await supabase
    .from("sites")
    .select("province_id, provinces(name)")
    .eq("is_published", true); // optional: only published
  if (error) throw error;

  // aggregate counts manually
  const counts: Record<string, number> = {};
  data?.forEach((row: any) => {
    const province = row.provinces?.name ?? "Unknown";
    counts[province] = (counts[province] || 0) + 1;
  });

  // convert to array
  return Object.entries(counts).map(([province, count]) => ({
    province,
    count,
  }));
}
