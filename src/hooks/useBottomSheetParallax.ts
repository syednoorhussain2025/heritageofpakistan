"use client";

import { useEffect, useRef } from "react";

const SCALE = 0.88;
const TRANSLATE_Y = "38px";
const BORDER_RADIUS = "24px";
const DURATION_MS = 460;
const TRANSITION = `transform ${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1), border-radius ${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1), filter ${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1)`;
const BODY_TRANSITION = `background-color ${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1)`;
const BODY_COLOR_OPEN = "#111111";
const BODY_COLOR_CLOSED = "#f4f4f4";
const FILTER_OPEN = "brightness(0.75) blur(0.6px)";
const FILTER_CLOSED = "brightness(1) blur(0px)";

export function useBottomSheetParallax(active: boolean) {
  const bgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const page = document.getElementById("heritage-page-root");
    const body = document.body;
    if (!page) return;

    // Cancel any pending bg restore
    if (bgTimerRef.current != null) {
      clearTimeout(bgTimerRef.current);
      bgTimerRef.current = null;
    }

    if (active) {
      // Snap body bg to black instantly — no gap flash on open
      body.style.transition = "none";
      body.style.backgroundColor = BODY_COLOR_OPEN;
      body.offsetHeight; // force reflow
      body.style.transition = BODY_TRANSITION;

      page.style.transition = TRANSITION;
      page.style.transformOrigin = "top center";
      page.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y})`;
      page.style.borderRadius = BORDER_RADIUS;
      page.style.filter = FILTER_OPEN;
    } else {
      // Scale back up first, then restore body bg after animation completes
      page.style.transition = TRANSITION;
      page.style.transform = "scale(1) translateY(0px)";
      page.style.borderRadius = "0px";
      page.style.filter = FILTER_CLOSED;

      // Delay body bg restore until page is fully scaled back — prevents flash in gap
      bgTimerRef.current = setTimeout(() => {
        bgTimerRef.current = null;
        body.style.transition = BODY_TRANSITION;
        body.style.backgroundColor = BODY_COLOR_CLOSED;
      }, DURATION_MS);
    }
  }, [active]);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (bgTimerRef.current != null) clearTimeout(bgTimerRef.current);
  }, []);
}
