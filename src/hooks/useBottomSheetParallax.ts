import { useEffect } from "react";

const TRANSITION = "transform 0.5s cubic-bezier(0.25,0.1,0.25,1), border-radius 0.5s cubic-bezier(0.25,0.1,0.25,1), filter 0.5s cubic-bezier(0.25,0.1,0.25,1)";
const BODY_TRANSITION = "background-color 0.5s cubic-bezier(0.25,0.1,0.25,1)";
const RADIUS = "28px";
const BODY_COLOR_OPEN = "#111111";
const SCALE = 0.94;
const TRANSLATE_Y = -60; // px upward nudge

/**
 * Applies a scale-down parallax effect to `#heritage-page-root` when a
 * bottom sheet is open, mimicking the iOS native sheet behaviour.
 *
 * Uses scrollY-aware translateY so the effect works correctly regardless
 * of scroll position — no position:fixed needed.
 *
 * @param active  true while the sheet is fully open (visible + not closing)
 */
export function useBottomSheetParallax(active: boolean) {
  useEffect(() => {
    const page = document.getElementById("heritage-page-root");
    const body = document.body;
    if (!page) return;

    body.style.transition = BODY_TRANSITION;

    if (active) {
      const scrollY = window.scrollY;

      // Only apply the effect when near the top — mid-scroll causes a white
      // flash because the browser repaints a large scrolled element.
      if (scrollY > 200) return;

      const compensate = scrollY * (1 - SCALE);
      const ty = TRANSLATE_Y - compensate;

      page.style.transition = TRANSITION;
      body.style.backgroundColor = BODY_COLOR_OPEN;

      const raf = requestAnimationFrame(() => {
        page.style.transform = `scale(${SCALE}) translateY(${ty}px)`;
        page.style.borderRadius = RADIUS;
        page.style.filter = "blur(0.6px)";
      });
      return () => cancelAnimationFrame(raf);
    } else {
      page.style.transition = TRANSITION;
      body.style.backgroundColor = "";

      const raf = requestAnimationFrame(() => {
        page.style.transform = "";
        page.style.borderRadius = "";
        page.style.filter = "";
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [active]);
}
