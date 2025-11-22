// src/app/heritage/[region]/[slug]/heritage/HeritageBibliography.tsx
// @ts-nocheck

import HeritageSection from "./HeritageSection";
import type { BiblioItem } from "./heritagedata";

export default function HeritageBibliography({
  items,
  styleId,
  entries,
}: {
  items: BiblioItem[];
  styleId: string;
  entries: string[];
}) {
  const hasItems = items && items.length > 0;

  return (
    <HeritageSection
      id="bibliography"
      title="Bibliography & Sources"
      iconName="bibliography-sources"
    >
      {hasItems ? (
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
