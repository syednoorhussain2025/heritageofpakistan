"use client";

/**
 * Minimal TypeScript shims for citation-js packages
 * (they don't ship their own .d.ts files).
 */
declare module "@citation-js/core" {
  export class Cite {
    constructor(data: any);
    format(
      mode: string,
      options?: {
        format?: string;
        template?: string;
        lang?: string;
      }
    ): string;
  }
}

declare module "@citation-js/plugin-csl";

import HeritageSection from "./HeritageSection";
import type { BiblioItem } from "./heritagedata";
import { useMemo } from "react";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-csl";

export default function HeritageBibliography({
  items,
  styleId,
}: {
  items: BiblioItem[];
  styleId: string;
}) {
  const entries = useMemo(() => {
    try {
      if (!items.length) return [];

      const cite = new Cite(items.map((b) => b.csl));

      const html = cite.format("bibliography", {
        format: "html",
        template: styleId,
        lang: "en-US",
      });

      const container =
        typeof document !== "undefined" ? document.createElement("div") : null;
      if (!container) return [];

      container.innerHTML = html;

      return Array.from(container.querySelectorAll(".csl-entry")).map(
        (el) => el.innerHTML || ""
      );
    } catch {
      return [];
    }
  }, [items, styleId]);

  return (
    <HeritageSection
      id="bibliography"
      title="Bibliography & Sources"
      iconName="bibliography-sources"
    >
      {items.length ? (
        <ol className="list-decimal list-inside space-y-2 text-[13px] text-slate-900">
          {items.map((row, i) => {
            const entryHtml = entries[i] || "";
            return (
              <li key={row.id}>
                <span
                  className="csl-entry"
                  dangerouslySetInnerHTML={{ __html: entryHtml }}
                />
                {row.note ? (
                  <span className="text-slate-600"> — {row.note}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div
          className="text-[13px]"
          style={{ color: "var(--muted-foreground, #5b6b84)" }}
        >
          No sources listed.
        </div>
      )}
    </HeritageSection>
  );
}
