// src/modules/flow-layout/FlowComposer.tsx
"use client";

import * as React from "react";
import DOMPurify from "isomorphic-dompurify";
import CollectHeart from "@/components/CollectHeart";

/* ----------------------------- Tiptap ----------------------------- */
import { EditorContent, useEditor, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Heading from "@tiptap/extension-heading";
import TextStyle from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import { Extension } from "@tiptap/core";

/* ----------------------------- Types (UI) ----------------------------- */

export type SectionKind =
  | "full-width-image"
  | "image-left-text-right"
  | "image-right-text-left"
  | "two-images"
  | "three-images"
  | "full-width-text"
  | "aside-figure";

export type ImageSlot = {
  src?: string;
  alt?: string | null;
  caption?: string | null;
  galleryCaption?: string | null;
  href?: string | null;
  aspectRatio?: number;
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
  cssClass?: string;
  style?: React.CSSProperties;

  /** legacy align (not used by inline aside anymore) */
  align?: "left" | "right" | "center";
};

export type FlowComposerProps = {
  sections: Section[];
  onChange: (next: Section[]) => void;

  onPickImage?: (slotId: string) => Promise<ImageSlot>;
  debugFrames?: boolean;

  showToolbar?: boolean;
  showControls?: boolean;

  readonly?: boolean;

  siteId?: string | number;
};

/* ---------------------------- Constants / Utils ---------------------------- */

// Standard side image width used by your fixed two-column layout
const SIDE_W_PX = 480; // desktop standard
const SIZE_S_PX = 360;
const SIZE_M_PX = 480; // match two-column
const SIZE_L_PX = 520;

// Tiny inline SVG placeholder (3:4) at SIDE_W_PX
const ASIDE_PLACEHOLDER_DATA_URI =
  `data:image/svg+xml;utf8,` +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${SIDE_W_PX}' height='${Math.round(
      SIDE_W_PX * (4 / 3)
    )}' viewBox='0 0 ${SIDE_W_PX} ${Math.round(
      SIDE_W_PX * (4 / 3)
    )}'><defs><style>@media(prefers-color-scheme:dark){.bg{fill:#2b2b2b}.fg{fill:#9aa0a6}}</style></defs><rect class='bg' width='100%' height='100%' fill='#f1f3f4'/><g class='fg' fill='#9aa0a6'><rect x='${Math.round(
      SIDE_W_PX * 0.12
    )}' y='${Math.round(SIDE_W_PX * 0.12)}' width='${Math.round(
      SIDE_W_PX * 0.76
    )}' height='12' rx='6'/><circle cx='${SIDE_W_PX / 2}' cy='${Math.round(
      SIDE_W_PX * 0.72
    )}' r='${Math.round(SIDE_W_PX * 0.12)}'/></g></svg>`
  );

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
        setMinPx(undefined);
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
  siteId,
}: {
  slot: ImageSlot;
  sidePortraitLock?: boolean;
  onPick?: (slotId?: string) => void;
  onReset?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
  siteId?: string | number;
}) {
  const hasImg = !!slot.src;
  const lockedRatio = sidePortraitLock ? 3 / 4 : slot.aspectRatio;

  const hasRatio =
    typeof lockedRatio === "number" &&
    Number.isFinite(lockedRatio) &&
    lockedRatio > 0;

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

      {/* --- NEW: figcaption is the container, heart is positioned inside --- */}
      {(hasImg || displayCaption) && (
        <figcaption className="mt-2 relative min-h-[1.5rem]">
          {hasImg && siteId && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
              <CollectHeart
                variant="icon"
                size={22}
                siteId={siteId}
                imageUrl={slot.src || ""}
                altText={slot.alt || null}
                caption={displayCaption}
              />
            </div>
          )}
          {displayCaption ? (
            <span className="block text-sm text-gray-500 text-center px-7">
              {displayCaption}
            </span>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
}

/* --------------------------- Tiptap helpers --------------------------- */

const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attrs) => {
              if (!attrs.lineHeight) return {};
              return { style: `line-height:${attrs.lineHeight}` };
            },
          },
        },
      },
    ];
  },
});

/** Toolbar button helper */
function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded-md border ${
        active
          ? "bg-black text-white border-black"
          : "bg-white hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function Select({
  value,
  onChange,
  items,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  title?: string;
}) {
  return (
    <select
      title={title}
      className="px-2 py-1 text-xs rounded-md border bg-white"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {items.map((it) => (
        <option key={it.value} value={it.value}>
          {it.label}
        </option>
      ))}
    </select>
  );
}

/* --------------------------- Inline Text Block --------------------------- */

function InlineTextBlock({
  value,
  setValue,
  maxHeightPx,
  readonly,
  maxCharsSoft,
}: {
  value: string;
  setValue: (v: string) => void;
  maxHeightPx?: number;
  readonly?: boolean;
  maxCharsSoft?: number;
}) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const prevHtmlRef = React.useRef<string>(value || "");
  const [overflowFlash, setOverflowFlash] = React.useState(false);

  const editor = useEditor({
    editable: !readonly,
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3, 4] }),
      TextStyle,
      LineHeight,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      if (typeof maxCharsSoft === "number" && maxCharsSoft > 0) {
        const txt = editor.state.doc.textBetween(
          0,
          editor.state.doc.content.size,
          "\n"
        );
        if (txt.length > maxCharsSoft) {
          editor.commands.undo();
          flashOverflow();
          return;
        }
      }

      const html = editor.getHTML();
      const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      setValue(clean);

      if (typeof maxHeightPx === "number" && maxHeightPx > 0) {
        requestAnimationFrame(() => {
          const el = wrapRef.current;
          if (!el) return;

          const overflows = el.scrollHeight > el.clientHeight + 1;
          if (overflows) {
            editor.commands.undo();
            if (prevHtmlRef.current !== value) {
              setValue(prevHtmlRef.current);
            }
            flashOverflow();
          } else {
            prevHtmlRef.current = clean;
          }
        });
      } else {
        prevHtmlRef.current = clean;
      }
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== (current || "")) {
      editor.commands.setContent(value || "", false);
      prevHtmlRef.current = value || "";
    }
  }, [value, editor]);

  const flashOverflow = () => {
    setOverflowFlash(true);
    window.setTimeout(() => setOverflowFlash(false), 250);
  };

  const setLH = (lh: string) => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    const parentName = $from.parent.type.name;
    if (parentName === "heading") {
      editor
        .chain()
        .focus()
        .updateAttributes("heading", { lineHeight: lh })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .updateAttributes("paragraph", { lineHeight: lh })
        .run();
    }
  };

  const currentBlock = React.useMemo(() => {
    if (!editor) return "p";
    if (editor.isActive("heading", { level: 1 })) return "h1";
    if (editor.isActive("heading", { level: 2 })) return "h2";
    if (editor.isActive("heading", { level: 3 })) return "h3";
    if (editor.isActive("heading", { level: 4 })) return "h4";
    return "p";
  }, [editor, editor?.state?.selection?.from, editor?.state?.selection?.to]);

  const wrapperClass =
    "prose prose-gray max-w-none outline-none " +
    (!readonly
      ? "flow-editor-decor ring-1 ring-dashed ring-gray-300 rounded-lg"
      : "") +
    " text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0 prose-figure:my-0";

  return (
    <div
      ref={wrapRef}
      className={`${wrapperClass} ${overflowFlash ? "ring-red-400" : ""}`}
      style={{
        minHeight:
          typeof maxHeightPx === "number" && maxHeightPx > 0
            ? `${Math.max(120, maxHeightPx)}px`
            : undefined,
        maxHeight:
          typeof maxHeightPx === "number" && maxHeightPx > 0
            ? `${maxHeightPx}px`
            : undefined,
        overflow:
          typeof maxHeightPx === "number" && maxHeightPx > 0
            ? "hidden"
            : undefined,
        cursor: readonly ? "default" : "text",
        textAlign: "justify",
        textJustify: "inter-word",
        padding: !readonly ? "0.5rem" : undefined,
      }}
      data-editing={!readonly || undefined}
    >
      {editor?.isEditable && !readonly ? (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 150, placement: "top" }}
          shouldShow={({ editor }) =>
            editor.isFocused &&
            (editor.isActive("paragraph") || editor.isActive("heading"))
          }
          className="flex items-center gap-1 bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-lg p-1 z-50"
          data-edit-only
        >
          <Select
            title="Block type"
            value={currentBlock}
            onChange={(v) => {
              const chain = editor.chain().focus();
              if (v === "p") {
                chain.setParagraph().run();
              } else {
                const level = Number(v.replace("h", "")) as 1 | 2 | 3 | 4;
                chain.setHeading({ level }).run();
              }
            }}
            items={[
              { value: "p", label: "Paragraph" },
              { value: "h1", label: "H1" },
              { value: "h2", label: "H2" },
              { value: "h3", label: "H3" },
              { value: "h4", label: "H4" },
            ]}
          />

          <Btn
            title="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <span className="font-semibold">B</span>
          </Btn>
          <Btn
            title="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <span className="italic">I</span>
          </Btn>

          <Select
            title="Line height"
            value={"lh"}
            onChange={(v) => setLH(v)}
            items={[
              { value: "1.2", label: "LH 1.2" },
              { value: "1.5", label: "LH 1.5" },
              { value: "1.75", label: "LH 1.75" },
              { value: "2", label: "LH 2.0" },
            ]}
          />

          <Btn
            title="Add/Edit Link"
            onClick={() => {
              const previous = editor.getAttributes("link").href as
                | string
                | undefined;
              const url = window.prompt("Enter URL", previous || "https://");
              if (url === null) return;
              if (url.trim() === "") {
                editor.chain().focus().unsetLink().run();
                return;
              }
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url.trim() })
                .run();
            }}
          >
            Link
          </Btn>
          {editor.isActive("link") && (
            <Btn
              title="Remove Link"
              onClick={() => editor.chain().focus().unsetLink().run()}
            >
              Unlink
            </Btn>
          )}
        </BubbleMenu>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  );
}

/* --------------------------- Aside Rich Text (with image BubbleMenu) --------------------------- */

/** Custom image node with width + alignment + caption that renders as a <figure> with <img> and optional <figcaption>. */
const AsideImage = Image.extend({
  name: "asideImage",

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      widthPx: {
        default: SIDE_W_PX,
        parseHTML: (el) => {
          const v = el.getAttribute("data-width");
          return v ? Number(v) : SIDE_W_PX;
        },
        renderHTML: (attrs) => ({ "data-width": String(attrs.widthPx) }),
      },
      align: {
        default: "left", // "left" | "right" | "center"
        parseHTML: (el) => el.getAttribute("data-align") || "left",
        renderHTML: (attrs) => ({ "data-align": attrs.align }),
      },
      /** Per-article override caption (string) */
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-caption"),
        renderHTML: (attrs) =>
          attrs.caption ? { "data-caption": String(attrs.caption) } : {},
      },
      /** Copied from gallery on insert (string) */
      galleryCaption: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-gallery-caption"),
        renderHTML: (attrs) =>
          attrs.galleryCaption
            ? { "data-gallery-caption": String(attrs.galleryCaption) }
            : {},
      },
      class: { default: null },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const width = Number(HTMLAttributes["data-width"]) || SIDE_W_PX;
    const align = (HTMLAttributes["data-align"] as string) || "left";
    const cap =
      (HTMLAttributes["data-caption"] as string) ||
      (HTMLAttributes["data-gallery-caption"] as string) ||
      "";

    // Float the FIGURE, not the <img>, so caption sits under the image.
    let figureStyle = `width:${width}px; max-width:40%;`;
    if (align === "left") {
      figureStyle += "float:left; margin:0 1rem .6rem 0;";
    } else if (align === "right") {
      figureStyle += "float:right; margin:0 0 .6rem 1rem;";
    } else {
      figureStyle = `display:block; margin:.75rem auto; width:${width}px;`;
    }

    const figAttrs: any = {
      class: ["hop-inline-figure", HTMLAttributes.class]
        .filter(Boolean)
        .join(" "),
      style: figureStyle,
    };

    // Keep data-* on IMG so TipTap can parse them back into node attrs
    const imgAttrs: any = {
      src: HTMLAttributes.src,
      alt: HTMLAttributes.alt || "",
      style: "display:block; width:100%; height:auto; border-radius:10px;",
      "data-width": String(width),
      "data-align": align,
    };
    if (HTMLAttributes["data-caption"])
      imgAttrs["data-caption"] = HTMLAttributes["data-caption"];
    if (HTMLAttributes["data-gallery-caption"])
      imgAttrs["data-gallery-caption"] = HTMLAttributes["data-gallery-caption"];

    const children: any[] = [["img", imgAttrs]];
    if (cap && String(cap).trim().length) {
      children.push([
        "figcaption",
        { class: "hop-caption text-sm text-gray-500 text-center" },
        String(cap),
      ]);
    }
    return ["figure", figAttrs, ...children];
  },
});

function AsideRichTextEditor({
  value,
  setValue,
  onPickImage,
  readonly,
}: {
  value: string;
  setValue: (v: string) => void;
  onPickImage?: (slotId: string) => Promise<ImageSlot>;
  readonly?: boolean;
}) {
  const editor = useEditor({
    editable: !readonly,
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3, 4] }),
      TextStyle,
      LineHeight,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      AsideImage,
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // allow inline style, data-* attrs, and figure/figcaption wrapper
      const clean = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ALLOWED_TAGS: [
          "p",
          "a",
          "strong",
          "em",
          "u",
          "ul",
          "ol",
          "li",
          "blockquote",
          "br",
          "span",
          "img",
          "figure",
          "figcaption",
        ],
        ALLOWED_ATTR: [
          "href",
          "target",
          "rel",
          "style",
          "src",
          "alt",
          "title",
          "data-width",
          "data-align",
          "data-caption",
          "data-gallery-caption",
          "class",
        ],
      });
      setValue(clean);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== (current || "")) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  const pickAndInsertImage = async () => {
    if (!editor) return;
    let picked: ImageSlot | null = null;
    if (onPickImage) {
      picked = await onPickImage(`aside-inline-${Date.now()}`);
    } else {
      const src = window.prompt("Image URL") || "";
      if (!src.trim()) return;
      picked = { src, caption: null, galleryCaption: null };
    }
    if (!picked?.src) return;

    editor
      .chain()
      .focus()
      .setNode("asideImage", {
        src: picked.src,
        alt: picked.alt || "",
        widthPx: SIDE_W_PX,
        align: "left",
        caption: picked.caption || null,
        galleryCaption: picked.galleryCaption || picked.caption || null,
      })
      .run();
  };

  const setAlign = (align: "left" | "right" | "center") => {
    if (!editor) return;
    editor.chain().focus().updateAttributes("asideImage", { align }).run();
  };

  const setSize = (px: number) => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .updateAttributes("asideImage", { widthPx: px })
      .run();
  };

  const replaceImage = async () => {
    if (!editor) return;
    const attrs = editor.getAttributes("asideImage");
    let picked: ImageSlot | null = null;
    if (onPickImage) {
      picked = await onPickImage(`aside-replace-${Date.now()}`);
    } else {
      const src = window.prompt("New image URL", attrs?.src || "") || "";
      if (!src.trim()) return;
      picked = { src, caption: null, galleryCaption: null };
    }
    if (!picked?.src) return;
    editor
      .chain()
      .focus()
      .updateAttributes("asideImage", {
        src: picked.src,
        galleryCaption:
          picked.galleryCaption ||
          picked.caption ||
          attrs?.galleryCaption ||
          null,
      })
      .run();
  };

  const removeImage = () => {
    if (!editor) return;
    editor.chain().focus().deleteSelection().run();
  };

  const editCaption = () => {
    if (!editor) return;
    const attrs = editor.getAttributes("asideImage");
    const initial = (attrs?.caption as string) || "";
    const next = window.prompt(
      "Edit caption (leave blank to clear and fall back to gallery):",
      initial || ""
    );
    if (next === null) return;
    const caption = next.trim() ? next.trim() : null;
    editor.chain().focus().updateAttributes("asideImage", { caption }).run();
  };

  const revertCaption = () => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .updateAttributes("asideImage", { caption: null })
      .run();
  };

  const wrapperClass =
    "prose prose-gray max-w-none outline-none " +
    (!readonly
      ? "flow-editor-decor ring-1 ring-dashed ring-gray-300 rounded-lg"
      : "") +
    " text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0";

  return (
    <div>
      {!readonly && editor ? (
        <div
          className="mb-2 flex flex-wrap items-center gap-2 bg-white/95 border border-gray-200 shadow-sm rounded-lg p-1"
          data-edit-only
        >
          <Btn
            title="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <span className="font-semibold">B</span>
          </Btn>
          <Btn
            title="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <span className="italic">I</span>
          </Btn>
          <Btn title="Insert Image" onClick={pickAndInsertImage}>
            Insert Image
          </Btn>
        </div>
      ) : null}

      {/* Image BubbleMenu (only when image is selected) */}
      {!readonly && editor ? (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 120, placement: "top" }}
          shouldShow={({ editor }) => editor.isActive("asideImage")}
          className="flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-lg p-2 z-50"
          data-edit-only
        >
          <span className="text-[11px] text-gray-600 mr-1">Align</span>
          <Btn title="Left" onClick={() => setAlign("left")}>
            Left
          </Btn>
          <Btn title="Right" onClick={() => setAlign("right")}>
            Right
          </Btn>
          <Btn title="Center" onClick={() => setAlign("center")}>
            Center
          </Btn>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <span className="text-[11px] text-gray-600 mr-1">Size</span>
          <Btn title="Small" onClick={() => setSize(SIZE_S_PX)}>
            S
          </Btn>
          <Btn title="Medium (std)" onClick={() => setSize(SIZE_M_PX)}>
            M
          </Btn>
          <Btn title="Large" onClick={() => setSize(SIZE_L_PX)}>
            L
          </Btn>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <Btn title="Edit Caption" onClick={editCaption}>
            Edit
          </Btn>
          <Btn title="Revert to Gallery Caption" onClick={revertCaption}>
            Revert
          </Btn>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <Btn title="Replace Image" onClick={replaceImage}>
            Replace
          </Btn>
          <Btn title="Remove Image" onClick={removeImage}>
            Remove
          </Btn>
        </BubbleMenu>
      ) : null}

      <div
        className={wrapperClass}
        style={{
          padding: !readonly ? "0.5rem" : undefined,
          textAlign: "justify",
          textJustify: "inter-word",
        }}
        data-editing={!readonly || undefined}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/* --------------------------- Two-column UI --------------------------- */

const HANG_PX = 12;

function ImageLeftTextRight({
  sec,
  onChangeText,
  onPickImage,
  onResetImage,
  onOpenCaption,
  readonly,
  siteId,
}: {
  sec: Section;
  onChangeText: (text: string) => void;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
  siteId?: string | number;
}) {
  const img = (sec.images || [])[0] || { slotId: "left-1" };
  const imageColRef = React.useRef<HTMLDivElement | null>(null);
  const minPx = usePairHeightLock(imageColRef, true);
  const cap = typeof minPx === "number" ? minPx + HANG_PX : undefined;
  const html = sec.text?.text || "";

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
            siteId={siteId}
          />
        </div>
        <div className="md:col-span-7">
          {readonly ? (
            html ? (
              <div
                className="prose prose-gray max-w-none text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0 prose-figure:my-0"
                style={{
                  minHeight: typeof cap === "number" ? `${cap}px` : undefined,
                  textAlign: "justify",
                  textJustify: "inter-word",
                }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(html, {
                    USE_PROFILES: { html: true },
                  }),
                }}
              />
            ) : null
          ) : (
            <InlineTextBlock
              value={html}
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
  siteId,
}: {
  sec: Section;
  onChangeText: (text: string) => void;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
  siteId?: string | number;
}) {
  const img = (sec.images || [])[0] || { slotId: "right-1" };
  const imageColRef = React.useRef<HTMLDivElement | null>(null);
  const minPx = usePairHeightLock(imageColRef, true);
  const cap = typeof minPx === "number" ? minPx + HANG_PX : undefined;
  const html = sec.text?.text || "";

  return (
    <div className={wrapClass(sec)} style={sec.style}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-7 order-2 md:order-1">
          {readonly ? (
            html ? (
              <div
                className="prose prose-gray max-w-none text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0 prose-figure:my-0"
                style={{
                  minHeight: typeof cap === "number" ? `${cap}px` : undefined,
                  textAlign: "justify",
                  textJustify: "inter-word",
                }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(html, {
                    USE_PROFILES: { html: true },
                  }),
                }}
              />
            ) : null
          ) : (
            <InlineTextBlock
              value={html}
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
            siteId={siteId}
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
  siteId,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
  siteId?: string | number;
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
              siteId={siteId}
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
  siteId,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
  siteId?: string | number;
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
              siteId={siteId}
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
  siteId,
}: {
  sec: Section;
  onPickImage?: (slotId?: string) => void;
  onResetImage?: (slotId?: string) => void;
  onOpenCaption?: (slot: ImageSlot) => void;
  readonly?: boolean;
  siteId?: string | number;
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
        siteId={siteId}
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
  const html = sec.text?.text || "";
  return (
    <div className={wrapClass(sec)} style={sec.style}>
      {readonly ? (
        html ? (
          <div
            className="prose prose-gray max-w-none text-justify prose-p:my-0 prose-headings:my-0 prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-blockquote:my-0 prose-pre:my-0 prose-hr:my-0 prose-figure:my-0"
            style={{ textAlign: "justify", textJustify: "inter-word" }}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(html, {
                USE_PROFILES: { html: true },
              }),
            }}
          />
        ) : null
      ) : (
        <InlineTextBlock
          value={html}
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
      <button className={btn} onClick={() => onAdd("aside-figure")}>
        Aside (Rich Text + Inline Image)
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
  siteId,
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

  const onPickImageForSec = async (idx: number, slotIdx = 0) => {
    if (!onPickImage || readonly) return;
    const sec = sections[idx];
    const slotId =
      (sec.images?.[slotIdx]?.slotId as string) ||
      `${sec.type}-${idx}-${slotIdx}`;
    const picked = await onPickImage(slotId);
    if (!picked) return;

    const galleryCaption =
      typeof picked.caption === "string" && picked.caption.trim().length > 0
        ? picked.caption
        : null;

    const images = [...(sec.images || [])];
    images[slotIdx] = {
      ...images[slotIdx],
      ...picked,
      slotId,
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
      src: undefined,
      alt: null,
      href: null,
      aspectRatio: undefined,
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
          return { ...img, caption };
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

      <div className="[&>*]:mt-0 [&>*]:mb-0">
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
                    onPickImage={() => onPickImageForSec(idx, 0)}
                    onResetImage={() => resetSlot(idx, 0)}
                    onOpenCaption={openCaptionEditor}
                    readonly={readonly}
                    siteId={siteId}
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
                    onPickImage={() => onPickImageForSec(idx, 0)}
                    onResetImage={() => resetSlot(idx, 0)}
                    onOpenCaption={openCaptionEditor}
                    readonly={readonly}
                    siteId={siteId}
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
                      onPickImageForSec(
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
                    siteId={siteId}
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
                      onPickImageForSec(
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
                    siteId={siteId}
                  />
                </div>
              );
            case "full-width-image":
              return (
                <div key={key} className={frame}>
                  {controls}
                  <FullWidthImage
                    sec={sec}
                    onPickImage={() => onPickImageForSec(idx, 0)}
                    onResetImage={() => resetSlot(idx, 0)}
                    onOpenCaption={openCaptionEditor}
                    readonly={readonly}
                    siteId={siteId}
                  />
                </div>
              );
            case "aside-figure":
              return (
                <div key={key} className={frame}>
                  {controls}
                  <div className={wrapClass(sec)} style={sec.style}>
                    <AsideRichTextEditor
                      value={sec.text?.text || ""}
                      setValue={(html) =>
                        updateSection(idx, {
                          text: { ...(sec.text || {}), text: html },
                        })
                      }
                      onPickImage={onPickImage}
                      readonly={readonly}
                    />
                  </div>
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
    case "aside-figure":
      return {
        ...base,
        images: [{ slotId: "aside-1" }],
        // default: placeholder image left with standard width so text wraps immediately
        text: {
          text:
            `<p>` +
            `<figure class="hop-inline-figure" ` +
            `style="float:left; width:${SIDE_W_PX}px; max-width:40%; margin:0 1rem .6rem 0;">` +
            `<img src="${ASIDE_PLACEHOLDER_DATA_URI}" alt="" ` +
            `data-width="${SIDE_W_PX}" data-align="left" ` +
            `style="display:block; width:100%; height:auto; border-radius:10px;" />` +
            `<figcaption class="hop-caption text-sm text-gray-500 text-center"></figcaption>` +
            `</figure>` +
            `Write your text here…</p>`,
        },
      };
    case "full-width-text":
    default:
      return { ...base, text: { text: "" } };
  }
}
