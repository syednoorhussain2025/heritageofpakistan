"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import YouTube from "@tiptap/extension-youtube";
import TiptapLink from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Node } from "@tiptap/core";
import {
  FaBold,
  FaItalic,
  FaUnderline as FaUnderlineIcon,
  FaListUl,
  FaQuoteRight,
  FaMinus,
  FaLink as FaLinkIcon,
  FaAlignLeft,
  FaAlignCenter,
  FaAlignRight,
  FaImage,
  FaYoutube,
  FaArrowLeft,
  FaArrowRight,
  FaMinus as FaMinusSmall,
  FaCode,
} from "react-icons/fa";
import { supabase } from "@/lib/supabaseClient";

/** Local field wrappers to keep the same look as before */
function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <div className="text-base font-semibold mb-1.5 text-gray-800">
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyles =
  "w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500";

/* ------------------------ Utility ------------------------ */
async function publicUrl(bucket: string, key: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}

/* ---------------- Custom Figure & Figcaption nodes ---------------- */
const Figure = Node.create({
  name: "figure",
  group: "block",
  content: "image figcaption",
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      width: {
        default: "100%",
        parseHTML: (element) => element.style.width,
        renderHTML: (attributes) => ({ style: `width: ${attributes.width}` }),
      },
      float: {
        default: null,
        parseHTML: (element) => element.style.float,
        renderHTML: (attributes) => {
          if (!attributes.float) return {};
          const margin =
            attributes.float === "left"
              ? "0.25rem 0.75rem 0.25rem 0"
              : "0.25rem 0 0.25rem 0.75rem";
          return { style: `float: ${attributes.float}; margin: ${margin}` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", HTMLAttributes, 0];
  },
});

const Figcaption = Node.create({
  name: "figcaption",
  content: "text*",
  marks: "",
  group: "block",
  parseHTML: () => [{ tag: "figcaption" }],
  renderHTML: () => ["figcaption", 0],
});

/* ---------------- Toolbar(s) ---------------- */
function ImageActionToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const btn = (active?: boolean) =>
    `p-2 rounded-md border text-sm flex items-center justify-center
     ${
       active
         ? "bg-indigo-500 text-white border-indigo-600"
         : "bg-white text-gray-700 border-gray-300 hover:bg-gray-200"
     }
     focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`;

  const attrs = editor.getAttributes("figure");
  const currWidth = parseInt(attrs?.width || "100", 10);

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-white border border-gray-300 shadow-lg">
      <span className="text-xs text-gray-600 mr-2">Image:</span>
      <button
        className={btn(attrs?.float === "left")}
        onClick={() =>
          editor
            .chain()
            .focus()
            .updateAttributes("figure", { float: "left" })
            .run()
        }
        title="Float left"
      >
        <FaArrowLeft />
      </button>
      <button
        className={btn(attrs?.float === "right")}
        onClick={() =>
          editor
            .chain()
            .focus()
            .updateAttributes("figure", { float: "right" })
            .run()
        }
        title="Float right"
      >
        <FaArrowRight />
      </button>
      <button
        className={btn(!attrs?.float)}
        onClick={() =>
          editor
            .chain()
            .focus()
            .updateAttributes("figure", { float: null })
            .run()
        }
        title="No float"
      >
        <FaMinusSmall />
      </button>

      <span className="w-px h-6 bg-gray-300" />

      <button
        className={btn()}
        onClick={() => {
          const w = Math.max(10, Math.min(100, currWidth - 10));
          editor
            .chain()
            .focus()
            .updateAttributes("figure", { width: `${w}%` })
            .run();
        }}
        title="Smaller"
      >
        −10%
      </button>

      <input
        type="range"
        min={10}
        max={100}
        value={currWidth}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("figure", { width: `${e.target.value}%` })
            .run()
        }
      />

      <button
        className={btn()}
        onClick={() => {
          const w = Math.max(10, Math.min(100, currWidth + 10));
          editor
            .chain()
            .focus()
            .updateAttributes("figure", { width: `${w}%` })
            .run();
        }}
        title="Larger"
      >
        +10%
      </button>
    </div>
  );
}

function EditorToolbar({
  editor,
  onAddImage,
  onToggleHtmlView,
  isHtmlView,
}: {
  editor: Editor | null;
  onAddImage: () => void;
  onToggleHtmlView: () => void;
  isHtmlView: boolean;
}) {
  if (!editor) return null;

  const btn = (active?: boolean) =>
    `p-2 rounded-md border text-sm flex items-center justify-center
     ${
       active
         ? "bg-indigo-500 text-white border-indigo-600"
         : "bg-white text-gray-700 border-gray-300 hover:bg-gray-200"
     }
     focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`;

  const handleHeadingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const chain = editor.chain().focus();
    switch (value) {
      case "p":
        chain.setParagraph().run();
        break;
      case "h1":
        chain.toggleHeading({ level: 1 }).run();
        break;
      case "h2":
        chain.toggleHeading({ level: 2 }).run();
        break;
      case "h3":
        chain.toggleHeading({ level: 3 }).run();
        break;
      case "h4":
        chain.toggleHeading({ level: 4 }).run();
        break;
      case "h5":
        chain.toggleHeading({ level: 5 }).run();
        break;
    }
  };

  const currentSelection = useMemo(() => {
    if (editor.isActive("paragraph")) return "p";
    if (editor.isActive("heading", { level: 1 })) return "h1";
    if (editor.isActive("heading", { level: 2 })) return "h2";
    if (editor.isActive("heading", { level: 3 })) return "h3";
    if (editor.isActive("heading", { level: 4 })) return "h4";
    if (editor.isActive("heading", { level: 5 })) return "h5";
    return "p";
  }, [editor, editor.state.selection]);

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-100 border-b border-gray-300 rounded-t-md">
      <select
        value={currentSelection}
        onChange={handleHeadingChange}
        className="p-2 rounded-md border bg-white text-gray-700 border-gray-300 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
        <option value="h5">Heading 5</option>
      </select>

      <span className="w-px h-6 bg-gray-300" />

      <button
        className={btn(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
        disabled={isHtmlView}
      >
        <FaBold />
      </button>
      <button
        className={btn(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
        disabled={isHtmlView}
      >
        <FaItalic />
      </button>
      <button
        className={btn(editor.isActive("underline"))}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
        disabled={isHtmlView}
      >
        <FaUnderlineIcon />
      </button>

      <span className="w-px h-6 bg-gray-300" />

      <button
        className={btn()}
        onClick={onAddImage}
        title="Insert image"
        disabled={isHtmlView}
      >
        <FaImage />
      </button>
      <button
        className={btn()}
        onClick={() => {
          const url = window.prompt("YouTube URL");
          if (url) editor?.commands.setYoutubeVideo({ src: url });
        }}
        title="Embed YouTube"
        disabled={isHtmlView}
      >
        <FaYoutube />
      </button>
      <button
        className={btn(editor.isActive("link"))}
        onClick={() => {
          const prev = editor?.getAttributes("link").href;
          const url = window.prompt("URL", prev);
          if (url === null) return;
          if (url === "") {
            editor?.chain().focus().extendMarkRange("link").unsetLink().run();
          } else {
            editor
              ?.chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
          }
        }}
        title="Link"
        disabled={isHtmlView}
      >
        <FaLinkIcon />
      </button>

      <span className="w-px h-6 bg-gray-300" />

      <button
        className={btn(editor.isActive("bulletList"))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
        disabled={isHtmlView}
      >
        <FaListUl />
      </button>
      <button
        className={btn(editor.isActive("blockquote"))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
        disabled={isHtmlView}
      >
        <FaQuoteRight />
      </button>
      <button
        className={btn()}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Divider"
        disabled={isHtmlView}
      >
        <FaMinus />
      </button>

      <span className="w-px h-6 bg-gray-300" />

      <button
        className={btn(editor.isActive({ textAlign: "left" }))}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        title="Align left"
        disabled={isHtmlView}
      >
        <FaAlignLeft />
      </button>
      <button
        className={btn(editor.isActive({ textAlign: "center" }))}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        title="Align center"
        disabled={isHtmlView}
      >
        <FaAlignCenter />
      </button>
      <button
        className={btn(editor.isActive({ textAlign: "right" }))}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        title="Align right"
        disabled={isHtmlView}
      >
        <FaAlignRight />
      </button>

      <span className="w-px h-6 bg-gray-300" />

      <button
        className={btn(isHtmlView)}
        onClick={onToggleHtmlView}
        title="Toggle HTML View"
      >
        <FaCode />
      </button>
    </div>
  );
}

/* ---------------- Gallery Browser Modal for inserting images ---------------- */
function GalleryBrowserModal({
  show,
  onClose,
  onImageSelect,
  siteId,
}: {
  show: boolean;
  onClose: () => void;
  onImageSelect: (image: {
    publicUrl: string;
    alt_text: string;
    caption: string | null;
  }) => void;
  siteId: string | number;
}) {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;

    async function loadImages() {
      setLoading(true);
      const { data, error } = await supabase
        .from("site_images")
        .select("storage_path, alt_text, caption, sort_order")
        .eq("site_id", siteId)
        .order("sort_order", { ascending: false });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      const withUrls = await Promise.all(
        (data || []).map(async (r: any) => ({
          ...r,
          publicUrl: await publicUrl("site-images", r.storage_path),
        }))
      );
      setImages(withUrls);
      setLoading(false);
    }
    loadImages();
  }, [show, siteId]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Select an Image
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-2xl font-bold"
          >
            &times;
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          {loading ? (
            <p className="text-gray-600">Loading images...</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {images.map((img) => (
                <div
                  key={img.publicUrl}
                  className="cursor-pointer group"
                  onClick={() => onImageSelect(img)}
                >
                  <img
                    src={img.publicUrl}
                    alt={img.alt_text || ""}
                    className="w-full h-32 object-cover rounded-md transition-transform group-hover:scale-105 border"
                  />
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {img.alt_text || "No alt text"}
                  </p>
                </div>
              ))}
            </div>
          )}
          {images.length === 0 && !loading && (
            <p className="text-gray-500">
              No images found in the gallery for this site.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- RichTextEditor (exported for CustomSectionsEditor reuse) ---------------- */
export function RichTextEditor({
  value,
  onChange,
  siteId,
}: {
  value: string;
  onChange: (value: string) => void;
  siteId: string | number;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [isHtmlView, setIsHtmlView] = useState(false);
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
      }),
      Underline,
      Image,
      Figure,
      Figcaption,
      YouTube.configure({ modestBranding: true, rel: 0 }),
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose max-w-none p-4 min-h-[250px] focus:outline-none",
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    onSelectionUpdate({ editor }) {
      setIsImageSelected(editor.isActive("figure"));
    },
  });

  const addImage = useCallback(
    (image: {
      publicUrl: string;
      alt_text: string;
      caption: string | null;
    }) => {
      if (image.publicUrl && editor) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "figure",
            content: [
              {
                type: "image",
                attrs: { src: image.publicUrl, alt: image.alt_text },
              },
              {
                type: "figcaption",
                content: [{ type: "text", text: image.caption || "" }],
              },
            ],
          })
          .run();
      }
      setIsModalOpen(false);
    },
    [editor]
  );

  const handleToggleHtmlView = () => {
    if (!isHtmlView && editorContentRef.current) {
      setEditorHeight(editorContentRef.current.clientHeight);
    }
    setIsHtmlView(!isHtmlView);
  };

  if (!siteId) {
    return (
      <div className="p-4 border rounded-md bg-gray-50 text-gray-600">
        Editor requires a site ID to function.
      </div>
    );
  }

  return (
    <>
      <GalleryBrowserModal
        show={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onImageSelect={addImage}
        siteId={siteId}
      />

      {isImageSelected && !isHtmlView && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 p-2">
          <ImageActionToolbar editor={editor} />
        </div>
      )}

      <div className="bg-white border border-gray-300 rounded-md text-black focus-within:ring-2 focus-within:ring-indigo-500 relative">
        <EditorToolbar
          editor={editor}
          onAddImage={() => setIsModalOpen(true)}
          isHtmlView={isHtmlView}
          onToggleHtmlView={handleToggleHtmlView}
        />

        {isHtmlView ? (
          <textarea
            className="w-full p-4 font-mono text-gray-900 bg-white caret-black focus:outline-none resize-y"
            style={{
              height: editorHeight ? `${editorHeight}px` : "250px",
              minHeight: "250px",
            }}
            value={editor?.getHTML()}
            onChange={(e) => {
              editor?.commands.setContent(e.target.value, false);
            }}
            spellCheck="false"
          />
        ) : (
          <div ref={editorContentRef}>
            <EditorContent editor={editor} />
          </div>
        )}
      </div>

      <style jsx>{`
        :global(.prose figure) {
          margin-top: 1.5em;
          margin-bottom: 1.5em;
        }
        :global(.prose figure img) {
          margin: 0 auto;
        }
        :global(.prose figure figcaption) {
          color: #6b7280; /* text-gray-500 */
          font-size: 0.9rem;
          text-align: center;
          margin-top: 0.5rem;
        }
        :global(.ProseMirror-selectednode > figure) {
          outline: 3px solid #3b82f6;
        }
        :global(.no-scrollbar::-webkit-scrollbar) {
          display: none;
        }
        :global(.no-scrollbar) {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </>
  );
}

/* ---------------- ArticlesSection (default export) ---------------- */
export default function ArticlesSection({
  siteId,
  history_content,
  architecture_content,
  climate_env_content,
  onChange,
}: {
  siteId: string | number;
  history_content: string;
  architecture_content?: string;
  climate_env_content?: string;
  onChange: (patch: {
    history_content?: string;
    architecture_content?: string;
    climate_env_content?: string;
  }) => void;
}) {
  return (
    <>
      <FieldBlock label="History & Background">
        <RichTextEditor
          siteId={siteId}
          value={history_content || ""}
          onChange={(content) => onChange({ history_content: content })}
        />
      </FieldBlock>

      <div className="mt-6">
        <FieldBlock label="Architecture & Design (optional)">
          <RichTextEditor
            siteId={siteId}
            value={architecture_content || ""}
            onChange={(content) => onChange({ architecture_content: content })}
          />
        </FieldBlock>
      </div>

      <div className="mt-6">
        <FieldBlock label="Climate, Geography & Environment (optional)">
          <RichTextEditor
            siteId={siteId}
            value={climate_env_content || ""}
            onChange={(content) => onChange({ climate_env_content: content })}
          />
        </FieldBlock>
      </div>
    </>
  );
}
