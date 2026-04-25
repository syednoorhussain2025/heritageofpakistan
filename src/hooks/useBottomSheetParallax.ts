"use client";

import { useEffect, useRef } from "react";

const DURATION_MS = 900;
const BODY_COLOR_OPEN = "#111111";
const BODY_COLOR_CLOSED = "#f4f4f4";

let openCount = 0;
let bgTimer: ReturnType<typeof setTimeout> | null = null;

export type Targets = {
  pageIds?: string[];
  headerIds?: string[];
};

export function applyOpen(_targets: Targets) {
  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }
  const body = document.body;
  body.style.transition = "none";
  body.style.backgroundColor = BODY_COLOR_OPEN;
  // No scale/translate on pages — compositor only needs to animate the sheet
  // and backdrop. Scale on the page shell forces layer promotion + rasterisation
  // of all child content (cards, images, filters) on every frame.
}

export function applyClose(_targets: Targets) {
  if (bgTimer != null) { clearTimeout(bgTimer); bgTimer = null; }
  const body = document.body;

  bgTimer = setTimeout(() => {
    bgTimer = null;
    body.style.transition = "none";
    body.style.backgroundColor = BODY_COLOR_CLOSED;
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
