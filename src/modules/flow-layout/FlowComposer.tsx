// src/modules/flow-layout/FlowComposer.tsx
"use client";

import * as React from "react";

/* ----------------------------- Types ----------------------------- */

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
  aspectRatio?: number; // e.g. 1.777 for 16:9
  /** composite slot key */
  slotId?: string;
};

export type TextSlot = {
  html?: string;
  text?: string;
};

export type Section = {
  id?: string;
  type: SectionKind;
  images?: ImageSlot[];
  text?: TextSlot;
  paddingY?: "none" | "sm" | "md" | "lg";
  bg?: "none" | "muted";
  /** Added: catalog-provided classes & inline style */
  cssClass?: string;
  style?: React.CSSProperties;
};

export type FlowComposerProps = {
  sections?: Section[] | null;
  debugFrames?: boolean;

  /** Adapter mode */
  masterText?: string;
  template?: {
    id: string;
    name?: string;
    sections: Array<{ sectionTypeId: string }>;
  };
  sectionCatalog?: Record<
    string,
    {
      cssClass?: string;
      style?: React.CSSProperties;
      blocks: Array<
        | {
            id: string;
            kind: "text";
            acceptsTextFlow?: boolean;
            textPolicy?: { targetWords?: number };
          }
        | { id: string; kind: "image"; imageSlotId: string }
      >;
    }
  >;

  onPickImage?: (slotId: string) => Promise<ImageSlot>;
  initialPickedBySlot?: Record<string, ImageSlot>;
  onPickedChange?: (map: Record<string, ImageSlot>) => void;
};

/* ---------------------------- Utilities ---------------------------- */

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
      return "py-8";
  }
}

function panel(bg?: Section["bg"]) {
  return bg === "muted"
    ? "bg-white shadow-sm border border-gray-200 rounded-2xl"
    : "";
}

/** Combine base panel/padding with catalog cssClass; inline `style` comes from sec.style */
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

/** Image figure with overlay controls when an image exists */
function Figure({
  slot,
  onPick,
  onReset,
}: {
  slot: ImageSlot;
  onPick?: (slotId?: string) => void;
  onReset?: (slotId?: string) => void;
}) {
  const hasImg = !!slot.src;
  const wrap =
    typeof slot.aspectRatio === "number" && slot.aspectRatio > 0
      ? { paddingTop: `${(1 / slot.aspectRatio) * 100}%` }
      : null;

  return (
    <figure className="w-full group">
      <div
        className={`relative w-full overflow-hidden rounded-xl ${
          hasImg ? "" : "bg-gray-50"
        }`}
        style={wrap || undefined}
      >
        {hasImg ? (
          <>
            {slot.href ? (
              <a
                href={slot.href || undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={slot.src}
                  alt={slot.alt || ""}
                  className="w-full h-full object-cover rounded-xl"
                  style={wrap ? { position: "absolute", inset: 0 } : undefined}
                  loading="lazy"
                />
              </a>
            ) : (
              <img
                src={slot.src}
                alt={slot.alt || ""}
                className="w-full h-full object-cover rounded-xl"
                style={wrap ? { position: "absolute", inset: 0 } : undefined}
                loading="lazy"
              />
            )}

            {(onPick || onReset) && (
              <div
                className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                style={wrap ? { zIndex: 1 } : undefined}
              >
                {onPick && (
                  <button
                    type="button"
                    onClick={() => onPick(slot.slotId)}
                    className="px-2.5 py-1.5 rounded-md bg-black/75 text-white text-xs backdrop-blur hover:bg-black"
                  >
                    Change
                  </button>
                )}
                {onReset && (
                  <button
                    type="button"
                    onClick={() => onReset(slot.slotId)}
                    className="px-2.5 py-1.5 rounded-md bg-white/85 text-gray-800 text-xs border hover:bg-white"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <Placeholder minH={wrap ? 0 : 260}>
            <div className="flex items-center gap-3">
              <span className="text-sm">Empty slot</span>
              {onPick ? (
                <button
                  className="px-3 py-1.5 rounded-full bg-black text-white text-xs"
                  onClick={() => onPick(slot.slotId)}
                >
                  Pick image
                </button>
              ) : null}
            </div>
          </Placeholder>
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

function Prose({ text }: { text?: TextSlot }) {
  if (!text) return null;
  if (text.html) {
    return (
      <div
        className="prose prose-gray max-w-none"
        dangerouslySetInnerHTML={{ __html: text.html }}
      />
    );
  }
  if (text.text) {
    return (
      <div className="prose prose-gray max-w-none whitespace-pre-wrap">
        {text.text}
      </div>
    );
  }
  return null;
}

/* --------------------------- Archetypes --------------------------- */

function FullWidthImage(props: any) {
  const img = props.sec.images?.[0];
  return (
    <div className={wrapClass(props.sec)} style={props.sec.style}>
      {img ? (
        <Figure
          slot={img}
          onPick={props.onPickImage}
          onReset={props.onResetImage}
        />
      ) : (
        <Placeholder>Image</Placeholder>
      )}
    </div>
  );
}

function ImageLeftTextRight(props: any) {
  const img = props.sec.images?.[0];
  return (
    <div className={wrapClass(props.sec)} style={props.sec.style}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-5">
          {img ? (
            <Figure
              slot={img}
              onPick={props.onPickImage}
              onReset={props.onResetImage}
            />
          ) : (
            <Placeholder>Image</Placeholder>
          )}
        </div>
        <div className="md:col-span-7">
          <Prose text={props.sec.text} />
        </div>
      </div>
    </div>
  );
}

function ImageRightTextLeft(props: any) {
  const img = props.sec.images?.[0];
  return (
    <div className={wrapClass(props.sec)} style={props.sec.style}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-7 order-2 md:order-1">
          <Prose text={props.sec.text} />
        </div>
        <div className="md:col-span-5 order-1 md:order-2">
          {img ? (
            <Figure
              slot={img}
              onPick={props.onPickImage}
              onReset={props.onResetImage}
            />
          ) : (
            <Placeholder>Image</Placeholder>
          )}
        </div>
      </div>
    </div>
  );
}

function TwoImages(props: any) {
  const imgs = (props.sec.images || []).slice(0, 2);
  return (
    <div className={wrapClass(props.sec)} style={props.sec.style}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {imgs.map((s: any, i: number) => (
          <Figure
            key={i}
            slot={s}
            onPick={props.onPickImage}
            onReset={props.onResetImage}
          />
        ))}
      </div>
    </div>
  );
}

function ThreeImages(props: any) {
  const imgs = (props.sec.images || []).slice(0, 3);
  return (
    <div className={wrapClass(props.sec)} style={props.sec.style}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {imgs.map((s: any, i: number) => (
          <Figure
            key={i}
            slot={s}
            onPick={props.onPickImage}
            onReset={props.onResetImage}
          />
        ))}
      </div>
    </div>
  );
}

function FullWidthText({ sec }: { sec: Section }) {
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <Prose text={sec.text} />
    </div>
  );
}

/* ---------------------- Adapter helpers ---------------------- */

function detectKind(blocks: Array<any>): SectionKind {
  const imgs = blocks.filter((b) => b.kind === "image").length;
  const txts = blocks.filter((b) => b.kind === "text").length;

  if (imgs === 0 && txts === 1) return "full-width-text";
  if (imgs === 1 && txts === 0) return "full-width-image";
  if (imgs === 2 && txts === 0) return "two-images";
  if (imgs === 3 && txts === 0) return "three-images";

  if (blocks.length === 2) {
    const [a, b] = blocks;
    if (a.kind === "image" && b.kind === "text") return "image-left-text-right";
    if (a.kind === "text" && b.kind === "image") return "image-right-text-left";
  }
  return "full-width-text";
}

function makeSectionsFromTemplate(opts: {
  masterText?: string;
  template: FlowComposerProps["template"];
  sectionCatalog: NonNullable<FlowComposerProps["sectionCatalog"]>;
  pickedImages: Record<string, ImageSlot>;
}): Section[] {
  const { masterText = "", template, sectionCatalog, pickedImages } = opts;

  const tokens = masterText
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  let cursor = 0;
  const takeWords = (n?: number) => {
    const k =
      !n || n <= 0
        ? tokens.length - cursor
        : Math.min(n, tokens.length - cursor);
    const slice = tokens.slice(cursor, cursor + k).join(" ");
    cursor += k;
    return slice;
  };

  const out: Section[] = [];

  template!.sections.forEach((seg, idx) => {
    const cat = sectionCatalog[seg.sectionTypeId];
    if (!cat) return;

    const instanceKey = `${template!.id}:${idx}`;

    const kind = detectKind(cat.blocks);
    const images: ImageSlot[] = [];
    let text: TextSlot | undefined;

    cat.blocks.forEach((b) => {
      if (b.kind === "image") {
        const composite = `${instanceKey}:${b.imageSlotId}`;
        const chosen =
          pickedImages[composite] ?? pickedImages[b.imageSlotId] ?? undefined;
        images.push({
          slotId: composite,
          src: chosen?.src,
          alt: chosen?.alt ?? null,
          caption: chosen?.caption ?? null,
          href: chosen?.href ?? null,
        });
      } else if (b.kind === "text") {
        const body = takeWords(b.textPolicy?.targetWords);
        text = { text: body };
      }
    });

    out.push({
      id: instanceKey,
      type: kind,
      images,
      text,
      paddingY: "md",
      bg: "none",
      cssClass: cat.cssClass,
      style: cat.style, // <- critical: inline spacing/background from catalog
    });
  });

  return out;
}

/* ------------------------------ Root ------------------------------ */

export default function FlowComposer(props: FlowComposerProps) {
  const {
    sections,
    debugFrames,

    masterText,
    template,
    sectionCatalog,
    onPickImage,

    initialPickedBySlot,
    onPickedChange,
  } = props;

  const classicList: Section[] = Array.isArray(sections)
    ? (sections.filter(Boolean) as Section[])
    : [];

  const [pickedBySlot, setPickedBySlot] = React.useState<
    Record<string, ImageSlot>
  >(() => initialPickedBySlot || {});

  /** Hydrate once per template id + initial picks */
  const didHydrateRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const tplKey = template?.id ?? "no-template";
    const initKey = JSON.stringify(initialPickedBySlot || {});
    const key = `${tplKey}|${initKey}`;
    if (didHydrateRef.current !== key) {
      if (initialPickedBySlot) setPickedBySlot(initialPickedBySlot);
      didHydrateRef.current = key;
    }
  }, [template?.id, JSON.stringify(initialPickedBySlot || {})]);

  /** Notify parent only when map truly changes */
  const lastSentRef = React.useRef<string>("");
  React.useEffect(() => {
    if (!onPickedChange) return;
    const current = JSON.stringify(pickedBySlot);
    if (current !== lastSentRef.current) {
      lastSentRef.current = current;
      onPickedChange(pickedBySlot);
    }
  }, [pickedBySlot, onPickedChange]);

  const adapterList: Section[] = React.useMemo(() => {
    if (!template || !sectionCatalog) return [];
    return makeSectionsFromTemplate({
      masterText,
      template,
      sectionCatalog,
      pickedImages: pickedBySlot,
    });
  }, [
    masterText,
    template?.id,
    JSON.stringify(template?.sections),
    sectionCatalog,
    pickedBySlot,
  ]);

  const list = classicList.length ? classicList : adapterList;

  const handlePick = async (slotId?: string) => {
    if (!slotId || !onPickImage) return;
    const picked = await onPickImage(slotId);
    if (!picked) return;
    setPickedBySlot((m) => ({ ...m, [slotId]: { ...picked, slotId } }));
  };

  const handleReset = (slotId?: string) => {
    if (!slotId) return;
    setPickedBySlot((m) => {
      if (!(slotId in m)) return m;
      const copy = { ...m };
      delete copy[slotId];
      return copy;
    });
  };

  if (list.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        {debugFrames ? "No sections in this template yet." : null}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {list.map((sec, idx) => {
        const key = sec.id || `${sec.type}-${idx}`;
        const wrapCls = debugFrames
          ? "relative ring-1 ring-dashed ring-emerald-300 rounded-xl p-1"
          : "";

        switch (sec.type) {
          case "full-width-image":
            return (
              <div key={key} className={wrapCls}>
                <FullWidthImage
                  sec={sec}
                  onPickImage={handlePick}
                  onResetImage={handleReset}
                />
              </div>
            );
          case "image-left-text-right":
            return (
              <div key={key} className={wrapCls}>
                <ImageLeftTextRight
                  sec={sec}
                  onPickImage={handlePick}
                  onResetImage={handleReset}
                />
              </div>
            );
          case "image-right-text-left":
            return (
              <div key={key} className={wrapCls}>
                <ImageRightTextLeft
                  sec={sec}
                  onPickImage={handlePick}
                  onResetImage={handleReset}
                />
              </div>
            );
          case "two-images":
            return (
              <div key={key} className={wrapCls}>
                <TwoImages
                  sec={sec}
                  onPickImage={handlePick}
                  onResetImage={handleReset}
                />
              </div>
            );
          case "three-images":
            return (
              <div key={key} className={wrapCls}>
                <ThreeImages
                  sec={sec}
                  onPickImage={handlePick}
                  onResetImage={handleReset}
                />
              </div>
            );
          case "full-width-text":
            return (
              <div key={key} className={wrapCls}>
                <FullWidthText sec={sec} />
              </div>
            );
          default:
            return <div key={key} />;
        }
      })}
    </div>
  );
}
