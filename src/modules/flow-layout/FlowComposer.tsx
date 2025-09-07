// src/modules/flow-layout/FlowComposer.tsx
"use client";

import * as React from "react";

/* ----------------------------- Types (UI) ----------------------------- */

export type SectionKind =
  | "full-width-image"
  | "image-left-text-right"
  | "image-right-text-left"
  | "two-images"
  | "three-images"
  | "full-width-text";

export type ImageSlot = {
  src?: string;
  alt?: string | null;
  caption?: string | null;
  href?: string | null;
  aspectRatio?: number; // for galleries/full width; side images standardized to 3/4
  /** composite slot key (optional for your picker) */
  slotId?: string;
};

export type TextSlot = {
  text?: string;
};

export type Section = {
  id?: string;
  type: SectionKind;
  images?: ImageSlot[];
  text?: TextSlot;
  paddingY?: "none" | "sm" | "md" | "lg";
  bg?: "none" | "muted";
  /** optional extra classes / style */
  cssClass?: string;
  style?: React.CSSProperties;
};

export type FlowComposerProps = {
  sections: Section[];
  onChange: (next: Section[]) => void;

  onPickImage?: (slotId: string) => Promise<ImageSlot>;
  debugFrames?: boolean;

  /** Hide add-toolbar in the canvas (we’ll show it in the sidebar instead). */
  showToolbar?: boolean;
  /** Hide per-section move/delete controls in the canvas. */
  showControls?: boolean;

  /** When true, hides all editing affordances and disables editing. */
  readonly?: boolean;
};

/* ---------------------------- Utilities ---------------------------- */

function uid() {
  return (
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`) ||
    String(+new Date())
  );
}

function padY(cls?: Section["paddingY"]) {
  switch (cls) {
    case "none":
      return "";
    case "sm":
      return "py-4";
    case "lg":
      return "py-12";
    case "md":
    default:
      // tighter default to reduce the inter-section feel
      return "py-6";
  }
}

function panel(bg?: Section["bg"]) {
  return bg === "muted"
    ? "bg-white shadow-sm border border-gray-200 rounded-2xl"
    : "";
}

/** Combine base panel/padding with optional extra cssClass */
function wrapClass(sec: Section) {
  return [padY(sec.paddingY), panel(sec.bg), sec.cssClass]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function Placeholder({
  children,
  minH = 240,
}: {
  children: React.ReactNode;
  minH?: number;
}) {
  return (
    <div
      style={{ minHeight: minH }}
      className="grid place-items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-500"
    >
      {children}
    </div>
  );
}

/* ------------------------- Height lock (fallback) ------------------------- */
/** Lock text column minHeight to the image column height on desktop/tablet. */
function usePairHeightLock(
  imageWrapRef: React.RefObject<HTMLElement | null>,
  enabled = true
) {
  const [minPx, setMinPx] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (!enabled) {
      setMinPx(undefined);
      return;
    }
    const el = imageWrapRef.current as HTMLElement | null;
    if (!el) return;

    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (!imageWrapRef.current) return;
      if (mql.matches) {
        const h = imageWrapRef.current.getBoundingClientRect().height;
        setMinPx(Math.max(0, Math.round(h)));
      } else {
        setMinPx(undefined); // unlock on mobile
      }
    };

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    mql.addEventListener("change", update);
    update();

    return () => {
      try {
        ro.disconnect();
      } catch {}
      mql.removeEventListener("change", update);
    };
  }, [imageWrapRef, enabled]);

  return minPx;
}

/* --------------------------- Image Figure --------------------------- */

function Figure({
  slot,
  sidePortraitLock = false,
  onPick,
  onReset,
  readonly,
}: {
  slot: ImageSlot;
  sidePortraitLock?: boolean;
  onPick?: (slotId?: string) => void;
  onReset?: (slotId?: string) => void;
  readonly?: boolean;
}) {
  const hasImg = !!slot.src;
  // Standardize side images to 3/4 (portrait lock)
  const lockedRatio = sidePortraitLock ? 3 / 4 : slot.aspectRatio;

  const hasRatio =
    typeof lockedRatio === "number" &&
    Number.isFinite(lockedRatio) &&
    lockedRatio > 0;

  // Avoid a super-tall placeholder until an image exists.
  const useRatioBox = hasImg && hasRatio;
  const wrapStyle = useRatioBox
    ? { paddingTop: `${(1 / (lockedRatio as number)) * 100}%` }
    : undefined;

  const ImgTag = hasImg ? (
    <img
      src={slot.src}
      alt={slot.alt || ""}
      className={
        useRatioBox
          ? "absolute inset-0 w-full h-full object-cover rounded-xl"
          : "w-full h-auto rounded-xl object-contain"
      }
      loading="lazy"
      decoding="async"
    />
  ) : null;

  return (
    <figure className="w-full group">
      <div
        className={`relative w-full overflow-hidden rounded-xl ${
          hasImg ? "" : "bg-gray-50"
        }`}
        style={wrapStyle}
      >
        {hasImg ? (
          ImgTag
        ) : (
          <Placeholder minH={sidePortraitLock ? 280 : 240}>Image</Placeholder>
        )}

        {!readonly && (onPick || onReset) && (
          <div
            className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            data-edit-only
          >
            {onPick && (
              <button
                type="button"
                onClick={() => onPick?.(slot.slotId)}
                className="px-2.5 py-1.5 rounded-md bg-black/75 text-white text-xs backdrop-blur hover:bg-black"
              >
                {hasImg ? "Change" : "Pick image"}
              </button>
            )}
            {hasImg && onReset && (
              <button
                type="button"
                onClick={() => onReset?.(slot.slotId)}
                className="px-2.5 py-1.5 rounded-md bg-white/85 text-gray-800 text-xs border hover:bg-white"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>
      {slot.caption ? (
        <figcaption className="mt-2 text-sm text-gray-500 text-center">
          {slot.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/* --------------------------- Inline Text Block --------------------------- */

function InlineTextBlock({
  value,
  setValue,
  maxHeightPx,
  readonly,
}: {
  value: string;
  setValue: (v: string) => void;
  maxHeightPx?: number;
  readonly?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const prevOk = React.useRef<string>(value || "");

  // keep DOM in sync when external value changes
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if ((el.textContent || "") !== (value || "")) {
      el.textContent = value || "";
    }
    prevOk.current = value || "";
  }, [value]);

  const handleInput = () => {
    if (readonly) return;
    const el = ref.current;
    if (!el) return;
    const next = el.textContent || "";

    if (typeof maxHeightPx === "number" && maxHeightPx > 0) {
      // If the content makes the box taller than the cap, revert.
      const tooTall = el.scrollHeight > el.clientHeight + 1;
      if (tooTall) {
        el.textContent = prevOk.current;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
    }

    prevOk.current = next;
    setValue(next);
  };

  return (
    <div
      ref={ref}
      contentEditable={!readonly}
      suppressContentEditableWarning
      onInput={handleInput}
      className={`prose prose-gray max-w-none outline-none ${
        !readonly
          ? "flow-editor-decor ring-1 ring-dashed ring-gray-300 rounded-lg p-2"
          : ""
      }`}
      style={{
        whiteSpace: "pre-wrap",
        minHeight:
          typeof maxHeightPx === "number" && maxHeightPx > 0
            ? `${maxHeightPx}px`
            : undefined,
        maxHeight:
          typeof maxHeightPx === "number" && maxHeightPx > 0
            ? `${maxHeightPx}px`
            : undefined,
        overflow: typeof maxHeightPx === "number" ? "hidden" : undefined,
        cursor: readonly ? "default" : "text",
      }}
      data-editing={!readonly || undefined}
    />
  );
}

/* --------------------------- Two-column UI --------------------------- */

const HANG_PX = 12; // text hangs slightly below image

function ImageLeftTextRight({
  sec,
  onChangeText,
  onPickImage,
  onResetImage,
  readonly,
}: {
  sec: Section;
  onChangeText: (text: string) => void;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  readonly?: boolean;
}) {
  const img = (sec.images || [])[0] || { slotId: "left-1" };
  const imageColRef = React.useRef<HTMLDivElement | null>(null);
  const minPx = usePairHeightLock(imageColRef, true);
  const cap = typeof minPx === "number" ? minPx + HANG_PX : undefined;
  const textVal = sec.text?.text || "";

  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div ref={imageColRef} className="md:col-span-5">
          <Figure
            slot={img}
            sidePortraitLock
            onPick={onPickImage}
            onReset={onResetImage}
            readonly={readonly}
          />
        </div>
        <div className="md:col-span-7">
          {readonly ? (
            textVal ? (
              <div
                className="prose prose-gray max-w-none whitespace-pre-wrap"
                style={{
                  minHeight: typeof cap === "number" ? `${cap}px` : undefined,
                }}
              >
                {textVal}
              </div>
            ) : null
          ) : (
            <InlineTextBlock
              value={textVal}
              setValue={(v) => onChangeText(v)}
              maxHeightPx={cap}
              readonly={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ImageRightTextLeft({
  sec,
  onChangeText,
  onPickImage,
  onResetImage,
  readonly,
}: {
  sec: Section;
  onChangeText: (text: string) => void;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  readonly?: boolean;
}) {
  const img = (sec.images || [])[0] || { slotId: "right-1" };
  const imageColRef = React.useRef<HTMLDivElement | null>(null);
  const minPx = usePairHeightLock(imageColRef, true);
  const cap = typeof minPx === "number" ? minPx + HANG_PX : undefined;
  const textVal = sec.text?.text || "";

  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-7 order-2 md:order-1">
          {readonly ? (
            textVal ? (
              <div
                className="prose prose-gray max-w-none whitespace-pre-wrap"
                style={{
                  minHeight: typeof cap === "number" ? `${cap}px` : undefined,
                }}
              >
                {textVal}
              </div>
            ) : null
          ) : (
            <InlineTextBlock
              value={textVal}
              setValue={(v) => onChangeText(v)}
              maxHeightPx={cap}
              readonly={false}
            />
          )}
        </div>
        <div ref={imageColRef} className="md:col-span-5 order-1 md:order-2">
          <Figure
            slot={img}
            sidePortraitLock
            onPick={onPickImage}
            onReset={onResetImage}
            readonly={readonly}
          />
        </div>
      </div>
    </div>
  );
}

function TwoImages({
  sec,
  onPickImage,
  onResetImage,
  readonly,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  readonly?: boolean;
}) {
  const imgs = (sec.images || []).slice(0, 2);
  const ensure = (i: number) => imgs[i] || { slotId: `slot_${i + 1}` };
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <Figure
            key={i}
            slot={ensure(i)}
            onPick={onPickImage}
            onReset={onResetImage}
            readonly={readonly}
          />
        ))}
      </div>
    </div>
  );
}

function ThreeImages({
  sec,
  onPickImage,
  onResetImage,
  readonly,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  readonly?: boolean;
}) {
  const imgs = (sec.images || []).slice(0, 3);
  const ensure = (i: number) => imgs[i] || { slotId: `slot_${i + 1}` };
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Figure
            key={i}
            slot={ensure(i)}
            onPick={onPickImage}
            onReset={onResetImage}
            readonly={readonly}
          />
        ))}
      </div>
    </div>
  );
}

function FullWidthImage({
  sec,
  onPickImage,
  onResetImage,
  readonly,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  readonly?: boolean;
}) {
  const img = (sec.images || [])[0] || { slotId: "fw-1" };
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <Figure
        slot={img}
        onPick={onPickImage}
        onReset={onResetImage}
        readonly={readonly}
      />
    </div>
  );
}

function FullWidthText({
  sec,
  onChangeText,
  readonly,
}: {
  sec: Section;
  onChangeText: (text: string) => void;
  readonly?: boolean;
}) {
  const textVal = sec.text?.text || "";
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      {readonly ? (
        textVal ? (
          <div className="prose prose-gray max-w-none whitespace-pre-wrap">
            {textVal}
          </div>
        ) : null
      ) : (
        <InlineTextBlock
          value={textVal}
          setValue={(v) => onChangeText(v)}
          readonly={false}
        />
      )}
    </div>
  );
}

/* --------------------------- Toolbar (optional) --------------------------- */

function Toolbar({
  onAdd,
  hidden,
}: {
  onAdd: (kind: SectionKind) => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  const btn =
    "px-2.5 py-1.5 rounded-md border text-xs hover:bg-gray-50 active:bg-gray-100";
  return (
    <div className="mb-2 flex flex-wrap gap-2" data-edit-only>
      <span className="text-sm text-gray-600 self-center mr-1">Add:</span>
      <button className={btn} onClick={() => onAdd("image-left-text-right")}>
        Image Left / Text Right
      </button>
      <button className={btn} onClick={() => onAdd("image-right-text-left")}>
        Image Right / Text Left
      </button>
      <button className={btn} onClick={() => onAdd("full-width-text")}>
        Full-width Text
      </button>
      <button className={btn} onClick={() => onAdd("full-width-image")}>
        Full-width Image
      </button>
      <button className={btn} onClick={() => onAdd("two-images")}>
        Two Images
      </button>
      <button className={btn} onClick={() => onAdd("three-images")}>
        Three Images
      </button>
    </div>
  );
}

/* ------------------------------ Root ------------------------------ */

export default function FlowComposer({
  sections,
  onChange,
  onPickImage,
  debugFrames,
  showToolbar = true,
  showControls = true,
  readonly = false,
}: FlowComposerProps) {
  const addSection = (kind: SectionKind) => {
    const next = [...(sections || []), makeSection(kind)];
    onChange(next);
  };

  const removeSection = (idx: number) => {
    const next = [...sections];
    next.splice(idx, 1);
    onChange(next);
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    const [s] = next.splice(idx, 1);
    next.splice(j, 0, s);
    onChange(next);
  };

  const updateSection = (idx: number, patch: Partial<Section>) => {
    const next = [...sections];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const pickForSlot = async (idx: number, slotIdx = 0) => {
    if (!onPickImage || readonly) return;
    const sec = sections[idx];
    const slotId =
      (sec.images?.[slotIdx]?.slotId as string) ||
      `${sec.type}-${idx}-${slotIdx}`;
    const picked = await onPickImage(slotId);
    if (!picked) return;
    const images = [...(sec.images || [])];
    images[slotIdx] = { ...images[slotIdx], ...picked, slotId };
    updateSection(idx, { images });
  };

  const resetSlot = (idx: number, slotIdx = 0) => {
    if (readonly) return;
    const sec = sections[idx];
    const images = [...(sec.images || [])];
    images[slotIdx] = { slotId: images[slotIdx]?.slotId || undefined };
    updateSection(idx, { images });
  };

  if (!Array.isArray(sections)) {
    return null;
  }

  return (
    // tighter spacing between sections
    <div className="space-y-3">
      {/* Hidden in our editor since we moved it to the sidebar */}
      <Toolbar onAdd={addSection} hidden={readonly || !showToolbar} />

      {sections.length === 0 && !readonly && showToolbar ? (
        <div
          className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600"
          data-edit-only
        >
          No sections yet. Use the buttons above to add your first section.
        </div>
      ) : null}

      {sections.map((sec, idx) => {
        const key = sec.id || `${sec.type}-${idx}`;
        const frame = debugFrames
          ? "relative ring-1 ring-dashed ring-emerald-300 rounded-xl p-1"
          : "";

        const controls =
          readonly || !showControls ? null : (
            <div className="flex gap-2 mb-2" data-edit-only>
              <button
                className="px-2 py-1 text-xs rounded-md border hover:bg-gray-50"
                onClick={() => moveSection(idx, -1)}
              >
                ↑ Move up
              </button>
              <button
                className="px-2 py-1 text-xs rounded-md border hover:bg-gray-50"
                onClick={() => moveSection(idx, +1)}
              >
                ↓ Move down
              </button>
              <button
                className="px-2 py-1 text-xs rounded-md border text-red-600 hover:bg-red-50"
                onClick={() => removeSection(idx)}
              >
                Delete
              </button>
            </div>
          );

        switch (sec.type) {
          case "image-left-text-right":
            return (
              <div key={key} className={frame}>
                {controls}
                <ImageLeftTextRight
                  sec={sec}
                  onChangeText={(v) =>
                    updateSection(idx, {
                      text: { ...(sec.text || {}), text: v },
                    })
                  }
                  onPickImage={() => pickForSlot(idx, 0)}
                  onResetImage={() => resetSlot(idx, 0)}
                  readonly={readonly}
                />
              </div>
            );
          case "image-right-text-left":
            return (
              <div key={key} className={frame}>
                {controls}
                <ImageRightTextLeft
                  sec={sec}
                  onChangeText={(v) =>
                    updateSection(idx, {
                      text: { ...(sec.text || {}), text: v },
                    })
                  }
                  onPickImage={() => pickForSlot(idx, 0)}
                  onResetImage={() => resetSlot(idx, 0)}
                  readonly={readonly}
                />
              </div>
            );
          case "two-images":
            return (
              <div key={key} className={frame}>
                {controls}
                <TwoImages
                  sec={sec}
                  onPickImage={(slotId) =>
                    pickForSlot(
                      idx,
                      Number((slotId as any)?.split("_")[1]) - 1 || 0
                    )
                  }
                  onResetImage={(slotId) =>
                    resetSlot(
                      idx,
                      Number((slotId as any)?.split("_")[1]) - 1 || 0
                    )
                  }
                  readonly={readonly}
                />
              </div>
            );
          case "three-images":
            return (
              <div key={key} className={frame}>
                {controls}
                <ThreeImages
                  sec={sec}
                  onPickImage={(slotId) =>
                    pickForSlot(
                      idx,
                      Number((slotId as any)?.split("_")[1]) - 1 || 0
                    )
                  }
                  onResetImage={(slotId) =>
                    resetSlot(
                      idx,
                      Number((slotId as any)?.split("_")[1]) - 1 || 0
                    )
                  }
                  readonly={readonly}
                />
              </div>
            );
          case "full-width-image":
            return (
              <div key={key} className={frame}>
                {controls}
                <FullWidthImage
                  sec={sec}
                  onPickImage={() => pickForSlot(idx, 0)}
                  onResetImage={() => resetSlot(idx, 0)}
                  readonly={readonly}
                />
              </div>
            );
          case "full-width-text":
          default:
            return (
              <div key={key} className={frame}>
                {controls}
                <FullWidthText
                  sec={sec}
                  onChangeText={(v) =>
                    updateSection(idx, {
                      text: { ...(sec.text || {}), text: v },
                    })
                  }
                  readonly={readonly}
                />
              </div>
            );
        }
      })}
    </div>
  );
}

/* ------------------------------ Factory ------------------------------ */

export function makeSection(kind: SectionKind): Section {
  const base: Section = {
    id: uid(),
    type: kind,
    // smaller internal padding by default to reduce the perceived gap
    paddingY: "sm",
    bg: "none",
  };

  switch (kind) {
    case "image-left-text-right":
      return { ...base, images: [{ slotId: "left-1" }], text: { text: "" } };
    case "image-right-text-left":
      return { ...base, images: [{ slotId: "right-1" }], text: { text: "" } };
    case "full-width-image":
      return { ...base, images: [{ slotId: "fw-1" }] };
    case "two-images":
      return {
        ...base,
        images: [{ slotId: "slot_1" }, { slotId: "slot_2" }],
      };
    case "three-images":
      return {
        ...base,
        images: [
          { slotId: "slot_1" },
          { slotId: "slot_2" },
          { slotId: "slot_3" },
        ],
      };
    case "full-width-text":
    default:
      return { ...base, text: { text: "" } };
  }
}
