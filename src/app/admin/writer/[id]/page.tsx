// src/app/admin/writer/[id]/page.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import {
  getDocument,
  updateDocument,
  WriterDocument,
} from "@/lib/writer";

// Tiptap
import {
  BubbleMenu,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import History from "@tiptap/extension-history";
import Link2 from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Extension } from "@tiptap/core";

/* ─────────────────────────────────────────────────────────────────
   FontSize custom extension (TextStyle attribute carrier)
───────────────────────────────────────────────────────────────── */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            renderHTML: (attrs) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
            parseHTML: (el) =>
              (el as HTMLElement).style.fontSize || null,
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

/* ─────────────────────────────────────────────────────────────────
   LineHeight custom extension
───────────────────────────────────────────────────────────────── */
const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            renderHTML: (attrs) =>
              attrs.lineHeight
                ? { style: `line-height: ${attrs.lineHeight}` }
                : {},
            parseHTML: (el) =>
              (el as HTMLElement).style.lineHeight || null,
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ commands }: any) =>
          commands.updateAttributes("paragraph", { lineHeight }),
    } as any;
  },
});

/* ─────────────────────────────────────────────────────────────────
   Resizable + Alignable Image (carried over from notebook)
───────────────────────────────────────────────────────────────── */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const ResizableImageComponent: React.FC<NodeViewProps> = (props) => {
  const { node, updateAttributes, selected } = props;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const width = node.attrs.width as number | null | undefined;
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string) || "";
  const display = (node.attrs.display as "inline" | "block") || "block";
  const align = (node.attrs.align as "left" | "center" | "right" | null) || null;

  function scheduleWidthUpdate(newWidth: number) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      updateAttributes({ width: newWidth });
      rafRef.current = null;
    });
  }

  function beginResize(clientXStart: number) {
    const el = imgRef.current;
    if (!el) return;
    const startWidth = el.getBoundingClientRect().width;
    const onMove = (ev: MouseEvent) => {
      const newWidth = clamp(Math.round(startWidth + (ev.clientX - clientXStart)), 60, 2000);
      scheduleWidthUpdate(newWidth);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const wrapperStyle: React.CSSProperties = { lineHeight: 0 };
  if (display === "inline") {
    wrapperStyle.display = "inline-block";
    if (align === "left") { wrapperStyle.float = "left"; wrapperStyle.margin = "0 12px 6px 0"; }
    else if (align === "right") { wrapperStyle.float = "right"; wrapperStyle.margin = "0 0 6px 12px"; }
    else if (align === "center") { wrapperStyle.display = "block"; wrapperStyle.textAlign = "center"; wrapperStyle.float = "none"; wrapperStyle.margin = "8px 0"; }
  } else {
    wrapperStyle.display = "block"; wrapperStyle.clear = "both"; wrapperStyle.margin = "8px 0";
  }

  return (
    <NodeViewWrapper as="span" className={`resizable-image ${selected ? "is-selected" : ""}`} contentEditable={false} style={wrapperStyle}>
      <span className="ri-box inline-block relative" style={{ lineHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt={alt} style={{ width: width ? `${width}px` : "auto", maxWidth: "100%", height: "auto", display: "block", borderRadius: 2 }} />
        {selected && (
          <span
            className="ri-handle ri-handle-se"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); beginResize(e.clientX); }}
            title="Drag to resize"
          />
        )}
      </span>
    </NodeViewWrapper>
  );
};

const ResizableImage = ImageExt.extend({
  name: "image",
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) => attrs.width ? { style: `width:${attrs.width}px` } : {},
        parseHTML: (el) => { const m = ((el as HTMLElement).getAttribute("style") || "").match(/width:\s*([\d.]+)px/); return m ? Number(m[1]) : null; },
      },
      display: {
        default: "block",
        renderHTML: (attrs) => ({ "data-display": attrs.display }),
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-display") || "block",
      },
      align: {
        default: null,
        renderHTML: (attrs) => attrs.align ? { "data-align": attrs.align } : {},
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-align") || null,
      },
    };
  },
  addNodeView() { return ReactNodeViewRenderer(ResizableImageComponent); },
});

/* ─────────────────────────────────────────────────────────────────
   Skeleton components
───────────────────────────────────────────────────────────────── */
function ToolbarSkeleton() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-200 bg-white">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="h-7 rounded bg-gray-200 animate-pulse" style={{ width: i % 5 === 0 ? 72 : 28 }} />
      ))}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex-1 overflow-auto bg-gray-100 py-10 px-4">
      <div className="mx-auto bg-white shadow-lg rounded-sm" style={{ maxWidth: 816, minHeight: 400, padding: "72px 96px" }}>
        <div className="space-y-3 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-4 bg-gray-200 rounded w-4/5" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Save status badge
───────────────────────────────────────────────────────────────── */
type SaveStatus = "saved" | "saving" | "unsaved" | "error";

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "saved") return (
    <span className="flex items-center gap-1 text-xs text-emerald-600">
      <Icon name="check-circle" size={13} /> Saved
    </span>
  );
  if (status === "saving") return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
      Saving…
    </span>
  );
  if (status === "unsaved") return (
    <span className="text-xs text-amber-500">Unsaved</span>
  );
  return <span className="text-xs text-red-500">Save failed</span>;
}

/* ─────────────────────────────────────────────────────────────────
   Divider
───────────────────────────────────────────────────────────────── */
function Divider() {
  return <div className="h-5 w-px bg-gray-200 mx-0.5 flex-shrink-0" />;
}

/* ─────────────────────────────────────────────────────────────────
   ToolbarButton
───────────────────────────────────────────────────────────────── */
const ToolbarButton = React.memo(function ToolbarButton({
  active, onClick, title, children, disabled = false,
}: {
  active?: boolean; onClick: () => void; title: string;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors flex-shrink-0 ${
        active ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
});

/* ─────────────────────────────────────────────────────────────────
   Link modal
───────────────────────────────────────────────────────────────── */
function LinkModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = editor.getAttributes("link").href || "";
  const [url, setUrl] = useState(existing);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  function apply() {
    const trimmed = url.trim();
    if (!trimmed) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); }
    else { editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed, target: "_blank" }).run(); }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-5 w-96" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Insert Link</h3>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(); if (e.key === "Escape") onClose(); }}
          placeholder="https://example.com"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 mb-3"
        />
        <div className="flex gap-2 justify-end">
          {existing && (
            <button onClick={() => { editor.chain().focus().unsetLink().run(); onClose(); }}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition">
              Remove
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
          <button onClick={apply} className="px-4 py-1.5 text-sm text-white rounded-lg transition hover:opacity-90" style={{ backgroundColor: "var(--brand-green)" }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Image URL modal
───────────────────────────────────────────────────────────────── */
function ImageModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function apply() {
    const trimmed = url.trim();
    if (trimmed) editor.chain().focus().setImage({ src: trimmed }).run();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-5 w-96" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Insert Image</h3>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(); if (e.key === "Escape") onClose(); }}
          placeholder="https://example.com/image.jpg"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 mb-3"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
          <button onClick={apply} className="px-4 py-1.5 text-sm text-white rounded-lg transition hover:opacity-90" style={{ backgroundColor: "var(--brand-green)" }}>Insert</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Image Bubble Menu
───────────────────────────────────────────────────────────────── */
function ImageBubbleMenu({ editor }: { editor: Editor }) {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const h = () => forceUpdate({});
    editor.on("transaction", h);
    return () => { editor.off("transaction", h); };
  }, [editor]);

  const attrs = editor.getAttributes("image");
  const display: "inline" | "block" = attrs.display || "block";
  const align: "left" | "center" | "right" | null = attrs.align || null;

  const setDisplay = (mode: "inline" | "block") => {
    const patch: any = { display: mode };
    if (mode === "block") patch.align = null;
    editor.chain().focus().updateAttributes("image", patch).run();
  };
  const setAlign = (a: "left" | "center" | "right") => {
    if (display === "inline") editor.chain().focus().updateAttributes("image", { align: a }).run();
  };

  return (
    <BubbleMenu editor={editor} pluginKey="img-bubble"
      shouldShow={({ editor }) => editor.isActive("image")}
      tippyOptions={{ placement: "top", offset: [0, 8], zIndex: 9999 }}
    >
      <div className="rounded-xl bg-white shadow-xl ring-1 ring-black/10 p-1 flex items-center gap-1">
        {(["inline", "block"] as const).map((m) => (
          <button key={m} onMouseDown={(e) => e.preventDefault()} onClick={() => setDisplay(m)}
            className={`px-2 h-7 rounded text-xs font-medium transition ${display === m ? "bg-gray-200 text-gray-900" : "hover:bg-gray-100 text-gray-600"}`}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        {(["left", "center", "right"] as const).map((a) => (
          <button key={a} onMouseDown={(e) => e.preventDefault()} onClick={() => setAlign(a)}
            disabled={display !== "inline"}
            className={`h-7 w-7 rounded inline-flex items-center justify-center transition ${align === a && display === "inline" ? "bg-gray-200 text-gray-900" : "hover:bg-gray-100 text-gray-600"} disabled:opacity-30`}
            title={`Align ${a}`}>
            <Icon name={`align-${a}`} size={13} />
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Selection BubbleMenu (quick formatting on text selection)
───────────────────────────────────────────────────────────────── */
function SelectionBubbleMenu({ editor, onLinkClick }: { editor: Editor; onLinkClick: () => void }) {
  return (
    <BubbleMenu editor={editor} pluginKey="sel-bubble"
      shouldShow={({ editor, state }) => {
        const { from, to } = state.selection;
        return !editor.isActive("image") && from !== to;
      }}
      tippyOptions={{ placement: "top", offset: [0, 8], zIndex: 9998 }}
    >
      <div className="rounded-xl bg-white shadow-xl ring-1 ring-black/10 p-1 flex items-center gap-0.5">
        {[
          { cmd: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold"), icon: "bold", title: "Bold" },
          { cmd: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic"), icon: "italic", title: "Italic" },
          { cmd: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive("underline"), icon: "underline", title: "Underline" },
          { cmd: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike"), icon: "strikethrough", title: "Strikethrough" },
        ].map((btn) => (
          <button key={btn.icon} onMouseDown={(e) => e.preventDefault()} onClick={btn.cmd}
            className={`h-7 w-7 rounded inline-flex items-center justify-center transition ${btn.active ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-600"}`}
            title={btn.title}>
            <Icon name={btn.icon} size={13} />
          </button>
        ))}
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <button onMouseDown={(e) => e.preventDefault()} onClick={onLinkClick}
          className={`h-7 w-7 rounded inline-flex items-center justify-center transition ${editor.isActive("link") ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-600"}`}
          title="Link">
          <Icon name="link" size={13} />
        </button>
        <button onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()}
          className={`h-7 w-7 rounded inline-flex items-center justify-center transition ${editor.isActive("highlight") ? "bg-yellow-100 text-yellow-700" : "hover:bg-gray-100 text-gray-600"}`}
          title="Highlight">
          <Icon name="highlighter" size={13} />
        </button>
      </div>
    </BubbleMenu>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main Toolbar
───────────────────────────────────────────────────────────────── */
const FONT_SIZES = ["10px","11px","12px","13px","14px","15px","16px","18px","20px","22px","24px","28px","32px","36px","42px","48px","60px","72px"];
const FONT_FAMILIES = [
  { label: "System", value: "system-ui" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Palatino", value: "'Palatino Linotype', serif" },
];
const LINE_HEIGHTS = [
  { label: "Single", value: "1.2" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
];

function WriterToolbar({
  editor,
  onLinkClick,
  onImageClick,
  wordCount,
}: {
  editor: Editor | null;
  onLinkClick: () => void;
  onImageClick: () => void;
  wordCount: number;
}) {
  const [, forceUpdate] = useState({});
  const [headingOpen, setHeadingOpen] = useState(false);
  const [lineHeightOpen, setLineHeightOpen] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const lineHeightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const h = () => forceUpdate({});
    editor.on("transaction", h);
    return () => { editor.off("transaction", h); };
  }, [editor]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) setHeadingOpen(false);
      if (lineHeightRef.current && !lineHeightRef.current.contains(e.target as Node)) setLineHeightOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!editor) return null;

  const headingLabel = () => {
    if (editor.isActive("heading", { level: 1 })) return "H1";
    if (editor.isActive("heading", { level: 2 })) return "H2";
    if (editor.isActive("heading", { level: 3 })) return "H3";
    if (editor.isActive("heading", { level: 4 })) return "H4";
    return "Normal";
  };

  const currentFontSize = editor.getAttributes("textStyle").fontSize || "16px";
  const currentFont = editor.getAttributes("textStyle").fontFamily || "system-ui";

  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 py-1.5 flex items-center flex-wrap gap-1 select-none">

      {/* Heading dropdown */}
      <div className="relative flex-shrink-0" ref={headingRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setHeadingOpen((s) => !s)}
          className="h-7 px-2.5 flex items-center gap-1 rounded bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 transition"
        >
          {headingLabel()} <Icon name="chevron-down" size={10} />
        </button>
        {headingOpen && (
          <div className="absolute top-full mt-1 left-0 w-44 rounded-xl bg-white ring-1 ring-black/10 shadow-xl p-1.5 z-50">
            {[
              { label: "Normal text", cmd: () => editor.chain().focus().setParagraph().run() },
              { label: "Heading 1", cmd: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), cls: "text-2xl font-bold" },
              { label: "Heading 2", cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), cls: "text-xl font-bold" },
              { label: "Heading 3", cmd: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), cls: "text-lg font-semibold" },
              { label: "Heading 4", cmd: () => editor.chain().focus().toggleHeading({ level: 4 }).run(), cls: "text-base font-semibold" },
            ].map((item) => (
              <button key={item.label} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { item.cmd(); setHeadingOpen(false); }}
                className={`w-full text-left px-3 py-1.5 rounded-lg hover:bg-gray-100 transition ${item.cls || "text-sm text-gray-700"}`}>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Font family */}
      <select
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
        value={currentFont}
        className="h-7 px-2 rounded bg-gray-100 hover:bg-gray-200 text-xs font-medium border-0 outline-none focus:ring-2 focus:ring-blue-400 transition max-w-[130px]"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Font size */}
      <select
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => (editor as any).chain().focus().setFontSize(e.target.value).run()}
        value={currentFontSize}
        className="h-7 px-1 rounded bg-gray-100 hover:bg-gray-200 text-xs font-medium border-0 outline-none focus:ring-2 focus:ring-blue-400 transition w-16"
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s.replace("px", "")}</option>
        ))}
      </select>

      <Divider />

      {/* Bold, Italic, Underline, Strike */}
      <ToolbarButton title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
        <Icon name="bold" size={13} />
      </ToolbarButton>
      <ToolbarButton title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
        <Icon name="italic" size={13} />
      </ToolbarButton>
      <ToolbarButton title="Underline (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
        <Icon name="underline" size={13} />
      </ToolbarButton>
      <ToolbarButton title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
        <Icon name="strikethrough" size={13} />
      </ToolbarButton>

      {/* Text color */}
      <div className="relative flex-shrink-0" title="Text color">
        <input
          type="color"
          onMouseDown={(e) => e.preventDefault()}
          onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
          value={editor.getAttributes("textStyle").color || "#000000"}
          className="w-7 h-7 rounded border-0 bg-gray-100 cursor-pointer p-0.5"
          title="Text color"
        />
      </div>

      {/* Highlight */}
      <ToolbarButton title="Highlight" onClick={() => editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()} active={editor.isActive("highlight")}>
        <Icon name="highlighter" size={13} />
      </ToolbarButton>

      <Divider />

      {/* Text align */}
      {(["left", "center", "right", "justify"] as const).map((dir) => (
        <ToolbarButton key={dir} title={`Align ${dir}`}
          onClick={() => editor.chain().focus().setTextAlign(dir).run()}
          active={editor.isActive({ textAlign: dir })}>
          <Icon name={`align-${dir}`} size={13} />
        </ToolbarButton>
      ))}

      {/* Line height */}
      <div className="relative flex-shrink-0" ref={lineHeightRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setLineHeightOpen((s) => !s)}
          title="Line spacing"
          className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
        >
          <Icon name="line-height" size={13} />
        </button>
        {lineHeightOpen && (
          <div className="absolute top-full mt-1 left-0 w-32 rounded-xl bg-white ring-1 ring-black/10 shadow-xl p-1.5 z-50">
            {LINE_HEIGHTS.map((lh) => (
              <button key={lh.value} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { (editor as any).chain().focus().setLineHeight(lh.value).run(); setLineHeightOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 rounded-lg hover:bg-gray-100 transition">
                {lh.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Lists */}
      <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
        <Icon name="layout-list" size={13} />
      </ToolbarButton>
      <ToolbarButton title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
        <Icon name="list-ol" size={13} />
      </ToolbarButton>

      {/* Blockquote */}
      <ToolbarButton title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
        <Icon name="quote-right" size={13} />
      </ToolbarButton>

      {/* Code block */}
      <ToolbarButton title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}>
        <Icon name="code" size={13} />
      </ToolbarButton>

      {/* Inline code */}
      <ToolbarButton title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>
        <Icon name="terminal" size={13} />
      </ToolbarButton>

      {/* Horizontal rule */}
      <ToolbarButton title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Icon name="minus" size={13} />
      </ToolbarButton>

      <Divider />

      {/* Link */}
      <ToolbarButton title="Insert link" onClick={onLinkClick} active={editor.isActive("link")}>
        <Icon name="link" size={13} />
      </ToolbarButton>

      {/* Image */}
      <ToolbarButton title="Insert image" onClick={onImageClick}>
        <Icon name="image" size={13} />
      </ToolbarButton>

      <Divider />

      {/* Indent / outdent */}
      <ToolbarButton title="Indent" onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
        disabled={!editor.can().sinkListItem("listItem")}>
        <Icon name="indent" size={13} />
      </ToolbarButton>
      <ToolbarButton title="Outdent" onClick={() => editor.chain().focus().liftListItem("listItem").run()}
        disabled={!editor.can().liftListItem("listItem")}>
        <Icon name="outdent" size={13} />
      </ToolbarButton>

      {/* Clear formatting */}
      <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        <Icon name="remove-format" size={13} />
      </ToolbarButton>

      <div className="flex-1" />

      {/* Word count */}
      <span className="text-xs text-gray-400 mr-2 flex-shrink-0">
        {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
      </span>

      <Divider />

      {/* Undo / Redo */}
      <ToolbarButton title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Icon name="undo" size={13} />
      </ToolbarButton>
      <ToolbarButton title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Icon name="redo" size={13} />
      </ToolbarButton>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Main Page
───────────────────────────────────────────────────────────────── */
export default function WriterEditorPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params?.id as string;

  const [doc, setDoc] = useState<WriterDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Untitled Document");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [wordCount, setWordCount] = useState(0);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<any>(null);
  const titleTimerRef = useRef<any>(null);

  // Lock page scroll (same pattern as notebook)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflowY;
    const prevBody = body.style.overflow;
    html.style.overflowY = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflowY = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        history: false,
      }),
      History,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      LineHeight,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Start writing your document…" }),
      Link2.configure({ openOnClick: false, HTMLAttributes: { class: "text-blue-600 underline cursor-pointer" } }),
      ResizableImage,
      Typography,
    ],
    editable: true,
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-neutral max-w-none focus:outline-none text-base leading-relaxed writer-content",
      },
    },
    onUpdate: ({ editor }) => {
      // Word count
      const text = editor.getText();
      const wc = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
      setWordCount(wc);

      // Debounced auto-save
      setSaveStatus("unsaved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await updateDocument({ id: docId, content: editor.getJSON(), word_count: wc });
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
      }, 1500);
    },
  });

  // Load document
  useEffect(() => {
    if (!editor || !docId) return;
    setLoading(true);
    getDocument(docId).then((d) => {
      if (!d) { router.push("/admin/writer"); return; }
      setDoc(d);
      setTitle(d.title);
      setWordCount(d.word_count || 0);
      // Use queueMicrotask to avoid React flushSync warning
      queueMicrotask(() => {
        editor.commands.setContent(d.content || { type: "doc", content: [{ type: "paragraph" }] }, false);
        setLoading(false);
      });
    }).catch(() => { router.push("/admin/writer"); });
  }, [editor, docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleChange = useCallback((value: string) => {
    setTitle(value);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      updateDocument({ id: docId, title: value || "Untitled Document" });
    }, 800);
  }, [docId]);

  function toggleFullscreen() {
    if (!shellRef.current) return;
    if (!document.fullscreenElement) shellRef.current.requestFullscreen();
    else document.exitFullscreen();
  }

  // Keyboard shortcut: Ctrl+S to force save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!editor) return;
        setSaveStatus("saving");
        const wc = editor.getText().trim().split(/\s+/).filter(Boolean).length;
        updateDocument({ id: docId, content: editor.getJSON(), word_count: wc })
          .then(() => setSaveStatus("saved"))
          .catch(() => setSaveStatus("error"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor, docId]);

  return (
    <AdminGuard>
      {/* Global writer styles */}
      <style>{`
        .writer-content h1 { font-size: 2em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .writer-content h2 { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .writer-content h3 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0 0.25em; }
        .writer-content h4 { font-size: 1.1em; font-weight: 600; margin: 0.5em 0 0.25em; }
        .writer-content p { margin: 0.4em 0; }
        .writer-content ul { list-style-type: disc; padding-left: 1.5em; }
        .writer-content ol { list-style-type: decimal; padding-left: 1.5em; }
        .writer-content li { margin: 0.2em 0; }
        .writer-content blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; color: #6b7280; margin: 0.8em 0; font-style: italic; }
        .writer-content code { background: #f3f4f6; border-radius: 3px; padding: 0.15em 0.4em; font-size: 0.88em; font-family: 'Courier New', monospace; }
        .writer-content pre { background: #1e293b; color: #e2e8f0; border-radius: 8px; padding: 1em 1.2em; overflow-x: auto; margin: 0.8em 0; }
        .writer-content pre code { background: none; color: inherit; padding: 0; font-size: 0.9em; }
        .writer-content a { color: #2563eb; text-decoration: underline; }
        .writer-content hr { border: none; border-top: 2px solid #e5e7eb; margin: 1.2em 0; }
        .writer-content mark { border-radius: 2px; padding: 0.1em 0.2em; }
        .ri-handle { position: absolute; bottom: -4px; right: -4px; width: 12px; height: 12px; background: #3b82f6; border-radius: 2px; cursor: se-resize; display: block; }
        .is-selected img { outline: 2px solid #3b82f6; }
        .ProseMirror p.is-editor-empty:first-child::before { color: #9ca3af; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
      `}</style>

      <div
        ref={shellRef}
        className={`flex flex-col bg-white text-gray-900 ${isFullscreen ? "fixed inset-0 z-[9999]" : "h-screen"}`}
        style={{ overflow: "hidden" }}
      >
        {/* Top bar */}
        <div className="flex-shrink-0 h-12 flex items-center gap-3 px-4 border-b border-gray-200 bg-white">
          <Link href="/admin/writer" className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors" title="Back to documents">
            <Icon name="chevron-left" size={18} />
          </Link>

          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="flex-1 text-base font-semibold text-gray-800 bg-transparent outline-none border-b border-transparent focus:border-gray-300 transition-colors truncate min-w-0"
            placeholder="Untitled Document"
          />

          <div className="flex items-center gap-3 flex-shrink-0">
            <SaveBadge status={saveStatus} />
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <Icon name={isFullscreen ? "compress" : "expand"} size={15} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        {loading ? (
          <ToolbarSkeleton />
        ) : (
          <WriterToolbar
            editor={editor}
            onLinkClick={() => setShowLinkModal(true)}
            onImageClick={() => setShowImageModal(true)}
            wordCount={wordCount}
          />
        )}

        {/* Editor canvas */}
        {loading ? (
          <EditorSkeleton />
        ) : (
          <div className="flex-1 overflow-auto bg-gray-100" style={{ minHeight: 0 }}>
            <div className="py-10 px-4">
              <div
                className="mx-auto bg-white shadow-lg"
                style={{
                  maxWidth: 816,
                  minHeight: 1056,
                  padding: "72px 96px",
                  borderRadius: 2,
                }}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        )}

        {/* Footer status bar */}
        <div className="flex-shrink-0 h-7 border-t border-gray-100 bg-white flex items-center px-5 gap-4 text-xs text-gray-400">
          <span>{wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}</span>
          <span>·</span>
          <span>Ctrl+S to save · Ctrl+Z undo · Ctrl+Y redo</span>
          <div className="flex-1" />
          {doc && (
            <span>Last saved {new Date(doc.updated_at).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Bubble menus */}
      {editor && <SelectionBubbleMenu editor={editor} onLinkClick={() => setShowLinkModal(true)} />}
      {editor && <ImageBubbleMenu editor={editor} />}

      {/* Modals */}
      {showLinkModal && editor && <LinkModal editor={editor} onClose={() => setShowLinkModal(false)} />}
      {showImageModal && editor && <ImageModal editor={editor} onClose={() => setShowImageModal(false)} />}
    </AdminGuard>
  );
}
