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
      className={`h-7 min-w-[26px] px-1 inline-flex items-center justify-center rounded transition-colors flex-shrink-0 ${active?"bg-[#e8f0fe] text-[#1967d2]":"text-[#444746] hover:bg-[#e9eaeb]"} disabled:opacity-40 disabled:cursor-not-allowed`}>
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
type MenuItemDef = { label?: string; kbd?: string; action?: ()=>void; sep?: boolean; disabled?: boolean };

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
        className={`px-2 h-6 text-[13px] text-[#3c4043] rounded transition ${open?"bg-[#e9eaeb]":"hover:bg-[#e9eaeb]"}`}>
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
/* ─── Mode icons ─── */
const ModeIcons = {
  Writing: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>,
  Research: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>,
};

function ModeDropdown({ mode, onModeChange }: { mode:"writing"|"research"; onModeChange:(m:"writing"|"research")=>void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={()=>setOpen(s=>!s)}
        className={`h-7 px-2.5 flex items-center gap-1.5 rounded text-[13px] font-medium transition border ${open||mode==="research" ? "bg-[#e8f0fe] text-[#1967d2] border-[#c5d6f8]" : "text-[#3c4043] border-transparent hover:bg-[#e9eaeb]"}`}
        title="Switch mode"
      >
        {mode==="research" ? <ModeIcons.Research/> : <ModeIcons.Writing/>}
        {mode==="writing" ? "Writing" : "Research"}
        <Ico.ChevDown/>
      </button>
      {open&&(
        <div className="absolute top-full right-0 mt-1 w-52 rounded-lg bg-white shadow-2xl border border-[#dadce0] py-1.5 z-[300]">
          <div className="px-3 py-1 text-[11px] font-semibold text-[#80868b] uppercase tracking-wide">Mode</div>
          {(["writing","research"] as const).map(m=>(
            <button key={m} onClick={()=>{ onModeChange(m); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] transition hover:bg-[#f1f3f4] ${mode===m?"text-[#1967d2] font-medium":"text-[#3c4043]"}`}>
              <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${mode===m?"bg-[#e8f0fe] text-[#1967d2]":"bg-[#f1f3f4] text-[#5f6368]"}`}>
                {m==="writing"?<ModeIcons.Writing/>:<ModeIcons.Research/>}
              </span>
              <span>
                <div className="font-medium capitalize">{m}</div>
                <div className="text-[11px] text-[#80868b]">{m==="writing"?"Full-page editor":"Split view with web browser"}</div>
              </span>
              {mode===m&&<svg className="ml-auto flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="#1967d2"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor, onLink, onImage, wordCount, title, onTitleChange, saveStatus, onBack, spellCheck, onToggleSpellCheck, mode, onModeChange }: {
  editor: Editor|null; onLink:()=>void; onImage:()=>void;
  wordCount:number; title:string; onTitleChange:(v:string)=>void;
  saveStatus:SaveStatus; onBack:()=>void;
  spellCheck:boolean; onToggleSpellCheck:()=>void;
  mode:"writing"|"research"; onModeChange:(m:"writing"|"research")=>void;
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
      <div className="flex items-center px-3 gap-1" style={{ height:36 }}>
        {/* Blue doc icon (back button) */}
        <button onClick={onBack} title="Back to documents" className="flex-shrink-0 mr-1 hover:opacity-80 transition">
          <svg width="24" height="24" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#1a73e8"/><path d="M14 2v6h6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1"/><path d="M8 12h8M8 15h5" stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </button>

        {/* Title */}
        <input value={title} onChange={e=>onTitleChange(e.target.value)}
          className="text-[16px] font-normal text-[#3c4043] bg-transparent outline-none border-b border-transparent hover:border-[#c7c8ca] focus:border-[#1a73e8] transition px-1"
          style={{minWidth:140,maxWidth:380}}
          placeholder="Untitled document"/>

        {/* Saved to Drive */}
        <span className="text-[13px] text-[#5f6368] whitespace-nowrap ml-1">{saveLabel}</span>

        <div className="flex-1"/>

        {/* Word count — right side */}
        <span className="text-[13px] text-[#3c4043] tabular-nums mr-1">{wordCount} words</span>
      </div>

      {/* ── Row 2: Menu bar — File Edit View Insert Format Tools ── */}
      <div className="flex items-center px-3" style={{ height:24 }}>
        <MenuBar editor={editor} onLink={onLink} onImage={onImage}/>
      </div>

      {/* ── Row 3: Toolbar ── */}
      <div className="flex items-center px-2 gap-0.5" style={{ height:36, background:"#fff", borderTop:"1px solid #e0e0e0" }}>

        {/* Undo/Redo */}
        <TB title="Undo (Ctrl+Z)" onClick={()=>editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Ico.Undo/></TB>
        <TB title="Redo (Ctrl+Y)" onClick={()=>editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Ico.Redo/></TB>
        {/* Print */}
        <TB title="Print (Ctrl+P)" onClick={()=>window.print()}><Ico.Print/></TB>
        {/* Spell check */}
        <TB title="Toggle spell check" onClick={onToggleSpellCheck} active={spellCheck}><Ico.SpellCheck/></TB>

        <Sep/>


        {/* Heading */}
        <div className="relative flex-shrink-0" ref={hRef}>
          <button onMouseDown={e=>e.preventDefault()} onClick={()=>setHOpen(s=>!s)}
            className="h-7 px-2 flex items-center gap-1 rounded hover:bg-[#e9eaeb] text-[13px] text-[#3c4043] transition" style={{minWidth:106}}>
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
            className="h-7 px-2 flex items-center gap-1 rounded hover:bg-[#e9eaeb] text-[13px] text-[#3c4043] transition" style={{minWidth:80}}>
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
            className="w-5 h-7 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#3c4043] text-[16px] leading-none transition">−</button>
          <input type="text"
            value={fsInput!==null?fsInput:fs}
            onFocus={()=>setFsInput(fs)}
            onChange={e=>setFsInput(e.target.value)}
            onBlur={e=>applyFs(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") applyFs((e.target as HTMLInputElement).value); if(e.key==="Escape") setFsInput(null); }}
            className="w-[26px] text-center text-[13px] text-[#3c4043] bg-transparent outline-none border border-transparent hover:border-[#c7c8ca] focus:border-[#1a73e8] rounded transition"/>
          <button onMouseDown={e=>e.preventDefault()}
            onClick={()=>{ const n=parseInt(fs); (editor as any).chain().focus().setFontSize(`${n+1}px`).run(); }}
            className="w-5 h-7 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#3c4043] text-[16px] leading-none transition">+</button>
        </div>

        <Sep/>

        {/* B I U S */}
        <TB title="Bold (Ctrl+B)" onClick={()=>editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Ico.Bold/></TB>
        <TB title="Italic (Ctrl+I)" onClick={()=>editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Ico.Italic/></TB>
        <TB title="Underline (Ctrl+U)" onClick={()=>editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}><Ico.Underline/></TB>
        <TB title="Strikethrough" onClick={()=>editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}><Ico.Strike/></TB>

        {/* Text color: A with colored underline bar — exactly like Docs */}
        <div className="relative flex-shrink-0" title="Text color">
          <div className="h-7 w-7 flex flex-col items-center justify-center rounded hover:bg-[#e9eaeb] transition cursor-pointer">
            <span className="text-[14px] font-bold text-[#3c4043] leading-none select-none" style={{fontFamily:"Arial"}}>A</span>
            <div className="w-[18px] h-[3px] rounded-sm" style={{backgroundColor:textColor,marginTop:1}}/>
            <input type="color" onMouseDown={e=>e.preventDefault()}
              onInput={e=>editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
              value={textColor} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
          </div>
        </div>

        {/* Highlight: pen icon with yellow bar — exactly like Docs */}
        <div className="h-7 w-7 flex flex-col items-center justify-center rounded hover:bg-[#e9eaeb] transition cursor-pointer flex-shrink-0"
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

        {/* Spacer pushes Modes to far right */}
        <div className="flex-1"/>

        <Sep/>

        {/* Modes dropdown */}
        <ModeDropdown mode={mode} onModeChange={onModeChange}/>
      </div>

      {/* ── Row 3: Ruler — full viewport width, gray outside page, white inside ── */}
      <div style={{ height:20, background:"#e8eaed", borderBottom:"1px solid #c7c8ca", overflow:"hidden", position:"relative", width:"100%" }}>
        {/* Full-width gray base — page content zone rendered centered */}
        <div style={{ position:"absolute", inset:0, display:"flex", justifyContent:"center" }}>
          {/* White content zone + ticks, centered over the 816px page */}
          <div style={{ position:"relative", width:816, height:20, flexShrink:0 }}>
            <svg width="816" height="20" style={{display:"block",position:"absolute",top:0,left:0}}>
              {/* White zone for content area (between margins) */}
              <rect x="96" y="0" width="624" height="20" fill="#fff"/>
              {/* Tick marks */}
              {Array.from({length:105}).map((_,i)=>{
                const x=96+i*6; if(x>720) return null;
                const rel=i*6;
                const isMaj=rel%96===0; const isMid=rel%48===0;
                const y1=isMaj?2:isMid?7:11;
                return <line key={i} x1={x} y1={y1} x2={x} y2={20} stroke="#bdc1c6" strokeWidth="0.75"/>;
              })}
              {/* Inch labels */}
              {[1,2,3,4,5,6].map(n=>(
                <text key={n} x={96+n*96} y={7} fontSize="9" fill="#80868b" textAnchor="middle" fontFamily="Arial">{n}</text>
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

/* ═══════════ RESEARCH PANEL ═══════════ */
function ResearchPanel() {
  const [url, setUrl] = useState("https://www.google.com/webhp?igu=1");
  const [input, setInput] = useState("");
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<"browser"|"notes">("browser");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function navigate(raw: string) {
    let href = raw.trim();
    if(!href) return;
    if(!/^https?:\/\//i.test(href)) href = `https://www.google.com/search?q=${encodeURIComponent(href)}`;
    setUrl(href);
    setInput(href);
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-[#c7c8ca]" style={{minWidth:0}}>
      {/* Panel header */}
      <div className="flex items-center gap-0 flex-shrink-0 border-b border-[#e0e0e0]" style={{height:36,background:"#f8f9fa"}}>
        <button onClick={()=>setTab("browser")}
          className={`px-4 h-full text-[13px] font-medium border-b-2 transition ${tab==="browser"?"border-[#1a73e8] text-[#1a73e8]":"border-transparent text-[#3c4043] hover:bg-[#e9eaeb]"}`}>
          Browser
        </button>
        <button onClick={()=>setTab("notes")}
          className={`px-4 h-full text-[13px] font-medium border-b-2 transition ${tab==="notes"?"border-[#1a73e8] text-[#1a73e8]":"border-transparent text-[#3c4043] hover:bg-[#e9eaeb]"}`}>
          Notes
        </button>
      </div>

      {tab==="browser"&&(<>
        {/* Address bar */}
        <div className="flex items-center gap-1.5 px-2 flex-shrink-0 border-b border-[#e0e0e0]" style={{height:34,background:"#fff"}}>
          <button onClick={()=>{ if(iframeRef.current) iframeRef.current.contentWindow?.history.back(); }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#5f6368] transition flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <button onClick={()=>{ if(iframeRef.current) iframeRef.current.contentWindow?.history.forward(); }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#5f6368] transition flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
          </button>
          <button onClick={()=>{ if(iframeRef.current) iframeRef.current.src=url; }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#5f6368] transition flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24L13 11h7V4l-2.35 2.35z"/></svg>
          </button>
          <form onSubmit={e=>{e.preventDefault();navigate(input);}} className="flex-1 flex">
            <input value={input} onChange={e=>setInput(e.target.value)}
              placeholder="Search or enter URL…"
              className="w-full h-6 text-[12px] text-[#3c4043] bg-[#f1f3f4] rounded-full px-3 outline-none border border-transparent focus:border-[#1a73e8] focus:bg-white transition"/>
          </form>
          <button onClick={()=>window.open(url,"_blank")}
            title="Open in new tab"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#5f6368] transition flex-shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
          </button>
        </div>
        {/* iframe */}
        <iframe ref={iframeRef} src={url} className="flex-1 w-full border-none" style={{minHeight:0}}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
          title="Research browser"/>
      </>)}

      {tab==="notes"&&(
        <div className="flex-1 flex flex-col p-3 gap-2" style={{minHeight:0}}>
          <p className="text-[11px] text-[#80868b]">Scratch pad — notes are saved locally in this session.</p>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)}
            className="flex-1 w-full resize-none text-[13px] text-[#3c4043] border border-[#dadce0] rounded-lg p-3 outline-none focus:border-[#1a73e8] transition leading-relaxed"
            placeholder="Jot down research notes, quotes, references…"
            style={{minHeight:0}}/>
        </div>
      )}
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
  const [spellCheck, setSpellCheck] = useState(true);
  const [mode, setMode] = useState<"writing"|"research">("writing");
  const [zoom, setZoom] = useState(100);
  const saveTimer = useRef<any>(null);
  const titleTimer = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragScrollRef = useRef<number|null>(null);

  // Lock body scroll
  useEffect(()=>{
    const html=document.documentElement, body=document.body;
    const ph=html.style.overflowY, pb=body.style.overflow;
    html.style.overflowY="hidden"; body.style.overflow="hidden";
    return ()=>{ html.style.overflowY=ph; body.style.overflow=pb; };
  },[]);

  // Auto-scroll during drag-select: when mouse is held and moves near top/bottom edge
  useEffect(()=>{
    const el = scrollRef.current;
    if(!el) return;
    let isDragging = false;

    function cancelDragScroll() {
      isDragging = false;
      if(dragScrollRef.current !== null) {
        cancelAnimationFrame(dragScrollRef.current);
        dragScrollRef.current = null;
      }
    }

    function startDragScroll(clientY: number) {
      if(!isDragging) return;
      const rect = el!.getBoundingClientRect();
      const zone = 60; // px from edge to start scrolling
      const maxSpeed = 18;
      let speed = 0;
      if(clientY < rect.top + zone) {
        speed = -maxSpeed * (1 - (clientY - rect.top) / zone);
      } else if(clientY > rect.bottom - zone) {
        speed = maxSpeed * (1 - (rect.bottom - clientY) / zone);
      }
      if(speed !== 0) {
        el!.scrollTop += speed;
      }
    }

    function onMouseDown(e: MouseEvent) {
      if(e.button !== 0) return;
      isDragging = true;
      function onMouseMove(e: MouseEvent) {
        if(!isDragging) return;
        startDragScroll(e.clientY);
      }
      function onMouseUp() {
        cancelDragScroll();
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }
      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("mouseup", onMouseUp);
    }

    el.addEventListener("mousedown", onMouseDown);
    return ()=>{
      el.removeEventListener("mousedown", onMouseDown);
      cancelDragScroll();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        spellcheck:"true",
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

  // Sync spellcheck toggle to the ProseMirror contenteditable element
  useEffect(()=>{
    if(!editor) return;
    const el = editor.view.dom as HTMLElement;
    el.setAttribute("spellcheck", spellCheck ? "true" : "false");
  },[editor, spellCheck]);

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
        /* Smooth, glitch-free text selection */
        .gdoc-page { cursor:text; user-select:text; -webkit-user-select:text; }
        .gdoc-body { cursor:text; user-select:text; -webkit-user-select:text; }
        .gdoc-body * { user-select:text; -webkit-user-select:text; }
        .gdoc-body .ProseMirror { cursor:text; user-select:text; -webkit-user-select:text; }
        /* Zoom slider */
        .zoom-slider { -webkit-appearance:none; appearance:none; height:4px; border-radius:2px; background:#c7c8ca; outline:none; }
        .zoom-slider::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:#1a73e8; cursor:pointer; }
        .zoom-slider::-moz-range-thumb { width:12px; height:12px; border-radius:50%; background:#1a73e8; cursor:pointer; border:none; }
        @media print { .gdoc-chrome{display:none!important;} .gdoc-shell{background:white!important;} .gdoc-page{box-shadow:none!important;} }
      `}</style>

      {/* ── RESEARCH MODE: full-viewport split ── */}
      {mode==="research"&&(
        <div className="flex" style={{height:"100vh",overflow:"hidden"}}>
          {/* Left half — browser */}
          <div className="flex flex-col border-r-2 border-[#c7c8ca]" style={{width:"50%",minWidth:0}}>
            <ResearchPanel/>
          </div>
          {/* Right half — full editor */}
          <div className="flex flex-col gdoc-shell" style={{width:"50%",minWidth:0,overflow:"hidden"}}>
            <div className="gdoc-chrome flex-shrink-0">
              {loading?(
                <div style={{background:"#fff"}}>
                  <div style={{height:60,borderBottom:"1px solid #c7c8ca"}} className="animate-pulse bg-white"/>
                  <div style={{height:36,borderBottom:"1px solid #c7c8ca",background:"#fff"}} className="animate-pulse"/>
                  <div style={{height:20,borderBottom:"1px solid #c7c8ca",background:"#fff"}} className="animate-pulse"/>
                </div>
              ):(
                <Toolbar editor={editor} onLink={()=>setShowLink(true)} onImage={()=>setShowImage(true)}
                  wordCount={wordCount} title={title} onTitleChange={handleTitle}
                  saveStatus={saveStatus} onBack={()=>router.push("/admin/writer")}
                  spellCheck={spellCheck} onToggleSpellCheck={()=>setSpellCheck(s=>!s)}
                  mode={mode} onModeChange={setMode}/>
              )}
            </div>
            <div ref={scrollRef} className="flex-1 gdoc-shell" style={{minHeight:0,overflowY:"scroll",overflowX:"auto"}}>
              <div className="flex justify-center" style={{paddingTop:20,paddingBottom:40,minHeight:"100%"}}>
                <div style={{transformOrigin:"top center",transform:`scale(${zoom/100})`,width:816,minHeight:1056*zoom/100,flexShrink:0}}>
                  <div className="gdoc-page bg-white" style={{width:816,minHeight:1056,padding:"96px 96px"}}>
                    <EditorContent editor={editor}/>
                  </div>
                </div>
              </div>
            </div>
            <div className="gdoc-chrome flex-shrink-0 flex items-center px-4 gap-1" style={{height:28,background:"#fff",borderTop:"1px solid #e0e0e0"}}>
              <span className="text-[12px] text-[#3c4043] tabular-nums">{wordCount} words</span>
              <span className="text-[12px] text-[#3c4043]">·</span>
              <span className="text-[12px] text-[#3c4043]">Ctrl+S to save</span>
              {doc&&<><span className="text-[12px] text-[#3c4043]">·</span><span className="text-[12px] text-[#3c4043]">Saved {new Date(doc.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></>}
              <div className="flex-1"/>
              <div className="flex items-center gap-1.5 select-none">
                <button onClick={()=>setZoom(z=>Math.max(25,z-10))} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#3c4043] text-[16px] leading-none transition">−</button>
                <input type="range" min={25} max={200} step={5} value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="zoom-slider w-24 cursor-pointer"/>
                <button onClick={()=>setZoom(z=>Math.min(200,z+10))} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#3c4043] text-[16px] leading-none transition">+</button>
                <button onClick={()=>setZoom(100)} className="min-w-[42px] text-right text-[12px] text-[#3c4043] hover:bg-[#e9eaeb] rounded px-1 transition tabular-nums">{zoom}%</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── WRITING MODE: standard full-width layout ── */}
      {mode==="writing"&&<div className="flex flex-col gdoc-shell" style={{height:"100vh",overflow:"hidden"}}>

        {/* Chrome */}
        <div className="gdoc-chrome flex-shrink-0">
          {loading?(
            <div style={{background:"#fff"}}>
              <div style={{height:60,borderBottom:"1px solid #c7c8ca"}} className="animate-pulse bg-white"/>
              <div style={{height:36,borderBottom:"1px solid #c7c8ca",background:"#fff"}} className="animate-pulse"/>
              <div style={{height:20,borderBottom:"1px solid #c7c8ca",background:"#fff"}} className="animate-pulse"/>
            </div>
          ):(
            <Toolbar editor={editor} onLink={()=>setShowLink(true)} onImage={()=>setShowImage(true)}
              wordCount={wordCount} title={title} onTitleChange={handleTitle}
              saveStatus={saveStatus} onBack={()=>router.push("/admin/writer")}
              spellCheck={spellCheck} onToggleSpellCheck={()=>setSpellCheck(s=>!s)}
              mode={mode} onModeChange={setMode}/>
          )}
        </div>

        {/* Canvas */}
        <div ref={scrollRef} className="flex-1 gdoc-shell" style={{minHeight:0,overflowY:"scroll",overflowX:"auto"}}>
          <div className="flex justify-center" style={{paddingTop:20,paddingBottom:40,minHeight:"100%"}}>
            <div style={{transformOrigin:"top center",transform:`scale(${zoom/100})`,width:816,minHeight:1056*zoom/100,flexShrink:0}}>
              <div className="gdoc-page bg-white" style={{width:816,minHeight:1056,padding:"96px 96px"}}>
                <EditorContent editor={editor}/>
              </div>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="gdoc-chrome flex-shrink-0 flex items-center px-4 gap-1" style={{height:28,background:"#fff",borderTop:"1px solid #e0e0e0",position:"relative"}}>
          {/* Left: word count + save hint */}
          <span className="text-[12px] text-[#3c4043] tabular-nums">{wordCount} words</span>
          <span className="text-[12px] text-[#3c4043]">·</span>
          <span className="text-[12px] text-[#3c4043]">Ctrl+S to save</span>
          {doc&&<><span className="text-[12px] text-[#3c4043]">·</span><span className="text-[12px] text-[#3c4043]">Saved {new Date(doc.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></>}

          <div className="flex-1"/>

          {/* Right: zoom controls — Word-style */}
          <div className="flex items-center gap-1.5 select-none">
            <button
              onClick={()=>setZoom(z=>Math.max(25,z-10))}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#3c4043] text-[16px] leading-none transition"
              title="Zoom out">−</button>
            <input
              type="range" min={25} max={200} step={5} value={zoom}
              onChange={e=>setZoom(Number(e.target.value))}
              className="zoom-slider w-24 cursor-pointer"
              title={`Zoom: ${zoom}%`}
            />
            <button
              onClick={()=>setZoom(z=>Math.min(200,z+10))}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#e9eaeb] text-[#3c4043] text-[16px] leading-none transition"
              title="Zoom in">+</button>
            <button
              onClick={()=>setZoom(100)}
              className="min-w-[42px] text-right text-[12px] text-[#3c4043] hover:bg-[#e9eaeb] rounded px-1 transition tabular-nums"
              title="Reset zoom">{zoom}%</button>
          </div>
        </div>
        {/* N avatar — floats bottom-left */}
        <div style={{position:"fixed",bottom:8,left:8,zIndex:100}}
          className="w-9 h-9 rounded-full bg-[#444746] flex items-center justify-center shadow-md cursor-pointer hover:opacity-90 transition select-none">
          <span className="text-white text-[14px] font-medium">N</span>
        </div>
      </div>}

      {/* Bubble menus */}
      {editor&&<SelectionBubble editor={editor} onLink={()=>setShowLink(true)}/>}

      {/* Modals */}
      {showLink&&editor&&<LinkModal editor={editor} onClose={()=>setShowLink(false)}/>}
      {showImage&&editor&&<ImageModal editor={editor} onClose={()=>setShowImage(false)}/>}
    </AdminGuard>
  );
}
