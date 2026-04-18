import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search_inspirations")
    .select("id, phrase")
    .eq("is_active", true)
    .order("sort_order");

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data ?? []);
}
