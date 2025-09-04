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

/* (Optional) Presentational primitives for a renderer (kept from earlier plan) */
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
