import {
  FlowEngine,
  FlowInput,
  LayoutInstance,
  BlockInstance,
  SectionDef,
  TextPolicy,
  MeasurerAPI,
} from "./types";

// ───────────── utilities ─────────────

const DEFAULT_SNAP = true;
const SENTENCE_SPLIT = /(?<=\.)\s+|(?<=\?)\s+|(?<=!)\s+/; // simple EN split

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

const defaultMin = (p: TextPolicy) =>
  p.minWords ?? Math.round(p.targetWords * 0.75);
const defaultMax = (p: TextPolicy) =>
  p.maxWords ?? Math.round(p.targetWords * 1.25);

function sliceByWordsFrom(
  text: string,
  startChar: number,
  targetWords: number,
  window: { min: number; max: number },
  snapToSentence: boolean
) {
  const remaining = text.slice(startChar);
  if (!remaining.trim()) return { endChar: startChar, excerpt: "" };

  const tokens = remaining.trim().split(/\s+/);
  const take = clamp(targetWords, window.min, window.max);
  const approx = tokens.slice(0, take).join(" ");
  const endChar = startChar + remaining.indexOf(approx) + approx.length;
  let excerpt = text.slice(startChar, endChar);

  if (snapToSentence) {
    const segment = text.slice(startChar, endChar);
    const sentences = segment.split(SENTENCE_SPLIT);
    if (sentences.length > 1) {
      const allButLast = sentences.slice(0, -1).join(" ").trim();
      if (allButLast.length > 0) {
        const newEnd =
          startChar + segment.indexOf(allButLast) + allButLast.length;
        return { endChar: newEnd, excerpt: text.slice(startChar, newEnd) };
      }
    }
  }
  return { endChar, excerpt };
}

function adjustByFitCheck(
  excerpt: string,
  startChar: number,
  endChar: number,
  policy: TextPolicy,
  measurer?: MeasurerAPI,
  cssSignature?: string,
  maxHeightPx?: number
) {
  if (!measurer || !cssSignature) return { endChar, excerpt };
  const overflows = measurer.checkOverflow({
    text: excerpt,
    cssSignature,
    maxHeightPx,
  });
  if (!overflows) return { endChar, excerpt };

  // Remove the last sentence to relieve overflow
  const sentences = excerpt.split(SENTENCE_SPLIT);
  if (sentences.length <= 1) return { endChar, excerpt };

  const trimmed = sentences.slice(0, -1).join(" ").trim();
  const delta = excerpt.length - trimmed.length;
  return { endChar: endChar - delta, excerpt: trimmed };
}

// ───────────── engine ─────────────

export const computeLayout: FlowEngine = (
  input: FlowInput,
  measurer?: MeasurerAPI
): LayoutInstance => {
  const { template, sectionCatalog, text, breakpoint } = input;
  let cursor = 0; // char offset into master text
  const flow: BlockInstance[] = [];

  // Keep a running index so the same section type used multiple times remains distinguishable
  const sectionCounters: Record<string, number> = {};

  for (const tplSection of template.sections) {
    const section: SectionDef = sectionCatalog[tplSection.sectionTypeId];
    if (!section) continue;

    const instanceIndex = (sectionCounters[section.sectionTypeId] ?? 0) + 1;
    sectionCounters[section.sectionTypeId] = instanceIndex;
    const sectionInstanceKey = `${section.sectionTypeId}#${instanceIndex}`;

    const geom = section.geometry[breakpoint];

    for (const block of section.blocks) {
      if (block.kind === "image") {
        flow.push({
          type: "image",
          sectionTypeId: section.sectionTypeId,
          sectionInstanceKey,
          blockId: block.id,
          imageSlotId:
            block.imageSlotId ?? `${section.sectionTypeId}:${block.id}`,
          image: null,
        });
        continue;
      }

      if (block.kind === "text" && (block.acceptsTextFlow ?? false)) {
        const policy = block.textPolicy!;
        const snap = policy.snapToSentence ?? DEFAULT_SNAP;
        const minW = defaultMin(policy);
        const maxW = defaultMax(policy);

        const remaining = text.slice(cursor).trim();
        if (!remaining) continue;

        // quota-based slice
        const { endChar: plannedEnd, excerpt: plannedExcerpt } =
          sliceByWordsFrom(
            text,
            cursor,
            policy.targetWords,
            { min: minW, max: maxW },
            snap
          );

        // SAFE signature: use double-underscore instead of colons
        const cssSignature = `${section.sectionTypeId}__${block.id}__${breakpoint}`;
        const { endChar: actualEnd, excerpt } = adjustByFitCheck(
          plannedExcerpt,
          cursor,
          plannedEnd,
          policy,
          measurer,
          cssSignature,
          block.maxHeightPx ??
            (geom.heightPolicy.type === "fixed"
              ? geom.heightPolicy.px
              : undefined)
        );

        if (!excerpt.trim()) continue;

        flow.push({
          type: "text",
          sectionTypeId: section.sectionTypeId,
          sectionInstanceKey,
          blockId: block.id,
          startChar: cursor,
          endChar: actualEnd,
        });

        cursor = actualEnd;
      }
    }

    if ((template.truncateOnTextEnd ?? true) && cursor >= text.length) {
      break;
    }
  }

  let leftoverText: LayoutInstance["leftoverText"] = null;
  if (
    cursor < text.length &&
    (template.overflowStrategy ?? "continue") === "stop"
  ) {
    leftoverText = { startChar: cursor };
  }

  return {
    templateId: template.templateId,
    templateVersion: template.version,
    breakpoint,
    flow,
    leftoverText,
  };
};
