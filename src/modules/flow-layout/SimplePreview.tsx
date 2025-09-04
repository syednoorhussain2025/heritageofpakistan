// src/modules/flow-layout/SimplePreview.tsx
"use client";

import React, { useMemo, useState } from "react";

type TextPolicy = { targetWords?: number };
type Block =
  | {
      id: string;
      kind: "text";
      acceptsTextFlow?: boolean;
      textPolicy?: TextPolicy;
    }
  | { id: string; kind: "image"; imageSlotId: string };

type SectionDef = {
  sectionTypeId: string; // we’ll use the slug here
  blocks: Block[];
  cssClass?: string;
};

type TemplateDef = {
  id: string;
  name: string;
  sections: Array<{ sectionTypeId: string }>;
};

type Catalog = Record<string, SectionDef>;

type PickedImage = {
  storagePath: string;
  alt?: string | null;
  caption?: string | null;
  credit?: string | null;
};

export default function SimplePreview({
  masterText,
  sectionCatalog,
  template,
  onPickImage,
}: {
  masterText: string;
  sectionCatalog: Catalog;
  template: TemplateDef;
  onPickImage?: () => Promise<PickedImage>;
}) {
  // very naive tokenizer
  const words = useMemo(
    () =>
      (masterText || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean),
    [masterText]
  );

  // keep a cursor through master text flow
  const [cursor, setCursor] = useState(0);

  // chosen images per slot
  const [imagesBySlot, setImagesBySlot] = useState<Record<string, PickedImage>>(
    {}
  );

  const takeWords = (n?: number) => {
    const k =
      !n || n <= 0 ? words.length - cursor : Math.min(n, words.length - cursor);
    const slice = words.slice(cursor, cursor + k).join(" ");
    setCursor((c) => c + k);
    return slice;
  };

  const pickImageFor = async (slot: string) => {
    if (!onPickImage) return;
    const im = await onPickImage();
    setImagesBySlot((m) => ({ ...m, [slot]: im }));
  };

  const sections = template.sections
    .map((s) => sectionCatalog[s.sectionTypeId])
    .filter(Boolean);

  // reset cursor when template or text changes
  React.useEffect(() => {
    setCursor(0);
  }, [masterText, template?.id, template?.sections?.length]);

  return (
    <div className="spv-root">
      {sections.map((sec, i) => (
        <div
          className={`spv-section ${sec.cssClass || ""}`}
          key={`${sec.sectionTypeId}_${i}`}
        >
          {renderSection(sec.blocks, {
            takeWords,
            imagesBySlot,
            pickImageFor,
          })}
        </div>
      ))}
      <style jsx>{`
        .spv-root {
          width: 100%;
        }
        .spv-section {
          margin: 20px 0;
          padding: 12px;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
        }
        .spv-text {
          line-height: 1.7;
          color: #111827;
          font-size: 16px;
        }
        .spv-imgbox {
          position: relative;
          width: 100%;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
        }
        .spv-imgbox img {
          display: block;
          width: 100%;
          height: auto;
        }
        .spv-imgbox .slot-btn {
          position: absolute;
          right: 8px;
          top: 8px;
          background: #111827;
          color: #fff;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          border: none;
          cursor: pointer;
          opacity: 0.9;
        }
        /* layouts */
        .sec-full-width-text .spv-grid {
          display: block;
        }
        .sec-full-width-image .spv-grid {
          display: block;
        }
        .sec-img-left-text-right .spv-grid,
        .sec-img-right-text-left .spv-grid,
        .sec-two-images .spv-grid,
        .sec-three-images .spv-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 16px;
        }
        .sec-img-left-text-right .col-img {
          grid-column: span 5;
        }
        .sec-img-left-text-right .col-text {
          grid-column: span 7;
        }
        .sec-img-right-text-left .col-text {
          grid-column: span 7;
        }
        .sec-img-right-text-left .col-img {
          grid-column: span 5;
        }
        .sec-two-images .col-img {
          grid-column: span 6;
        }
        .sec-three-images .col-img {
          grid-column: span 4;
        }
        @media (max-width: 768px) {
          .sec-img-left-text-right .spv-grid,
          .sec-img-right-text-left .spv-grid,
          .sec-two-images .spv-grid,
          .sec-three-images .spv-grid {
            grid-template-columns: 1fr;
          }
          .col-img,
          .col-text {
            grid-column: span 12;
          }
        }
      `}</style>
    </div>
  );
}

function renderSection(
  blocks: Block[],
  ctx: {
    takeWords: (n?: number) => string;
    imagesBySlot: Record<string, PickedImage>;
    pickImageFor: (slot: string) => Promise<void>;
  }
) {
  // Determine layout by the combination of blocks (simple heuristic)
  const hasTwoImages = blocks.filter((b) => b.kind === "image").length === 2;
  const hasThreeImages = blocks.filter((b) => b.kind === "image").length === 3;

  // wrappers to apply grid classes
  const wrap = (children: React.ReactNode, extraClass?: string) => (
    <div className={`spv-grid ${extraClass || ""}`}>{children}</div>
  );

  // Section variants
  if (hasThreeImages) {
    return wrap(
      blocks.map((b) =>
        b.kind === "image" ? (
          <div className="col-img" key={b.id}>
            <ImageSlot slot={b.imageSlotId} ctx={ctx} />
          </div>
        ) : null
      ),
      "sec-three-images"
    );
  }

  if (hasTwoImages) {
    return wrap(
      blocks.map((b) =>
        b.kind === "image" ? (
          <div className="col-img" key={b.id}>
            <ImageSlot slot={b.imageSlotId} ctx={ctx} />
          </div>
        ) : null
      ),
      "sec-two-images"
    );
  }

  // single image + text combos or single text
  if (blocks.length === 1 && blocks[0].kind === "text") {
    const policy = blocks[0].textPolicy?.targetWords;
    const txt = ctx.takeWords(policy);
    return wrap(
      <div className="spv-text">{txt || " "}</div>,
      "sec-full-width-text"
    );
  }

  if (blocks.length === 1 && blocks[0].kind === "image") {
    return wrap(
      <div className="spv-imgbox">
        <ImageSlot slot={blocks[0].imageSlotId} ctx={ctx} />
      </div>,
      "sec-full-width-image"
    );
  }

  // 2-column layouts
  if (blocks.length === 2) {
    const [a, b] = blocks;
    // image left / text right
    if (a.kind === "image" && b.kind === "text") {
      const txt = ctx.takeWords(b.textPolicy?.targetWords);
      return wrap(
        <>
          <div className="col-img">
            <ImageSlot slot={a.imageSlotId} ctx={ctx} />
          </div>
          <div className="col-text">
            <div className="spv-text">{txt || " "}</div>
          </div>
        </>,
        "sec-img-left-text-right"
      );
    }
    // text left / image right
    if (a.kind === "text" && b.kind === "image") {
      const txt = ctx.takeWords(a.textPolicy?.targetWords);
      return wrap(
        <>
          <div className="col-text">
            <div className="spv-text">{txt || " "}</div>
          </div>
          <div className="col-img">
            <ImageSlot slot={b.imageSlotId} ctx={ctx} />
          </div>
        </>,
        "sec-img-right-text-left"
      );
    }
  }

  // fallback: render blocks in a column
  return (
    <div>
      {blocks.map((b) =>
        b.kind === "text" ? (
          <p className="spv-text" key={b.id}>
            {ctx.takeWords(b.textPolicy?.targetWords)}
          </p>
        ) : (
          <div className="spv-imgbox" key={b.id}>
            <ImageSlot slot={b.imageSlotId} ctx={ctx} />
          </div>
        )
      )}
    </div>
  );
}

function ImageSlot({
  slot,
  ctx,
}: {
  slot: string;
  ctx: {
    imagesBySlot: Record<string, PickedImage>;
    pickImageFor: (slot: string) => Promise<void>;
  };
}) {
  const chosen = ctx.imagesBySlot[slot];
  return (
    <div className="spv-imgbox">
      {chosen ? (
        <img src={chosen.storagePath} alt={chosen.alt || ""} />
      ) : (
        <div
          style={{
            height: 280,
            display: "grid",
            placeItems: "center",
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          Empty slot: <code>{slot}</code>
        </div>
      )}
      <button className="slot-btn" onClick={() => ctx.pickImageFor(slot)}>
        Pick image
      </button>
    </div>
  );
}
