"use client";

import { useEffect } from "react";

export default function BrandColorApplier() {
  useEffect(() => {
    fetch("/api/brand-colors")
      .then((r) => r.json())
      .then((c) => {
        const root = document.documentElement;
        if (c.brand_green)           root.style.setProperty("--brand-green",           c.brand_green);
        if (c.brand_orange)          root.style.setProperty("--brand-orange",          c.brand_orange);
        if (c.brand_blue)            root.style.setProperty("--brand-blue",            c.brand_blue);
        if (c.brand_black)           root.style.setProperty("--brand-black",           c.brand_black);
        if (c.brand_dark_grey)       root.style.setProperty("--brand-dark-grey",       c.brand_dark_grey);
        if (c.brand_light_grey)      root.style.setProperty("--brand-light-grey",      c.brand_light_grey);
        if (c.brand_very_light_grey) root.style.setProperty("--brand-very-light-grey", c.brand_very_light_grey);
        if (c.brand_illustration)    root.style.setProperty("--brand-illustration",    c.brand_illustration);
      })
      .catch(() => {});
  }, []);

  return null;
}
