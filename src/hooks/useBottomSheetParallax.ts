"use client";

import { useEffect } from "react";

const SCALE = 0.92;
const TRANSLATE_Y = "12px";
const BORDER_RADIUS = "24px";
const TRANSITION = "transform 0.55s cubic-bezier(0.32,0.72,0,1), border-radius 0.55s cubic-bezier(0.32,0.72,0,1), filter 0.55s cubic-bezier(0.32,0.72,0,1)";
const BODY_TRANSITION = "background-color 0.55s cubic-bezier(0.32,0.72,0,1)";
const BODY_COLOR_OPEN = "#111111";
const BODY_COLOR_CLOSED = "#f4f4f4";

export function useBottomSheetParallax(active: boolean) {
  useEffect(() => {
    const page = document.getElementById("heritage-page-root");
    const body = document.body;
    if (!page) return;

    if (active) {
      page.style.transition = TRANSITION;
      body.style.transition = BODY_TRANSITION;
      body.style.backgroundColor = BODY_COLOR_OPEN;
      page.style.transformOrigin = "top center";
      page.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y})`;
      page.style.borderRadius = BORDER_RADIUS;
    } else {
      page.style.transition = TRANSITION;
      body.style.transition = BODY_TRANSITION;
      body.style.backgroundColor = BODY_COLOR_CLOSED;
      page.style.transform = "scale(1)";
      page.style.borderRadius = "0px";
    }
  }, [active]);
}
