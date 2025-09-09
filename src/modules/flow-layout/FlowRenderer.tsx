"use client";
import React from "react";
import { LayoutInstance, FlowInput, ImageRef, Breakpoint } from "./types";
import { computeLayout } from "./engine";
import { useMeasurer } from "./Measurer";

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
  /** Map of images keyed by **composite slot key** `${sectionInstanceKey}:${imageSlotId}`.
      For backward compatibility, plain `imageSlotId` keys are also accepted. */
  imagesBySlot?: Record<string, ImageRef | null>;
} & ClassMaps;

/** Provide sensible defaults for design tokens so height-lock can compute image height. */
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

// selection-friendly styles (don’t rely only on CSS file)
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

  const parts: React.ReactNode[] = [];
  let currentKey: string | null = null;
  let currentType: string | null = null;
  let sectionChildren: React.ReactNode[] = [];

  const flushSection = () => {
    if (!currentKey || !currentType) return;
    const sectionCls =
      sectionClassFor?.({
        sectionTypeId: currentType,
        sectionInstanceKey: currentKey,
        breakpoint: input.breakpoint,
      }) ?? "hop-section";
    parts.push(
      <section
        key={`sec-${currentKey}-${parts.length}`}
        className={sectionCls}
        style={SELECT_AUTO} /* make sure sections don’t disable selection */
      >
        {sectionChildren}
      </section>
    );
    sectionChildren = [];
  };

  for (const blk of layout.flow) {
    if (blk.sectionInstanceKey !== currentKey) {
      flushSection();
      currentKey = blk.sectionInstanceKey;
      currentType = blk.sectionTypeId;
    }

    if (blk.type === "text") {
      const text = input.text.slice(blk.startChar, blk.endChar);
      const cls =
        textClassFor?.({
          sectionTypeId: blk.sectionTypeId,
          blockId: blk.blockId,
          sectionInstanceKey: blk.sectionInstanceKey,
          breakpoint: input.breakpoint,
        }) ?? "hop-text";

      const minPx = (blk as any).minHeightPx as number | undefined;
      const dataAttr =
        typeof minPx === "number" && minPx > 0
          ? { "data-text-lock": "image" }
          : undefined;
      const style: React.CSSProperties =
        typeof minPx === "number" && minPx > 0
          ? { ...SELECT_TEXT, minHeight: `${minPx}px` }
          : SELECT_TEXT;

      sectionChildren.push(
        <div
          key={`${blk.sectionInstanceKey}:${blk.blockId}:text`}
          className={cls}
          {...dataAttr}
          style={style}
        >
          {text.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="hop-p" style={SELECT_TEXT}>
              {p}
            </p>
          ))}
        </div>
      );
    } else if (blk.type === "image") {
      const cls =
        imageClassFor?.({
          sectionTypeId: blk.sectionTypeId,
          blockId: blk.blockId,
          sectionInstanceKey: blk.sectionInstanceKey,
          breakpoint: input.breakpoint,
        }) ?? "hop-media";

      const compositeKey = `${blk.sectionInstanceKey}:${blk.imageSlotId}`;
      const image =
        imagesBySlot[compositeKey] ?? imagesBySlot[blk.imageSlotId] ?? null;

      sectionChildren.push(
        <figure
          key={`${blk.sectionInstanceKey}:${blk.blockId}:img`}
          className={cls}
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
    } else {
      sectionChildren.push(
        <div
          key={`${blk.sectionInstanceKey}:${blk.blockId}:other`}
          className="hop-other"
          style={SELECT_AUTO}
        />
      );
    }
  }
  flushSection();

  return (
    <div className="hop-article" style={SELECT_AUTO}>
      {parts}
    </div>
  );
}
