import { useEffect } from "react";

/**
 * Locks body scroll while the component is mounted (or while `active` is true).
 * Restores the original overflow and position on cleanup.
 */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
