// src/app/admin/writer/[id]/page.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { getDocument, updateDocument, WriterDocument } from "@/lib/writer";

import {
  BubbleMenu, EditorContent, NodeViewWrapper,
  ReactNodeViewRenderer, useEditor,
  type Editor, type NodeViewProps,
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

/* ─── FontSize ─── */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{ types: ["textStyle"], attributes: { fontSize: { default: null, renderHTML: (a) => a.fontSize ? { style: `font-size:${a.fontSize}` } : {}, parseHTML: (el) => (el as HTMLElement).style.fontSize || null } } }];
  },
  addCommands() {
    return { setFontSize: (s: string) => ({ chain }: any) => chain().setMark("textStyle", { fontSize: s }).run() } as any;
  },
});

/* ─── LineHeight ─── */
const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [{ types: ["paragraph","heading"], attributes: { lineHeight: { default: null, renderHTML: (a) => a.lineHeight ? { style: `line-height:${a.lineHeight}` } : {}, parseHTML: (el) => (el as HTMLElement).style.lineHeight || null } } }];
  },
  addCommands() {
    return { setLineHeight: (lh: string) => ({ commands }: any) => commands.updateAttributes("paragraph", { lineHeight: lh }) } as any;
  },
});

/* ─── Resizable Image ─── */
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
const ResizableImageComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const rafRef = useRef<number | null>(null);
  const w = node.attrs.width as number | null;
  const display = (node.attrs.display as "inline"|"block") || "block";
  const align = (node.attrs.align as "left"|"center"|"right"|null) || null;
  function beginResize(sx: number) {
    const sw = imgRef.current?.getBoundingClientRect().width || 200;
    const mv = (e: MouseEvent) => { const nw = clamp(Math.round(sw + e.clientX - sx), 60, 2000); if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(() => updateAttributes({ width: nw })); };
    const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
  }
  const ws: React.CSSProperties = { lineHeight: 0 };
  if (display === "inline") { ws.display = "inline-block"; if (align === "left") { ws.float = "left"; ws.margin = "0 12px 6px 0"; } else if (align === "right") { ws.float = "right"; ws.margin = "0 0 6px 12px"; } else { ws.display = "block"; ws.textAlign = "center"; ws.float = "none"; ws.margin = "8px 0"; } }
  else { ws.display = "block"; ws.clear = "both"; ws.margin = "8px 0"; }
  return (
    <NodeViewWrapper as="span" contentEditable={false} style={ws} className={`ri-wrap${selected?" ri-sel":""}`}>
      <span style={{ lineHeight:0, position:"relative", display:"inline-block" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={node.attrs.src} alt={node.attrs.alt||""} style={{ width: w?`${w}px`:"auto", maxWidth:"100%", height:"auto", display:"block" }} />
        {selected && <span className="ri-handle" onMouseDown={e=>{ e.preventDefault(); e.stopPropagation(); beginResize(e.clientX); }} />}
      </span>
    </NodeViewWrapper>
  );
};
const ResizableImage = ImageExt.extend({
  addAttributes() {
    return { ...this.parent?.(), width:{default:null,renderHTML:(a)=>a.width?{style:`width:${a.width}px`}:{},parseHTML:(el)=>{const m=(el as HTMLElement).getAttribute("style")?.match(/width:([\d.]+)px/);return m?Number(m[1]):null;}}, display:{default:"block",renderHTML:(a)=>({["data-display"]:a.display}),parseHTML:(el)=>(el as HTMLElement).getAttribute("data-display")||"block"}, align:{default:null,renderHTML:(a)=>a.align?{["data-align"]:a.align}:{},parseHTML:(el)=>(el as HTMLElement).getAttribute("data-align")||null} };
  },
  addNodeView() { return ReactNodeViewRenderer(ResizableImageComponent); },
});

type SaveStatus = "saved"|"saving"|"unsaved"|"error";

/* ─── Modals ─── */
function LinkModal({ editor, onClose }: { editor: Editor; onClose: ()=>void }) {
  const existing = editor.getAttributes("link").href||"";
  const [url, setUrl] = useState(existing);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(()=>{ ref.current?.focus(); ref.current?.select(); },[]);
  function apply(){ const t=url.trim(); if(!t) editor.chain().focus().extendMarkRange("link").unsetLink().run(); else editor.chain().focus().extendMarkRange("link").setLink({href:t,target:"_blank"}).run(); onClose(); }
  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl p-5 w-[400px] border border-[#dadce0]" onClick={e=>e.stopPropagation()}>
        <p className="text-sm font-medium text-[#3c4043] mb-3">Insert link</p>
        <input ref={ref} value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")apply();if(e.key==="Escape")onClose();}} placeholder="https://" className="w-full border border-[#dadce0] rounded px-3 py-2 text-sm outline-none focus:border-[#1a73e8] mb-4"/>
        <div className="flex justify-end gap-2">
          {existing&&<button onClick={()=>{editor.chain().focus().unsetLink().run();onClose();}} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded">Remove</button>}
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-[#1a73e8] hover:bg-[#f1f3f4] rounded">Cancel</button>
          <button onClick={apply} className="px-4 py-1.5 text-sm text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded">Apply</button>
        </div>
      </div>
    </div>
  );
}
function ImageModal({ editor, onClose }: { editor: Editor; onClose: ()=>void }) {
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(()=>{ ref.current?.focus(); },[]);
  function apply(){ if(url.trim()) editor.chain().focus().setImage({src:url.trim()}).run(); onClose(); }
  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl p-5 w-[400px] border border-[#dadce0]" onClick={e=>e.stopPropagation()}>
        <p className="text-sm font-medium text-[#3c4043] mb-3">Insert image by URL</p>
        <input ref={ref} value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")apply();if(e.key==="Escape")onClose();}} placeholder="https://example.com/image.jpg" className="w-full border border-[#dadce0] rounded px-3 py-2 text-sm outline-none focus:border-[#1a73e8] mb-4"/>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-[#1a73e8] hover:bg-[#f1f3f4] rounded">Cancel</button>
          <button onClick={apply} className="px-4 py-1.5 text-sm text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded">Insert</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Google Docs exact SVG icons ─── */
// Every icon below is the exact Material icon Google Docs uses
const Ico = {
  Undo: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>,
  Redo: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 15.7c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 15h9V6l-3.6 4.6z"/></svg>,
  Print: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>,
  SpellCheck: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.45 16h2.09L9.43 3H7.57L2.46 16h2.09l1.12-3h5.64l1.14 3zm-6.02-5L8.5 5.48 10.57 11H6.43zm15.16.59c-1.09-.13-1.91-.56-2.47-1.29-.56.73-1.41 1.29-2.54 1.29-1.89 0-3.02-1.3-3.02-3.07 0-1.82 1.13-3.07 3.02-3.07 1.1 0 1.97.52 2.54 1.28.56-.76 1.38-1.21 2.47-1.21v1.52c-.85 0-1.45.59-1.45 1.48 0 .85.6 1.48 1.45 1.48V12zM19 17.5c0 .83-.67 1.5-1.5 1.5S16 18.33 16 17.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5z"/></svg>,
  Bold: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 11.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 7.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>,
  Italic: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>,
  Underline: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>,
  Strike: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/></svg>,
  Link: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>,
  Image: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>,
  AlignLeft: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>,
  AlignCenter: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>,
  AlignRight: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>,
  Spacing: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 7h2.5L5 3.5 1.5 7H4v10H1.5L5 20.5 8.5 17H6V7zm4 2v2h10V9H10zm0 6h10v-2H10v2z"/></svg>,
  BulletList: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>,
  NumList: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>,
  IndentDec: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>,
  IndentInc: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>,
  Blockquote: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>,
  ClearFormat: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6zm14 15l-4.34-4.34L14 17H5l1-2.68 1.24-1.24L3.27 5.27 2 6.54l3.11 3.11L3 15v2h8.5l2.5 2.5 1.27-1.27L17.46 21 20 21z"/></svg>,
  ChevDown: ()=><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>,
  Highlight: ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 14l3 3v4h6v-4l3-3V9H6v5zm2-3h8v2.17l-3 3V19h-2v-2.83l-3-3V11zM21 3H3v2h18V3z"/></svg>,
};

/* ─── Toolbar button — exact Docs sizing ─── */
const TB = React.memo(function TB({ active, onClick, title, children, disabled }: {
  active?: boolean; onClick: ()=>void; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button title={title} onMouseDown={e=>e.preventDefault()} onClick={onClick} disabled={disabled}
      className={`h-8 min-w-[28px] px-1 inline-flex items-center justify-center rounded transition-colors flex-shrink-0 ${active?"bg-[#e8f0fe] text-[#1967d2]":"text-[#444746] hover:bg-[#e9eaeb]"} disabled:opacity-40 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
});

// Thin vertical separator — exact Docs style
function Sep() { return <div className="w-px h-[20px] bg-[#c7c8ca] mx-[3px] flex-shrink-0 self-center"/>; }

/* ─── Heading / font data ─── */
const HEADING_OPTS = [
  { label:"Normal text", cmd:(e:Editor)=>e.chain().focus().setParagraph().run(), cls:"text-[13px] text-[#3c4043]" },
  { label:"Title",       cmd:(e:Editor)=>e.chain().focus().toggleHeading({level:1}).run(), cls:"text-[24px] font-normal text-[#3c4043]" },
  { label:"Heading 1",   cmd:(e:Editor)=>e.chain().focus().toggleHeading({level:1}).run(), cls:"text-[20px] font-bold text-[#3c4043]" },
  { label:"Heading 2",   cmd:(e:Editor)=>e.chain().focus().toggleHeading({level:2}).run(), cls:"text-[16px] font-bold text-[#3c4043]" },
  { label:"Heading 3",   cmd:(e:Editor)=>e.chain().focus().toggleHeading({level:3}).run(), cls:"text-[14px] font-bold text-[#434343]" },
  { label:"Heading 4",   cmd:(e:Editor)=>e.chain().focus().toggleHeading({level:4}).run(), cls:"text-[12px] font-bold text-[#666]" },
];
const FONTS = [
  { label:"Arial",           value:"Arial, sans-serif" },
  { label:"Georgia",         value:"Georgia, serif" },
  { label:"Inter",           value:"Inter, sans-serif" },
  { label:"Courier New",     value:"'Courier New', monospace" },
  { label:"Times New Roman", value:"'Times New Roman', serif" },
  { label:"Trebuchet MS",    value:"'Trebuchet MS', sans-serif" },
  { label:"Verdana",         value:"Verdana, sans-serif" },
  { label:"Palatino",        value:"'Palatino Linotype', serif" },
];
const LINE_SPACINGS = [
  {label:"Single",value:"1.15"},{label:"1.15",value:"1.15"},{label:"1.5",value:"1.5"},{label:"Double",value:"2"},
];

/* ═══════════════ MENU BAR ═══════════════ */
type MenuItemDef = { label: string; kbd?: string; action?: ()=>void; sep?: boolean; disabled?: boolean };

function DropMenu({ label, items }: { label: string; items: MenuItemDef[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button onClick={()=>setOpen(s=>!s)}
        className={`px-2 h-8 text-[13px] text-[#3c4043] rounded transition ${open?"bg-[#e9eaeb]":"hover:bg-[#e9eaeb]"}`}>
        {label}
      </button>
      {open&&(
        <div className="absolute top-full left-0 mt-0.5 min-w-[220px] rounded bg-white shadow-xl border border-[#dadce0] py-1 z-[200]">
          {items.map((item,i)=>
            item.sep
              ? <div key={i} className="my-1 border-t border-[#e0e0e0]"/>
              : (
                <button key={i} disabled={item.disabled}
                  onClick={()=>{ if(item.action){ item.action(); setOpen(false); } }}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-[13px] text-[#3c4043] hover:bg-[#e9eaeb] transition disabled:opacity-40 disabled:cursor-default">
                  <span>{item.label}</span>
                  {item.kbd&&<span className="text-[11px] text-[#80868b] ml-8">{item.kbd}</span>}
                </button>
              )
          )}
        </div>
      )}
    </div>
  );
}

function MenuBar({ editor, onLink, onImage }: { editor: Editor|null; onLink:()=>void; onImage:()=>void }) {
  if(!editor) return null;
  const menus: { label: string; items: MenuItemDef[] }[] = [
    {
      label:"File",
      items:[
        { label:"New document", kbd:"Ctrl+N", disabled:true },
        { sep:true },
        { label:"Print", kbd:"Ctrl+P", action:()=>window.print() },
      ],
    },
    {
      label:"Edit",
      items:[
        { label:"Undo", kbd:"Ctrl+Z", action:()=>editor.chain().focus().undo().run() },
        { label:"Redo", kbd:"Ctrl+Y", action:()=>editor.chain().focus().redo().run() },
        { sep:true },
        { label:"Select all", kbd:"Ctrl+A", action:()=>editor.chain().focus().selectAll().run() },
        { sep:true },
        { label:"Find and replace", kbd:"Ctrl+H", disabled:true },
      ],
    },
    {
      label:"View",
      items:[
        { label:"100%", disabled:true },
        { sep:true },
        { label:"Show ruler", disabled:true },
        { label:"Show word count", disabled:true },
      ],
    },
    {
      label:"Insert",
      items:[
        { label:"Image…", action:onImage },
        { label:"Link…", kbd:"Ctrl+K", action:onLink },
        { sep:true },
        { label:"Horizontal line", action:()=>editor.chain().focus().setHorizontalRule().run() },
        { sep:true },
        { label:"Special characters", disabled:true },
        { label:"Emoji", disabled:true },
      ],
    },
    {
      label:"Format",
      items:[
        { label:"Bold", kbd:"Ctrl+B", action:()=>editor.chain().focus().toggleBold().run() },
        { label:"Italic", kbd:"Ctrl+I", action:()=>editor.chain().focus().toggleItalic().run() },
        { label:"Underline", kbd:"Ctrl+U", action:()=>editor.chain().focus().toggleUnderline().run() },
        { label:"Strikethrough", action:()=>editor.chain().focus().toggleStrike().run() },
        { sep:true },
        { label:"Heading 1", action:()=>editor.chain().focus().toggleHeading({level:1}).run() },
        { label:"Heading 2", action:()=>editor.chain().focus().toggleHeading({level:2}).run() },
        { label:"Heading 3", action:()=>editor.chain().focus().toggleHeading({level:3}).run() },
        { sep:true },
        { label:"Bulleted list", action:()=>editor.chain().focus().toggleBulletList().run() },
        { label:"Numbered list", action:()=>editor.chain().focus().toggleOrderedList().run() },
        { sep:true },
        { label:"Clear formatting", kbd:"Ctrl+\\", action:()=>editor.chain().focus().clearNodes().unsetAllMarks().run() },
      ],
    },
    {
      label:"Tools",
      items:[
        { label:"Word count", disabled:true },
        { sep:true },
        { label:"Keyboard shortcuts", kbd:"Ctrl+/", disabled:true },
      ],
    },
  ];
  return (
    <div className="flex items-center">
      {menus.map(m=><DropMenu key={m.label} label={m.label} items={m.items}/>)}
    </div>
  );
}

/* ═══════════════ TOOLBAR ═══════════════ */
function Toolbar({ editor, onLink, onImage, wordCount, title, onTitleChange, saveStatus, onBack }: {
  editor: Editor|null; onLink:()=>void; onImage:()=>void;
  wordCount:number; title:string; onTitleChange:(v:string)=>void;
  saveStatus:SaveStatus; onBack:()=>void;
}) {
  const [,fu] = useState({});
  const [hOpen, setHOpen] = useState(false);
  const [fOpen, setFOpen] = useState(false);
  const [lhOpen, setLhOpen] = useState(false);
  const [fsInput, setFsInput] = useState<string|null>(null);
  const hRef = useRef<HTMLDivElement>(null);
  const fRef = useRef<HTMLDivElement>(null);
  const lhRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!editor) return;
    const h=()=>fu({}); editor.on("transaction",h); return ()=>{ editor.off("transaction",h); };
  },[editor]);

  useEffect(()=>{
    function outside(e:MouseEvent){
      if(hRef.current&&!hRef.current.contains(e.target as Node)) setHOpen(false);
      if(fRef.current&&!fRef.current.contains(e.target as Node)) setFOpen(false);
      if(lhRef.current&&!lhRef.current.contains(e.target as Node)) setLhOpen(false);
    }
    document.addEventListener("mousedown",outside);
    return ()=>document.removeEventListener("mousedown",outside);
  },[]);

  if(!editor) return null;

  const headLabel = ()=>{
    if(editor.isActive("heading",{level:1})) return "Heading 1";
    if(editor.isActive("heading",{level:2})) return "Heading 2";
    if(editor.isActive("heading",{level:3})) return "Heading 3";
    if(editor.isActive("heading",{level:4})) return "Heading 4";
    return "Normal text";
  };
  const fs = editor.getAttributes("textStyle").fontSize?.replace("px","")||"11";
  const ff = editor.getAttributes("textStyle").fontFamily||"Arial, sans-serif";
  const ffLabel = FONTS.find(f=>f.value===ff)?.label||"Arial";
  const textColor = editor.getAttributes("textStyle").color||"#000000";
  const saveLabel = saveStatus==="saved"?"Saved to Drive":saveStatus==="saving"?"Saving…":saveStatus==="unsaved"?"Unsaved":"Save failed";

  function applyFs(val:string){ const n=parseInt(val); if(!isNaN(n)&&n>0) (editor as any).chain().focus().setFontSize(`${n}px`).run(); setFsInput(null); }

  return (
    /* Entire chrome wrapper — white bg */
    <div style={{ background:"#fff", borderBottom:"1px solid #c7c8ca" }}>

      {/* ── Row 1: Title row — doc icon + title left, save status, word count right ── */}
      <div className="flex items-center px-3 gap-1" style={{ height:44 }}>
        {/* Blue doc icon (back button) */}
        <button onClick={onBack} title="Back to documents" className="flex-shrink-0 mr-1 hover:opacity-80 transition">
          <svg width="28" height="28" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#1a73e8"/><path d="M14 2v6h6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1"/><path d="M8 12h8M8 15h5" stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </button>

        {/* Title */}
        <input value={title} onChange={e=>onTitleChange(e.target.value)}
          className="text-[18px] font-normal text-[#3c4043] bg-transparent outline-none border-b border-transparent hover:border-[#c7c8ca] focus:border-[#1a73e8] transition px-1"
          style={{minWidth:140,maxWidth:380}}
          placeholder="Untitled document"/>

        {/* Saved to Drive */}
        <span className="text-[13px] text-[#5f6368] whitespace-nowrap ml-1">{saveLabel}</span>

        <div className="flex-1"/>

        {/* Word count — right side */}
        <span className="text-[13px] text-[#3c4043] tabular-nums mr-1">{wordCount} words</span>
      </div>

      {/* ── Row 2: Menu bar — File Edit View Insert Format Tools ── */}
      <div className="flex items-center px-3" style={{ height:28 }}>
        <MenuBar editor={editor} onLink={onLink} onImage={onImage}/>
      </div>

      {/* ── Row 2: Toolbar ── */}
      {/* exact background: white. height: 40px */}
      <div className="flex items-center px-2 gap-0.5" style={{ height:40, background:"#fff", borderTop:"1px solid #e0e0e0" }}>

        {/* Undo/Redo */}
        <TB title="Undo (Ctrl+Z)" onClick={()=>editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Ico.Undo/></TB>
        <TB title="Redo (Ctrl+Y)" onClick={()=>editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Ico.Redo/></TB>
        {/* Print */}
        <TB title="Print (Ctrl+P)" onClick={()=>window.print()}><Ico.Print/></TB>
        {/* Spell check */}
        <TB title="Spell check" onClick={()=>{}}><Ico.SpellCheck/></TB>

        <Sep/>

        {/* 100% zoom */}
        <button className="h-8 px-2 flex items-center gap-0.5 rounded hover:bg-[#e9eaeb] text-[13px] text-[#3c4043] transition flex-shrink-0">
          100% <Ico.ChevDown/>
        </button>

        <Sep/>

        {/* Heading */}
        <div className="relative flex-shrink-0" ref={hRef}>
          <button onMouseDown={e=>e.preventDefault()} onClick={()=>setHOpen(s=>!s)}
            className="h-8 px-2 flex items-center gap-1 rounded hover:bg-[#e9eaeb] text-[13px] text-[#3c4043] transition" style={{minWidth:106}}>
            <span className="flex-1 text-left">{headLabel()}</span><Ico.ChevDown/>
          </button>
          {hOpen&&(
            <div className="absolute top-full mt-0.5 left-0 w-52 rounded bg-white shadow-xl border border-[#dadce0] py-1 z-50">
              {HEADING_OPTS.map(o=>(
                <button key={o.label} onMouseDown={e=>e.preventDefault()}
                  onClick={()=>{o.cmd(editor);setHOpen(false);}}
                  className={`w-full text-left px-4 py-2 hover:bg-[#e9eaeb] transition ${o.cls}`}>{o.label}</button>
              ))}
            </div>
          )}
        </div>

        <Sep/>

        {/* Font family */}
        <div className="relative flex-shrink-0" ref={fRef}>
          <button onMouseDown={e=>e.preventDefault()} onClick={()=>setFOpen(s=>!s)}
            className="h-8 px-2 flex items-center gap-1 rounded hover:bg-[#e9eaeb] text-[13px] text-[#3c4043] transition" style={{minWidth:80}}>
            <span className="flex-1 text-left truncate">{ffLabel}</span><Ico.ChevDown/>
          </button>
          {fOpen&&(
            <div className="absolute top-full mt-0.5 left-0 w-52 rounded bg-white shadow-xl border border-[#dadce0] py-1 z-50 max-h-60 overflow-y-auto">
              {FONTS.map(f=>(
                <button key={f.value} onMouseDown={e=>e.preventDefault()}
                  onClick={()=>{editor.chain().focus().setFontFamily(f.value).run();setFOpen(false);}}
                  className={`w-full text-left px-4 py-1.5 text-[13px] hover:bg-[#e9eaeb] transition ${ff===f.value?"text-[#1a73e8] font-medium":"text-[#3c4043]"}`}
                  style={{fontFamily:f.value}}>{f.label}</button>
              ))}
            </div>
          )}
        </div>

        <Sep/>

        {/* Font size: exact Docs style — no border box, just − number + */}
        <div className="flex items-center gap-0 flex-shrink-0">
          <button onMouseDown={e=>e.preventDefault()}
            onClick={()=>{ const n=parseInt(fs); if(n>1)(editor as any).chain().focus().setFontSize(`${n-1}px`).run(); }}
            className="w-6 h-8 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#3c4043] text-[18px] leading-none transition">−</button>
          <input type="text"
            value={fsInput!==null?fsInput:fs}
            onFocus={()=>setFsInput(fs)}
            onChange={e=>setFsInput(e.target.value)}
            onBlur={e=>applyFs(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") applyFs((e.target as HTMLInputElement).value); if(e.key==="Escape") setFsInput(null); }}
            className="w-[26px] text-center text-[13px] text-[#3c4043] bg-transparent outline-none border border-transparent hover:border-[#c7c8ca] focus:border-[#1a73e8] rounded transition"/>
          <button onMouseDown={e=>e.preventDefault()}
            onClick={()=>{ const n=parseInt(fs); (editor as any).chain().focus().setFontSize(`${n+1}px`).run(); }}
            className="w-6 h-8 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#3c4043] text-[18px] leading-none transition">+</button>
        </div>

        <Sep/>

        {/* B I U S */}
        <TB title="Bold (Ctrl+B)" onClick={()=>editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Ico.Bold/></TB>
        <TB title="Italic (Ctrl+I)" onClick={()=>editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Ico.Italic/></TB>
        <TB title="Underline (Ctrl+U)" onClick={()=>editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}><Ico.Underline/></TB>
        <TB title="Strikethrough" onClick={()=>editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}><Ico.Strike/></TB>

        {/* Text color: A with colored underline bar — exactly like Docs */}
        <div className="relative flex-shrink-0" title="Text color">
          <div className="h-8 w-8 flex flex-col items-center justify-center rounded hover:bg-[#e9eaeb] transition cursor-pointer">
            <span className="text-[14px] font-bold text-[#3c4043] leading-none select-none" style={{fontFamily:"Arial"}}>A</span>
            <div className="w-[18px] h-[3px] rounded-sm" style={{backgroundColor:textColor,marginTop:1}}/>
            <input type="color" onMouseDown={e=>e.preventDefault()}
              onInput={e=>editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
              value={textColor} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
          </div>
        </div>

        {/* Highlight: pen icon with yellow bar — exactly like Docs */}
        <div className="h-8 w-8 flex flex-col items-center justify-center rounded hover:bg-[#e9eaeb] transition cursor-pointer flex-shrink-0"
          title="Highlight color"
          onClick={()=>editor.chain().focus().toggleHighlight({color:"#ffff00"}).run()}>
          <Ico.Highlight/>
          <div className="w-[18px] h-[3px] rounded-sm bg-yellow-300" style={{marginTop:1}}/>
        </div>

        <Sep/>

        {/* Link, Image */}
        <TB title="Insert link (Ctrl+K)" onClick={onLink} active={editor.isActive("link")}><Ico.Link/></TB>
        <TB title="Insert image" onClick={onImage}><Ico.Image/></TB>

        <Sep/>

        {/* Align L/C/R */}
        <TB title="Align left" onClick={()=>editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({textAlign:"left"})}><Ico.AlignLeft/></TB>
        <TB title="Align center" onClick={()=>editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({textAlign:"center"})}><Ico.AlignCenter/></TB>
        <TB title="Align right" onClick={()=>editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({textAlign:"right"})}><Ico.AlignRight/></TB>

        {/* Line spacing */}
        <div className="relative flex-shrink-0" ref={lhRef}>
          <TB title="Line & paragraph spacing" onClick={()=>setLhOpen(s=>!s)} active={lhOpen}><Ico.Spacing/></TB>
          {lhOpen&&(
            <div className="absolute top-full mt-0.5 left-0 w-32 rounded bg-white shadow-xl border border-[#dadce0] py-1 z-50">
              {LINE_SPACINGS.map(lh=>(
                <button key={lh.value} onMouseDown={e=>e.preventDefault()}
                  onClick={()=>{(editor as any).chain().focus().setLineHeight(lh.value).run();setLhOpen(false);}}
                  className="w-full text-left px-4 py-1.5 text-[13px] text-[#3c4043] hover:bg-[#e9eaeb] transition">{lh.label}</button>
              ))}
            </div>
          )}
        </div>

        <Sep/>

        {/* Bullet / Numbered / Indent dec / Indent inc */}
        <TB title="Bulleted list (Ctrl+Shift+8)" onClick={()=>editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><Ico.BulletList/></TB>
        <TB title="Numbered list (Ctrl+Shift+7)" onClick={()=>editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><Ico.NumList/></TB>
        <TB title="Decrease indent" onClick={()=>editor.chain().focus().liftListItem("listItem").run()} disabled={!editor.can().liftListItem("listItem")}><Ico.IndentDec/></TB>
        <TB title="Increase indent" onClick={()=>editor.chain().focus().sinkListItem("listItem").run()} disabled={!editor.can().sinkListItem("listItem")}><Ico.IndentInc/></TB>

        <Sep/>

        {/* Blockquote / Clear formatting */}
        <TB title="Blockquote" onClick={()=>editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}><Ico.Blockquote/></TB>
        <TB title="Clear formatting" onClick={()=>editor.chain().focus().clearNodes().unsetAllMarks().run()}><Ico.ClearFormat/></TB>
      </div>

      {/* ── Row 3: Ruler — full viewport width, gray outside page, white inside ── */}
      <div style={{ height:22, background:"#e8eaed", borderBottom:"1px solid #c7c8ca", overflow:"hidden", position:"relative", width:"100%" }}>
        {/* Full-width gray base — page content zone rendered centered */}
        <div style={{ position:"absolute", inset:0, display:"flex", justifyContent:"center" }}>
          {/* White content zone + ticks, centered over the 816px page */}
          <div style={{ position:"relative", width:816, height:22, flexShrink:0 }}>
            <svg width="816" height="22" style={{display:"block",position:"absolute",top:0,left:0}}>
              {/* White zone for content area (between margins) */}
              <rect x="96" y="0" width="624" height="22" fill="#fff"/>
              {/* Tick marks */}
              {Array.from({length:105}).map((_,i)=>{
                const x=96+i*6; if(x>720) return null;
                const rel=i*6;
                const isMaj=rel%96===0; const isMid=rel%48===0;
                const y1=isMaj?3:isMid?8:12;
                return <line key={i} x1={x} y1={y1} x2={x} y2={22} stroke="#bdc1c6" strokeWidth="0.75"/>;
              })}
              {/* Inch labels */}
              {[1,2,3,4,5,6].map(n=>(
                <text key={n} x={96+n*96} y={8} fontSize="9" fill="#80868b" textAnchor="middle" fontFamily="Arial">{n}</text>
              ))}
              {/* Left margin handle — upward-pointing triangle ▲ at top of ruler */}
              <polygon points="96,0 90,10 102,10" fill="#4285f4"/>
              {/* Right margin handle */}
              <polygon points="720,0 714,10 726,10" fill="#4285f4"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ SELECTION BUBBLE ═══════════ */
function SelectionBubble({ editor, onLink }: { editor: Editor; onLink: ()=>void }) {
  return (
    <BubbleMenu editor={editor} pluginKey="sel-bub"
      shouldShow={({editor,state})=>!editor.isActive("image")&&state.selection.from!==state.selection.to}
      tippyOptions={{placement:"top",offset:[0,6],zIndex:9800}}>
      <div className="rounded bg-white shadow-lg border border-[#dadce0] p-0.5 flex items-center gap-0.5">
        <TB title="Bold" onClick={()=>editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Ico.Bold/></TB>
        <TB title="Italic" onClick={()=>editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Ico.Italic/></TB>
        <TB title="Underline" onClick={()=>editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}><Ico.Underline/></TB>
        <TB title="Strikethrough" onClick={()=>editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}><Ico.Strike/></TB>
        <Sep/>
        <TB title="Link" onClick={onLink} active={editor.isActive("link")}><Ico.Link/></TB>
      </div>
    </BubbleMenu>
  );
}

/* ═══════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════ */
export default function WriterEditorPage() {
  const params = useParams();
  const router = useRouter();
  const docId = params?.id as string;

  const [doc, setDoc] = useState<WriterDocument|null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Untitled document");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [wordCount, setWordCount] = useState(0);
  const [showLink, setShowLink] = useState(false);
  const [showImage, setShowImage] = useState(false);

  const saveTimer = useRef<any>(null);
  const titleTimer = useRef<any>(null);

  // Lock body scroll
  useEffect(()=>{
    const html=document.documentElement, body=document.body;
    const ph=html.style.overflowY, pb=body.style.overflow;
    html.style.overflowY="hidden"; body.style.overflow="hidden";
    return ()=>{ html.style.overflowY=ph; body.style.overflow=pb; };
  },[]);

  // Ctrl+S
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key==="s"){
        e.preventDefault();
        if(!editor) return;
        setSaveStatus("saving");
        const wc=editor.getText().trim().split(/\s+/).filter(Boolean).length;
        updateDocument({id:docId,content:editor.getJSON(),word_count:wc})
          .then(()=>setSaveStatus("saved")).catch(()=>setSaveStatus("error"));
      }
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[docId]);

  const editor = useEditor({
    extensions:[
      StarterKit.configure({heading:{levels:[1,2,3,4]},history:false}),
      History,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      LineHeight,
      Highlight.configure({multicolor:true}),
      TextAlign.configure({types:["heading","paragraph"]}),
      Placeholder.configure({placeholder:"Start typing…"}),
      Link2.configure({openOnClick:false,HTMLAttributes:{class:"gdoc-link"}}),
      ResizableImage,
      Typography,
    ],
    editable:true,
    content:"",
    editorProps:{
      attributes:{
        class:"gdoc-body focus:outline-none",
        style:"font-family:Arial,sans-serif;font-size:11pt;line-height:1.15;color:#000;caret-color:#000;",
      },
    },
    onUpdate:({editor})=>{
      const text=editor.getText().trim();
      const wc=text?text.split(/\s+/).filter(Boolean).length:0;
      setWordCount(wc);
      setSaveStatus("unsaved");
      if(saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current=setTimeout(async()=>{
        setSaveStatus("saving");
        try{ await updateDocument({id:docId,content:editor.getJSON(),word_count:wc}); setSaveStatus("saved"); }
        catch{ setSaveStatus("error"); }
      },1500);
    },
  });

  useEffect(()=>{
    if(!editor||!docId) return;
    setLoading(true);
    getDocument(docId).then(d=>{
      if(!d){ router.push("/admin/writer"); return; }
      setDoc(d); setTitle(d.title); setWordCount(d.word_count||0);
      queueMicrotask(()=>{
        editor.commands.setContent(d.content||{type:"doc",content:[{type:"paragraph"}]},false);
        setLoading(false);
      });
    }).catch(()=>router.push("/admin/writer"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[editor,docId]);

  const handleTitle = useCallback((v:string)=>{
    setTitle(v);
    if(titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current=setTimeout(()=>updateDocument({id:docId,title:v||"Untitled document"}),800);
  },[docId]);

  return (
    <AdminGuard>
      <style>{`
        /* Shell background — exact Docs grey */
        .gdoc-shell { background:#e8eaed; }

        /* Page content defaults */
        .gdoc-body { min-height:100%; word-break:break-word; }
        .gdoc-body p { margin:0; min-height:1.3em; }
        .gdoc-body h1 { font-size:20pt; font-weight:400; margin:16pt 0 0; line-height:1.15; font-family:Arial,sans-serif; }
        .gdoc-body h2 { font-size:16pt; font-weight:400; margin:14pt 0 0; line-height:1.15; font-family:Arial,sans-serif; }
        .gdoc-body h3 { font-size:14pt; font-weight:700; color:#434343; margin:12pt 0 0; line-height:1.15; font-family:Arial,sans-serif; }
        .gdoc-body h4 { font-size:12pt; font-weight:700; color:#666; margin:11pt 0 0; line-height:1.15; font-family:Arial,sans-serif; }
        .gdoc-body ul { list-style-type:disc; padding-left:2em; margin:0; }
        .gdoc-body ol { list-style-type:decimal; padding-left:2em; margin:0; }
        .gdoc-body li { margin:0; }
        .gdoc-body blockquote { border-left:3px solid #ccc; padding-left:12pt; color:#666; margin:6pt 0; font-style:italic; }
        .gdoc-body pre { background:#f8f9fa; border:1px solid #e0e0e0; border-radius:2px; padding:8px 12px; font-size:10pt; overflow-x:auto; margin:4px 0; font-family:'Courier New',monospace; }
        .gdoc-body pre code { background:none; border:none; padding:0; }
        .gdoc-body code { background:#f1f3f4; border-radius:2px; padding:1px 4px; font-size:10pt; font-family:'Courier New',monospace; }
        .gdoc-link { color:#1155cc; text-decoration:underline; }
        .gdoc-body hr { border:none; border-top:1px solid #e0e0e0; margin:8pt 0; }
        .gdoc-body mark { padding:0; }
        /* Placeholder */
        .ProseMirror p.is-editor-empty:first-child::before { color:#b7b7b7; content:attr(data-placeholder); float:left; height:0; pointer-events:none; }
        /* Resizable image handles */
        .ri-handle { position:absolute; bottom:-4px; right:-4px; width:10px; height:10px; background:#1a73e8; border-radius:2px; cursor:se-resize; display:block; }
        .ri-sel img { outline:2px solid #1a73e8; }
        /* Page shadow — exact Docs */
        .gdoc-page { box-shadow:0 1px 3px rgba(0,0,0,.3),0 4px 8px 3px rgba(0,0,0,.15); }
        @media print { .gdoc-chrome{display:none!important;} .gdoc-shell{background:white!important;} .gdoc-page{box-shadow:none!important;} }
      `}</style>

      <div className="flex flex-col gdoc-shell" style={{height:"100vh",overflow:"hidden"}}>

        {/* Chrome */}
        <div className="gdoc-chrome flex-shrink-0">
          {loading?(
            <div style={{background:"#fff"}}>
              <div style={{height:48,borderBottom:"1px solid #c7c8ca"}} className="animate-pulse bg-white"/>
              <div style={{height:40,borderBottom:"1px solid #c7c8ca",background:"#fff"}} className="animate-pulse"/>
              <div style={{height:22,borderBottom:"1px solid #c7c8ca",background:"#fff"}} className="animate-pulse"/>
            </div>
          ):(
            <Toolbar editor={editor} onLink={()=>setShowLink(true)} onImage={()=>setShowImage(true)}
              wordCount={wordCount} title={title} onTitleChange={handleTitle}
              saveStatus={saveStatus} onBack={()=>router.push("/admin/writer")}/>
          )}
        </div>

        {/* Scrollable canvas */}
        <div className="flex-1 overflow-auto gdoc-shell" style={{minHeight:0}}>
          <div className="flex justify-center" style={{paddingTop:20,paddingBottom:40,minHeight:"100%"}}>
            {/* Google Docs page: 8.5in @ 96dpi = 816px, 1in margins = 96px */}
            <div className="gdoc-page bg-white" style={{width:816,minHeight:1056,padding:"96px 96px",flexShrink:0}}>
              <EditorContent editor={editor}/>
            </div>
          </div>
        </div>

        {/* Status bar — exact Docs: thin 24px bar, text left, last saved right */}
        <div className="gdoc-chrome flex-shrink-0 flex items-center px-4 gap-1" style={{height:24,background:"#fff",borderTop:"1px solid #e0e0e0",position:"relative"}}>
          <span className="text-[12px] text-[#3c4043] tabular-nums">{wordCount} words</span>
          <span className="text-[12px] text-[#3c4043]">·</span>
          <span className="text-[12px] text-[#3c4043]">Ctrl+S to save</span>
          <div className="flex-1"/>
          {doc&&<span className="text-[12px] text-[#3c4043]">Last saved {new Date(doc.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
        </div>
        {/* N avatar — floats bottom-left, overlapping status bar, exactly like Docs */}
        <div style={{position:"fixed",bottom:8,left:8,zIndex:100}}
          className="w-9 h-9 rounded-full bg-[#444746] flex items-center justify-center shadow-md cursor-pointer hover:opacity-90 transition select-none">
          <span className="text-white text-[14px] font-medium">N</span>
        </div>
      </div>

      {/* Bubble menus */}
      {editor&&<SelectionBubble editor={editor} onLink={()=>setShowLink(true)}/>}

      {/* Modals */}
      {showLink&&editor&&<LinkModal editor={editor} onClose={()=>setShowLink(false)}/>}
      {showImage&&editor&&<ImageModal editor={editor} onClose={()=>setShowImage(false)}/>}
    </AdminGuard>
  );
}
