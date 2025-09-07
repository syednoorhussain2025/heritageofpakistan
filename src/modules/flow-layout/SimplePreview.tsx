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

/* -------------------------------- Height lock -------------------------------- */

function usePairHeightLock(
  imgRef: React.RefObject<HTMLElement | null>,
  setMinPx: (px?: number) => void
) {
  React.useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (!imgRef.current) return;
      if (mql.matches) {
        const h = imgRef.current.getBoundingClientRect().height;
        setMinPx(Math.max(0, Math.round(h)));
      } else {
        setMinPx(undefined);
      }
    };

    const ro = new ResizeObserver(update);
    ro.observe(el);
    mql.addEventListener("change", update);
    update();

    return () => {
      try {
        ro.disconnect();
      } catch {}
      mql.removeEventListener("change", update);
    };
  }, [imgRef, setMinPx]);
}

/* -------------------------------- Components -------------------------------- */

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
        /* Release the lock on small screens */
        @media (max-width: 1024px) {
          [data-text-lock="image"] {
            min-height: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

/* -------------------------- Render dispatcher -------------------------- */

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
        <TwoColLeft text={txt} slot={a.imageSlotId} ctx={ctx} />,
        "sec-img-left-text-right"
      );
    }
    // text left / image right
    if (a.kind === "text" && b.kind === "image") {
      const txt = ctx.takeWords(a.textPolicy?.targetWords);
      return wrap(
        <TwoColRight text={txt} slot={b.imageSlotId} ctx={ctx} />,
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

/* ------------------------- Two-column variants ------------------------- */

function TwoColLeft({
  text,
  slot,
  ctx,
}: {
  text: string;
  slot: string;
  ctx: {
    imagesBySlot: Record<string, PickedImage>;
    pickImageFor: (slot: string) => Promise<void>;
  };
}) {
  const imgBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [minTextPx, setMinTextPx] = React.useState<number | undefined>();
  usePairHeightLock(imgBoxRef, setMinTextPx);

  return (
    <>
      <div className="col-img">
        <ImageSlot slot={slot} ctx={ctx} containerRef={imgBoxRef} />
      </div>
      <div
        className="col-text"
        data-text-lock={typeof minTextPx === "number" ? "image" : undefined}
        style={{
          minHeight:
            typeof minTextPx === "number" && minTextPx > 0
              ? `${minTextPx}px`
              : undefined,
        }}
      >
        <div className="spv-text">{text || " "}</div>
      </div>
    </>
  );
}

function TwoColRight({
  text,
  slot,
  ctx,
}: {
  text: string;
  slot: string;
  ctx: {
    imagesBySlot: Record<string, PickedImage>;
    pickImageFor: (slot: string) => Promise<void>;
  };
}) {
  const imgBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [minTextPx, setMinTextPx] = React.useState<number | undefined>();
  usePairHeightLock(imgBoxRef, setMinTextPx);

  return (
    <>
      <div
        className="col-text"
        data-text-lock={typeof minTextPx === "number" ? "image" : undefined}
        style={{
          minHeight:
            typeof minTextPx === "number" && minTextPx > 0
              ? `${minTextPx}px`
              : undefined,
        }}
      >
        <div className="spv-text">{text || " "}</div>
      </div>
      <div className="col-img">
        <ImageSlot slot={slot} ctx={ctx} containerRef={imgBoxRef} />
      </div>
    </>
  );
}

/* -------------------------------- Image slot -------------------------------- */

function ImageSlot({
  slot,
  ctx,
  containerRef,
}: {
  slot: string;
  ctx: {
    imagesBySlot: Record<string, PickedImage>;
    pickImageFor: (slot: string) => Promise<void>;
  };
  /** Optional: let parent observe the image box height */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const chosen = ctx.imagesBySlot[slot];
  return (
    <div className="spv-imgbox" ref={containerRef as any}>
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
