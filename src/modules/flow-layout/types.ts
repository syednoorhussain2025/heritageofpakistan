export type Breakpoint = "desktop" | "tablet" | "mobile";

export type BlockKind = "text" | "image" | "heading" | "callout";

/** Lock the text column's minimum height to the height of a specific block (usually an image). */
export type TextFlowLock = {
  /** The blockId (within the same section) whose rendered height sets the minimum text height. */
  minHeightFromBlockId: string;
  /** Allow a controlled overshoot to avoid awkward truncations. Default: 0.10 (10%). */
  overshootPct?: number;
  /** Absolute overshoot cap in px (applied after pct). Default: 64px. */
  overshootPx?: number;
  /** Breakpoints where the lock applies. Default: ["desktop", "tablet"]. It is typically disabled on mobile. */
  breakpoints?: Breakpoint[];
};

/** Optional sizing metadata for image blocks (used when standardizing left/right image widths). */
export type ImageSizing = {
  /** Named width token that maps to a px value at the current breakpoint (e.g., "--side-img-w"). */
  widthToken?: string;
  /** Explicit width in px (used if no token is provided). */
  widthPx?: number;
  /** Aspect ratio (w/h). If provided, the engine can compute height from width without DOM measurement. */
  aspectRatio?: number;
};

export type HeightPolicy =
  | { type: "auto" }
  | { type: "ratio"; value: number } // e.g., 16/9
  | { type: "fixed"; px: number };

export type TextPolicy = {
  /** Target words to try for this slot. */
  targetWords: number;
  /** Lower bound (defaults to 0.75 * target). */
  minWords?: number;
  /** Upper bound (defaults to 1.25 * target). */
  maxWords?: number;
  /** Prefer ending at a sentence boundary. Default true. */
  snapToSentence?: boolean;
  /** Minimum lines at end of a slot to avoid widows. (visual hint; we don’t measure lines in v1) */
  widowMinLines?: number;
  /** Minimum lines at start of next slot to avoid orphans. (visual hint; we don’t measure lines in v1) */
  orphanMinLines?: number;
};

export type SectionBlockDef = {
  /** Unique within the section type. */
  id: string;
  kind: BlockKind;
  /** CSS grid-area name for this block within the section. */
  area: string;
  /** True for text blocks that receive the global text flow. */
  acceptsTextFlow?: boolean;
  /** Policy used for quota-based slicing + single fit-check. */
  textPolicy?: TextPolicy;
  /** Slot id for images (used to attach/replace). */
  imageSlotId?: string;
  /**
   * For image blocks: aspect ratio (e.g., 16/9 = 1.777…).
   * NOTE: retained for backward compatibility; prefer `sizing.aspectRatio` going forward.
   */
  aspectRatio?: number;
  /** Optional clamp for very tall media. */
  maxHeightPx?: number;

  /** NEW: standardized sizing (width token / explicit width / aspect) for side images. */
  sizing?: ImageSizing;
};

export type SectionGeometry = {
  /** CSS grid tracks & gaps per breakpoint. */
  gridTemplateColumns: string;
  gridTemplateAreas: string[]; // e.g., ["media text"]
  gap: string;
  heightPolicy: HeightPolicy;
};

export type SectionDef = {
  sectionTypeId: string;
  name: string;
  version: number;
  isHero?: boolean;
  /** Per-breakpoint geometry. */
  geometry: Record<Breakpoint, SectionGeometry>;
  /** Block layout inside this section. */
  blocks: SectionBlockDef[];
  /** Whether this section’s text blocks accept overflow from previous sections. */
  textAcceptsFlow?: boolean;

  /**
   * NEW: lock the text column to be at least as tall as a reference block (usually the adjacent image).
   * When set, the fitter will keep adding sentences until textHeight >= imageHeight (+ overshoot tolerance).
   */
  textFlowLock?: TextFlowLock;
};

export type TemplateDef = {
  templateId: string;
  name: string;
  version: number;
  sections: Array<{
    sectionTypeId: string;
    version: number;
    /** Optional overrides per use (rare; keep minimal). */
    configOverrides?: Partial<SectionDef>;
  }>;
  /** Stop stacking sections when text ends. Default true. */
  truncateOnTextEnd?: boolean;
  /** If text overflows after last section: continue with same template or stop. Default "continue". */
  overflowStrategy?: "continue" | "stop";
};

export type ImageRef = {
  storagePath: string;
  alt: string;
  caption?: string | null;
  credit?: string | null;
};

export type BlockInstance =
  | {
      type: "text";
      sectionTypeId: string;
      sectionInstanceKey: string; // unique per section occurrence
      blockId: string;
      /** Indices into the master text (character offsets). */
      startChar: number;
      endChar: number;
      pinned?: boolean;
      /** NEW: If the fitter computed a minimum height for this block (from textFlowLock), persist it for snapshotting. */
      minHeightPx?: number;
    }
  | {
      type: "image";
      sectionTypeId: string;
      sectionInstanceKey: string;
      blockId: string;
      imageSlotId: string;
      image?: ImageRef | null; // null = placeholder
    }
  | {
      type: "heading" | "callout";
      sectionTypeId: string;
      sectionInstanceKey: string;
      blockId: string;
      content?: string;
    };

export type LayoutInstance = {
  templateId: string;
  templateVersion: number;
  breakpoint: Breakpoint;
  flow: BlockInstance[];
  leftoverText?: { startChar: number } | null;
};

export type FlowInput = {
  /** Master text to flow (plain text, already sanitized). */
  text: string;
  /** Section definitions used by this template. */
  sectionCatalog: Record<string, SectionDef>;
  /** Template definition that stacks sections. */
  template: TemplateDef;
  breakpoint: Breakpoint;

  /**
   * NEW: optional design tokens resolved to pixels for the current breakpoint.
   * Used by the engine to compute image heights when `sizing.widthToken` is provided.
   */
  designTokens?: {
    /** e.g., { "--side-img-w": 480 } */
    widthPx?: Record<string, number>;
  };
};

export type MeasurerAPI = {
  /**
   * Given text and a CSS signature, return true if content would overflow the slot’s maxHeightPx.
   * This is a single fit-check to nudge quotas—much cheaper than full binary-search pagination.
   */
  checkOverflow: (params: {
    text: string;
    cssSignature: string; // a stable key for width/font/line-height, etc.
    maxHeightPx?: number;
  }) => boolean;

  /**
   * NEW: Return the measured height (in px) of the given text under a CSS signature.
   * Required for height-aware fitting (text must reach image height).
   */
  measureTextHeight?: (params: {
    text: string;
    cssSignature: string;
    /** Optional width override if the signature alone is insufficient. */
    maxWidthPx?: number;
  }) => number;

  /**
   * NEW: Helper to compute image height from standardized sizing info.
   * If widthToken is provided, the engine may pass a resolved px value from FlowInput.designTokens.widthPx.
   */
  computeImageHeightFromSizing?: (params: {
    sizing?: ImageSizing;
    /** Fallback: when neither token nor widthPx are given, a DOM measure may occur in the composer. */
    resolvedWidthPx?: number;
  }) => number | undefined;
};

export type FlowEngine = (
  input: FlowInput,
  measurer?: MeasurerAPI
) => LayoutInstance;
