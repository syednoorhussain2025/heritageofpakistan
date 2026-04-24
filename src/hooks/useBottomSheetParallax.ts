"use client";

import { useEffect, useRef } from "react";

const SCALE = 0.88;
const TRANSLATE_Y = "38px";
const BORDER_RADIUS = "24px";
const DURATION_MS = 680;
const TRANSITION = `transform ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1), border-radius ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1), filter ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1)`;
const BODY_TRANSITION = `background-color ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1)`;
const BODY_COLOR_OPEN = "#111111";
const BODY_COLOR_CLOSED = "#f4f4f4";
const FILTER_OPEN = "brightness(0.75) blur(0.6px)";
const FILTER_CLOSED = "brightness(1) blur(0px)";

// Singleton ref-count: tracks how many sheets are currently open.
let openCount = 0;
let bgTimer: ReturnType<typeof setTimeout> | null = null;
let openRaf: number | null = null;

const DEFAULT_TARGETS = {
  pageIds: ["heritage-page-root"],
  headerIds: ["heritage-mobile-header"],
};

type Targets = {
  pageIds?: string[];
  headerIds?: string[];
};

function applyOpen(targets: Targets) {
  const pageIds = targets.pageIds ?? DEFAULT_TARGETS.pageIds;
  const headerIds = targets.headerIds ?? DEFAULT_TARGETS.headerIds;
  const body = document.body;

  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }
  // Cancel any pending open RAF (e.g. rapid open/close)
  if (openRaf != null) { cancelAnimationFrame(openRaf); openRaf = null; }

  // Snap body bg to black instantly — no gap flash
  body.style.transition = "none";
  body.style.backgroundColor = BODY_COLOR_OPEN;
  body.offsetHeight; // force reflow so the color is committed before transition re-enables

  // Set will-change on pages before the animation frame so the GPU promotes
  // the layer *before* we apply the transform, eliminating the first-frame stutter.
  const pages = pageIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const headers = headerIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);

  pages.forEach((page) => {
    page.style.willChange = "transform, filter, border-radius";
    page.style.transition = "none";
    page.style.transform = "scale(1) translateY(0px)";
    page.style.borderRadius = "0px";
    page.style.filter = FILTER_CLOSED;
  });
  headers.forEach((header) => {
    header.style.willChange = "transform, filter";
    header.style.transition = "none";
    header.style.transform = "scale(1) translateY(0px)";
    header.style.filter = FILTER_CLOSED;
  });

  // One RAF: browser has promoted layers and painted the starting state.
  // Now flip to the target state — transition runs cleanly from the first frame.
  openRaf = requestAnimationFrame(() => {
    openRaf = null;
    body.style.transition = BODY_TRANSITION;

    pages.forEach((page) => {
      page.style.transition = TRANSITION;
      page.style.transformOrigin = "top center";
      page.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y})`;
      page.style.borderRadius = BORDER_RADIUS;
      page.style.filter = FILTER_OPEN;
    });

    headers.forEach((header) => {
      header.style.transition = TRANSITION;
      header.style.transformOrigin = "top center";
      header.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y})`;
      header.style.opacity = "1";
      header.style.filter = FILTER_OPEN;
    });
  });
}

function applyClose(targets: Targets) {
  const pageIds = targets.pageIds ?? DEFAULT_TARGETS.pageIds;
  const headerIds = targets.headerIds ?? DEFAULT_TARGETS.headerIds;
  const pages = pageIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const headers = headerIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const body = document.body;

  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }
  // If open RAF hasn't fired yet, cancel it — open was superseded by close
  if (openRaf != null) { cancelAnimationFrame(openRaf); openRaf = null; }

  pages.forEach((page) => {
    page.style.transition = TRANSITION;
    page.style.transform = "scale(1) translateY(0px)";
    page.style.borderRadius = "0px";
    page.style.filter = FILTER_CLOSED;
  });

  headers.forEach((header) => {
    header.style.transition = TRANSITION;
    header.style.transform = "scale(1) translateY(0px)";
    header.style.opacity = "1";
    header.style.filter = FILTER_CLOSED;
  });

  // Delay body bg restore until page has scaled back up, then clear will-change
  bgTimer = setTimeout(() => {
    bgTimer = null;
    body.style.transition = BODY_TRANSITION;
    body.style.backgroundColor = BODY_COLOR_CLOSED;

    // Release GPU layers once animation is done
    [...pages, ...headers].forEach((el) => { el.style.willChange = ""; });
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
      if (openCount === 0) {
        applyClose(targetsRef.current);
      }
    }
  }, [active]);

  // On unmount: if this sheet was active, decrement and maybe restore
  useEffect(() => {
    return () => {
      if (wasActive.current) {
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) {
          applyClose(targetsRef.current);
        }
      }
    };
  }, []);
}
