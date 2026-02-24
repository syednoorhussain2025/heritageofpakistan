// src/lib/fetchHeaderItems.ts
// Server-side fetch for header nav items — called from layout.tsx so data
// is available before any client JS runs, eliminating layout shift.

import { createPublicClient } from "@/lib/supabase/public-server";
import { getVariantPublicUrl } from "@/lib/imagevariants";

export type HeaderSubItem = {
  id: string;
  main_item_id: string;
  label: string;
  icon_name: string | null;
  url: string | null;
  title: string | null;
  detail: string | null;
  site_id: string | null;
  site_image_id: string | null;
  sort_order: number;
  image_url: string | null;
};

export type HeaderMainItem = {
  id: string;
  label: string;
  slug: string;
  icon_name: string | null;
  url: string | null;
  sort_order: number;
  sub_items: HeaderSubItem[];
};

export async function fetchHeaderItems(): Promise<HeaderMainItem[]> {
  try {
    const supabase = createPublicClient();

    const { data: mainItems, error: mainErr } = await supabase
      .from("header_main_items")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (mainErr || !mainItems || mainItems.length === 0) return [];

    const mainIds = (mainItems as any[]).map((m) => m.id);

    const { data: subItems, error: subErr } = await supabase
      .from("header_sub_items")
      .select("*")
      .in("main_item_id", mainIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    let imageMap: Record<string, string> = {};

    if (!subErr && subItems && subItems.length > 0) {
      const imageIds = (subItems as any[])
        .map((s) => s.site_image_id)
        .filter((id) => !!id) as string[];

      if (imageIds.length > 0) {
        const { data: images } = await supabase
          .from("site_images")
          .select("id,storage_path")
          .in("id", imageIds);

        if (images) {
          imageMap = (images as any[]).reduce((acc, img) => {
            acc[img.id] = img.storage_path;
            return acc;
          }, {} as Record<string, string>);
        }
      }
    }

    const finalSubItems: HeaderSubItem[] = ((subItems as any[]) || []).map((s) => {
      const storagePath = s.site_image_id ? imageMap[s.site_image_id] ?? null : null;
      const image_url = storagePath
        ? getVariantPublicUrl(storagePath, "thumb")
        : null;
      return {
        id: s.id,
        main_item_id: s.main_item_id,
        label: s.label,
        icon_name: s.icon_name,
        url: s.url,
        title: s.title,
        detail: s.detail,
        site_id: s.site_id,
        site_image_id: s.site_image_id,
        sort_order: s.sort_order,
        image_url,
      };
    });

    const subByMain: Record<string, HeaderSubItem[]> = {};
    finalSubItems.forEach((s) => {
      const arr = subByMain[s.main_item_id] || (subByMain[s.main_item_id] = []);
      arr.push(s);
    });

    return (mainItems as any[]).map((m) => ({
      id: m.id,
      label: m.label,
      slug: m.slug,
      icon_name: m.icon_name,
      url: m.url,
      sort_order: m.sort_order,
      sub_items: subByMain[m.id] || [],
    }));
  } catch {
    return [];
  }
}
