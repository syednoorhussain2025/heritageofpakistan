"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import NotebookEditor from "@/components/NotebookEditor";
import {
  createNote,
  listNotes,
  TravelNote,
  updateNote,
  NoteType,
} from "@/lib/notebook";
import AddFromCollectionsModal, {
  PickerInsertItem,
} from "@/components/AddFromCollectionsModal";

// Tiptap
import {
  useEditor,
  Editor,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  BubbleMenu,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import History from "@tiptap/extension-history";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import ImageExt from "@tiptap/extension-image";

/* ===================== Resizable + Alignable Image node view ===================== */

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
  const title = (node.attrs.title as string) || "";
  const display = (node.attrs.display as "inline" | "block") || "block";
  const align =
    (node.attrs.align as "left" | "center" | "right" | null) || null;

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
    const startRect = el.getBoundingClientRect();
    const startWidth = startRect.width;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - clientXStart;
      const newWidth = clamp(Math.round(startWidth + delta), 60, 2000);
      scheduleWidthUpdate(newWidth);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    beginResize(e.clientX);
  }
  function onHandleTouchStart(e: React.TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    const t = e.touches?.[0];
    if (t) beginResize(t.clientX);
  }

  const wrapperStyle: React.CSSProperties = { lineHeight: 0 };
  if (display === "inline") {
    wrapperStyle.display = "inline-block";
    if (align === "left") {
      wrapperStyle.float = "left";
      wrapperStyle.margin = "0 8px 4px 0";
    } else if (align === "right") {
      wrapperStyle.float = "right";
      wrapperStyle.margin = "0 0 4px 8px";
    } else if (align === "center") {
      wrapperStyle.display = "block";
      wrapperStyle.textAlign = "center";
      wrapperStyle.float = "none";
      wrapperStyle.margin = "6px 0";
    }
  } else {
    wrapperStyle.display = "block";
    wrapperStyle.clear = "both";
    wrapperStyle.textAlign = "left";
    // Keep margins predictable
    if (wrapperStyle.marginTop == null) wrapperStyle.marginTop = 0;
    if (wrapperStyle.marginBottom == null) wrapperStyle.marginBottom = 8;
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`resizable-image ${selected ? "is-selected" : ""}`}
      contentEditable={false}
      style={wrapperStyle}
    >
      <span className="ri-box inline-block relative" style={{ lineHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          title={title}
          style={{
            width: width ? `${width}px` : "auto",
            maxWidth: "100%",
            height: "auto",
            display: "block",
          }}
        />
        {selected && (
          <span
            className="ri-handle ri-handle-se"
            onMouseDown={onHandleMouseDown}
            onTouchStart={onHandleTouchStart}
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
        renderHTML: (attrs) => {
          const w = attrs.width;
          return w ? { style: `width:${w}px` } : {};
        },
        parseHTML: (el) => {
          const style = (el.getAttribute("style") || "").toLowerCase();
          const m = style.match(/width:\s*([\d.]+)px/);
          return m ? Number(m[1]) : null;
        },
      },
      display: {
        default: "block",
        renderHTML: (attrs) => ({ "data-display": attrs.display }),
        parseHTML: (el) => el.getAttribute("data-display") || "block",
      },
      align: {
        default: null,
        renderHTML: (attrs) =>
          attrs.align ? { "data-align": attrs.align } : {},
        parseHTML: (el) => el.getAttribute("data-align") || null,
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

/* ================================ Lightweight Skeletons ================================ */

function SidebarItemSkeleton() {
  return (
    <li className="p-2.5 rounded-lg border-b border-gray-200 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="w-3.5 h-3.5 rounded bg-gray-200 animate-pulse" />
        <div className="h-3 w-40 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="h-2 w-24 bg-gray-200 rounded mt-2 ml-6 animate-pulse" />
    </li>
  );
}

function TitleBarSkeleton() {
  return (
    <div className="h-16 flex-shrink-0 px-6 border-b border-gray-200 flex items-center justify-between gap-4">
      <div className="h-6 w-1/3 bg-gray-200 rounded animate-pulse" />
      <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
    </div>
  );
}

function ToolbarSkeleton() {
  return (
    <div className="flex-shrink-0 px-6 py-2 border-b border-gray-200 flex items-center flex-wrap gap-1.5">
      {Array.from({ length: 14 }).map((_, i) => (
        <div
          key={i}
          className="h-7 rounded bg-gray-200 animate-pulse"
          style={{ width: i % 4 === 0 ? 64 : 28 }}
        />
      ))}
      <div className="ml-auto h-7 w-16 rounded bg-gray-200 animate-pulse" />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex-1 overflow-hidden px-8 py-6">
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-4/6 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse" />
      </div>
    </div>
  );
}

/* ================================ Page ================================ */

export default function TravelNotebookPage() {
  const [notes, setNotes] = useState<TravelNote[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Existing loading for notes list
  const [loadingList, setLoadingList] = useState(true);

  // New: loading state for the right pane while switching/creating notes
  const [contentLoading, setContentLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // outer frame that must fit exactly in viewport under the header
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState<number | undefined>(undefined);

  const shellRef = useRef<HTMLDivElement>(null);
  const titleDebounceTimer = useRef<any>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeId),
    [notes, activeId]
  );

  // --- Lock page scrolling while notebook is mounted (prevents browser scrollbar)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflowY = html.style.overflowY;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflowY = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflowY = prevHtmlOverflowY;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        history: false,
        blockquote: false,
        codeBlock: false,
      }),
      Underline,
      Link,
      Placeholder.configure({ placeholder: "Start writing here..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
      History,
      TextStyle,
      Color,
      FontFamily,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ResizableImage,
    ],
    editable: false,
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral max-w-none text-base leading-relaxed focus:outline-none",
      },
    },
    onBlur: ({ editor }) => {
      if (activeNote) {
        const currentNoteState = notes.find((n) => n.id === activeNote.id);
        const latestContent = editor.getJSON();
        if (
          JSON.stringify(currentNoteState?.content) !==
          JSON.stringify(latestContent)
        ) {
          updateNote({
            id: activeNote.id,
            content: latestContent,
            content_text: editor.getText(),
          });
        }
      }
    },
  });

  useEffect(() => {
    (async () => {
      setLoadingList(true);
      const rows = await listNotes();
      setNotes(rows);
      setLoadingList(false);
    })();

    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);

    const onFullscreenChange = () =>
      setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  // Fit the frame to the viewport below the header (no page scrollbar)
  useEffect(() => {
    const compute = () => {
      const el = frameRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      const bottomPad = parseFloat(styles.paddingBottom || "0");
      const h = Math.max(
        320,
        Math.floor(window.innerHeight - rect.top - bottomPad)
      );
      setFrameHeight(h);
    };
    const raf = requestAnimationFrame(compute);
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
    };
  }, []);

  // schedule content updates in a microtask (prevents flushSync warning)
  const schedule = (fn: () => void) => {
    if (typeof queueMicrotask === "function") queueMicrotask(fn);
    else Promise.resolve().then(fn);
  };

  // Manage editor content & content skeleton
  useEffect(() => {
    if (!editor) return;

    editor.setEditable(!!activeNote);

    if (activeNote) {
      // show skeleton while swapping note content
      setContentLoading(true);
      const nextContent = activeNote.content || "";
      schedule(() => {
        if (!editor) return;
        editor.commands.setContent(nextContent, false);
        // small timeout to allow the DOM to paint before removing skeleton
        setTimeout(() => setContentLoading(false), 120);
      });
    } else {
      schedule(() => {
        if (!editor) return;
        editor.commands.clearContent();
        setContentLoading(false);
      });
    }
  }, [activeNote, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateNote = async (type: NoteType) => {
    setMenuOpen(false);
    setContentLoading(true);
    const row = await createNote(type);
    const updatedNotes = await listNotes();
    setNotes(updatedNotes);
    setActiveId(row.id);
    // contentLoading will be cleared by the effect above after setContent
  };

  const handleTitleChange = (id: string, title: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title } : n)));
    if (titleDebounceTimer.current) clearTimeout(titleDebounceTimer.current);
    titleDebounceTimer.current = setTimeout(async () => {
      await updateNote({ id, title });
    }, 800);
  };

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.content_text || "").toLowerCase().includes(q)
    );
  }, [notes, search]);

  return (
    <div
      ref={frameRef}
      className="w-full p-4 bg-white font-sans overflow-hidden overscroll-contain"
      style={{ height: frameHeight ? `${frameHeight}px` : undefined }}
    >
      <div
        ref={shellRef}
        id="notebook-shell"
        className={`h-full w-full max-w-7xl mx-auto bg-white shadow-2xl flex min-h-0 overflow-hidden ring-1 ring-black/10 transition-all duration-300 ${
          isFullScreen ? "rounded-none max-w-none" : "rounded-xl"
        }`}
      >
        <aside className="w-[300px] flex-shrink-0 bg-gray-100 border-r border-gray-200 flex flex-col min-h-0">
          <div className="h-16 flex-shrink-0 px-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-bold text-lg text-gray-800">My Notebook</h2>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((s) => !s)}
                className="w-9 h-9 rounded-full bg-orange-500 text-white shadow hover:bg-orange-600 active:scale-95 transition-all inline-flex items-center justify-center"
              >
                <Icon name="plus" size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white ring-1 ring-black/5 shadow-xl p-2 animate-fadeIn z-10">
                  <button
                    onClick={() => handleCreateNote("note")}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition"
                  >
                    <span className="w-7 h-7 bg-orange-100 text-orange-500 rounded-md flex items-center justify-center">
                      <Icon name="file-alt" size={14} />
                    </span>
                    <div className="text-sm font-medium">New Note</div>
                  </button>
                  <button
                    onClick={() => handleCreateNote("checklist")}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition"
                  >
                    <span className="w-7 h-7 bg-orange-100 text-orange-500 rounded-md flex items-center justify-center">
                      <Icon name="tasks" size={14} />
                    </span>
                    <div className="text-sm font-medium">New Checklist</div>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="p-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entries..."
              className="w-full h-10 px-4 rounded-full bg-white border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 outline-none transition text-sm"
            />
          </div>
          <div className="flex-1 overflow-auto p-2 min-h-0">
            {loadingList ? (
              <ul>
                {Array.from({ length: 8 }).map((_, i) => (
                  <SidebarItemSkeleton key={i} />
                ))}
              </ul>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center p-4 text-sm text-gray-500">
                No notes found.
              </div>
            ) : (
              <ul>
                {filteredNotes.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => {
                      setActiveId(n.id);
                      setContentLoading(true);
                    }}
                    className={`p-2.5 rounded-lg cursor-pointer border-b border-gray-200 last:border-b-0 transition-colors ${
                      activeId === n.id
                        ? "bg-orange-100"
                        : "hover:bg-gray-200/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-sm text-gray-800 truncate">
                      <Icon
                        name={n.type === "note" ? "file-alt" : "tasks"}
                        size={12}
                        className="text-orange-500 flex-shrink-0"
                      />
                      {n.title}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-1 pl-6">
                      {new Date(n.created_at).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-white min-h-0">
          {!activeNote ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 p-6">
              <Icon name="book" size={48} className="text-gray-300 mb-4" />
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                Welcome to your Travel Notebook!
              </h3>
              <p className="max-w-md text-gray-600">
                Select an item from the left, or create a new one to get
                started. Plan your trips or make notes
              </p>
            </div>
          ) : contentLoading ? (
            <>
              <TitleBarSkeleton />
              <ToolbarSkeleton />
              <EditorSkeleton />
            </>
          ) : (
            <>
              <div className="h-16 flex-shrink-0 px-6 border-b border-gray-200 flex items-center justify-between gap-4">
                <input
                  value={activeNote.title}
                  onChange={(e) =>
                    handleTitleChange(activeNote.id, e.target.value)
                  }
                  className="bg-transparent text-2xl font-bold text-gray-800 outline-none w-full"
                />
                <button
                  onClick={() => {
                    if (!shellRef.current) return;
                    if (!document.fullscreenElement)
                      shellRef.current.requestFullscreen();
                    else document.exitFullscreen();
                  }}
                  title="Toggle Fullscreen"
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Icon name={isFullScreen ? "compress" : "expand"} size={16} />
                </button>
              </div>

              {/* Toolbar */}
              <Toolbar
                editor={editor}
                onOpenPicker={() => setPickerOpen(true)}
              />

              {/* Image BubbleMenu */}
              {editor && (
                <ImageBubbleMenu
                  editor={editor}
                  containerEl={shellRef.current}
                />
              )}

              {/* Only this area scrolls */}
              <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
                <NotebookEditor editor={editor} />
              </div>
            </>
          )}
        </main>
      </div>

      <style jsx global>{`
        .animate-fadeIn {
          animation: fadeIn 120ms ease-out both;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.98) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .prose :where(ul):not(:where([class~="not-prose"] *)) {
          list-style-type: disc;
        }
        .prose :where(ol):not(:where([class~="not-prose"] *)) {
          list-style-type: decimal;
        }
        .prose :where(blockquote):not(:where([class~="not-prose"] *)) {
          border-left-color: #e5e7eb;
          font-style: italic;
        }
        .resizable-image.is-selected .ri-box img {
          outline: 2px solid rgba(0, 0, 0, 0.25);
          outline-offset: 2px;
          border-radius: 2px;
        }
        .resizable-image .ri-handle {
          position: absolute;
          width: 10px;
          height: 10px;
          background: #fff;
          border: 2px solid #111827;
          border-radius: 2px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
          cursor: nwse-resize;
          user-select: none;
          touch-action: none;
        }
        .resizable-image .ri-handle-se {
          right: -6px;
          bottom: -6px;
        }
      `}</style>

      {/* Modal lives outside the editor tree */}
      <AddFromCollectionsModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onInsert={(items: PickerInsertItem[]) => {
          if (!editor || items.length === 0) return;
          const chain = editor.chain().focus();
          items.forEach((p) => {
            chain.setImage({
              src: p.src,
              alt: p.alt ?? undefined,
              title: p.title ?? undefined,
            });
          });
          chain.run();
        }}
        bucket="site-images"
      />
    </div>
  );
}

/* ----------------------------- Image Bubble ----------------------------- */

function ImageBubbleMenu({
  editor,
  containerEl,
}: {
  editor: Editor;
  containerEl: HTMLElement | null | undefined;
}) {
  const [, force] = useState({});
  useEffect(() => {
    const rerender = () => force({});
    editor.on("transaction", rerender);
    return () => {
      // ✅ return void cleanup; do not return the Editor instance
      editor.off("transaction", rerender);
    };
  }, [editor]);

  const attrs = editor.getAttributes("image") || {};
  const display: "inline" | "block" = attrs.display || "block";
  const align: "left" | "center" | "right" | null = attrs.align || null;

  const setDisplay = (mode: "inline" | "block") => {
    const patch: any = { display: mode };
    if (mode === "block") patch.align = null;
    editor.chain().focus().updateAttributes("image", patch).run();
  };
  const setAlign = (a: "left" | "center" | "right") => {
    if (display !== "inline") return;
    editor.chain().focus().updateAttributes("image", { align: a }).run();
  };

  // stable append container (avoid NotFoundError & fullscreen clipping)
  const appendRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!appendRef.current) {
      const el =
        (typeof document !== "undefined" && document.fullscreenElement
          ? (containerEl as HTMLElement) ||
            (document.fullscreenElement as HTMLElement)
          : (document.body as HTMLElement)) || null;
      appendRef.current = el;
    }
  }, [containerEl]);

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="image-bubble"
      shouldShow={({ editor }) => editor.isActive("image")}
      tippyOptions={{
        placement: "top",
        offset: [0, 8],
        appendTo: () => (appendRef.current as HTMLElement) || document.body,
        zIndex: 2147483647,
        popperOptions: { strategy: "fixed" } as any,
      }}
    >
      <div className="rounded-xl bg-white shadow-xl ring-1 ring-black/10 p-1 flex items-center gap-1">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDisplay("inline")}
          className={`px-2 h-7 rounded text-sm ${
            display === "inline"
              ? "bg-gray-200 text-gray-900"
              : "hover:bg-gray-100 text-gray-700"
          }`}
          title="Inline image"
        >
          Inline
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDisplay("block")}
          className={`px-2 h-7 rounded text-sm ${
            display === "block"
              ? "bg-gray-200 text-gray-900"
              : "hover:bg-gray-100 text-gray-700"
          }`}
          title="Block image"
        >
          Block
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAlign("left")}
          disabled={display !== "inline"}
          className={`h-7 w-7 rounded inline-flex items-center justify-center ${
            align === "left" && display === "inline"
              ? "bg-gray-200 text-gray-900"
              : "hover:bg-gray-100 text-gray-700"
          } disabled:opacity-40`}
          title="Align left"
        >
          <Icon name="align-left" size={14} />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAlign("center")}
          disabled={display !== "inline"}
          className={`h-7 w-7 rounded inline-flex items-center justify-center ${
            align === "center" && display === "inline"
              ? "bg-gray-200 text-gray-900"
              : "hover:bg-gray-100 text-gray-700"
          } disabled:opacity-40`}
          title="Align center"
        >
          <Icon name="align-center" size={14} />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAlign("right")}
          disabled={display !== "inline"}
          className={`h-7 w-7 rounded inline-flex items-center justify-center ${
            align === "right" && display === "inline"
              ? "bg-gray-200 text-gray-900"
              : "hover:bg-gray-100 text-gray-700"
          } disabled:opacity-40`}
          title="Align right"
        >
          <Icon name="align-right" size={14} />
        </button>
      </div>
    </BubbleMenu>
  );
}

/* ----------------------------- Toolbar ----------------------------- */

const ToolbarButton = React.memo(
  ({
    active,
    onClick,
    title,
    children,
    disabled = false,
  }: {
    active?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${
        active
          ? "bg-gray-300 text-gray-900"
          : "text-gray-500 hover:bg-gray-200 hover:text-gray-800"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
);
ToolbarButton.displayName = "ToolbarButton";

function Toolbar({
  editor,
  onOpenPicker,
}: {
  editor: Editor | null;
  onOpenPicker: () => void;
}) {
  const [_, set_] = useState({});
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const forceUpdate = () => set_({});
    editor.on("transaction", forceUpdate);

    const handleClickOutside = (e: MouseEvent) => {
      if (
        headingMenuRef.current &&
        !headingMenuRef.current.contains(e.target as Node)
      ) {
        setHeadingMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      editor.off("transaction", forceUpdate);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [editor]);

  if (!editor) return null;

  const getHeadingLabel = () => {
    if (editor.isActive("heading", { level: 1 })) return "H1";
    if (editor.isActive("heading", { level: 2 })) return "H2";
    if (editor.isActive("heading", { level: 3 })) return "H3";
    if (editor.isActive("heading", { level: 4 })) return "H4";
    return "Normal";
  };

  return (
    <div className="flex-shrink-0 px-6 py-2 border-b border-gray-200 flex items-center flex-wrap gap-1.5">
      <div className="relative" ref={headingMenuRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setHeadingMenuOpen((s) => !s)}
          className="h-7 px-2.5 flex items-center gap-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm font-medium"
        >
          {getHeadingLabel()} <Icon name="chevron-down" size={12} />
        </button>
        {headingMenuOpen && (
          <div className="absolute top-full mt-1 w-40 rounded-lg bg-white ring-1 ring-black/5 shadow-lg p-1.5 z-10">
            <button
              onClick={() => {
                editor.chain().focus().setParagraph().run();
                setHeadingMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100"
            >
              Normal
            </button>
            <button
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 1 }).run();
                setHeadingMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100"
            >
              Heading 1
            </button>
            <button
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 2 }).run();
                setHeadingMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100"
            >
              Heading 2
            </button>
            <button
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 3 }).run();
                setHeadingMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100"
            >
              Heading 3
            </button>
            <button
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 4 }).run();
                setHeadingMenuOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100"
            >
              Heading 4
            </button>
          </div>
        )}
      </div>
      <select
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) =>
          editor.chain().focus().setFontFamily(e.target.value).run()
        }
        value={editor.getAttributes("textStyle").fontFamily || "system-ui"}
        className="h-7 px-2 flex items-center rounded bg-gray-100 hover:bg-gray-200 text-sm font-medium border-0 outline-none focus:ring-2 focus:ring-orange-400"
      >
        <option value="system-ui">System</option>
        <option value="Inter">Inter</option>
        <option value="Georgia">Georgia</option>
      </select>
      <div className="h-5 w-px bg-gray-200 mx-1" />
      <ToolbarButton
        title="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
      >
        <Icon name="bold" size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
      >
        <Icon name="italic" size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Underline"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
      >
        <Icon name="underline" size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
      >
        <Icon name="strikethrough" size={14} />
      </ToolbarButton>
      <input
        type="color"
        onMouseDown={(e) => e.preventDefault()}
        onInput={(e) =>
          editor
            .chain()
            .focus()
            .setColor((e.target as HTMLInputElement).value)
            .run()
        }
        value={editor.getAttributes("textStyle").color || "#000000"}
        className="w-7 h-7 bg-transparent border-0 rounded"
        title="Text color"
      />
      <div className="h-5 w-px bg-gray-200 mx-1" />
      <ToolbarButton
        title="Align Left"
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
      >
        <Icon name="align-left" size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Align Center"
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
      >
        <Icon name="align-center" size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Align Right"
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
      >
        <Icon name="align-right" size={14} />
      </ToolbarButton>
      <div className="h-5 w-px bg-gray-200 mx-1" />
      <ToolbarButton
        title="Bulleted List"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
      >
        <Icon name="list-ul" size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered List"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
      >
        <Icon name="list-ol" size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Checklist"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
      >
        <Icon name="tasks" size={14} />
      </ToolbarButton>
      <div className="h-5 w-px bg-gray-200 mx-1" />
      <ToolbarButton title="Add Image" onClick={onOpenPicker}>
        <Icon name="image" size={14} />
      </ToolbarButton>
      <div className="ml-auto flex items-center gap-1.5">
        <ToolbarButton
          title="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Icon name="undo" size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Icon name="redo" size={14} />
        </ToolbarButton>
      </div>
    </div>
  );
}
