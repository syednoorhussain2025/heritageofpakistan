// src/app/heritage/[region]/[slug]/heritage/HeritageBibliography.tsx
"use client";
// @ts-nocheck

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import HeritageSection from "./HeritageSection";
import Icon from "@/components/Icon";
import type { BiblioItem } from "./heritagedata";

const MOBILE_PREVIEW_COUNT = 2;

function BibliographyItem({ entryHtml, note }: { entryHtml: string; note?: string | null }) {
  return (
    <div className="bg-slate-50/50 mx-6 px-4 py-4 border-l-4 border-[var(--brand-orange)]">
      <div className="flex items-start gap-2.5">
        <Icon name="receipt-long-24dp-1f1f1f-fill0-wght200-grad0-opsz24" size={18} className="shrink-0 text-slate-400 mt-[2px]" />
        <div className="text-[14px] text-slate-600 leading-relaxed break-words min-w-0">
          <span className="csl-entry" dangerouslySetInnerHTML={{ __html: entryHtml }} />
          {note ? <span className="text-slate-400"> — {note}</span> : null}
        </div>
      </div>
    </div>
  );
}

function BibliographySlidePanel({
  items,
  entries,
  onClose,
  siteTitle,
}: {
  items: BiblioItem[];
  entries: string[];
  onClose: () => void;
  siteTitle?: string;
}) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const el = document.getElementById("heritage-page-root");
    if (!el) return;
    el.style.transition = "transform 0.5s cubic-bezier(0.25,0.1,0.25,1)";
    const raf = requestAnimationFrame(() => {
      el.style.transform = closing ? "translateX(0)" : "translateX(-173px)";
    });
    return () => cancelAnimationFrame(raf);
  }, [closing]);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[4999]"
        style={{
          backgroundColor: "rgba(0,0,0,0)",
          animation: closing
            ? "sideSheetBackdropOut 0.35s ease-in forwards"
            : "sideSheetBackdropIn 0.72s ease-out forwards",
        }}
      />
      <div
        className={`fixed inset-0 z-[5000] bg-white flex flex-col ${closing ? "animate-side-sheet-out" : "animate-side-sheet-in"}`}
        onAnimationEnd={() => { if (closing) onClose(); }}
      >
        <div className="relative flex items-center justify-center px-4 border-b border-slate-100" style={{ paddingTop: "calc(var(--sat, 44px) + 10px)", paddingBottom: "14px" }}>
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="absolute left-4 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 shrink-0"
            aria-label="Back"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
            </svg>
          </button>
          <div className="flex flex-col items-center gap-0.5">
            {siteTitle && (
              <span className="text-[18px] font-extrabold" style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}>
                {siteTitle}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-bold bg-slate-100 text-[var(--brand-orange,#F78300)]">
              <Icon name="bibliography-sources" size={13} className="text-[var(--brand-orange,#F78300)]" />
              Bibliography &amp; Sources
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {items.map((row, i) => (
            <BibliographyItem key={row.id} entryHtml={entries[i] || ""} note={row.note} />
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

export default function HeritageBibliography({
  items,
  styleId,
  entries,
  siteTitle,
}: {
  items: BiblioItem[];
  styleId: string;
  entries: string[];
  siteTitle?: string;
}) {
  const [showPanel, setShowPanel] = useState(false);
  const hasItems = items && items.length > 0;
  const previewItems = items.slice(0, MOBILE_PREVIEW_COUNT);
  const hasMore = items.length > MOBILE_PREVIEW_COUNT;

  return (
    <>
      {/* Mobile */}
      <section
        className="md:hidden py-12 mobile-divider mobile-divider-top scroll-mt-[var(--sticky-offset)] cursor-pointer active:bg-slate-50 transition-colors"
        onClick={() => hasItems && setShowPanel(true)}
      >
        <div className="w-full flex items-center justify-between mb-4 px-4">
          <h2
            className="flex items-center gap-2 text-[22px] font-extrabold"
            style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
          >
            <Icon name="bibliography-sources" size={24} className="text-[var(--brand-orange)]" />
            <span>Bibliography &amp; Sources</span>
          </h2>
          {hasItems && (
            <span aria-hidden="true" className="inline-flex shrink-0 h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500">
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                <path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z" />
              </svg>
            </span>
          )}
        </div>
        {hasItems ? (
          <div className="space-y-5">
            {previewItems.map((row, i) => (
              <BibliographyItem key={row.id} entryHtml={entries[i] || ""} note={row.note} />
            ))}
          </div>
        ) : (
          <p className="px-4 text-[13px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>No sources listed.</p>
        )}
      </section>

      {/* Desktop */}
      <HeritageSection
        id="bibliography"
        title="Bibliography & Sources"
        iconName="bibliography-sources"
        className="hidden md:block md:bg-white md:rounded-2xl md:px-6 md:py-6"
      >
        {hasItems ? (
          <ol className="list-decimal list-inside space-y-2 text-[13px] text-slate-900">
            {items.map((row, i) => {
              const entryHtml = entries[i] || "";
              return (
                <li key={row.id}>
                  <span className="csl-entry" dangerouslySetInnerHTML={{ __html: entryHtml }} />
                  {row.note ? <span className="text-slate-600"> — {row.note}</span> : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="text-[13px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
            No sources listed.
          </div>
        )}
      </HeritageSection>

      {showPanel && (
        <BibliographySlidePanel
          items={items}
          entries={entries}
          onClose={() => setShowPanel(false)}
          siteTitle={siteTitle}
        />
      )}
    </>
  );
}
