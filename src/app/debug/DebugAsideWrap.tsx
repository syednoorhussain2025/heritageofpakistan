"use client";
import React, { useEffect, useRef } from "react";

type Case = {
  id: string;
  title: string;
  notes: string;
  sectionClass: string;
  figureClass: string;
  textClass: string;
  order: "figure-first" | "text-first";
};

const CASES: Case[] = [
  {
    id: "OK_flowroot_floatLeft",
    title: "✅ Works: flow-root + float-left (figure first)",
    notes:
      "This is the recommended pattern. Section is flow-root; figure floats; text follows. Expect text to wrap.",
    sectionClass: "dbg-section flow-root",
    figureClass: "dbg-figure float-left",
    textClass: "dbg-text",
    order: "figure-first",
  },
  {
    id: "BROKEN_grid_floatLeft",
    title: "❌ Broken: section is grid",
    notes:
      "If the section (parent) is display:grid/flex, floats no longer affect siblings; text won’t wrap.",
    sectionClass: "dbg-section grid",
    figureClass: "dbg-figure float-left",
    textClass: "dbg-text",
    order: "figure-first",
  },
  {
    id: "BROKEN_textFirst_thenFloat",
    title: "⚠️ Usually broken: text first, figure second",
    notes:
      "Floats only wrap following content. If text comes before the floated figure, it won’t wrap around it.",
    sectionClass: "dbg-section flow-root",
    figureClass: "dbg-figure float-left",
    textClass: "dbg-text",
    order: "text-first",
  },
  {
    id: "BROKEN_overflowHidden",
    title: "❌ Broken: overflow hidden on text block",
    notes:
      "A float inside the same formatting context is clipped if an ancestor has overflow set; wrap fails.",
    sectionClass: "dbg-section flow-root",
    figureClass: "dbg-figure float-left",
    textClass: "dbg-text overflow-hidden",
    order: "figure-first",
  },
];

function Para() {
  return (
    <>
      Lahore Museum on Mall Road houses a diverse collection reflecting the
      region’s cultural and historical evolution. Its building is a major
      Indo-Saracenic example designed by Sardar Bhai Ram Singh. During 1858–1864
      the collection outgrew Wazir Khan’s Baradari, leading to the Exhibition
      Hall and later Tollinton Market. The building remains a point of interest…
    </>
  );
}

function CaseBox({ cfg }: { cfg: Case }) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const figRef = useRef<HTMLElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sec = sectionRef.current!;
    const fig = figRef.current!;
    const txt = textRef.current!;
    const sSec = getComputedStyle(sec);
    const sFig = getComputedStyle(fig);
    const sTxt = getComputedStyle(txt);

    // Minimal diagnostic facts that decide wrap
    const facts = {
      sectionDisplay: sSec.display,
      sectionEstablishesBFC: sSec.display === "flow-root", // rough heuristic
      figureFloat: sFig.float,
      textOverflow: sTxt.overflow,
      textHasMinHeight: sTxt.minHeight,
      order: cfg.order,
    };
    // eslint-disable-next-line no-console
    console.groupCollapsed(`WrapDiag: ${cfg.id}`);
    // eslint-disable-next-line no-console
    console.table(facts);
    // eslint-disable-next-line no-console
    console.log(
      "Expect wrap?",
      facts.figureFloat !== "none" &&
        (facts.sectionDisplay === "block" ||
          facts.sectionDisplay === "flow-root") &&
        cfg.order === "figure-first" &&
        !["hidden", "auto", "clip", "scroll"].includes(facts.textOverflow)
    );
    // eslint-disable-next-line no-console
    console.groupEnd();
  }, [cfg]);

  const Figure = (
    <figure ref={figRef as any} className={cfg.figureClass} aria-label="figure">
      {/* Use a colored block instead of external image so this runs standalone */}
      <div className="dbg-img" />
      <figcaption className="dbg-cap">Example caption under image</figcaption>
    </figure>
  );

  const Text = (
    <div ref={textRef} className={cfg.textClass} aria-label="text">
      <p>
        <Para />
      </p>
      <p>
        <Para />
      </p>
      <p>
        <Para />
      </p>
    </div>
  );

  return (
    <div className="dbg-card">
      <div className="dbg-title">{cfg.title}</div>
      <div className="dbg-notes">{cfg.notes}</div>
      <div ref={sectionRef} className={cfg.sectionClass}>
        {cfg.order === "figure-first" ? (
          <>
            {Figure}
            {Text}
          </>
        ) : (
          <>
            {Text}
            {Figure}
          </>
        )}
      </div>
    </div>
  );
}

export default function DebugAsideWrap() {
  return (
    <div className="dbg-wrap">
      <style>{CSS}</style>
      {CASES.map((c) => (
        <CaseBox key={c.id} cfg={c} />
      ))}
    </div>
  );
}

const CSS = `
/* Layout of the test grid */
.dbg-wrap {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
  padding: 18px;
  background: #fafafa;
}
.dbg-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,.04);
}
.dbg-title { font-weight: 600; margin-bottom: 4px; }
.dbg-notes { font-size: 12px; color: #6b7280; margin-bottom: 10px; }

/* The "section" under test */
.dbg-section {
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
}
/* Variants */
.flow-root { display: flow-root; }
.grid { display: grid; grid-template-columns: 1fr; }
/* The figure and image */
.dbg-figure { margin: 0; }
.float-left { float: left; width: clamp(260px, 36vw, 380px); margin: 0 12px 8px 0; }
.dbg-img { width: 100%; height: 220px; border-radius: 8px; background: linear-gradient(135deg,#93c5fd,#60a5fa); }
.dbg-cap { font-size: 12px; color: #6b7280; margin-top: 4px; }

/* Text */
.dbg-text { line-height: 1.7; font-size: 15px; text-align: justify; text-justify: inter-word; }
.dbg-text p { margin: 0 0 10px 0; }

/* A variant that intentionally breaks wrap */
.overflow-hidden { overflow: hidden; }
`;
