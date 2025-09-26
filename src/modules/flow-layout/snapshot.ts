// Snapshot generation: turns a LayoutInstance + master text + images into static HTML.
// Serve this HTML directly on the public page. No measuring or client logic required.

import type { LayoutInstance, ImageRef, Breakpoint } from "./types";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SnapshotInput = {
  layout: LayoutInstance;
  masterText: string;
  /** Map keyed by **composite slot key** `${sectionInstanceKey}:${imageSlotId}`.
      For backward compatibility, plain `imageSlotId` keys also work. */
  imagesBySlot: Record<string, ImageRef | null>;
  sectionClass?: (
    sectionTypeId: string,
    sectionInstanceKey: string,
    bp: Breakpoint
  ) => string;
  textClass?: (
    sectionTypeId: string,
    blockId: string,
    sectionInstanceKey: string,
    bp: Breakpoint
  ) => string;
  imageClass?: (
    sectionTypeId: string,
    blockId: string,
    sectionInstanceKey: string,
    bp: Breakpoint
  ) => string;
};

export function renderSnapshotHTML({
  layout,
  masterText,
  imagesBySlot,
  sectionClass,
  textClass,
  imageClass,
}: SnapshotInput): string {
  const SECTION_GAP_PX = 24;

  const sectionsOut: string[] = [];
  let currentSectionKey: string | null = null;
  let currentSectionType: string | null = null;

  // Per-section collectors
  let sectionChildren: string[] = [];
  let asideFigure: string | null = null;
  let asideText: string[] = [];

  const flush = () => {
    if (!currentSectionKey || !currentSectionType) return;

    // Default class: for aside-figure we must NOT be a grid container.
    const defaultSectionCls =
      currentSectionType === "aside-figure" ? "aside-figure" : "hop-section";

    // Allow override, but if someone mistakenly adds hop-section for aside, strip it.
    let cls =
      sectionClass?.(
        currentSectionType,
        currentSectionKey,
        layout.breakpoint
      ) ?? defaultSectionCls;
    if (currentSectionType === "aside-figure") {
      cls = cls
        .replace(/\bhop-section\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!/\baside-figure\b/.test(cls)) cls = (cls + " aside-figure").trim();
    }

    // For aside-figure: render <figure> first, then text, then any extras.
    const children =
      currentSectionType === "aside-figure"
        ? [asideFigure, ...asideText, ...sectionChildren]
            .filter(Boolean)
            .join("")
        : sectionChildren.join("");

    sectionsOut.push(`<section class="${esc(cls)}">${children}</section>`);

    // reset
    sectionChildren = [];
    asideFigure = null;
    asideText = [];
  };

  for (const blk of layout.flow) {
    if (blk.sectionInstanceKey !== currentSectionKey) {
      flush();
      currentSectionKey = blk.sectionInstanceKey;
      currentSectionType = blk.sectionTypeId;
    }

    if (blk.type === "text") {
      const txt = masterText.slice(blk.startChar, blk.endChar);
      const cls =
        textClass?.(
          blk.sectionTypeId,
          blk.blockId,
          blk.sectionInstanceKey,
          layout.breakpoint
        ) ?? "hop-text";
      const isAside = currentSectionType === "aside-figure";

      const minPx =
        typeof (blk as any).minHeightPx === "number"
          ? (blk as any).minHeightPx
          : 0;

      const styleBits = [
        "-webkit-user-select:text",
        "-ms-user-select:text",
        "user-select:text",
      ];
      // never lock height for aside-figure
      if (minPx > 0 && !isAside) styleBits.push(`min-height:${minPx}px`);
      const styleAttr = ` style="${styleBits.join(";")}"`;

      const dataAttr = minPx > 0 && !isAside ? ` data-text-lock="image"` : "";

      const body =
        txt
          .split(/\n{2,}/)
          .map((p) => `<p class="hop-p">${esc(p)}</p>`)
          .join("") || "";

      const html = `<div class="${esc(
        isAside ? `${cls} aside-figure-body` : cls
      )}"${styleAttr}${dataAttr} data-selectable="text">${body}</div>`;

      if (isAside) {
        asideText.push(html);
      } else {
        sectionChildren.push(html);
      }
    } else if (blk.type === "image") {
      const img =
        imagesBySlot[`${blk.sectionInstanceKey}:${blk.imageSlotId}`] ||
        imagesBySlot[blk.imageSlotId] ||
        null;

      const isAside = currentSectionType === "aside-figure";
      const defaultImageCls = isAside ? "hop-media img-left" : "hop-media";
      const cls =
        imageClass?.(
          blk.sectionTypeId,
          blk.blockId,
          blk.sectionInstanceKey,
          layout.breakpoint
        ) ?? defaultImageCls;

      if (img) {
        const cap = img.caption
          ? `<figcaption class="hop-caption">${esc(img.caption)}</figcaption>`
          : "";
        const fig = `<figure class="${esc(cls)}"><img src="${esc(
          img.storagePath
        )}" alt="${esc(
          img.alt || ""
        )}" loading="lazy" decoding="async" draggable="false" />${cap}</figure>`;
        if (isAside) {
          asideFigure = fig; // figure must be first
        } else {
          sectionChildren.push(fig);
        }
      } else {
        const ph = `<figure class="${esc(
          cls
        )}"><div class="hop-media-placeholder">Image slot: ${esc(
          blk.imageSlotId
        )} <span style="opacity:.6">(${esc(
          blk.sectionInstanceKey
        )})</span></div></figure>`;
        if (isAside) {
          asideFigure = ph;
        } else {
          sectionChildren.push(ph);
        }
      }
    } else {
      sectionChildren.push(`<div class="hop-other"></div>`);
    }
  }
  flush();

  const joined = sectionsOut.join(
    `<div class="hop-gap" style="height:${SECTION_GAP_PX}px" aria-hidden="true"></div>`
  );

  return `<div class="hop-article" data-hop-published="1">${joined}</div>`;
}
