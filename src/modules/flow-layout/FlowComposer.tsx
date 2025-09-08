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
  caption?: string | null; // per-article override
  galleryCaption?: string | null; // inherited from gallery at pick time (fallback)
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

/** vertical padding inside a section (default: none) */
function padY(cls?: Section["paddingY"]) {
  switch (cls) {
    case "sm":
      return "py-4";
    case "md":
      return "py-6";
    case "lg":
      return "py-12";
    case "none":
    default:
      return "";
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

/* --------------------------- Shared helpers --------------------------- */

function effectiveCaption(slot: ImageSlot): string | null {
  // Prefer per-article override; otherwise fall back to gallery caption.
  const c = (slot.caption ?? "").trim();
  if (c) return c;
  const g = (slot.galleryCaption ?? "").trim();
  return g || null;
}

/* --------------------------- Caption Modal --------------------------- */

function CaptionModal({
  initial,
  galleryCaption,
  onSave,
  onCancel,
  onRevert,
}: {
  initial: string;
  galleryCaption?: string | null;
  onSave: (value: string | null) => void;
  onCancel: () => void;
  onRevert?: () => void;
}) {
  const [value, setValue] = React.useState<string>(initial);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      data-edit-only
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            Edit Image Caption
          </h3>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            rows={4}
            placeholder="Add a caption (per-article override)…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {typeof galleryCaption === "string" && galleryCaption.trim() ? (
            <div className="text-xs text-gray-500">
              Gallery caption: <em>{galleryCaption}</em>
            </div>
          ) : null}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2 justify-end">
          {onRevert ? (
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={() => onRevert()}
              title="Use gallery caption instead"
            >
              Revert to Gallery
            </button>
          ) : null}
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={() => onCancel()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md bg-black text-white hover:bg-gray-900"
            onClick={() => onSave(value.trim() ? value.trim() : null)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Image Figure --------------------------- */

// simple inline pencil icon (no external deps)
function PencilIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-9.193 9.193a2 2 0 01-.878.503l-3.12.78a.5.5 0 01-.606-.606l.78-3.12a2 2 0 01.503-.878l9.193-9.193zM12.172 5l2.828 2.828" />
    </svg>
  );
}

function Figure({
  slot,
  sidePortraitLock = false,
  onPick,
  onReset,
  onOpenCaption,
  readonly,
}: {
  slot: ImageSlot;
  sidePortraitLock?: boolean;
  onPick?: (slotId?: string) => void;
  onReset?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
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

  const displayCaption = effectiveCaption(slot);

  return (
    <figure className="w-full group m-0">
      {" "}
      {/* margin reset to kill section gaps */}
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

        {!readonly && (onPick || onReset || onOpenCaption) && (
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
                {hasImg ? "Change" : "Pick"}
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
            {hasImg && onOpenCaption && (
              <button
                type="button"
                onClick={() => onOpenCaption?.(slot)}
                className="px-2 py-1.5 rounded-md bg-white/90 text-gray-800 text-xs border hover:bg-white inline-flex items-center gap-1"
                title="Edit caption"
              >
                <PencilIcon className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>
        )}
      </div>
      {/* PUBLIC CAPTION (override -> fallback) */}
      {displayCaption ? (
        <figcaption className="mt-2 text-sm text-gray-500 text-center">
          {displayCaption}
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
      } text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0 prose-figure:my-0`}
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
        textAlign: "justify",
        textJustify: "inter-word",
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
  onOpenCaption,
  readonly,
}: {
  sec: Section;
  onChangeText: (text: string) => void;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
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
            onOpenCaption={onOpenCaption}
            readonly={readonly}
          />
        </div>
        <div className="md:col-span-7">
          {readonly ? (
            textVal ? (
              <div
                className="prose prose-gray max-w-none whitespace-pre-wrap text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0 prose-figure:my-0"
                style={{
                  minHeight: typeof cap === "number" ? `${cap}px` : undefined,
                  textAlign: "justify",
                  textJustify: "inter-word",
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
  onOpenCaption,
  readonly,
}: {
  sec: Section;
  onChangeText: (text: string) => void;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
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
                className="prose prose-gray max-w-none whitespace-pre-wrap text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0 prose-figure:my-0"
                style={{
                  minHeight: typeof cap === "number" ? `${cap}px` : undefined,
                  textAlign: "justify",
                  textJustify: "inter-word",
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
            onOpenCaption={onOpenCaption}
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
  onOpenCaption,
  readonly,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
}) {
  const imgs = (sec.images || []).slice(0, 2);
  const ensure = (i: number) => imgs[i] || { slotId: `slot_${i + 1}` };
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => {
          const img = ensure(i);
          return (
            <Figure
              key={i}
              slot={img}
              onPick={onPickImage}
              onReset={onResetImage}
              onOpenCaption={onOpenCaption}
              readonly={readonly}
            />
          );
        })}
      </div>
    </div>
  );
}

function ThreeImages({
  sec,
  onPickImage,
  onResetImage,
  onOpenCaption,
  readonly,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
}) {
  const imgs = (sec.images || []).slice(0, 3);
  const ensure = (i: number) => imgs[i] || { slotId: `slot_${i + 1}` };
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => {
          const img = ensure(i);
          return (
            <Figure
              key={i}
              slot={img}
              onPick={onPickImage}
              onReset={onResetImage}
              onOpenCaption={onOpenCaption}
              readonly={readonly}
            />
          );
        })}
      </div>
    </div>
  );
}

function FullWidthImage({
  sec,
  onPickImage,
  onResetImage,
  onOpenCaption,
  readonly,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
}) {
  const img = (sec.images || [])[0] || { slotId: "fw-1" };
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <Figure
        slot={img}
        onPick={onPickImage}
        onReset={onResetImage}
        onOpenCaption={onOpenCaption}
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
          <div
            className="prose prose-gray max-w-none whitespace-pre-wrap text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0 prose-figure:my-0"
            style={{
              textAlign: "justify",
              textJustify: "inter-word",
            }}
          >
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
  const [captionEdit, setCaptionEdit] = React.useState<{
    slotId?: string;
    initial: string;
    gallery?: string | null;
  } | null>(null);

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

  // Helper: update a specific image slot within a section
  const patchSlot = (
    secIdx: number,
    slotIdx: number,
    patch: Partial<ImageSlot>
  ) => {
    const sec = sections[secIdx];
    const imgs = [...(sec.images || [])];
    imgs[slotIdx] = { ...(imgs[slotIdx] || {}), ...patch };
    updateSection(secIdx, { images: imgs });
  };

  const pickForSlot = async (idx: number, slotIdx = 0) => {
    if (!onPickImage || readonly) return;
    const sec = sections[idx];
    const slotId =
      (sec.images?.[slotIdx]?.slotId as string) ||
      `${sec.type}-${idx}-${slotIdx}`;
    const picked = await onPickImage(slotId);
    if (!picked) return;

    // Capture gallery caption as fallback at pick time.
    const galleryCaption =
      typeof picked.caption === "string" && picked.caption.trim().length > 0
        ? picked.caption
        : null;

    const images = [...(sec.images || [])];
    images[slotIdx] = {
      ...images[slotIdx],
      ...picked,
      slotId,
      // Set both: override defaults to gallery caption initially.
      caption: galleryCaption,
      galleryCaption,
    };
    updateSection(idx, { images });
  };

  const resetSlot = (idx: number, slotIdx = 0) => {
    if (readonly) return;
    const sec = sections[idx];
    const prev = (sec.images || [])[slotIdx];
    const images = [...(sec.images || [])];
    images[slotIdx] = {
      slotId: prev?.slotId || undefined,
      // wipe image data
      src: undefined,
      alt: null,
      href: null,
      aspectRatio: undefined,
      // captions cleared
      caption: null,
      galleryCaption: null,
    };
    updateSection(idx, { images });
  };

  const setSlotCaptionById = (
    slotId: string | undefined,
    caption: string | null
  ) => {
    if (!slotId) return;
    const next = sections.map((sec) => {
      if (!sec.images?.length) return sec;
      let changed = false;
      const imgs = sec.images.map((img) => {
        if (img.slotId === slotId) {
          changed = true;
          return { ...img, caption }; // null -> fallback to gallery on render
        }
        return img;
      });
      return changed ? { ...sec, images: imgs } : sec;
    });
    onChange(next);
  };

  const revertSlotCaptionById = (slotId: string | undefined) => {
    if (!slotId) return;
    const next = sections.map((sec) => {
      if (!sec.images?.length) return sec;
      let changed = false;
      const imgs = sec.images.map((img) => {
        if (img.slotId === slotId) {
          changed = true;
          return { ...img, caption: null };
        }
        return img;
      });
      return changed ? { ...sec, images: imgs } : sec;
    });
    onChange(next);
  };

  const openCaptionEditor = (slot: ImageSlot) => {
    const initial = (slot.caption ?? "") || "";
    setCaptionEdit({
      slotId: slot.slotId,
      initial,
      gallery: slot.galleryCaption ?? null,
    });
  };

  const closeCaptionEditor = () => setCaptionEdit(null);

  if (!Array.isArray(sections)) {
    return null;
  }

  return (
    <>
      {/* Caption modal (editor-only) */}
      {!readonly && captionEdit ? (
        <CaptionModal
          initial={captionEdit.initial}
          galleryCaption={captionEdit.gallery ?? ""}
          onCancel={closeCaptionEditor}
          onRevert={() => {
            revertSlotCaptionById(captionEdit.slotId);
            closeCaptionEditor();
          }}
          onSave={(val) => {
            setSlotCaptionById(captionEdit.slotId, val);
            closeCaptionEditor();
          }}
        />
      ) : null}

      {/* ZERO spacing between section wrappers */}
      <div className="[&>*]:mt-0 [&>*]:mb-0">
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
                    onOpenCaption={openCaptionEditor}
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
                    onOpenCaption={openCaptionEditor}
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
                    onOpenCaption={openCaptionEditor}
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
                    onOpenCaption={openCaptionEditor}
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
                    onOpenCaption={openCaptionEditor}
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
    </>
  );
}

/* ------------------------------ Factory ------------------------------ */

export function makeSection(kind: SectionKind): Section {
  const base: Section = {
    id: uid(),
    type: kind,
    // NO internal padding by default (fully tight). You can change per-section via paddingY.
    paddingY: "none",
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
