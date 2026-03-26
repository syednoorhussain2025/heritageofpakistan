"use client";

import { useEffect } from "react";

const SCALE = 0.88;
const TRANSLATE_Y = "22px";
const BORDER_RADIUS = "24px";
// Slower with ease-in-out feel: longer duration + gentler bezier
const TRANSITION = "transform 0.58s cubic-bezier(0.4,0,0.2,1), border-radius 0.58s cubic-bezier(0.4,0,0.2,1), filter 0.58s cubic-bezier(0.4,0,0.2,1)";
const BODY_TRANSITION = "background-color 0.58s cubic-bezier(0.4,0,0.2,1)";
const BODY_COLOR_OPEN = "#111111";
const BODY_COLOR_CLOSED = "#f4f4f4";
const FILTER_OPEN = "brightness(0.75) blur(0.6px)";
const FILTER_CLOSED = "brightness(1) blur(0px)";

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
      page.style.filter = FILTER_OPEN;
    } else {
      page.style.transition = TRANSITION;
      body.style.transition = BODY_TRANSITION;
      body.style.backgroundColor = BODY_COLOR_CLOSED;
      page.style.transform = "scale(1) translateY(0px)";
      page.style.borderRadius = "0px";
      page.style.filter = FILTER_CLOSED;
    }
  }, [active]);
}
