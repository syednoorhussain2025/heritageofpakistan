// src/modules/flow-layout/FlowRenderer.tsx
"use client";

import React from "react";
import { LayoutInstance, FlowInput, ImageRef, Breakpoint } from "./types";

/* ---------- local stub measurer (no external file needed) ---------- */

function useMeasurer() {
  // If you later add a real measurer, you can replace this.
  // For now, layout fallback does not use this value.
  return null as any;
}

/* ---------- helpers & types ---------- */

type ClassMaps = {
  sectionClassFor?: (args: {
    sectionTypeId: string;
    sectionInstanceKey: string;
    breakpoint: Breakpoint;
  }) => string;
  textClassFor?: (args: {
    sectionTypeId: string;
    blockId: string;
    sectionInstanceKey: string;
    breakpoint: Breakpoint;
  }) => string;
  imageClassFor?: (args: {
    sectionTypeId: string;
    blockId: string;
    sectionInstanceKey: string;
    breakpoint: Breakpoint;
  }) => string;
};

type Props = {
  input: FlowInput;
  imagesBySlot?: Record<string, ImageRef | null>;
} & ClassMaps;

/**
 * Local fallback for computeLayout.
 * If a precomputed layout is present on the input, we use it.
 * Otherwise we return an empty layout to keep the renderer safe.
 */
function computeLayout(input: FlowInput, _measurer: any): LayoutInstance {
  const anyInput = input as any;

  // Prefer a precomputed layout if the engine already ran upstream.
  if (anyInput?.layout && Array.isArray(anyInput.layout.flow)) {
    return anyInput.layout as LayoutInstance;
  }
  if (anyInput?.precomputedLayout) {
    return anyInput.precomputedLayout as LayoutInstance;
  }

  // Fallback: empty layout (renders nothing instead of crashing)
  return {
    flow: [],
  } as unknown as LayoutInstance;
}

function withDefaultDesignTokens(input: FlowInput): FlowInput {
  const defaultSideW =
    input.breakpoint === "desktop"
      ? 480
      : input.breakpoint === "tablet"
      ? 420
      : undefined;

  // default carousel card width per breakpoint
  const defaultCarouselW =
    input.breakpoint === "desktop"
      ? 520
      : input.breakpoint === "tablet"
      ? 460
      : 360;

  const existing = input.designTokens?.widthPx ?? {};
  const needSide =
    existing["--side-img-w"] == null && typeof defaultSideW === "number";
  const needCarousel = existing["--carousel-card-w"] == null;

  if (!needSide && !needCarousel) return input;

  return {
    ...input,
    designTokens: {
      ...(input.designTokens || {}),
      widthPx: {
        ...existing,
        ...(needSide ? { "--side-img-w": defaultSideW! } : null),
        ...(needCarousel ? { "--carousel-card-w": defaultCarouselW } : null),
      },
    },
  };
}

const SELECT_TEXT: React.CSSProperties = {
  userSelect: "text",
  WebkitUserSelect: "text",
  msUserSelect: "text",
};

const SELECT_AUTO: React.CSSProperties = {
  userSelect: "auto",
  WebkitUserSelect: "auto",
  // Note: msUserSelect's TS type does not accept "auto", so we omit it here.
};

const NO_SELECT_MEDIA: React.CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  msUserSelect: "none",
};

/* ---------- component ---------- */

export default function FlowRenderer({
  input,
  imagesBySlot = {},
  sectionClassFor,
  textClassFor,
  imageClassFor,
}: Props) {
  const measurer = useMeasurer();
  const inputWithTokens = withDefaultDesignTokens(input);
  const layout: LayoutInstance = computeLayout(inputWithTokens, measurer);

  // Helper: read aside-figure alignment from composer metadata
  const getAsideAlign = (
    sectionInstanceKey: string
  ): "left" | "right" | "center" => {
    const meta = (input as any)?.sectionMeta?.[sectionInstanceKey];
    const a = meta?.align;
    return a === "right" || a === "center" ? a : "left";
  };

  // Group blocks by section so we can reorder inside a section when needed
  const bySection = new Map<
    string,
    { type: string; items: typeof layout.flow }
  >();
  for (const blk of layout.flow) {
    const key = blk.sectionInstanceKey;
    const entry = bySection.get(key);
    if (entry) {
      entry.items.push(blk);
    } else {
      bySection.set(key, { type: (blk as any).sectionTypeId, items: [blk] });
    }
  }

  const sectionsOut: React.ReactNode[] = [];

  // Shared image resolver that supports both plain image blocks and carousel slots
  const resolveImage = (
    sectionInstanceKey: string,
    slotId: string
  ): ImageRef | null => {
    const compositeKey = `${sectionInstanceKey}:${slotId}`;
    return imagesBySlot[compositeKey] ?? imagesBySlot[slotId] ?? null;
  };

  for (const [sectionKey, { type: sectionTypeId, items }] of bySection) {
    const baseSectionCls =
      sectionClassFor?.({
        sectionTypeId,
        sectionInstanceKey: sectionKey,
        breakpoint: input.breakpoint,
      }) ?? "hop-section";

    // Semantic section classes for special layouts
    const semantic =
      sectionTypeId === "aside-figure"
        ? "aside-figure"
        : sectionTypeId === "quotation"
        ? "quotation sec-quotation"
        : sectionTypeId === "carousel"
        ? "sec-carousel"
        : "";
    const sectionClassName = semantic
      ? `${baseSectionCls} ${semantic}`.trim()
      : baseSectionCls;

    /* ───────── Renderers ───────── */

    const renderText = (blk: any) => {
      const text = input.text.slice(blk.startChar, blk.endChar);
      const baseTextCls =
        textClassFor?.({
          sectionTypeId: blk.sectionTypeId,
          blockId: blk.blockId,
          sectionInstanceKey: blk.sectionInstanceKey,
          breakpoint: input.breakpoint,
        }) ?? "hop-text";

      const textCls =
        blk.sectionTypeId === "aside-figure"
          ? `${baseTextCls} aside-figure-body`
          : baseTextCls;

      const minPx = (blk as any).minHeightPx as number | undefined;
      const lockText =
        typeof minPx === "number" &&
        minPx > 0 &&
        blk.sectionTypeId !== "aside-figure";

      return (
        <div
          key={`${blk.sectionInstanceKey}:${blk.blockId}:text`}
          className={textCls}
          {...(lockText ? { "data-text-lock": "image" } : {})}
          style={
            lockText ? { ...SELECT_TEXT, minHeight: `${minPx}px` } : SELECT_TEXT
          }
        >
          {text.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="hop-p" style={SELECT_TEXT}>
              {p}
            </p>
          ))}
        </div>
      );
    };

    const renderImage = (
      blk: any,
      alignOverride?: "left" | "right" | "center"
    ) => {
      const baseImgCls =
        imageClassFor?.({
          sectionTypeId: blk.sectionTypeId,
          blockId: blk.blockId,
          sectionInstanceKey: blk.sectionInstanceKey,
          breakpoint: input.breakpoint,
        }) ?? "hop-media";

      let imgCls = baseImgCls;
      if (blk.sectionTypeId === "aside-figure") {
        const align = alignOverride ?? getAsideAlign(blk.sectionInstanceKey);
        imgCls += ` ${
          align === "right"
            ? "img-right"
            : align === "center"
            ? "img-center"
            : "img-left"
        }`;
      }

      const image = resolveImage(blk.sectionInstanceKey, blk.imageSlotId);

      return (
        <figure
          key={`${blk.sectionInstanceKey}:${blk.blockId}:img`}
          className={imgCls}
          style={SELECT_AUTO}
        >
          {image ? (
            <img
              src={image.storagePath}
              alt={image.alt || ""}
              loading="lazy"
              decoding="async"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={NO_SELECT_MEDIA}
            />
          ) : (
            <div className="hop-media-placeholder" style={NO_SELECT_MEDIA}>
              Image slot: {blk.imageSlotId}{" "}
              <span className="opacity-60">({blk.sectionInstanceKey})</span>
            </div>
          )}
          {image?.caption ? (
            <figcaption className="hop-caption" style={SELECT_TEXT}>
              {image.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    };

    // quotation renderer -> semantic <blockquote> with paragraphs
    const renderQuote = (blk: any) => {
      const content: string = blk.content || "";
      const parts = content.split(/\n{2,}/);
      return (
        <blockquote
          key={`${blk.sectionInstanceKey}:${blk.blockId}:quote`}
          className="hop-quote"
          style={SELECT_TEXT}
        >
          {parts.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </blockquote>
      );
    };

    // carousel renderer
    const renderCarousel = (blk: any) => {
      const slotIds: string[] = Array.isArray(blk.imageSlotIds)
        ? blk.imageSlotIds.slice(0, 10)
        : [];
      return (
        <div
          key={`${blk.sectionInstanceKey}:${blk.blockId}:carousel`}
          className="hop-carousel"
          style={SELECT_AUTO}
        >
          {slotIds.map((slotId, i) => {
            const image = resolveImage(blk.sectionInstanceKey, slotId);
            return (
              <div
                key={`${blk.sectionInstanceKey}:${slotId}:${i}`}
                className="hop-carousel-item"
                style={SELECT_AUTO}
              >
                <figure className="hop-media" style={SELECT_AUTO}>
                  {image ? (
                    <img
                      src={image.storagePath}
                      alt={image.alt || ""}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      style={NO_SELECT_MEDIA}
                    />
                  ) : (
                    <div
                      className="hop-media-placeholder"
                      style={NO_SELECT_MEDIA}
                    >
                      Image slot: {slotId}{" "}
                      <span className="opacity-60">
                        ({blk.sectionInstanceKey})
                      </span>
                    </div>
                  )}
                  {image?.caption ? (
                    <figcaption className="hop-caption" style={SELECT_TEXT}>
                      {image.caption}
                    </figcaption>
                  ) : null}
                </figure>
              </div>
            );
          })}
        </div>
      );
    };

    /* ───────── Section assembly ───────── */

    // Aside-figure keeps special ordering (img first, then text, then more images)
    if (sectionTypeId === "aside-figure") {
      const firstImgIdx = items.findIndex((b) => (b as any).type === "image");
      const textBlocks = items.filter((b) => (b as any).type === "text");
      const imageBlocks = items.filter((b) => (b as any).type === "image");

      const sectionChildren: React.ReactNode[] = [];

      if (firstImgIdx >= 0) {
        sectionChildren.push(renderImage(items[firstImgIdx]));
      }
      for (const t of textBlocks) sectionChildren.push(renderText(t));
      imageBlocks.forEach((imgBlk, i) => {
        if (i === 0) return;
        sectionChildren.push(renderImage(imgBlk));
      });

      sectionsOut.push(
        <section
          key={`sec-${sectionKey}`}
          className={sectionClassName}
          style={SELECT_AUTO}
        >
          {sectionChildren}
        </section>
      );
      continue;
    }

    // Other sections: render in flow order, including quote + carousel
    sectionsOut.push(
      <section
        key={`sec-${sectionKey}`}
        className={sectionClassName}
        style={SELECT_AUTO}
      >
        {items.map((blk: any) => {
          switch (blk.type) {
            case "text":
              return renderText(blk);
            case "image":
              return renderImage(blk);
            case "quote":
              return renderQuote(blk);
            case "carousel":
              return renderCarousel(blk);
            default:
              return (
                <div
                  key={`${blk.sectionInstanceKey}:${blk.blockId}:other`}
                  className="hop-other"
                />
              );
          }
        })}
      </section>
    );
  }

  return (
    <div className="hop-article" style={SELECT_AUTO}>
      {sectionsOut}
    </div>
  );
}
