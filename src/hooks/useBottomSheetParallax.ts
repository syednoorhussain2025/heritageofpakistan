"use client";

import { useEffect, useRef } from "react";

const SCALE = 0.88;
const TRANSLATE_Y = "38px";
const BORDER_RADIUS = "24px";
const DURATION_MS = 900;
const EASE = "cubic-bezier(0.32,0.72,0,1)";
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

function fullyReset(els: HTMLElement[]) {
  els.forEach((el) => {
    el.style.transition = "";
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.borderRadius = "";
  });
}

export function applyOpen(targets: Targets) {
  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }

  const { pages, headers } = getEls(targets);
  const body = document.body;

  // Full reset first — every cycle starts from clean elements.
  fullyReset([...pages, ...headers]);

  body.style.transition = "none";
  body.style.backgroundColor = BODY_COLOR_OPEN;

  // Pin to identity (start state). NO willChange — the shells contain
  // child elements with filter:blur which force their own layers. Setting
  // willChange on the parent causes layer tree invalidation every cycle
  // and gets progressively worse as more cards mount.
  pages.forEach((page) => {
    page.style.transformOrigin = "top center";
    page.style.borderRadius = BORDER_RADIUS;
    page.style.transition = "none";
    page.style.transform = "scale(1)";
  });
  headers.forEach((header) => {
    header.style.transformOrigin = "top center";
    header.style.transition = "none";
    header.style.transform = "scale(1)";
  });

  // Force reflow — commits the start state.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  pages[0]?.offsetHeight ?? body.offsetHeight;

  pages.forEach((page) => {
    page.style.transition = TRANSITION;
    page.style.transform = `translateY(${TRANSLATE_Y}) scale(${SCALE})`;
  });
  headers.forEach((header) => {
    header.style.transition = TRANSITION;
    header.style.transform = `translateY(${TRANSLATE_Y}) scale(${SCALE})`;
  });
}

export function applyClose(targets: Targets) {
  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }

  const { pages, headers } = getEls(targets);
  const body = document.body;

  pages.forEach((page) => {
    page.style.transition = TRANSITION;
    page.style.transform = "scale(1)";
  });
  headers.forEach((header) => {
    header.style.transition = TRANSITION;
    header.style.transform = "scale(1)";
  });

  bgTimer = setTimeout(() => {
    bgTimer = null;
    body.style.transition = "none";
    body.style.backgroundColor = BODY_COLOR_CLOSED;
    fullyReset([...pages, ...headers]);
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
