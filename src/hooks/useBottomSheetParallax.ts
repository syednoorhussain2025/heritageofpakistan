"use client";

import { useEffect, useRef } from "react";

const SCALE = 0.92;
const TRANSLATE_Y = "24px";
const BORDER_RADIUS = "24px";
const DURATION_MS = 460;
const TRANSITION = `transform ${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1), border-radius ${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1), filter ${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1)`;
const BODY_TRANSITION = `background-color ${DURATION_MS}ms cubic-bezier(0.4,0,0.2,1)`;
const BODY_COLOR_OPEN = "#111111";
const BODY_COLOR_CLOSED = "#f4f4f4";
const FILTER_OPEN = "brightness(0.75) blur(0.6px)";
const FILTER_CLOSED = "brightness(1) blur(0px)";

// Singleton ref-count: tracks how many sheets are currently open.
// This prevents sequential/nested sheets from fighting over the page state.
let openCount = 0;
let bgTimer: ReturnType<typeof setTimeout> | null = null;

function applyOpen() {
  const page = document.getElementById("heritage-page-root");
  const header = document.getElementById("heritage-mobile-header");
  const body = document.body;
  if (!page) return;

  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }

  // Snap body bg to black instantly — no gap flash
  body.style.transition = "none";
  body.style.backgroundColor = BODY_COLOR_OPEN;
  body.offsetHeight; // force reflow
  body.style.transition = BODY_TRANSITION;

  page.style.transition = TRANSITION;
  page.style.transformOrigin = "top center";
  page.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y})`;
  page.style.borderRadius = BORDER_RADIUS;
  page.style.filter = FILTER_OPEN;

  if (header) {
    header.style.transition = TRANSITION;
    header.style.transformOrigin = "top center";
    header.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y})`;
    header.style.opacity = "1";
    header.style.filter = FILTER_OPEN;
  }
}

function applyClose() {
  const page = document.getElementById("heritage-page-root");
  const header = document.getElementById("heritage-mobile-header");
  const body = document.body;
  if (!page) return;

  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }

  page.style.transition = TRANSITION;
  page.style.transform = "scale(1) translateY(0px)";
  page.style.borderRadius = "0px";
  page.style.filter = FILTER_CLOSED;

  if (header) {
    header.style.transition = TRANSITION;
    header.style.transform = "scale(1) translateY(0px)";
    header.style.opacity = "1";
    header.style.filter = FILTER_CLOSED;
  }

  // Delay body bg restore until page has scaled back up
  bgTimer = setTimeout(() => {
    bgTimer = null;
    body.style.transition = BODY_TRANSITION;
    body.style.backgroundColor = BODY_COLOR_CLOSED;
  }, DURATION_MS);
}

export function useBottomSheetParallax(active: boolean) {
  const wasActive = useRef(false);

  useEffect(() => {
    const isNowActive = active;
    const wasActiveVal = wasActive.current;
    wasActive.current = isNowActive;

    if (isNowActive && !wasActiveVal) {
      // Opening
      openCount++;
      applyOpen();
    } else if (!isNowActive && wasActiveVal) {
      // Closing
      openCount = Math.max(0, openCount - 1);
      // Only restore page if no other sheet is still open
      if (openCount === 0) {
        applyClose();
      }
    }
  }, [active]);

  // On unmount: if this sheet was active, decrement and maybe restore
  useEffect(() => {
    return () => {
      if (wasActive.current) {
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) {
          applyClose();
        }
      }
    };
  }, []);
}
