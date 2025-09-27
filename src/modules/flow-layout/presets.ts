import type { Breakpoint, SectionDef, TemplateDef } from "./types";

/**
 * Three sample sections and one sample template so you can render immediately.
 * Geometry uses simple grids; adjust to your design tokens.
 */

export const HERO_INTRO: SectionDef = {
  sectionTypeId: "heroIntro",
  name: "Hero + Intro",
  version: 1,
  isHero: true,
  textAcceptsFlow: true,
  geometry: {
    desktop: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["media", "text"],
      gap: "1.25rem",
      heightPolicy: { type: "auto" },
    },
    tablet: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["media", "text"],
      gap: "1rem",
      heightPolicy: { type: "auto" },
    },
    mobile: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["media", "text"],
      gap: "0.875rem",
      heightPolicy: { type: "auto" },
    },
  },
  blocks: [
    {
      id: "media",
      kind: "image",
      area: "media",
      imageSlotId: "hero",
      aspectRatio: 16 / 9,
      maxHeightPx: 560,
    },
    {
      id: "intro",
      kind: "text",
      area: "text",
      acceptsTextFlow: true,
      textPolicy: {
        targetWords: 160,
        minWords: 110,
        maxWords: 220,
        snapToSentence: true,
      },
    },
  ],
};

export const MEDIA_LEFT_TEXT_RIGHT: SectionDef = {
  sectionTypeId: "mediaLeftTextRight",
  name: "Media Left / Text Right",
  // Bumped: version 2 adds standardized image sizing + textFlowLock
  version: 2,
  textAcceptsFlow: true,
  geometry: {
    desktop: {
      gridTemplateColumns: "40% 1fr",
      gridTemplateAreas: ["media text"],
      gap: "1.25rem",
      heightPolicy: { type: "auto" },
    },
    tablet: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["media", "text"],
      gap: "1rem",
      heightPolicy: { type: "auto" },
    },
    mobile: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["media", "text"],
      gap: "0.875rem",
      heightPolicy: { type: "auto" },
    },
  },
  blocks: [
    {
      id: "media",
      kind: "image",
      area: "media",
      imageSlotId: "slot_1",
      // Standardized side image sizing: prefer portrait 4:5 with a width token
      aspectRatio: 4 / 5, // kept in sync with sizing.aspectRatio for clarity
      sizing: {
        widthToken: "--side-img-w",
        aspectRatio: 4 / 5,
      },
      maxHeightPx: 520,
    },
    {
      id: "text",
      kind: "text",
      area: "text",
      acceptsTextFlow: true,
      textPolicy: {
        targetWords: 140,
        minWords: 100,
        maxWords: 200,
        snapToSentence: true,
      },
    },
  ],
  // NEW: lock text height to the adjacent image height on desktop/tablet
  textFlowLock: {
    minHeightFromBlockId: "media",
    overshootPct: 0.1,
    overshootPx: 64,
    breakpoints: ["desktop", "tablet"],
  },
};

export const FULL_TEXT_BAND: SectionDef = {
  sectionTypeId: "fullTextBand",
  name: "Full Text Band",
  version: 1,
  textAcceptsFlow: true,
  geometry: {
    desktop: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["text"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
    tablet: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["text"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
    mobile: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["text"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
  },
  blocks: [
    {
      id: "text",
      kind: "text",
      area: "text",
      acceptsTextFlow: true,
      textPolicy: {
        targetWords: 200,
        minWords: 150,
        maxWords: 280,
        snapToSentence: true,
      },
    },
  ],
};

/* ────────────────────────────────────────────────────────────── */
/* NEW: Quotation (emphasis block)                                */
/* ────────────────────────────────────────────────────────────── */
export const QUOTATION: SectionDef = {
  sectionTypeId: "quotation", // matches renderer/CSS semantics
  name: "Quotation",
  version: 1,
  textAcceptsFlow: false,
  geometry: {
    desktop: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["quote"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
    tablet: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["quote"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
    mobile: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["quote"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
  },
  blocks: [
    {
      id: "quote",
      kind: "quote",
      area: "quote",
      // content is supplied at instance-time via BlockInstance ("quote")
    },
  ],
};

/* ────────────────────────────────────────────────────────────── */
/* NEW: Carousel Photos (multi-image)                              */
/* ────────────────────────────────────────────────────────────── */
export const CAROUSEL: SectionDef = {
  sectionTypeId: "carousel", // matches renderer/CSS semantics
  name: "Carousel Photos",
  version: 1,
  textAcceptsFlow: false,
  geometry: {
    desktop: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["carousel"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
    tablet: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["carousel"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
    mobile: {
      gridTemplateColumns: "1fr",
      gridTemplateAreas: ["carousel"],
      gap: "0",
      heightPolicy: { type: "auto" },
    },
  },
  blocks: [
    {
      id: "carousel",
      kind: "carousel",
      area: "carousel",
      imageSlotIds: [
        "slide_1",
        "slide_2",
        "slide_3",
        "slide_4",
        "slide_5",
        "slide_6",
        "slide_7",
        "slide_8",
        "slide_9",
        "slide_10",
      ],
      carousel: {
        maxItems: 10,
        snap: "mandatory",
        minVisible: { desktop: 1, tablet: 1, mobile: 1 },
      },
    },
  ],
};

export const SECTION_CATALOG = {
  [HERO_INTRO.sectionTypeId]: HERO_INTRO,
  [MEDIA_LEFT_TEXT_RIGHT.sectionTypeId]: MEDIA_LEFT_TEXT_RIGHT,
  [FULL_TEXT_BAND.sectionTypeId]: FULL_TEXT_BAND,
  // NEW
  [QUOTATION.sectionTypeId]: QUOTATION,
  [CAROUSEL.sectionTypeId]: CAROUSEL,
} as const;

export const TEMPLATE_LONGFORM_A: TemplateDef = {
  templateId: "longformA",
  name: "Longform A",
  version: 2, // bumped to include new sections
  truncateOnTextEnd: true,
  overflowStrategy: "continue",
  sections: [
    { sectionTypeId: "heroIntro", version: 1 },
    { sectionTypeId: "mediaLeftTextRight", version: 2 },
    { sectionTypeId: "fullTextBand", version: 1 },
    // NEW: drop a quote emphasis after the first body block
    { sectionTypeId: "quotation", version: 1 },
    { sectionTypeId: "mediaLeftTextRight", version: 2 },
    { sectionTypeId: "fullTextBand", version: 1 },
    // NEW: finish with a carousel gallery
    { sectionTypeId: "carousel", version: 1 },
  ],
};
