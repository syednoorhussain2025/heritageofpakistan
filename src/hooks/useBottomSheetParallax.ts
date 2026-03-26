"use client";

import { useEffect } from "react";

const SCALE = 0.88;
const TRANSLATE_Y = "38px";
const BORDER_RADIUS = "24px";
const TRANSITION = "transform 0.46s cubic-bezier(0.4,0,0.2,1), border-radius 0.46s cubic-bezier(0.4,0,0.2,1), filter 0.46s cubic-bezier(0.4,0,0.2,1)";
const BODY_TRANSITION = "background-color 0.46s cubic-bezier(0.4,0,0.2,1)";
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
      // Set body bg instantly (no transition) to prevent white flash in the gap
      body.style.transition = "none";
      body.style.backgroundColor = BODY_COLOR_OPEN;
      // Force reflow so the instant bg change paints before the transition starts
      body.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
      body.style.transition = BODY_TRANSITION;

      page.style.transition = TRANSITION;
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
