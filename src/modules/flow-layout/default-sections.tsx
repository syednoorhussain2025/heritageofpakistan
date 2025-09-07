// src/modules/flow-layout/default-sections.tsx
import React from "react";

export type ArchetypeSlug =
  | "full-width-image"
  | "full-width-text" // NEW
  | "image-left-text-right"
  | "image-right-text-left"
  | "two-images"
  | "three-images";

export type SectionSettings = {
  paddingY: number; // px
  paddingX: number; // px
  marginY: number; // px (gap between sections)
  maxWidth: number; // px (content container width)
  gutter: number; // px (gap between columns/images)
  background: string; // CSS color (e.g. "#fff" or "transparent")
};

export const DEFAULT_SETTINGS: Record<ArchetypeSlug, SectionSettings> = {
  "full-width-image": {
    paddingY: 24,
    paddingX: 0,
    marginY: 24,
    maxWidth: 1200,
    gutter: 16,
    background: "transparent",
  },
  "full-width-text": {
    paddingY: 28,
    paddingX: 20,
    marginY: 24,
    maxWidth: 820,
    gutter: 20,
    background: "transparent",
  }, // NEW
  "image-left-text-right": {
    paddingY: 32,
    paddingX: 20,
    marginY: 24,
    maxWidth: 1100,
    gutter: 24,
    background: "transparent",
  },
  "image-right-text-left": {
    paddingY: 32,
    paddingX: 20,
    marginY: 24,
    maxWidth: 1100,
    gutter: 24,
    background: "transparent",
  },
  "two-images": {
    paddingY: 24,
    paddingX: 20,
    marginY: 24,
    maxWidth: 1200,
    gutter: 12,
    background: "transparent",
  },
  "three-images": {
    paddingY: 24,
    paddingX: 20,
    marginY: 24,
    maxWidth: 1200,
    gutter: 12,
    background: "transparent",
  },
};

export const ARCHETYPES: {
  slug: ArchetypeSlug;
  name: string;
  description: string;
}[] = [
  {
    slug: "full-width-image",
    name: "Full-width Image",
    description: "Single edge-to-edge image band",
  },
  {
    slug: "full-width-text",
    name: "Full-width Text",
    description: "Single prose block across the page",
  }, // NEW
  {
    slug: "image-left-text-right",
    name: "Image Left + Text Right",
    description: "Two columns: media then prose",
  },
  {
    slug: "image-right-text-left",
    name: "Image Right + Text Left",
    description: "Two columns: prose then media",
  },
  {
    slug: "two-images",
    name: "Two Images Side-by-Side",
    description: "2-up gallery row",
  },
  {
    slug: "three-images",
    name: "Three Images Side-by-Side",
    description: "3-up gallery row",
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

type ImageData = {
  src: string;
  alt?: string;
  caption?: string | null;
  credit?: string | null;
  /** Defaults to 4:5 (portrait) for side images */
  aspectRatio?: number;
};

function FigureBox({
  image,
  widthVar = "--side-img-w",
  defaultWidthPx = 480,
}: {
  image: ImageData;
  widthVar?: string;
  defaultWidthPx?: number;
}) {
  const ar = image.aspectRatio ?? 4 / 5; // portrait default
  return (
    <figure style={{ margin: 0 }}>
      <div
        className="flx-img"
        style={{
          width: `var(${widthVar}, ${defaultWidthPx}px)`,
          aspectRatio: `${ar}`,
          overflow: "hidden",
          borderRadius: 8,
          background: "#f4f4f5",
        }}
      >
        {/* Use object-fit to honor aspect; height follows from aspect-ratio */}
        <img
          src={image.src}
          alt={image.alt || ""}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
      {(image.caption || image.credit) && (
        <figcaption
          style={{
            color: "#6b7280",
            fontSize: 12,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {image.caption}
          {image.credit
            ? image.caption
              ? ` — ${image.credit}`
              : image.credit
            : null}
        </figcaption>
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Presentational primitives                                          */
/* ------------------------------------------------------------------ */

export function FullWidthImage({
  src,
  alt,
  caption,
  settings,
}: {
  src: string;
  alt?: string;
  caption?: string;
  settings: SectionSettings;
}) {
  const { paddingY, marginY, background } = settings;
  return (
    <section
      style={{
        margin: `${marginY}px 0`,
        background,
        padding: `${paddingY}px 0`,
      }}
    >
      <img
        src={src}
        alt={alt || ""}
        style={{ display: "block", width: "100%", height: "auto" }}
      />
      {caption ? (
        <div
          style={{
            textAlign: "center",
            color: "#6b7280",
            fontSize: 14,
            marginTop: 8,
          }}
        >
          {caption}
        </div>
      ) : null}
    </section>
  );
}

export function FullWidthText({
  children,
  settings,
}: {
  children?: React.ReactNode;
  settings: SectionSettings;
}) {
  const { paddingY, paddingX, marginY, maxWidth, background } = settings;
  return (
    <section style={{ margin: `${marginY}px 0`, background }}>
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          padding: `${paddingY}px ${paddingX}px`,
        }}
      >
        <div style={{ fontSize: 18, lineHeight: 1.8 }}>{children}</div>
      </div>
    </section>
  );
}

/**
 * Image Left + Text Right
 * Enforces a stable side image width via CSS token and supports a minimum text height lock
 * using `minTextHeightPx`. When snapshots are rendered publicly, an inline `min-height`
 * will be injected into the text container and we’ll add `data-text-lock="image"`.
 */
export function ImageLeftTextRight({
  image,
  children,
  settings,
  minTextHeightPx,
}: {
  image: ImageData;
  children?: React.ReactNode;
  settings: SectionSettings;
  /** Optional: engine/composer can pass the computed min-height (px) for the text block. */
  minTextHeightPx?: number;
}) {
  const { paddingY, paddingX, marginY, maxWidth, gutter, background } =
    settings;
  return (
    <section style={{ margin: `${marginY}px 0`, background }}>
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          padding: `${paddingY}px ${paddingX}px`,
        }}
      >
        <div
          className="flx--two-col"
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: gutter,
            alignItems: "start",
          }}
        >
          <FigureBox image={image} />
          <div
            className="flx-text"
            data-text-lock={
              typeof minTextHeightPx === "number" ? "image" : undefined
            }
            style={{
              minHeight:
                typeof minTextHeightPx === "number" && minTextHeightPx > 0
                  ? `${minTextHeightPx}px`
                  : undefined,
              fontSize: 18,
              lineHeight: 1.8,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Image Right + Text Left
 * Same behavior as the left variant; just flips column order.
 */
export function ImageRightTextLeft({
  image,
  children,
  settings,
  minTextHeightPx,
}: {
  image: ImageData;
  children?: React.ReactNode;
  settings: SectionSettings;
  minTextHeightPx?: number;
}) {
  const { paddingY, paddingX, marginY, maxWidth, gutter, background } =
    settings;
  return (
    <section style={{ margin: `${marginY}px 0`, background }}>
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          padding: `${paddingY}px ${paddingX}px`,
        }}
      >
        <div
          className="flx--two-col"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: gutter,
            alignItems: "start",
          }}
        >
          <div
            className="flx-text"
            data-text-lock={
              typeof minTextHeightPx === "number" ? "image" : undefined
            }
            style={{
              minHeight:
                typeof minTextHeightPx === "number" && minTextHeightPx > 0
                  ? `${minTextHeightPx}px`
                  : undefined,
              fontSize: 18,
              lineHeight: 1.8,
            }}
          >
            {children}
          </div>
          <FigureBox image={image} />
        </div>
      </div>
    </section>
  );
}

/**
 * Two images side-by-side
 */
export function TwoImages({
  left,
  right,
  settings,
}: {
  left: ImageData;
  right: ImageData;
  settings: SectionSettings;
}) {
  const { paddingY, paddingX, marginY, maxWidth, gutter, background } =
    settings;
  return (
    <section style={{ margin: `${marginY}px 0`, background }}>
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          padding: `${paddingY}px ${paddingX}px`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: gutter,
          }}
        >
          <FigureBox image={left} widthVar="--side-img-w" />
          <FigureBox image={right} widthVar="--side-img-w" />
        </div>
      </div>
    </section>
  );
}

/**
 * Three images side-by-side
 */
export function ThreeImages({
  a,
  b,
  c,
  settings,
}: {
  a: ImageData;
  b: ImageData;
  c: ImageData;
  settings: SectionSettings;
}) {
  const { paddingY, paddingX, marginY, maxWidth, gutter, background } =
    settings;
  return (
    <section style={{ margin: `${marginY}px 0`, background }}>
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          padding: `${paddingY}px ${paddingX}px`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: gutter,
          }}
        >
          <FigureBox image={a} widthVar="--side-img-w" />
          <FigureBox image={b} widthVar="--side-img-w" />
          <FigureBox image={c} widthVar="--side-img-w" />
        </div>
      </div>
    </section>
  );
}
