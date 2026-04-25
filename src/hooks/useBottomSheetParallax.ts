"use client";

import { useEffect, useRef } from "react";

const SCALE = 0.88;
const TRANSLATE_Y = "38px";
const BORDER_RADIUS = "24px";
const DURATION_MS = 900;
const TRANSITION_OPEN  = `transform ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1), border-radius ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1), filter ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1)`;
const TRANSITION_CLOSE = `transform ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1), border-radius ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1), filter ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1)`;
const BODY_TRANSITION_OPEN  = `background-color ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1)`;
const BODY_TRANSITION_CLOSE = `background-color ${DURATION_MS}ms cubic-bezier(0.32,0.72,0,1)`;
const BODY_COLOR_OPEN = "#111111";
const BODY_COLOR_CLOSED = "#f4f4f4";
const FILTER_OPEN = "brightness(0.75) blur(0.6px)";
const FILTER_CLOSED = "brightness(1) blur(0px)";

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

  // Promote GPU layers first, pin to start state
  pages.forEach((page) => {
    page.style.willChange = "transform, filter, border-radius";
    page.style.transition = "none";
    page.style.transformOrigin = "top center";
    page.style.transform = "scale(1) translateY(0px)";
    page.style.borderRadius = "0px";
    page.style.filter = FILTER_CLOSED;
  });
  headers.forEach((header) => {
    header.style.willChange = "transform, filter";
    header.style.transition = "none";
    header.style.transformOrigin = "top center";
    header.style.transform = "scale(1) translateY(0px)";
    header.style.filter = FILTER_CLOSED;
  });

  // Snap body bg instantly
  body.style.transition = "none";
  body.style.backgroundColor = BODY_COLOR_OPEN;

  // Force reflow — commits the start state so the transition has a known from-value
  // and both the sheet CSS transition and parallax transition start simultaneously.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  pages[0]?.offsetHeight ?? body.offsetHeight;

  // Flip to target — CSS engine starts both transitions in this same paint cycle
  body.style.transition = BODY_TRANSITION_OPEN;
  pages.forEach((page) => {
    page.style.transition = TRANSITION_OPEN;
    page.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y})`;
    page.style.borderRadius = BORDER_RADIUS;
    page.style.filter = FILTER_OPEN;
  });
  headers.forEach((header) => {
    header.style.transition = TRANSITION_OPEN;
    header.style.transform = `scale(${SCALE}) translateY(${TRANSLATE_Y})`;
    header.style.opacity = "1";
    header.style.filter = FILTER_OPEN;
  });
}

export function applyClose(targets: Targets) {
  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }

  const { pages, headers } = getEls(targets);
  const body = document.body;

  // Start restore immediately — closing=true fires at the same moment the
  // sheet begins sliding down, so both animations start in the same tick.
  pages.forEach((page) => {
    page.style.transition = TRANSITION_CLOSE;
    page.style.transform = "scale(1) translateY(0px)";
    page.style.borderRadius = "0px";
    page.style.filter = FILTER_CLOSED;
  });
  headers.forEach((header) => {
    header.style.transition = TRANSITION_CLOSE;
    header.style.transform = "scale(1) translateY(0px)";
    header.style.opacity = "1";
    header.style.filter = FILTER_CLOSED;
  });

  // Restore body bg and release GPU layers after animation completes
  bgTimer = setTimeout(() => {
    bgTimer = null;
    body.style.transition = BODY_TRANSITION_CLOSE;
    body.style.backgroundColor = BODY_COLOR_CLOSED;
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
