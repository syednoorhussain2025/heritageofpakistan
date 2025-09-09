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
  const parts: string[] = [];
  let currentSectionKey: string | null = null;
  let currentSectionType: string | null = null;
  let sectionChildren: string[] = [];

  const flush = () => {
    if (!currentSectionKey || !currentSectionType) return;
    const cls =
      sectionClass?.(
        currentSectionType,
        currentSectionKey,
        layout.breakpoint
      ) ?? "hop-section";
    parts.push(
      `<section class="${esc(cls)}">` + sectionChildren.join("") + `</section>`
    );
    sectionChildren = [];
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

      // If the engine computed a minHeight for this text block, inline it and mark the lock.
      const minPx =
        typeof (blk as any).minHeightPx === "number"
          ? (blk as any).minHeightPx
          : 0;

      // ✨ Force native, granular text selection on this block
      const styleBits = [
        "-webkit-user-select:text",
        "-ms-user-select:text",
        "user-select:text",
      ];
      if (minPx > 0) styleBits.push(`min-height:${minPx}px`);

      const styleAttr = ` style="${styleBits.join(";")}"`;
      const dataAttr = minPx > 0 ? ` data-text-lock="image"` : "";

      const paras = txt
        .split(/\n{2,}/)
        .map((p) => `<p class="hop-p">${esc(p)}</p>`)
        .join("");

      sectionChildren.push(
        `<div class="${esc(
          cls
        )}"${styleAttr}${dataAttr} data-selectable="text">${paras}</div>`
      );
    } else if (blk.type === "image") {
      // Prefer composite key, fallback to plain slotId
      const img =
        imagesBySlot[`${blk.sectionInstanceKey}:${blk.imageSlotId}`] ||
        imagesBySlot[blk.imageSlotId] ||
        null;

      const cls =
        imageClass?.(
          blk.sectionTypeId,
          blk.blockId,
          blk.sectionInstanceKey,
          layout.breakpoint
        ) ?? "hop-media";

      if (img) {
        const cap = img.caption
          ? `<figcaption class="hop-caption">${esc(img.caption)}</figcaption>`
          : "";
        // ✨ Make images non-draggable so drag-to-select text near images feels native
        sectionChildren.push(
          `<figure class="${esc(cls)}"><img src="${esc(
            img.storagePath
          )}" alt="${esc(
            img.alt || ""
          )}" loading="lazy" decoding="async" draggable="false" />${cap}</figure>`
        );
      } else {
        sectionChildren.push(
          `<figure class="${esc(
            cls
          )}"><div class="hop-media-placeholder">Image slot: ${esc(
            blk.imageSlotId
          )} <span style="opacity:.6">(${esc(
            blk.sectionInstanceKey
          )})</span></div></figure>`
        );
      }
    } else {
      sectionChildren.push(`<div class="hop-other"></div>`);
    }
  }
  flush();

  // Helpful root marker for debugging/targeting if needed
  return `<div class="hop-article" data-hop-published="1">${parts.join(
    ""
  )}</div>`;
}
