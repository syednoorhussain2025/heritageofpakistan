// src/app/admin/writer/[id]/page.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
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
    return [{ types: ["textStyle"], attributes: { fontSize: { default: null, renderHTML: (a) => a.fontSize ? { style: `font-size:${a.fontSize}` } : {}, parseHTML: (el) => (el as HTMLElement).style.fontSize || null } } }];
  },
  addCommands() {
    return { setFontSize: (size: string) => ({ chain }: any) => chain().setMark("textStyle", { fontSize: size }).run() } as any;
  },
});

/* ── LineHeight ── */
const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [{ types: ["paragraph","heading"], attributes: { lineHeight: { default: null, renderHTML: (a) => a.lineHeight ? { style: `line-height:${a.lineHeight}` } : {}, parseHTML: (el) => (el as HTMLElement).style.lineHeight || null } } }];
  },
  addCommands() {
    return { setLineHeight: (lh: string) => ({ commands }: any) => commands.updateAttributes("paragraph", { lineHeight: lh }) } as any;
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
    const onMove = (e: MouseEvent) => { const w = clamp(Math.round(startW + e.clientX - startX), 60, 2000); if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(() => updateAttributes({ width: w })); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
  }
  const ws: React.CSSProperties = { lineHeight: 0 };
  if (display === "inline") { ws.display = "inline-block"; if (align === "left") { ws.float = "left"; ws.margin = "0 12px 6px 0"; } else if (align === "right") { ws.float = "right"; ws.margin = "0 0 6px 12px"; } else { ws.display = "block"; ws.textAlign = "center"; ws.float = "none"; ws.margin = "8px 0"; } }
  else { ws.display = "block"; ws.clear = "both"; ws.margin = "8px 0"; }
  return (
    <NodeViewWrapper as="span" contentEditable={false} style={ws} className={`resizable-image${selected ? " is-selected" : ""}`}>
      <span className="ri-box inline-block relative" style={{ lineHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={node.attrs.src} alt={node.attrs.alt || ""} style={{ width: width ? `${width}px` : "auto", maxWidth: "100%", height: "auto", display: "block" }} />
        {selected && <span className="ri-handle" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); beginResize(e.clientX); }} />}
      </span>
    </NodeViewWrapper>
  );
};
const ResizableImage = ImageExt.extend({
  addAttributes() {
    return { ...this.parent?.(), width: { default: null, renderHTML: (a) => a.width ? { style: `width:${a.width}px` } : {}, parseHTML: (el) => { const m = (el as HTMLElement).getAttribute("style")?.match(/width:([\d.]+)px/); return m ? Number(m[1]) : null; } }, display: { default: "block", renderHTML: (a) => ({ "data-display": a.display }), parseHTML: (el) => (el as HTMLElement).getAttribute("data-display") || "block" }, align: { default: null, renderHTML: (a) => a.align ? { "data-align": a.align } : {}, parseHTML: (el) => (el as HTMLElement).getAttribute("data-align") || null } };
  },
  addNodeView() { return ReactNodeViewRenderer(ResizableImageComponent); },
});

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

/* ── Link Modal ── */
function LinkModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = editor.getAttributes("link").href || "";
  const [url, setUrl] = useState(existing);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  function apply() { const t = url.trim(); if (!t) editor.chain().focus().extendMarkRange("link").unsetLink().run(); else editor.chain().focus().extendMarkRange("link").setLink({ href: t, target: "_blank" }).run(); onClose(); }
  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl p-5 w-[400px] border border-[#dadce0]" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-medium text-[#3c4043] mb-3">Insert link</p>
        <input ref={ref} value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") apply(); if (e.key === "Escape") onClose(); }} placeholder="https://" className="w-full border border-[#dadce0] rounded px-3 py-2 text-sm outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]/30 mb-4" />
        <div className="flex justify-end gap-2">
          {existing && <button onClick={() => { editor.chain().focus().unsetLink().run(); onClose(); }} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition">Remove</button>}
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-[#1a73e8] hover:bg-[#f1f3f4] rounded transition">Cancel</button>
          <button onClick={apply} className="px-4 py-1.5 text-sm text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded transition">Apply</button>
        </div>
      </div>
    </div>
  );
}

/* ── Image Modal ── */
function ImageModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  function apply() { if (url.trim()) editor.chain().focus().setImage({ src: url.trim() }).run(); onClose(); }
  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl p-5 w-[400px] border border-[#dadce0]" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-medium text-[#3c4043] mb-3">Insert image by URL</p>
        <input ref={ref} value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") apply(); if (e.key === "Escape") onClose(); }} placeholder="https://example.com/image.jpg" className="w-full border border-[#dadce0] rounded px-3 py-2 text-sm outline-none focus:border-[#1a73e8] mb-4" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-[#1a73e8] hover:bg-[#f1f3f4] rounded transition">Cancel</button>
          <button onClick={apply} className="px-4 py-1.5 text-sm text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded transition">Insert</button>
        </div>
      </div>
    </div>
  );
}

/* ── Tiny SVG icons matching Google Docs toolbar exactly ── */
function IcoUndo() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>; }
function IcoRedo() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 15.7c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 15h9V6l-3.6 4.6z"/></svg>; }
function IcoBold() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 11.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 7.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>; }
function IcoItalic() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>; }
function IcoUnderline() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>; }
function IcoStrike() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/></svg>; }
function IcoAlignLeft() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>; }
function IcoAlignCenter() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>; }
function IcoAlignRight() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>; }
function IcoBullet() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>; }
function IcoNumbered() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>; }
function IcoImage() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>; }
function IcoLink() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>; }
function IcoHighlight() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 14l3 3v4h6v-4l3-3V9H6v5zm2-3h8v2.17l-3 3V19h-2v-2.83l-3-3V11zM21 3H3v2h18V3z"/></svg>; }
function IcoQuote() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>; }
function IcoSpacing() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 7h2.5L5 3.5 1.5 7H4v10H1.5L5 20.5 8.5 17H6V7zm4 2v2h10V9H10zm0 6h10v-2H10v2z"/></svg>; }
function IcoChevronDown() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>; }

/* ── Toolbar button ── */
const TB = React.memo(function TB({ active, onClick, title, children, disabled }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button title={title} onMouseDown={e => e.preventDefault()} onClick={onClick} disabled={disabled}
      className={`h-8 min-w-[32px] px-1 inline-flex items-center justify-center rounded transition-colors flex-shrink-0 ${active ? "bg-[#e8f0fe] text-[#1967d2]" : "text-[#3c4043] hover:bg-[#f1f3f4]"} disabled:opacity-40 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
});

function Sep() { return <div className="w-px h-5 bg-[#dadce0] mx-0.5 flex-shrink-0 self-center" />; }

/* ── Heading options ── */
const HEADING_OPTIONS = [
  { label: "Normal text", cmd: (e: Editor) => e.chain().focus().setParagraph().run(), style: "text-sm" },
  { label: "Title", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run(), style: "text-[22px] font-normal" },
  { label: "Heading 1", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run(), style: "text-[20px] font-bold" },
  { label: "Heading 2", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(), style: "text-[16px] font-bold" },
  { label: "Heading 3", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run(), style: "text-[14px] font-bold text-[#434343]" },
  { label: "Heading 4", cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 4 }).run(), style: "text-[12px] font-bold text-[#666]" },
];

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Palatino", value: "'Palatino Linotype', serif" },
];

const LINE_SPACINGS = [
  { label: "Single", value: "1.15" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
];

/* ═══════════════════════════════════════════════════════════
   TOOLBAR COMPONENT
═══════════════════════════════════════════════════════════ */
function Toolbar({
  editor, onLink, onImage, wordCount, title, onTitleChange, saveStatus, onBack,
}: {
  editor: Editor | null;
  onLink: () => void; onImage: () => void;
  wordCount: number; title: string;
  onTitleChange: (v: string) => void;
  saveStatus: SaveStatus;
  onBack: () => void;
}) {
  const [, fu] = useState({});
  const [headingOpen, setHeadingOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [lhOpen, setLhOpen] = useState(false);
  const [fontSizeInput, setFontSizeInput] = useState<string | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const fontRef = useRef<HTMLDivElement>(null);
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
      if (fontRef.current && !fontRef.current.contains(e.target as Node)) setFontOpen(false);
      if (lhRef.current && !lhRef.current.contains(e.target as Node)) setLhOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  if (!editor) return null;

  const headingLabel = () => {
    if (editor.isActive("heading", { level: 1 })) return "Heading 1";
    if (editor.isActive("heading", { level: 2 })) return "Heading 2";
    if (editor.isActive("heading", { level: 3 })) return "Heading 3";
    if (editor.isActive("heading", { level: 4 })) return "Heading 4";
    return "Normal text";
  };

  const fontSize = editor.getAttributes("textStyle").fontSize?.replace("px", "") || "11";
  const fontFamily = editor.getAttributes("textStyle").fontFamily || "Arial, sans-serif";
  const fontLabel = FONT_FAMILIES.find(f => f.value === fontFamily)?.label || "Arial";
  const textColor = editor.getAttributes("textStyle").color || "#000000";

  function applyFontSize(val: string) {
    const n = parseInt(val);
    if (!isNaN(n) && n > 0) (editor as any).chain().focus().setFontSize(`${n}px`).run();
    setFontSizeInput(null);
  }

  const saveLabel = saveStatus === "saved" ? "Saved to Drive" : saveStatus === "saving" ? "Saving…" : saveStatus === "unsaved" ? "Unsaved" : "Error";

  return (
    <div className="flex-shrink-0" style={{ background: "#fff", borderBottom: "1px solid #e0e0e0" }}>

      {/* ── Title bar ── */}
      <div className="flex items-center h-[48px] px-4 gap-2" style={{ background: "#fff" }}>
        {/* Back / Forward arrows */}
        <button onClick={onBack} title="All documents"
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] transition text-[#3c4043]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] transition text-[#3c4043] opacity-40 cursor-not-allowed">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Title */}
        <input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          className="text-[18px] font-normal text-[#3c4043] bg-transparent outline-none border-b border-transparent hover:border-[#dadce0] focus:border-[#1a73e8] transition px-1 text-center"
          style={{ minWidth: 200, maxWidth: 400 }}
          placeholder="Untitled document"
        />

        {/* Save status */}
        <span className="text-[13px] text-[#5f6368] ml-3">{saveLabel}</span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Word count + menu items */}
        <div className="flex items-center gap-1">
          <span className="text-[13px] text-[#3c4043] mr-2">{wordCount} words</span>
          {["File","Edit","View","Insert","Format","Tools"].map(m => (
            <button key={m} className="px-2 h-8 text-[13px] text-[#3c4043] hover:bg-[#f1f3f4] rounded transition">{m}</button>
          ))}
        </div>
      </div>

      {/* ── Toolbar row ── */}
      <div className="flex items-center gap-0.5 px-3 h-[48px]" style={{ background: "#f9f9f9", borderTop: "1px solid #e0e0e0" }}>

        {/* Undo / Redo */}
        <TB title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <IcoUndo />
        </TB>
        <TB title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <IcoRedo />
        </TB>

        <Sep />

        {/* Zoom - visual */}
        <button className="h-8 px-2 flex items-center gap-1 rounded hover:bg-[#f1f3f4] text-[13px] text-[#3c4043] transition flex-shrink-0">
          100% <IcoChevronDown />
        </button>

        <Sep />

        {/* Heading style */}
        <div className="relative flex-shrink-0" ref={headingRef}>
          <button onMouseDown={e => e.preventDefault()} onClick={() => setHeadingOpen(s => !s)}
            className="h-8 px-2 flex items-center gap-1 rounded hover:bg-[#f1f3f4] text-[13px] text-[#3c4043] transition"
            style={{ minWidth: 110 }}>
            <span className="flex-1 text-left truncate">{headingLabel()}</span>
            <IcoChevronDown />
          </button>
          {headingOpen && (
            <div className="absolute top-full mt-0.5 left-0 w-52 rounded bg-white shadow-xl border border-[#dadce0] py-1 z-50">
              {HEADING_OPTIONS.map(opt => (
                <button key={opt.label} onMouseDown={e => e.preventDefault()}
                  onClick={() => { opt.cmd(editor); setHeadingOpen(false); }}
                  className={`w-full text-left px-4 py-2 hover:bg-[#f1f3f4] transition ${opt.style}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Sep />

        {/* Font family */}
        <div className="relative flex-shrink-0" ref={fontRef}>
          <button onMouseDown={e => e.preventDefault()} onClick={() => setFontOpen(s => !s)}
            className="h-8 px-2 flex items-center gap-1 rounded hover:bg-[#f1f3f4] text-[13px] text-[#3c4043] transition"
            style={{ minWidth: 90 }}>
            <span className="flex-1 text-left truncate">{fontLabel}</span>
            <IcoChevronDown />
          </button>
          {fontOpen && (
            <div className="absolute top-full mt-0.5 left-0 w-52 rounded bg-white shadow-xl border border-[#dadce0] py-1 z-50 max-h-64 overflow-y-auto">
              {FONT_FAMILIES.map(f => (
                <button key={f.value} onMouseDown={e => e.preventDefault()}
                  onClick={() => { editor.chain().focus().setFontFamily(f.value).run(); setFontOpen(false); }}
                  className={`w-full text-left px-4 py-1.5 text-[13px] hover:bg-[#f1f3f4] transition ${fontFamily === f.value ? "text-[#1a73e8] font-medium" : "text-[#3c4043]"}`}
                  style={{ fontFamily: f.value }}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Sep />

        {/* Font size: − value + */}
        <div className="flex items-center h-8 rounded border border-[#dadce0] hover:border-[#bdc1c6] focus-within:border-[#1a73e8] overflow-hidden flex-shrink-0">
          <button onMouseDown={e => e.preventDefault()}
            onClick={() => { const n = parseInt(fontSize); if (n > 1) (editor as any).chain().focus().setFontSize(`${n - 1}px`).run(); }}
            className="w-7 h-full flex items-center justify-center hover:bg-[#f1f3f4] text-[#3c4043] text-[16px] leading-none transition flex-shrink-0">−</button>
          <input
            type="text"
            value={fontSizeInput !== null ? fontSizeInput : fontSize}
            onFocus={() => setFontSizeInput(fontSize)}
            onChange={e => setFontSizeInput(e.target.value)}
            onBlur={e => applyFontSize(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyFontSize((e.target as HTMLInputElement).value); if (e.key === "Escape") setFontSizeInput(null); }}
            className="w-[30px] text-center text-[13px] text-[#3c4043] bg-transparent outline-none"
          />
          <button onMouseDown={e => e.preventDefault()}
            onClick={() => { const n = parseInt(fontSize); (editor as any).chain().focus().setFontSize(`${n + 1}px`).run(); }}
            className="w-7 h-full flex items-center justify-center hover:bg-[#f1f3f4] text-[#3c4043] text-[16px] leading-none transition flex-shrink-0">+</button>
        </div>

        <Sep />

        {/* Bold */}
        <TB title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
          <IcoBold />
        </TB>
        {/* Italic */}
        <TB title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
          <IcoItalic />
        </TB>
        {/* Underline */}
        <TB title="Underline (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
          <IcoUnderline />
        </TB>
        {/* Strikethrough */}
        <TB title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
          <IcoStrike />
        </TB>

        {/* Text color A with colored underline */}
        <div className="relative h-8 w-8 flex flex-col items-center justify-center rounded hover:bg-[#f1f3f4] transition cursor-pointer flex-shrink-0" title="Text color">
          <span className="text-[14px] font-bold text-[#3c4043] leading-none" style={{ fontFamily: "Arial" }}>A</span>
          <div className="w-4 h-[3px] rounded-sm mt-0.5" style={{ backgroundColor: textColor }} />
          <input type="color" onMouseDown={e => e.preventDefault()}
            onInput={e => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
            value={textColor}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
        </div>

        {/* Highlight pen with yellow underline */}
        <div className="relative h-8 w-8 flex flex-col items-center justify-center rounded hover:bg-[#f1f3f4] transition cursor-pointer flex-shrink-0"
          title="Highlight color"
          onClick={() => editor.chain().focus().toggleHighlight({ color: "#ffff00" }).run()}>
          <IcoHighlight />
          <div className="w-4 h-[3px] rounded-sm mt-0.5 bg-yellow-300" />
        </div>

        <Sep />

        {/* Link */}
        <TB title="Insert link (Ctrl+K)" onClick={onLink} active={editor.isActive("link")}>
          <IcoLink />
        </TB>

        {/* Image */}
        <TB title="Insert image" onClick={onImage}>
          <IcoImage />
        </TB>

        <Sep />

        {/* Align L / C / R */}
        <TB title="Align left" onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}>
          <IcoAlignLeft />
        </TB>
        <TB title="Align center" onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}>
          <IcoAlignCenter />
        </TB>
        <TB title="Align right" onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}>
          <IcoAlignRight />
        </TB>

        {/* Line spacing */}
        <div className="relative flex-shrink-0" ref={lhRef}>
          <TB title="Line & paragraph spacing" onClick={() => setLhOpen(s => !s)} active={lhOpen}>
            <IcoSpacing />
          </TB>
          {lhOpen && (
            <div className="absolute top-full mt-0.5 left-0 w-36 rounded bg-white shadow-xl border border-[#dadce0] py-1 z-50">
              {LINE_SPACINGS.map(lh => (
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

        {/* Bullet / Numbered */}
        <TB title="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
          <IcoBullet />
        </TB>
        <TB title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
          <IcoNumbered />
        </TB>

        {/* Indent dec / inc */}
        <TB title="Decrease indent" onClick={() => editor.chain().focus().liftListItem("listItem").run()} disabled={!editor.can().liftListItem("listItem")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>
        </TB>
        <TB title="Increase indent" onClick={() => editor.chain().focus().sinkListItem("listItem").run()} disabled={!editor.can().sinkListItem("listItem")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>
        </TB>

        <Sep />

        {/* Blockquote */}
        <TB title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
          <IcoQuote />
        </TB>

        {/* Clear formatting */}
        <TB title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6zm14 15l-4.34-4.34L14 17H5l1-2.68 1.24-1.24L3.27 5.27 2 6.54l3.11 3.11L3 15v2h8.5l2.5 2.5 1.27-1.27L17.46 21 20 21z"/></svg>
        </TB>
      </div>

      {/* ── Ruler ── */}
      <div className="flex-shrink-0 overflow-hidden select-none" style={{ height: 24, background: "#f1f3f4", borderTop: "1px solid #e0e0e0", borderBottom: "1px solid #e0e0e0" }}>
        <div className="flex justify-center">
          <svg width="816" height="24" style={{ display: "block", flexShrink: 0 }}>
            {/* Page margin indicators */}
            <rect x="0" y="0" width="96" height="24" fill="#e8eaed" />
            <rect x="720" y="0" width="96" height="24" fill="#e8eaed" />
            {/* Tick marks */}
            {Array.from({ length: 130 }).map((_, i) => {
              const x = i * 6;
              const rel = x - 96; // relative to content start
              if (x < 96 || x > 720) return null;
              const isMajor = rel % 96 === 0;
              const isMid = rel % 48 === 0;
              return <line key={i} x1={x} y1={isMajor ? 6 : isMid ? 10 : 14} x2={x} y2={24} stroke="#bdc1c6" strokeWidth="1" />;
            })}
            {/* Inch numbers */}
            {[1,2,3,4,5,6].map(n => (
              <text key={n} x={96 + n * 96} y={9} fontSize="9" fill="#80868b" textAnchor="middle">{n}</text>
            ))}
            {/* Left margin drag handle */}
            <polygon points="108,18 114,24 102,24" fill="#4285f4" />
            {/* Right margin drag handle */}
            <polygon points="708,18 714,24 702,24" fill="#4285f4" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SELECTION BUBBLE
═══════════════════════════════════════════════════════════ */
function SelectionBubble({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  return (
    <BubbleMenu editor={editor} pluginKey="sel-bub"
      shouldShow={({ editor, state }) => !editor.isActive("image") && state.selection.from !== state.selection.to}
      tippyOptions={{ placement: "top", offset: [0, 6], zIndex: 9800 }}>
      <div className="rounded bg-white shadow-lg border border-[#dadce0] p-0.5 flex items-center gap-0.5">
        <TB title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><IcoBold /></TB>
        <TB title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><IcoItalic /></TB>
        <TB title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}><IcoUnderline /></TB>
        <TB title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}><IcoStrike /></TB>
        <Sep />
        <TB title="Link" onClick={onLink} active={editor.isActive("link")}><IcoLink /></TB>
        <TB title="Highlight" onClick={() => editor.chain().focus().toggleHighlight({ color: "#ffff00" }).run()} active={editor.isActive("highlight")}><IcoHighlight /></TB>
      </div>
    </BubbleMenu>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════ */
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
    const html = document.documentElement, body = document.body;
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
      Link2.configure({ openOnClick: false, HTMLAttributes: { class: "gdocs-link" } }),
      ResizableImage,
      Typography,
    ],
    editable: true,
    content: "",
    editorProps: {
      attributes: {
        class: "gdocs-content focus:outline-none",
        style: "font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.15; color: #000; caret-color: #000;",
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText().trim();
      const wc = text ? text.split(/\s+/).filter(Boolean).length : 0;
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

  useEffect(() => {
    if (!editor || !docId) return;
    setLoading(true);
    getDocument(docId).then(d => {
      if (!d) { router.push("/admin/writer"); return; }
      setDoc(d); setTitle(d.title); setWordCount(d.word_count || 0);
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
        /* Exact Google Docs page background */
        .gdocs-shell { background: #e8eaed; }

        /* Content defaults — match Docs exactly */
        .gdocs-content { min-height: 100%; word-wrap: break-word; white-space: pre-wrap; }
        .gdocs-content p { margin: 0; padding: 0; min-height: 1.3em; }
        .gdocs-content h1 { font-size: 20pt; font-weight: 400; color: #000; margin: 16pt 0 0; font-family: Arial, sans-serif; line-height: 1.15; }
        .gdocs-content h2 { font-size: 16pt; font-weight: 400; color: #000; margin: 14pt 0 0; font-family: Arial, sans-serif; line-height: 1.15; }
        .gdocs-content h3 { font-size: 14pt; font-weight: 700; color: #434343; margin: 12pt 0 0; font-family: Arial, sans-serif; line-height: 1.15; }
        .gdocs-content h4 { font-size: 12pt; font-weight: 700; color: #666; margin: 11pt 0 0; font-family: Arial, sans-serif; line-height: 1.15; }
        .gdocs-content ul { list-style-type: disc; padding-left: 2em; margin: 0; }
        .gdocs-content ol { list-style-type: decimal; padding-left: 2em; margin: 0; }
        .gdocs-content li { margin: 0; }
        .gdocs-content blockquote { border-left: 4px solid #ccc; padding-left: 16px; color: #666; margin: 8px 0; font-style: italic; }
        .gdocs-content pre { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 2px; padding: 8px 12px; font-size: 10pt; overflow-x: auto; margin: 4px 0; font-family: 'Courier New', monospace; }
        .gdocs-content pre code { background: none; border: none; padding: 0; }
        .gdocs-content code { background: #f1f3f4; border-radius: 2px; padding: 1px 4px; font-size: 10pt; font-family: 'Courier New', monospace; }
        .gdocs-link { color: #1155cc; text-decoration: underline; }
        .gdocs-content hr { border: none; border-top: 1px solid #e0e0e0; margin: 12px 0; }
        .gdocs-content mark { padding: 0; }
        .ProseMirror p.is-editor-empty:first-child::before { color: #aaa; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; font-style: normal; }

        /* Resizable image */
        .ri-handle { position: absolute; bottom: -4px; right: -4px; width: 10px; height: 10px; background: #1a73e8; border-radius: 2px; cursor: se-resize; display: block; }
        .is-selected img { outline: 2px solid #1a73e8; }

        /* Page shadow matches Docs exactly */
        .gdocs-page { box-shadow: 0 1px 3px rgba(0,0,0,.3), 0 4px 8px 3px rgba(0,0,0,.15); }

        @media print {
          .gdocs-chrome { display: none !important; }
          .gdocs-shell { background: white !important; }
          .gdocs-page { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      <div className="flex flex-col gdocs-shell" style={{ height: "100vh", overflow: "hidden" }}>

        {/* Chrome */}
        <div className="gdocs-chrome flex-shrink-0" style={{ background: "#fff" }}>
          {loading ? (
            <div className="animate-pulse">
              <div className="h-[48px] bg-white border-b border-[#e0e0e0]" />
              <div className="h-[48px] bg-[#f9f9f9] border-b border-[#e0e0e0] flex items-center gap-2 px-4">
                {Array.from({ length: 18 }).map((_, i) => <div key={i} className="h-7 bg-gray-200 rounded" style={{ width: i % 5 === 0 ? 80 : 32 }} />)}
              </div>
              <div className="h-[24px] bg-[#f1f3f4] border-b border-[#e0e0e0]" />
            </div>
          ) : (
            <Toolbar
              editor={editor}
              onLink={() => setShowLink(true)}
              onImage={() => setShowImage(true)}
              wordCount={wordCount}
              title={title}
              onTitleChange={handleTitleChange}
              saveStatus={saveStatus}
              onBack={() => router.push("/admin/writer")}
            />
          )}
        </div>

        {/* Scrollable page canvas */}
        <div className="flex-1 overflow-auto gdocs-shell" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="gdocs-page bg-white" style={{ width: 816, height: 500 }} />
            </div>
          ) : (
            <div className="flex justify-center" style={{ paddingTop: 24, paddingBottom: 24, minHeight: "100%" }}>
              {/* Exact Google Docs page: 8.5in wide @ 96dpi = 816px, 1in margins = 96px */}
              <div
                className="gdocs-page bg-white relative"
                style={{ width: 816, minHeight: 1056, padding: "96px 96px 96px 96px", flexShrink: 0 }}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          )}
        </div>

        {/* Bottom status bar — exact match */}
        <div className="gdocs-chrome flex-shrink-0 flex items-center px-4 gap-2 text-[12px] text-[#5f6368]"
          style={{ height: 24, background: "#fff", borderTop: "1px solid #e0e0e0" }}>
          <span>{wordCount} words</span>
          <span>·</span>
          <span>Ctrl+S to save</span>
          <div className="flex-1" />
          {doc && <span>Last saved {new Date(doc.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      </div>

      {/* Bubble menus */}
      {editor && <SelectionBubble editor={editor} onLink={() => setShowLink(true)} />}

      {/* Modals */}
      {showLink && editor && <LinkModal editor={editor} onClose={() => setShowLink(false)} />}
      {showImage && editor && <ImageModal editor={editor} onClose={() => setShowImage(false)} />}
    </AdminGuard>
  );
}
