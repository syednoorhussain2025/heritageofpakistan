// src/app/admin/writer/[id]/page.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import { getDocument, updateDocument, WriterDocument } from "@/lib/writer";

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

/* ── FontSize ── */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
          parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: any) =>
        chain().setMark("textStyle", { fontSize: size }).run(),
    } as any;
  },
});

/* ── LineHeight ── */
const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        lineHeight: {
          default: null,
          renderHTML: (attrs) => attrs.lineHeight ? { style: `line-height:${attrs.lineHeight}` } : {},
          parseHTML: (el) => (el as HTMLElement).style.lineHeight || null,
        },
      },
    }];
  },
  addCommands() {
    return {
      setLineHeight: (lh: string) => ({ commands }: any) =>
        commands.updateAttributes("paragraph", { lineHeight: lh }),
    } as any;
  },
});

/* ── Resizable Image ── */
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

const ResizableImageComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const rafRef = useRef<number | null>(null);
  const width = node.attrs.width as number | null;
  const display = (node.attrs.display as "inline"|"block") || "block";
  const align = (node.attrs.align as "left"|"center"|"right"|null) || null;

  function beginResize(startX: number) {
    const startW = imgRef.current?.getBoundingClientRect().width || 200;
    const onMove = (e: MouseEvent) => {
      const w = clamp(Math.round(startW + e.clientX - startX), 60, 2000);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => updateAttributes({ width: w }));
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const ws: React.CSSProperties = { lineHeight: 0 };
  if (display === "inline") {
    ws.display = "inline-block";
    if (align === "left") { ws.float = "left"; ws.margin = "0 12px 6px 0"; }
    else if (align === "right") { ws.float = "right"; ws.margin = "0 0 6px 12px"; }
    else { ws.display = "block"; ws.textAlign = "center"; ws.float = "none"; ws.margin = "8px 0"; }
  } else { ws.display = "block"; ws.clear = "both"; ws.margin = "8px 0"; }

  return (
    <NodeViewWrapper as="span" contentEditable={false} style={ws} className={`resizable-image${selected?" is-selected":""}`}>
      <span className="ri-box inline-block relative" style={{ lineHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={node.attrs.src} alt={node.attrs.alt||""} style={{ width: width ? `${width}px` : "auto", maxWidth: "100%", height: "auto", display: "block" }} />
        {selected && <span className="ri-handle" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); beginResize(e.clientX); }} />}
      </span>
    </NodeViewWrapper>
  );
};

const ResizableImage = ImageExt.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, renderHTML: (a) => a.width ? { style: `width:${a.width}px` } : {}, parseHTML: (el) => { const m = (el as HTMLElement).getAttribute("style")?.match(/width:([\d.]+)px/); return m ? Number(m[1]) : null; } },
      display: { default: "block", renderHTML: (a) => ({ "data-display": a.display }), parseHTML: (el) => (el as HTMLElement).getAttribute("data-display") || "block" },
      align: { default: null, renderHTML: (a) => a.align ? { "data-align": a.align } : {}, parseHTML: (el) => (el as HTMLElement).getAttribute("data-align") || null },
    };
  },
  addNodeView() { return ReactNodeViewRenderer(ResizableImageComponent); },
});

/* ── Types ── */
type SaveStatus = "saved" | "saving" | "unsaved" | "error";

/* ── Helpers ── */
function Sep() { return <div className="w-px bg-gray-300 mx-1 self-stretch my-1 flex-shrink-0" />; }

const TB = React.memo(function TB({ active, onClick, title, children, disabled }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled}
      className={`h-7 min-w-[28px] px-1 inline-flex items-center justify-center rounded transition-colors text-[#3c4043] flex-shrink-0 ${
        active ? "bg-[#c2e7ff]" : "hover:bg-[#f1f3f4]"
      } disabled:opacity-40 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
});

/* ── Link modal ── */
function LinkModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = editor.getAttributes("link").href || "";
  const [url, setUrl] = useState(existing);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  function apply() {
    const t = url.trim();
    if (!t) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: t, target: "_blank" }).run();
    onClose();
  }
  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl p-5 w-[400px] border border-gray-200" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-medium text-[#3c4043] mb-3">Insert link</p>
        <input ref={ref} value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") apply(); if (e.key === "Escape") onClose(); }}
          placeholder="https://" className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]/30 mb-4" />
        <div className="flex justify-end gap-2">
          {existing && <button onClick={() => { editor.chain().focus().unsetLink().run(); onClose(); }} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition">Remove</button>}
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-[#1a73e8] hover:bg-[#f1f3f4] rounded transition">Cancel</button>
          <button onClick={apply} className="px-4 py-1.5 text-sm text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded transition">Apply</button>
        </div>
      </div>
    </div>
  );
}

/* ── Image URL modal ── */
function ImageModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  function apply() { if (url.trim()) editor.chain().focus().setImage({ src: url.trim() }).run(); onClose(); }
  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl p-5 w-[400px] border border-gray-200" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-medium text-[#3c4043] mb-3">Insert image by URL</p>
        <input ref={ref} value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") apply(); if (e.key === "Escape") onClose(); }}
          placeholder="https://example.com/image.jpg" className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]/30 mb-4" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-[#1a73e8] hover:bg-[#f1f3f4] rounded transition">Cancel</button>
          <button onClick={apply} className="px-4 py-1.5 text-sm text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded transition">Insert</button>
        </div>
      </div>
    </div>
  );
}

/* ── Image Bubble ── */
function ImageBubble({ editor }: { editor: Editor }) {
  const [, fu] = useState({});
  useEffect(() => { const h = () => fu({}); editor.on("transaction", h); return () => { editor.off("transaction", h); }; }, [editor]);
  const display: "inline"|"block" = editor.getAttributes("image").display || "block";
  const align: "left"|"center"|"right"|null = editor.getAttributes("image").align || null;
  return (
    <BubbleMenu editor={editor} pluginKey="img-bub" shouldShow={({ editor }) => editor.isActive("image")}
      tippyOptions={{ placement: "top", offset: [0, 8], zIndex: 9800 }}>
      <div className="rounded-lg bg-white shadow-xl border border-gray-200 p-1 flex items-center gap-0.5">
        {(["inline","block"] as const).map(m => (
          <button key={m} onMouseDown={e=>e.preventDefault()} onClick={() => editor.chain().focus().updateAttributes("image", { display: m, align: m==="block"?null:align }).run()}
            className={`px-2 h-7 rounded text-xs font-medium transition ${display===m?"bg-[#c2e7ff] text-[#1a73e8]":"hover:bg-[#f1f3f4] text-[#3c4043]"}`}>
            {m.charAt(0).toUpperCase()+m.slice(1)}
          </button>
        ))}
        <Sep />
        {(["left","center","right"] as const).map(a => (
          <button key={a} onMouseDown={e=>e.preventDefault()} onClick={() => { if (display==="inline") editor.chain().focus().updateAttributes("image",{align:a}).run(); }}
            disabled={display!=="inline"}
            className={`h-7 w-7 rounded inline-flex items-center justify-center transition ${align===a&&display==="inline"?"bg-[#c2e7ff] text-[#1a73e8]":"hover:bg-[#f1f3f4] text-[#3c4043]"} disabled:opacity-30`}>
            <Icon name={`align-${a}`} size={13} />
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}

/* ── Selection Bubble ── */
function SelectionBubble({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  return (
    <BubbleMenu editor={editor} pluginKey="sel-bub"
      shouldShow={({ editor, state }) => !editor.isActive("image") && state.selection.from !== state.selection.to}
      tippyOptions={{ placement: "top", offset: [0, 8], zIndex: 9800 }}>
      <div className="rounded-lg bg-white shadow-xl border border-gray-200 p-1 flex items-center gap-0.5">
        <TB title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><strong className="text-xs font-bold">B</strong></TB>
        <TB title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><em className="text-xs italic">I</em></TB>
        <TB title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}><span className="text-xs underline">U</span></TB>
        <TB title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}><s className="text-xs">S</s></TB>
        <Sep />
        <TB title="Link" onClick={onLink} active={editor.isActive("link")}><Icon name="link" size={13} /></TB>
        <TB title="Highlight" onClick={() => editor.chain().focus().toggleHighlight({ color: "#ffff00" }).run()} active={editor.isActive("highlight")}>
          <Icon name="highlighter" size={13} />
        </TB>
      </div>
    </BubbleMenu>
  );
}

/* ── Constants ── */
const FONT_SIZES = ["6","7","8","9","10","11","12","14","16","18","20","22","24","26","28","32","36","40","42","48","54","60","66","72","80","88","96"];
const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Palatino", value: "'Palatino Linotype', serif" },
  { label: "Impact", value: "Impact, sans-serif" },
];
const HEADING_OPTIONS = [
  { label: "Normal text", style: "text-sm text-[#3c4043]", cmd: (e: Editor) => e.chain().focus().setParagraph().run() },
  { label: "Title", style: "text-2xl font-bold text-[#3c4043]", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "Heading 1", style: "text-xl font-bold text-[#3c4043]", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "Heading 2", style: "text-lg font-bold text-[#3c4043]", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Heading 3", style: "text-base font-semibold text-[#3c4043]", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: "Heading 4", style: "text-sm font-semibold text-[#3c4043]", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 4 }).run() },
];
const LINE_HEIGHTS = [
  { label: "Single", value: "1.15" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
];

/* ── Skeleton ── */
function ToolbarSkel() {
  return (
    <div className="flex-shrink-0 bg-white">
      <div className="h-[40px] border-b border-[#e0e0e0] flex items-center gap-1 px-4">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-4 w-16 bg-gray-200 rounded animate-pulse" />)}
      </div>
      <div className="h-[48px] border-b border-[#e0e0e0] flex items-center gap-1 px-4">
        {Array.from({ length: 22 }).map((_, i) => <div key={i} className="h-7 bg-gray-100 rounded animate-pulse" style={{ width: i % 5 === 0 ? 64 : 28 }} />)}
      </div>
    </div>
  );
}

/* ── Main Toolbar ── */
function WriterToolbar({
  editor, onLink, onImage, wordCount, docTitle, onTitleChange, saveStatus, onBack,
}: {
  editor: Editor | null;
  onLink: () => void;
  onImage: () => void;
  wordCount: number;
  docTitle: string;
  onTitleChange: (v: string) => void;
  saveStatus: SaveStatus;
  onBack: () => void;
}) {
  const [, fu] = useState({});
  const [headingOpen, setHeadingOpen] = useState(false);
  const [lhOpen, setLhOpen] = useState(false);
  const [fontSizeInput, setFontSizeInput] = useState<string | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const lhRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const h = () => fu({});
    editor.on("transaction", h);
    return () => { editor.off("transaction", h); };
  }, [editor]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) setHeadingOpen(false);
      if (lhRef.current && !lhRef.current.contains(e.target as Node)) setLhOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const headingLabel = () => {
    if (!editor) return "Normal text";
    if (editor.isActive("heading", { level: 1 })) return "Heading 1";
    if (editor.isActive("heading", { level: 2 })) return "Heading 2";
    if (editor.isActive("heading", { level: 3 })) return "Heading 3";
    if (editor.isActive("heading", { level: 4 })) return "Heading 4";
    return "Normal text";
  };

  const currentFontSize = editor?.getAttributes("textStyle").fontSize?.replace("px","") || "11";
  const currentFont = editor?.getAttributes("textStyle").fontFamily || "Arial, sans-serif";
  const currentFontLabel = FONT_FAMILIES.find(f => f.value === currentFont)?.label || "Arial";

  function applyFontSize(val: string) {
    const n = parseInt(val);
    if (!isNaN(n) && n > 0 && editor) {
      (editor as any).chain().focus().setFontSize(`${n}px`).run();
    }
    setFontSizeInput(null);
  }

  if (!editor) return null;

  const saveLabel = saveStatus === "saved" ? "Saved to Drive" : saveStatus === "saving" ? "Saving…" : saveStatus === "unsaved" ? "Unsaved changes" : "Save failed";

  return (
    <div className="flex-shrink-0 bg-[#f9fbff] select-none" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>

      {/* ── Row 1: Menu bar (File / Edit style) ── */}
      <div className="flex items-center gap-0 px-3 h-[40px] border-b border-[#e0e0e0]">
        {/* Back / Doc icon */}
        <button onClick={onBack} title="All documents"
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-[#f1f3f4] transition mr-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#1a73e8"/><path d="M14 2v6h6" fill="none" stroke="#fff" strokeWidth="1.5"/><path d="M8 13h8M8 17h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>

        {/* Document title */}
        <input
          value={docTitle}
          onChange={e => onTitleChange(e.target.value)}
          className="text-[15px] font-normal text-[#3c4043] bg-transparent outline-none px-1 rounded hover:bg-[#f1f3f4] focus:bg-white focus:border focus:border-[#1a73e8] transition w-56 truncate"
          placeholder="Untitled document"
          style={{ minWidth: 0 }}
        />

        {/* Saved status */}
        <div className="ml-2 flex items-center gap-1 text-[12px] text-[#5f6368]">
          {saveStatus === "saving" && <span className="w-3 h-3 border-2 border-[#5f6368] border-t-transparent rounded-full animate-spin" />}
          {saveStatus === "saved" && <Icon name="check-circle" size={13} className="text-[#5f6368]" />}
          <span>{saveLabel}</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Word count */}
        <span className="text-[12px] text-[#5f6368] mr-3">{wordCount.toLocaleString()} words</span>

        {/* Menu items (visual only — functional dropdowns for key ones) */}
        {["File","Edit","View","Insert","Format","Tools"].map(m => (
          <button key={m} className="px-2 h-7 rounded text-[13px] text-[#3c4043] hover:bg-[#f1f3f4] transition font-normal">{m}</button>
        ))}
      </div>

      {/* ── Row 2: Toolbar ── */}
      <div className="flex items-center gap-0.5 px-2 h-[48px]">

        {/* Undo / Redo */}
        <TB title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Icon name="undo" size={16} />
        </TB>
        <TB title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Icon name="redo" size={16} />
        </TB>

        {/* Print placeholder */}
        <TB title="Print (Ctrl+P)" onClick={() => window.print()}>
          <Icon name="print" size={16} />
        </TB>

        {/* Spell check (visual) */}
        <TB title="Spell check" onClick={() => {}}>
          <Icon name="spell-check" size={16} />
        </TB>

        <Sep />

        {/* Zoom (visual) */}
        <button className="h-7 px-2 flex items-center gap-1 rounded hover:bg-[#f1f3f4] text-[13px] text-[#3c4043] transition flex-shrink-0">
          100% <Icon name="chevron-down" size={11} />
        </button>

        <Sep />

        {/* Heading / paragraph style */}
        <div className="relative flex-shrink-0" ref={headingRef}>
          <button onMouseDown={e => e.preventDefault()} onClick={() => setHeadingOpen(s => !s)}
            className="h-8 px-2 flex items-center gap-1 rounded hover:bg-[#f1f3f4] text-[13px] text-[#3c4043] transition w-[120px] justify-between">
            <span className="truncate">{headingLabel()}</span>
            <Icon name="chevron-down" size={11} className="flex-shrink-0" />
          </button>
          {headingOpen && (
            <div className="absolute top-full mt-1 left-0 w-48 rounded bg-white shadow-xl border border-gray-200 py-1 z-50">
              {HEADING_OPTIONS.map(opt => (
                <button key={opt.label} onMouseDown={e => e.preventDefault()}
                  onClick={() => { opt.cmd(editor); setHeadingOpen(false); }}
                  className={`w-full text-left px-4 py-1.5 hover:bg-[#f1f3f4] transition ${opt.style}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Sep />

        {/* Font family */}
        <div className="relative flex-shrink-0">
          <select onMouseDown={e => e.preventDefault()}
            onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}
            value={currentFont}
            className="h-8 pl-2 pr-6 rounded hover:bg-[#f1f3f4] text-[13px] text-[#3c4043] border-0 outline-none bg-transparent cursor-pointer appearance-none w-[110px] truncate">
            {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <Icon name="chevron-down" size={11} className="absolute right-1 top-1/2 -translate-y-1/2 text-[#5f6368] pointer-events-none" />
        </div>

        <Sep />

        {/* Font size */}
        <div className="flex items-center h-8 rounded border border-transparent hover:border-gray-300 focus-within:border-[#1a73e8] overflow-hidden flex-shrink-0" style={{ width: 50 }}>
          <button onMouseDown={e => e.preventDefault()}
            onClick={() => { const n = parseInt(currentFontSize); if (n > 1) (editor as any).chain().focus().setFontSize(`${n-1}px`).run(); }}
            className="w-5 h-full flex items-center justify-center hover:bg-[#f1f3f4] text-[#5f6368] text-base leading-none transition flex-shrink-0">−</button>
          <input
            type="text"
            value={fontSizeInput !== null ? fontSizeInput : currentFontSize}
            onFocus={() => setFontSizeInput(currentFontSize)}
            onChange={e => setFontSizeInput(e.target.value)}
            onBlur={e => applyFontSize(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyFontSize((e.target as HTMLInputElement).value); if (e.key === "Escape") setFontSizeInput(null); }}
            className="flex-1 text-center text-[13px] text-[#3c4043] bg-transparent outline-none w-0 min-w-0"
          />
          <button onMouseDown={e => e.preventDefault()}
            onClick={() => { const n = parseInt(currentFontSize); (editor as any).chain().focus().setFontSize(`${n+1}px`).run(); }}
            className="w-5 h-full flex items-center justify-center hover:bg-[#f1f3f4] text-[#5f6368] text-base leading-none transition flex-shrink-0">+</button>
        </div>

        <Sep />

        {/* Bold */}
        <TB title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 4h8a4 4 0 0 1 0 8H6z" fill="currentColor"/><path d="M6 12h9a4 4 0 0 1 0 8H6z" fill="currentColor"/></svg>
        </TB>
        {/* Italic */}
        <TB title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
          <svg width="16" height="16" viewBox="0 0 24 24"><line x1="19" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="14" y1="20" x2="5" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="15" y1="4" x2="9" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </TB>
        {/* Underline */}
        <TB title="Underline (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 3v7a6 6 0 0 0 12 0V3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="4" y1="21" x2="20" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </TB>
        {/* Strikethrough */}
        <TB title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
          <svg width="16" height="16" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2"/><path d="M17.5 6.5C17.5 4.6 15.5 3 12 3s-5.5 1.6-5.5 3.5c0 2 1.5 3 5.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M6.5 17.5C6.5 19.4 8.5 21 12 21s5.5-1.6 5.5-3.5c0-2-1.5-3-5.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </TB>

        {/* Text color */}
        <div className="flex flex-col items-center justify-center h-8 w-8 rounded hover:bg-[#f1f3f4] transition cursor-pointer flex-shrink-0 relative" title="Text color">
          <span className="text-[13px] font-bold text-[#3c4043] leading-none" style={{ fontFamily: "Arial" }}>A</span>
          <input type="color" onMouseDown={e => e.preventDefault()}
            onInput={e => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
            value={editor.getAttributes("textStyle").color || "#000000"}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" title="Text color" />
          <div className="w-4 h-1 rounded-sm mt-0.5" style={{ backgroundColor: editor.getAttributes("textStyle").color || "#000000" }} />
        </div>

        {/* Highlight */}
        <div className="flex flex-col items-center justify-center h-8 w-8 rounded hover:bg-[#f1f3f4] transition cursor-pointer flex-shrink-0 relative" title="Highlight">
          <Icon name="highlighter" size={14} className="text-[#3c4043]" />
          <div className="w-4 h-1 rounded-sm mt-0.5 bg-yellow-300" />
        </div>

        <Sep />

        {/* Link */}
        <TB title="Insert link (Ctrl+K)" onClick={onLink} active={editor.isActive("link")}>
          <Icon name="link" size={15} />
        </TB>
        {/* Image */}
        <TB title="Insert image" onClick={onImage}>
          <Icon name="image" size={15} />
        </TB>

        <Sep />

        {/* Alignment */}
        <TB title="Align left (Ctrl+Shift+L)" onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}>
          <Icon name="align-left" size={15} />
        </TB>
        <TB title="Align center (Ctrl+Shift+E)" onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}>
          <Icon name="align-center" size={15} />
        </TB>
        <TB title="Align right (Ctrl+Shift+R)" onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}>
          <Icon name="align-right" size={15} />
        </TB>
        <TB title="Justify (Ctrl+Shift+J)" onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })}>
          <Icon name="align-justify" size={15} />
        </TB>

        {/* Line spacing */}
        <div className="relative flex-shrink-0" ref={lhRef}>
          <TB title="Line & paragraph spacing" onClick={() => setLhOpen(s => !s)} active={lhOpen}>
            <Icon name="line-height" size={15} />
          </TB>
          {lhOpen && (
            <div className="absolute top-full mt-1 left-0 w-36 rounded bg-white shadow-xl border border-gray-200 py-1 z-50">
              {LINE_HEIGHTS.map(lh => (
                <button key={lh.value} onMouseDown={e => e.preventDefault()}
                  onClick={() => { (editor as any).chain().focus().setLineHeight(lh.value).run(); setLhOpen(false); }}
                  className="w-full text-left px-4 py-1.5 text-[13px] text-[#3c4043] hover:bg-[#f1f3f4] transition">
                  {lh.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Sep />

        {/* Bullet list */}
        <TB title="Bulleted list (Ctrl+Shift+8)" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
          <Icon name="layout-list" size={15} />
        </TB>
        {/* Numbered list */}
        <TB title="Numbered list (Ctrl+Shift+7)" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
          <Icon name="list-ol" size={15} />
        </TB>

        {/* Indent */}
        <TB title="Decrease indent (Ctrl+[)" onClick={() => editor.chain().focus().liftListItem("listItem").run()} disabled={!editor.can().liftListItem("listItem")}>
          <Icon name="outdent" size={15} />
        </TB>
        <TB title="Increase indent (Ctrl+])" onClick={() => editor.chain().focus().sinkListItem("listItem").run()} disabled={!editor.can().sinkListItem("listItem")}>
          <Icon name="indent" size={15} />
        </TB>

        <Sep />

        {/* Blockquote */}
        <TB title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
          <Icon name="quote-right" size={15} />
        </TB>
        {/* Code block */}
        <TB title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}>
          <Icon name="code" size={15} />
        </TB>
        {/* Inline code */}
        <TB title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>
          <Icon name="terminal" size={15} />
        </TB>

        {/* Clear formatting */}
        <TB title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          <Icon name="remove-format" size={15} />
        </TB>
      </div>

      {/* ── Row 3: Ruler ── */}
      <div className="flex-shrink-0 h-[24px] bg-[#f9fbff] border-b border-[#e0e0e0] relative overflow-hidden select-none" style={{ paddingLeft: "calc(50% - 408px + 96px)", paddingRight: 96 }}>
        <svg width="624" height="24" style={{ display: "block" }}>
          {/* Tick marks every 0.25 inch at ~24px per inch (624px = ~6.5in) */}
          {Array.from({ length: 100 }).map((_, i) => {
            const x = i * 6; // every 6px
            const isMajor = i % 16 === 0;
            const isMinor = i % 8 === 0;
            if (x > 624) return null;
            return (
              <line key={i} x1={x} y1={isMajor ? 8 : isMinor ? 10 : 14} x2={x} y2={24}
                stroke="#bdc1c6" strokeWidth="1" />
            );
          })}
          {/* Inch labels */}
          {[1,2,3,4,5,6].map(n => (
            <text key={n} x={n * 96} y={8} fontSize="9" fill="#80868b" textAnchor="middle">{n}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════ */
export default function WriterEditorPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params?.id as string;

  const [doc, setDoc] = useState<WriterDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Untitled document");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [wordCount, setWordCount] = useState(0);
  const [showLink, setShowLink] = useState(false);
  const [showImage, setShowImage] = useState(false);

  const saveTimerRef = useRef<any>(null);
  const titleTimerRef = useRef<any>(null);

  // Lock body scroll
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const ph = html.style.overflowY, pb = body.style.overflow;
    html.style.overflowY = "hidden"; body.style.overflow = "hidden";
    return () => { html.style.overflowY = ph; body.style.overflow = pb; };
  }, []);

  // Ctrl+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!editor) return;
        setSaveStatus("saving");
        const wc = editor.getText().trim().split(/\s+/).filter(Boolean).length;
        updateDocument({ id: docId, content: editor.getJSON(), word_count: wc })
          .then(() => setSaveStatus("saved")).catch(() => setSaveStatus("error"));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1,2,3,4] }, history: false }),
      History,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      LineHeight,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading","paragraph"] }),
      Placeholder.configure({ placeholder: "Start typing…" }),
      Link2.configure({ openOnClick: false, HTMLAttributes: { class: "text-[#1a73e8] underline cursor-pointer" } }),
      ResizableImage,
      Typography,
    ],
    editable: true,
    content: "",
    editorProps: {
      attributes: {
        class: "gdocs-content focus:outline-none",
        style: "font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.15; color: #000;",
      },
    },
    onUpdate: ({ editor }) => {
      const wc = editor.getText().trim() ? editor.getText().trim().split(/\s+/).filter(Boolean).length : 0;
      setWordCount(wc);
      setSaveStatus("unsaved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try { await updateDocument({ id: docId, content: editor.getJSON(), word_count: wc }); setSaveStatus("saved"); }
        catch { setSaveStatus("error"); }
      }, 1500);
    },
  });

  // Load doc
  useEffect(() => {
    if (!editor || !docId) return;
    setLoading(true);
    getDocument(docId).then(d => {
      if (!d) { router.push("/admin/writer"); return; }
      setDoc(d);
      setTitle(d.title);
      setWordCount(d.word_count || 0);
      queueMicrotask(() => {
        editor.commands.setContent(d.content || { type: "doc", content: [{ type: "paragraph" }] }, false);
        setLoading(false);
      });
    }).catch(() => router.push("/admin/writer"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docId]);

  const handleTitleChange = useCallback((v: string) => {
    setTitle(v);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => updateDocument({ id: docId, title: v || "Untitled document" }), 800);
  }, [docId]);

  return (
    <AdminGuard>
      <style>{`
        /* Google Docs page background */
        body { background: #f0f4f9 !important; }

        /* Editor content styles matching Google Docs defaults */
        .gdocs-content { min-height: 100%; }
        .gdocs-content p { margin: 0; padding: 0; min-height: 1.15em; }
        .gdocs-content h1 { font-size: 20pt; font-weight: 400; color: #000; margin: 0 0 2pt; font-family: Arial, sans-serif; }
        .gdocs-content h2 { font-size: 16pt; font-weight: 400; color: #000; margin: 0 0 2pt; font-family: Arial, sans-serif; }
        .gdocs-content h3 { font-size: 14pt; font-weight: 700; color: #434343; margin: 0 0 2pt; font-family: Arial, sans-serif; }
        .gdocs-content h4 { font-size: 12pt; font-weight: 700; color: #666; margin: 0 0 2pt; font-family: Arial, sans-serif; }
        .gdocs-content ul { list-style-type: disc; padding-left: 24pt; margin: 0; }
        .gdocs-content ol { list-style-type: decimal; padding-left: 24pt; margin: 0; }
        .gdocs-content li { margin: 0; }
        .gdocs-content blockquote { border-left: 3px solid #ccc; padding-left: 12pt; color: #666; margin: 6pt 0; }
        .gdocs-content pre { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 4px; padding: 8pt 10pt; font-size: 10pt; overflow-x: auto; margin: 4pt 0; }
        .gdocs-content pre code { background: none; border: none; padding: 0; font-size: inherit; color: #c7254e; }
        .gdocs-content code { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 2px; padding: 1px 4px; font-size: 10pt; color: #c7254e; }
        .gdocs-content a { color: #1155cc; }
        .gdocs-content hr { border: none; border-top: 1px solid #e0e0e0; margin: 8pt 0; }
        .gdocs-content mark { border-radius: 1px; padding: 0; }
        .ProseMirror p.is-editor-empty:first-child::before { color: #bdc1c6; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; font-style: normal; }

        /* Resizable image */
        .ri-handle { position: absolute; bottom: -4px; right: -4px; width: 10px; height: 10px; background: #1a73e8; border-radius: 2px; cursor: se-resize; display: block; }
        .is-selected img { outline: 2px solid #1a73e8; }

        /* Ruler */
        .writer-ruler { background: linear-gradient(to bottom, #f9fbff 0%, #f1f3f4 100%); }

        /* Print */
        @media print {
          .writer-chrome { display: none !important; }
          .writer-page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
      `}</style>

      <div className="flex flex-col bg-[#f0f4f9]" style={{ height: "100vh", overflow: "hidden" }}>

        {/* Chrome: menu bar + toolbar + ruler */}
        <div className="writer-chrome flex-shrink-0">
          {loading ? <ToolbarSkel /> : (
            <WriterToolbar
              editor={editor}
              onLink={() => setShowLink(true)}
              onImage={() => setShowImage(true)}
              wordCount={wordCount}
              docTitle={title}
              onTitleChange={handleTitleChange}
              saveStatus={saveStatus}
              onBack={() => router.push("/admin/writer")}
            />
          )}
        </div>

        {/* Scrollable canvas */}
        <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="bg-white shadow-md w-[816px] h-[400px] animate-pulse rounded-sm" />
            </div>
          ) : (
            <div className="flex justify-center py-8 px-4" style={{ minHeight: "100%" }}>
              {/* The "page" — exact Google Docs dimensions */}
              <div
                className="writer-page bg-white relative"
                style={{
                  width: 816,
                  minHeight: 1056,
                  padding: "96px 96px 96px 96px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.28), 0 4px 8px rgba(0,0,0,0.1)",
                  borderRadius: 1,
                  flexShrink: 0,
                }}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          )}
        </div>

        {/* Status bar — exact Google Docs bottom bar */}
        <div className="writer-chrome flex-shrink-0 h-[24px] bg-[#f9fbff] border-t border-[#e0e0e0] flex items-center px-4 gap-4 text-[11px] text-[#5f6368]" style={{ boxShadow: "0 -1px 0 #e0e0e0" }}>
          <span>{wordCount.toLocaleString()} words</span>
          <span>·</span>
          <span>Ctrl+S to save</span>
          <div className="flex-1" />
          {doc && <span>Last saved {new Date(doc.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      </div>

      {/* Bubble menus */}
      {editor && <SelectionBubble editor={editor} onLink={() => setShowLink(true)} />}
      {editor && <ImageBubble editor={editor} />}

      {/* Modals */}
      {showLink && editor && <LinkModal editor={editor} onClose={() => setShowLink(false)} />}
      {showImage && editor && <ImageModal editor={editor} onClose={() => setShowImage(false)} />}
    </AdminGuard>
  );
}
