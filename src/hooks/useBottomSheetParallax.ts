"use client";

import { useEffect, useRef } from "react";

/**
 * Parallax hook — drives the background page recede when a bottom sheet opens.
 *
 * STUTTER-FREE STRATEGY:
 * The animation window must contain ONLY transform changes — that's the one
 * property the GPU compositor can animate without re-rasterising layers.
 *
 *   • transform (scale + translate3d): GPU-only ✅
 *   • border-radius: forces repaint per frame ❌ → snap instantly at start
 *   • filter (blur/brightness): full-page repaint per frame ❌ → use a fixed dim overlay instead
 *   • background-color: useless under an opaque page ❌ → snap instantly
 *
 * On low-end devices the previous filter+border-radius+bg approach was killing the GPU.
 * Now: only transform animates. Everything else snaps. Result: 60fps everywhere.
 */

const SCALE = 0.88;
const TRANSLATE_Y = "38px";
const BORDER_RADIUS = "24px";
const DURATION_MS = 900;
const EASE = "cubic-bezier(0.32,0.72,0,1)";
// ONLY transform animates. Nothing else.
const TRANSITION = `transform ${DURATION_MS}ms ${EASE}`;
const BODY_COLOR_OPEN = "#111111";
const BODY_COLOR_CLOSED = "#f4f4f4";

let openCount = 0;
let bgTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_TARGETS = {
  pageIds: ["heritage-page-root"],
  headerIds: ["heritage-mobile-header"],
};

export type Targets = {
  pageIds?: string[];
  headerIds?: string[];
};

function getEls(targets: Targets) {
  const pageIds = targets.pageIds ?? DEFAULT_TARGETS.pageIds;
  const headerIds = targets.headerIds ?? DEFAULT_TARGETS.headerIds;
  const pages = pageIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const headers = headerIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  return { pages, headers };
}

export function applyOpen(targets: Targets) {
  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }

  const { pages, headers } = getEls(targets);
  const body = document.body;

  // Promote GPU layers + snap all non-transform properties to their open
  // values BEFORE the animation starts. None of these properties animate —
  // they take effect instantly, hidden under the rising sheet.
  pages.forEach((page) => {
    page.style.willChange = "transform";
    page.style.backfaceVisibility = "hidden";
    page.style.transition = "none";
    page.style.transformOrigin = "top center";
    page.style.transform = "translate3d(0, 0, 0) scale(1)";
    page.style.borderRadius = BORDER_RADIUS; // snapped instantly
    page.style.filter = ""; // no filter at all — we use a dim overlay instead
  });
  headers.forEach((header) => {
    header.style.willChange = "transform";
    header.style.backfaceVisibility = "hidden";
    header.style.transition = "none";
    header.style.transformOrigin = "top center";
    header.style.transform = "translate3d(0, 0, 0) scale(1)";
    header.style.filter = "";
  });

  // Snap body bg instantly — it's hidden under the page anyway, but this
  // gives a dark frame around the receded page on devices where the corners
  // round in.
  body.style.transition = "none";
  body.style.backgroundColor = BODY_COLOR_OPEN;

  // Force reflow — commits the start state so the transform transition has
  // a known from-value. ONLY transform is in the transition list, so no
  // expensive paint properties get animated.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  pages[0]?.offsetHeight ?? body.offsetHeight;

  // Flip transforms — pure GPU compositor work
  pages.forEach((page) => {
    page.style.transition = TRANSITION;
    page.style.transform = `translate3d(0, ${TRANSLATE_Y}, 0) scale(${SCALE})`;
  });
  headers.forEach((header) => {
    header.style.transition = TRANSITION;
    header.style.transform = `translate3d(0, ${TRANSLATE_Y}, 0) scale(${SCALE})`;
    header.style.opacity = "1";
  });
}

export function applyClose(targets: Targets) {
  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }

  const { pages, headers } = getEls(targets);
  const body = document.body;

  // Re-promote GPU layers (in case they were released by a prior cycle)
  pages.forEach((page) => {
    page.style.willChange = "transform";
    page.style.backfaceVisibility = "hidden";
  });
  headers.forEach((header) => {
    header.style.willChange = "transform";
    header.style.backfaceVisibility = "hidden";
  });

  // Animate only transform back to identity
  pages.forEach((page) => {
    page.style.transition = TRANSITION;
    page.style.transform = "translate3d(0, 0, 0) scale(1)";
  });
  headers.forEach((header) => {
    header.style.transition = TRANSITION;
    header.style.transform = "translate3d(0, 0, 0) scale(1)";
    header.style.opacity = "1";
  });

  // After the animation completes, snap the non-animated properties back
  // to closed state and release GPU layers.
  bgTimer = setTimeout(() => {
    bgTimer = null;
    body.style.transition = "none";
    body.style.backgroundColor = BODY_COLOR_CLOSED;
    [...pages, ...headers].forEach((el) => {
      el.style.willChange = "";
      el.style.backfaceVisibility = "";
    });
    pages.forEach((page) => { page.style.borderRadius = ""; });
  }, DURATION_MS);
}

export function useBottomSheetParallax(active: boolean, targets?: Targets) {
  const wasActive = useRef(false);
  const targetsRef = useRef<Targets>(targets ?? {});
  targetsRef.current = targets ?? {};

  useEffect(() => {
    const isNowActive = active;
    const wasActiveVal = wasActive.current;
    wasActive.current = isNowActive;

    if (isNowActive && !wasActiveVal) {
      openCount++;
      applyOpen(targetsRef.current);
    } else if (!isNowActive && wasActiveVal) {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) applyClose(targetsRef.current);
    }
  }, [active]);

  useEffect(() => {
    return () => {
      if (wasActive.current) {
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) applyClose(targetsRef.current);
      }
    };
  }, []);
}
