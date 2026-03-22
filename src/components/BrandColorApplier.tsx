"use client";

import { useEffect } from "react";
import type { BrandColors } from "@/lib/brand-colors";

export default function BrandColorApplier({ colors }: { colors: BrandColors }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-green",           colors.brand_green);
    root.style.setProperty("--brand-orange",          colors.brand_orange);
    root.style.setProperty("--brand-blue",            colors.brand_blue);
    root.style.setProperty("--brand-black",           colors.brand_black);
    root.style.setProperty("--brand-dark-grey",       colors.brand_dark_grey);
    root.style.setProperty("--brand-light-grey",      colors.brand_light_grey);
    root.style.setProperty("--brand-very-light-grey", colors.brand_very_light_grey);
    root.style.setProperty("--brand-illustration",    colors.brand_illustration);
  }, [colors]);

  return null;
}
