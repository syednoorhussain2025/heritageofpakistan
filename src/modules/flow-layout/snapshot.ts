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

  // NEW: collectors for new section types
  let quotationTextParts: string[] = [];
  let carouselItems: string[] = [];

  const flush = () => {
    if (!currentSectionKey || !currentSectionType) return;

    // Default class handling
    const isAside = currentSectionType === "aside-figure";
    const isQuote = currentSectionType === "quotation";
    const isCarousel = currentSectionType === "carousel";

    const defaultSectionCls = isAside
      ? "aside-figure"
      : isQuote
      ? "hop-section quotation"
      : isCarousel
      ? "hop-section carousel"
      : "hop-section";

    let cls =
      sectionClass?.(
        currentSectionType,
        currentSectionKey,
        layout.breakpoint
      ) ?? defaultSectionCls;

    // Ensure aside-figure is not a grid container
    if (isAside) {
      cls = cls
        .replace(/\bhop-section\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!/\baside-figure\b/.test(cls)) cls = (cls + " aside-figure").trim();
    }

    let children = "";

    if (isAside) {
      // figure first, then text, then any extras
      children = [asideFigure, ...asideText, ...sectionChildren]
        .filter(Boolean)
        .join("");
    } else if (isQuote) {
      const quoteContent = quotationTextParts.join(" ").trim();
      // Fallback to any regular children if no explicit text collected
      const inner =
        quoteContent.length > 0
          ? `<div class="hop-quote">${esc(quoteContent)}</div>`
          : sectionChildren.join("");
      children = inner;
    } else if (isCarousel) {
      // Wrap all collected figures in a scroll container
      const strip = `<div class="hop-carousel">${carouselItems.join("")}</div>`;
      children = strip;
    } else {
      children = sectionChildren.join("");
    }

    sectionsOut.push(`<section class="${esc(cls)}">${children}</section>`);

    // reset collectors
    sectionChildren = [];
    asideFigure = null;
    asideText = [];
    quotationTextParts = [];
    carouselItems = [];
  };

  for (const blk of layout.flow) {
    if (blk.sectionInstanceKey !== currentSectionKey) {
      flush();
      currentSectionKey = blk.sectionInstanceKey;
      currentSectionType = blk.sectionTypeId;
    }

    const isAside = currentSectionType === "aside-figure";
    const isQuote = currentSectionType === "quotation";
    const isCarousel = currentSectionType === "carousel";

    if (blk.type === "text") {
      const txt = masterText.slice(blk.startChar, blk.endChar);
      const cls =
        textClass?.(
          blk.sectionTypeId,
          blk.blockId,
          blk.sectionInstanceKey,
          layout.breakpoint
        ) ?? "hop-text";

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
      } else if (isQuote) {
        // Collect plain text for the quotation block (strip HTML intent)
        const plain = txt.replace(/\s+/g, " ").trim();
        if (plain) quotationTextParts.push(plain);
      } else {
        sectionChildren.push(html);
      }
    } else if (blk.type === "image") {
      const img =
        imagesBySlot[`${blk.sectionInstanceKey}:${blk.imageSlotId}`] ||
        imagesBySlot[blk.imageSlotId] ||
        null;

      const defaultImageCls = isAside ? "hop-media img-left" : "hop-media";
      const cls =
        imageClass?.(
          blk.sectionTypeId,
          blk.blockId,
          blk.sectionInstanceKey,
          layout.breakpoint
        ) ?? defaultImageCls;

      let figHtml: string;
      if (img) {
        const cap = img.caption
          ? `<figcaption class="hop-caption">${esc(img.caption)}</figcaption>`
          : "";
        figHtml = `<figure class="${esc(cls)}"><img src="${esc(
          img.storagePath
        )}" alt="${esc(
          img.alt || ""
        )}" loading="lazy" decoding="async" draggable="false" />${cap}</figure>`;
      } else {
        figHtml = `<figure class="${esc(
          cls
        )}"><div class="hop-media-placeholder">Image slot: ${esc(
          blk.imageSlotId
        )} <span style="opacity:.6">(${esc(
          blk.sectionInstanceKey
        )})</span></div></figure>`;
      }

      if (isAside) {
        // first image wins positioning
        if (!asideFigure) asideFigure = figHtml;
        else sectionChildren.push(figHtml);
      } else if (isCarousel) {
        // push into carousel strip
        carouselItems.push(`<div class="hop-carousel-item">${figHtml}</div>`);
      } else {
        sectionChildren.push(figHtml);
      }
    } else if (blk.type === "heading" || blk.type === "callout") {
      // Generic rendering for optional block kinds
      const clsBase = blk.type === "heading" ? "hop-heading" : "hop-callout";
      const content = (blk as any).content ? String((blk as any).content) : "";
      if (isQuote) {
        const plain = content.replace(/\s+/g, " ").trim();
        if (plain) quotationTextParts.push(plain);
      } else {
        const html =
          blk.type === "heading"
            ? `<h2 class="${clsBase}">${esc(content)}</h2>`
            : `<div class="${clsBase}">${esc(content)}</div>`;
        sectionChildren.push(html);
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
