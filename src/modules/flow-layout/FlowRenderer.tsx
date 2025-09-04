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

export default function FlowRenderer({
  input,
  imagesBySlot = {},
  sectionClassFor,
  textClassFor,
  imageClassFor,
}: Props) {
  const measurer = useMeasurer();
  const layout: LayoutInstance = computeLayout(input, measurer);

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
      <section key={`sec-${currentKey}-${parts.length}`} className={sectionCls}>
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
      sectionChildren.push(
        <div
          key={`${blk.sectionInstanceKey}:${blk.blockId}:text`}
          className={cls}
        >
          {text.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="hop-p">
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

      // Prefer composite key, fallback to plain slotId for backward compat
      const compositeKey = `${blk.sectionInstanceKey}:${blk.imageSlotId}`;
      const image =
        imagesBySlot[compositeKey] ?? imagesBySlot[blk.imageSlotId] ?? null;

      sectionChildren.push(
        <figure
          key={`${blk.sectionInstanceKey}:${blk.blockId}:img`}
          className={cls}
        >
          {image ? (
            <img
              src={image.storagePath}
              alt={image.alt || ""}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="hop-media-placeholder">
              Image slot: {blk.imageSlotId}{" "}
              <span className="opacity-60">({blk.sectionInstanceKey})</span>
            </div>
          )}
          {image?.caption ? (
            <figcaption className="hop-caption">{image.caption}</figcaption>
          ) : null}
        </figure>
      );
    } else {
      sectionChildren.push(
        <div
          key={`${blk.sectionInstanceKey}:${blk.blockId}:other`}
          className="hop-other"
        />
      );
    }
  }
  flushSection();

  return <div className="hop-article">{parts}</div>;
}
