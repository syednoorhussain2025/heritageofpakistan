"use client";
import React from "react";
import { LayoutInstance, FlowInput, ImageRef, Breakpoint } from "./types";
import { computeLayout } from "./engine";
import { useMeasurer } from "./Measurer";

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

function withDefaultDesignTokens(input: FlowInput): FlowInput {
  const defaultSideW =
    input.breakpoint === "desktop"
      ? 480
      : input.breakpoint === "tablet"
      ? 420
      : undefined;

  const existing = input.designTokens?.widthPx ?? {};
  const needSide =
    existing["--side-img-w"] == null && typeof defaultSideW === "number";

  if (!needSide) return input;

  return {
    ...input,
    designTokens: {
      ...(input.designTokens || {}),
      widthPx: {
        ...existing,
        ...(needSide ? { "--side-img-w": defaultSideW! } : null),
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
  msUserSelect: "auto",
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
      bySection.set(key, { type: blk.sectionTypeId, items: [blk] });
    }
  }

  const sectionsOut: React.ReactNode[] = [];

  for (const [sectionKey, { type: sectionTypeId, items }] of bySection) {
    const baseSectionCls =
      sectionClassFor?.({
        sectionTypeId,
        sectionInstanceKey: sectionKey,
        breakpoint: input.breakpoint,
      }) ?? "hop-section";

    // Add semantic class; CSS ensures this is NOT grid/flex for aside-figure
    const sectionClassName =
      sectionTypeId === "aside-figure"
        ? `${baseSectionCls} aside-figure`
        : baseSectionCls;

    // Render helpers
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

      const compositeKey = `${blk.sectionInstanceKey}:${blk.imageSlotId}`;
      const image =
        imagesBySlot[compositeKey] ?? imagesBySlot[blk.imageSlotId] ?? null;

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

    // If not aside-figure: render as-is in given order
    if (sectionTypeId !== "aside-figure") {
      sectionsOut.push(
        <section
          key={`sec-${sectionKey}`}
          className={sectionClassName}
          style={SELECT_AUTO}
        >
          {items.map((blk) =>
            blk.type === "text" ? (
              renderText(blk)
            ) : blk.type === "image" ? (
              renderImage(blk)
            ) : (
              <div
                key={`${blk.sectionInstanceKey}:${blk.blockId}:other`}
                className="hop-other"
              />
            )
          )}
        </section>
      );
      continue;
    }

    // For aside-figure: reorder => first image, then text, then remaining images
    const firstImgIdx = items.findIndex((b) => b.type === "image");
    const textBlocks = items.filter((b) => b.type === "text");
    const imageBlocks = items.filter((b) => b.type === "image");

    const sectionChildren: React.ReactNode[] = [];

    if (firstImgIdx >= 0) {
      // Put first image first so floats can wrap following text
      sectionChildren.push(renderImage(items[firstImgIdx]));
    }

    // Then the text
    for (const t of textBlocks) sectionChildren.push(renderText(t));

    // Then any remaining images (optional)
    imageBlocks.forEach((imgBlk, i) => {
      if (i === 0) return; // already rendered first
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
  }

  return (
    <div className="hop-article" style={SELECT_AUTO}>
      {sectionsOut}
    </div>
  );
}
