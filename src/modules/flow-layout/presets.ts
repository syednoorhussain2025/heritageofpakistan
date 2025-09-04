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
  version: 1,
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
      aspectRatio: 4 / 3,
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

export const SECTION_CATALOG = {
  [HERO_INTRO.sectionTypeId]: HERO_INTRO,
  [MEDIA_LEFT_TEXT_RIGHT.sectionTypeId]: MEDIA_LEFT_TEXT_RIGHT,
  [FULL_TEXT_BAND.sectionTypeId]: FULL_TEXT_BAND,
} as const;

export const TEMPLATE_LONGFORM_A: TemplateDef = {
  templateId: "longformA",
  name: "Longform A",
  version: 1,
  truncateOnTextEnd: true,
  overflowStrategy: "continue",
  sections: [
    { sectionTypeId: "heroIntro", version: 1 },
    { sectionTypeId: "mediaLeftTextRight", version: 1 },
    { sectionTypeId: "fullTextBand", version: 1 },
    { sectionTypeId: "mediaLeftTextRight", version: 1 },
    { sectionTypeId: "fullTextBand", version: 1 },
  ],
};
