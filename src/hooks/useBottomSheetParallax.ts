import { useEffect } from "react";

const TRANSITION = "transform 0.5s cubic-bezier(0.25,0.1,0.25,1), border-radius 0.5s cubic-bezier(0.25,0.1,0.25,1), filter 0.5s cubic-bezier(0.25,0.1,0.25,1)";
const BODY_TRANSITION = "background-color 0.5s cubic-bezier(0.25,0.1,0.25,1)";
const SCALE = 0.94;
const TRANSLATE_Y = -100;
const RADIUS = "28px";
const BODY_COLOR_OPEN = "#111111";

/**
 * Applies a scale-down parallax effect to `#heritage-page-root` when a
 * bottom sheet is open, mimicking the iOS native sheet behaviour.
 *
 * Uses position:fixed pinned to the current scroll offset so the effect
 * works correctly at any scroll position without flash or jump.
 */
export function useBottomSheetParallax(active: boolean) {
  useEffect(() => {
    const page = document.getElementById("heritage-page-root");
    const body = document.body;
    if (!page) return;

    if (active) {
      const scrollY = window.scrollY;

      // 1. Pin WITHOUT transition so there's no flash
      page.style.transition = "none";
      page.style.position = "fixed";
      page.style.top = `-${scrollY}px`;
      page.style.left = "0";
      page.style.right = "0";
      page.style.width = "100%";
      // Reset any previous transform so the pin is clean
      page.style.transform = "none";
      page.style.borderRadius = "0px";
      page.style.filter = "none";

      // 2. Force a synchronous reflow so the pin is applied before animating
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      page.offsetHeight;

      // 3. Now enable transition and animate
      page.style.transition = TRANSITION;
      body.style.transition = BODY_TRANSITION;
      body.style.backgroundColor = BODY_COLOR_OPEN;

      const raf = requestAnimationFrame(() => {
        page.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y}px)`;
        page.style.borderRadius = RADIUS;
        page.style.filter = "blur(0.3px)";
      });

      return () => cancelAnimationFrame(raf);
    } else {
      // Capture scroll offset stored in top before restoring
      const pinnedTop = page.style.top;
      const scrollY = pinnedTop ? -parseInt(pinnedTop, 10) : 0;

      // Animate back
      page.style.transition = TRANSITION;
      body.style.transition = BODY_TRANSITION;
      body.style.backgroundColor = "";

      const raf = requestAnimationFrame(() => {
        page.style.transform = "none";
        page.style.borderRadius = "0px";
        page.style.filter = "none";
      });

      // After animation finishes, unpin and restore scroll
      const timer = setTimeout(() => {
        page.style.transition = "none";
        page.style.position = "";
        page.style.top = "";
        page.style.left = "";
        page.style.right = "";
        page.style.width = "";
        page.style.transform = "";
        page.style.borderRadius = "";
        page.style.filter = "";
        window.scrollTo({ top: scrollY, behavior: "instant" });
      }, 520);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [active]);
}
