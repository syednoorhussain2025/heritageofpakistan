import { useEffect } from "react";

/**
 * Locks body scroll while active.
 *
 * Uses overflow:hidden only — deliberately avoids position:fixed on the body.
 * position:fixed repositions the body to y=0 on iOS which causes the page to
 * visually jump, and also interacts badly with the software keyboard (the
 * fixed body shifts upward when the keyboard opens, pushing modals with it).
 */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [active]);
}
