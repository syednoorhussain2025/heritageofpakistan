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
    el.style.willChange = "";
    el.style.backfaceVisibility = "";
    el.style.transition = "";
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.borderRadius = "";
    el.style.filter = "";
    el.style.opacity = "";
  });
}

export function applyOpen(targets: Targets) {
  // Cancel any pending close cleanup and do it NOW — every cycle starts clean.
  if (bgTimer != null) {
    clearTimeout(bgTimer);
    bgTimer = null;
  }

  const { pages, headers } = getEls(targets);
  const body = document.body;

  // Full reset first — clears any stale inline styles from previous cycles.
  fullyReset([...pages, ...headers]);

  // Snap body bg instantly.
  body.style.transition = "none";
  body.style.backgroundColor = BODY_COLOR_OPEN;

  // Promote GPU layers, pin to identity (start state).
  pages.forEach((page) => {
    page.style.transformOrigin = "top center";
    page.style.borderRadius = BORDER_RADIUS;
    page.style.willChange = "transform";
    page.style.backfaceVisibility = "hidden";
    page.style.transition = "none";
    page.style.transform = "translate3d(0, 0, 0) scale(1)";
  });
  headers.forEach((header) => {
    header.style.transformOrigin = "top center";
    header.style.willChange = "transform";
    header.style.backfaceVisibility = "hidden";
    header.style.transition = "none";
    header.style.transform = "translate3d(0, 0, 0) scale(1)";
  });

  // Force reflow — commits the start state.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  pages[0]?.offsetHeight ?? body.offsetHeight;

  // Animate to open target — only transform, GPU-only.
  pages.forEach((page) => {
    page.style.transition = TRANSITION;
    page.style.transform = `translate3d(0, ${TRANSLATE_Y}, 0) scale(${SCALE})`;
  });
  headers.forEach((header) => {
    header.style.transition = TRANSITION;
    header.style.transform = `translate3d(0, ${TRANSLATE_Y}, 0) scale(${SCALE})`;
  });
}

export function applyClose(targets: Targets) {
  if (bgTimer != null) {
    clearTimeout(bgTimer);
    bgTimer = null;
  }

  const { pages, headers } = getEls(targets);
  const body = document.body;

  // Animate transform back to identity — GPU-only.
  pages.forEach((page) => {
    page.style.willChange = "transform";
    page.style.backfaceVisibility = "hidden";
    page.style.transition = TRANSITION;
    page.style.transform = "translate3d(0, 0, 0) scale(1)";
  });
  headers.forEach((header) => {
    header.style.willChange = "transform";
    header.style.backfaceVisibility = "hidden";
    header.style.transition = TRANSITION;
    header.style.transform = "translate3d(0, 0, 0) scale(1)";
  });

  // After animation completes: full reset — no stale styles left on elements.
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
