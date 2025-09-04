"use client";
import { useEffect, useMemo, useRef } from "react";
import type { MeasurerAPI } from "./types";

/**
 * Offscreen measurer. Applies signature classes that **must not contain colons**.
 * We sanitize to allow only [a-zA-Z0-9-_].
 */
export function useMeasurer(): MeasurerAPI {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) return;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.position = "fixed";
    el.style.left = "-99999px";
    el.style.top = "-99999px";
    el.style.visibility = "hidden";
    el.style.pointerEvents = "none";
    el.style.whiteSpace = "normal";
    el.style.wordBreak = "break-word";
    el.style.overflow = "auto";
    document.body.appendChild(el);
    ref.current = el;
    return () => {
      if (ref.current?.parentNode)
        ref.current.parentNode.removeChild(ref.current);
    };
  }, []);

  return useMemo<MeasurerAPI>(
    () => ({
      checkOverflow: ({ text, cssSignature, maxHeightPx }) => {
        if (!ref.current) return false;
        const el = ref.current;

        // Reset and apply signature classes.
        el.className = "";
        el.classList.add("hop-measure-base");
        if (cssSignature) {
          // STRICT: strip anything except letters, digits, dash, underscore
          const safe = cssSignature.replace(/[^a-zA-Z0-9-_]/g, "_");
          el.classList.add(`sig-${safe}`);
        }

        el.textContent = text || "";
        if (typeof maxHeightPx === "number")
          el.style.maxHeight = `${maxHeightPx}px`;
        else el.style.maxHeight = "";

        return typeof maxHeightPx === "number"
          ? el.scrollHeight > maxHeightPx + 1
          : false;
      },
    }),
    []
  );
}
