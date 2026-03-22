import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BRAND_ROW_ID = "00000000-0000-0000-0000-000000000001";

export type BrandColors = {
  brand_green: string;
  brand_orange: string;
  brand_blue: string;
  brand_black: string;
  brand_dark_grey: string;
  brand_light_grey: string;
  brand_very_light_grey: string;
  brand_illustration: string;
};

export const BRAND_DEFAULTS: BrandColors = {
  brand_green:           "#00b78b",
  brand_orange:          "#F78300",
  brand_blue:            "#1c1f4c",
  brand_black:           "#111111",
  brand_dark_grey:       "#2d2d2d",
  brand_light_grey:      "#efefef",
  brand_very_light_grey: "#f5f5f5",
  brand_illustration:    "#00b78b",
};

export const getBrandColors = unstable_cache(
  async (): Promise<BrandColors> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("brand_colors")
        .select("brand_green,brand_orange,brand_blue,brand_black,brand_dark_grey,brand_light_grey,brand_very_light_grey,brand_illustration")
        .eq("id", BRAND_ROW_ID)
        .single();
      if (error || !data) return BRAND_DEFAULTS;
      return { ...BRAND_DEFAULTS, ...data } as BrandColors;
    } catch {
      return BRAND_DEFAULTS;
    }
  },
  ["brand-colors"],
  { tags: ["brand-colors"], revalidate: 3600 }
);

/** Converts BrandColors to a CSS <style> block injected into <head> */
export function brandColorsCss(c: BrandColors): string {
  return `:root {
  --brand-green: ${c.brand_green};
  --brand-orange: ${c.brand_orange};
  --brand-blue: ${c.brand_blue};
  --brand-black: ${c.brand_black};
  --brand-dark-grey: ${c.brand_dark_grey};
  --brand-light-grey: ${c.brand_light_grey};
  --brand-very-light-grey: ${c.brand_very_light_grey};
  --brand-illustration: ${c.brand_illustration};
}`;
}
