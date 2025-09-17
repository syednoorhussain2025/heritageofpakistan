// src/app/admin/listings/ArticlesSection.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import FlowComposer from "@/modules/flow-layout/FlowComposer";
import type {
  Section as FlowSection,
  ImageSlot,
  SectionKind,
} from "@/modules/flow-layout/FlowComposer";
import "@/modules/flow-layout/flow-layout.css";
import Icon from "@/components/Icon";

/* -------------------------------------------------------------- */
/* Types                                                          */
/* -------------------------------------------------------------- */

type ImagePick = {
  slotId?: string;
  src?: string;
  alt?: string | null;
  caption?: string | null;
  href?: string | null;
  aspectRatio?: number;
};

export type CustomSection = {
  id: string;
  title: string;
  /** Manual builder data (kept inside custom_sections_json) */
  sections_json?: FlowSection[];
  /** Persisted preview HTML for public page */
  layout_html?: string | null;
};

type ArticlesSectionProps = {
  siteId: string | number;

  /* manual builder data per default part – mapped to existing *_layout_json */
  history_layout_json?: FlowSection[] | null;
  architecture_layout_json?: FlowSection[] | null;
  climate_layout_json?: FlowSection[] | null;

  /* snapshots (optional; passed through) – existing columns */
  history_layout_html?: string | null;
  architecture_layout_html?: string | null;
  climate_layout_html?: string | null;

  /* custom sections (stored in existing custom_sections_json column) */
  custom_sections_json?: CustomSection[];

  /** change sink */
  onChange: (patch: any) => void;
};

/* -------------------------------------------------------------- */
/* Helpers & small components                                     */
/* -------------------------------------------------------------- */

const inputStyles =
  "w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500";

async function publicUrl(bucket: string, key: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}

/** debounce helper (deps must be a FIXED-LENGTH array of primitives) */
function useDebouncedEffect(
  effect: () => void,
  deps: readonly unknown[],
  delay = 400
) {
  const timeout = useRef<number | null>(null);
  useEffect(() => {
    if (timeout.current) window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => effect(), delay);
    return () => timeout.current && window.clearTimeout(timeout.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Build an off-screen sizer that mirrors the public page container+grid.
 * We read the width of the RIGHT column (main content), so our preview matches. */
function usePublicMainWidth() {
  const mainRef = useRef<HTMLDivElement | null>(null);
  const [px, setPx] = useState<number | null>(null);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setPx(Math.round(r.width));
    };

    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();

    return () => ro.disconnect();
  }, []);

  // Render the offscreen sizer once
  return {
    px,
    Sizer: () => (
      <div
        aria-hidden
        className="fixed -left-[99999px] -top-[99999px] pointer-events-none opacity-0"
      >
        {/* container/gutters & grid copied from public page */}
        <div className="max-w-screen-2xl mx-auto my-6 px-[54px] md:px-[82px] lg:px-[109px] lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6">
          <aside />
          <main ref={mainRef} />
        </div>
      </div>
    ),
  };
}

/** Strip all editor-only UI & attributes before saving HTML */
function snapshotCleanHTML(root: HTMLElement): string {
  const node = root.cloneNode(true) as HTMLElement;

  // Remove editor-only elements
  node.querySelectorAll("[data-edit-only]").forEach((el) => el.remove());

  // Strip editor decoration classes (borders/rings/padding)
  node.querySelectorAll<HTMLElement>(".flow-editor-decor").forEach((el) => {
    const classes = (el.getAttribute("class") || "")
      .split(/\s+/)
      .filter(Boolean)
      .filter(
        (c) =>
          ![
            "flow-editor-decor",
            "ring",
            "ring-1",
            "ring-2",
            "ring-dashed",
            "ring-gray-100",
            "ring-gray-200",
            "ring-gray-300",
            "border",
            "border-dashed",
            "border-gray-100",
            "border-gray-200",
            "border-gray-300",
            "rounded",
            "rounded-md",
            "rounded-lg",
            "rounded-xl",
            "bg-gray-50",
            "p-1",
            "p-1.5",
            "p-2",
            "p-2.5",
          ].includes(c) &&
          !c.startsWith("ring-") &&
          !c.startsWith("border-")
      );
    el.setAttribute("class", classes.join(" "));
  });

  // Remove contenteditable & data flags
  node.querySelectorAll("[contenteditable], [data-editing]").forEach((el) => {
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-editing");
  });

  return (node.innerHTML || "").trim();
}

/* -------------------------------------------------------------- */
/* Lightweight Toast                                              */
/* -------------------------------------------------------------- */

type Toast = { id: string; message: string };

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = (message: string) => {
    const t = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message,
    };
    setToasts((prev) => [...prev, t]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 1800);
  };
  const remove = (id: string) =>
    setToasts((prev) => prev.filter((x) => x.id !== id));
  return { toasts, add, remove };
}

function ToastViewport({
  toasts,
  onClose,
}: {
  toasts: Toast[];
  onClose: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2" data-edit-only>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 rounded-lg bg-gray-900 text-white shadow-lg px-3 py-2"
          role="status"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 text-emerald-400"
            >
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.415l-7.01 7.011a1 1 0 01-1.415 0L3.296 8.724a1 1 0 111.415-1.415l3.16 3.16 6.303-6.303a1 1 0 011.53.124z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div className="text-sm">{t.message}</div>
          <button
            className="ml-2 text-xs text-gray-300 hover:text-white"
            onClick={() => onClose(t.id)}
            aria-label="Dismiss"
          >
            Close
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Image Picker Modal (masonry + hover zoom + click-outside close) */
/* -------------------------------------------------------------- */

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
    aspectRatio?: number;
  }) => void;
  siteId: string | number;
}) {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>(
    {}
  );

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    (async () => {
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
      if (!cancelled) {
        setImages(withUrls);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show, siteId]);

  // Close with ESC
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      data-edit-only
      onClick={onClose} // click outside closes
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()} // prevent inner clicks from bubbling
      >
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
            <p className="text-gray-600">Loading images…</p>
          ) : images.length ? (
            // Masonry using CSS multi-column layout
            <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-x-4">
              {images.map((img) => {
                const d = dims[img.publicUrl];
                const orient =
                  d?.w && d?.h
                    ? d.w === d.h
                      ? "square"
                      : d.w > d.h
                      ? "landscape"
                      : "portrait"
                    : undefined;
                return (
                  <div
                    key={img.publicUrl}
                    className="mb-4 break-inside-avoid"
                    title={img.alt_text || ""}
                  >
                    <button
                      type="button"
                      className="group block w-full text-left"
                      onClick={() =>
                        onImageSelect({
                          ...img,
                          aspectRatio:
                            d?.w && d?.h && d.h > 0 ? d.w / d.h : undefined,
                        })
                      }
                    >
                      <div className="relative w-full overflow-hidden rounded-md border border-gray-300 bg-white">
                        <img
                          src={img.publicUrl}
                          alt={img.alt_text || ""}
                          loading="lazy"
                          className="w-full h-auto transition-transform duration-200 ease-out group-hover:scale-[1.03]"
                          style={{ willChange: "transform" }}
                          onLoad={(e) => {
                            const el = e.currentTarget;
                            if (el.naturalWidth && el.naturalHeight) {
                              setDims((m) => ({
                                ...m,
                                [img.publicUrl]: {
                                  w: el.naturalWidth,
                                  h: el.naturalHeight,
                                },
                              }));
                            }
                          }}
                        />
                        {orient && (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] rounded bg-black/70 text-white">
                            {orient}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {img.alt_text || "No alt text"}
                      </p>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500">
              No images found in the gallery for this site.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Card Header                                                    */
/* -------------------------------------------------------------- */

function CardHeader({
  title,
  iconKey,
}: {
  title: string;
  iconKey:
    | "history-background"
    | "architecture-design"
    | "climate-topography"
    | "custom";
}) {
  const resolvedIcon = iconKey === "custom" ? "history-background" : iconKey;

  return (
    <div className="flex items-center gap-3 mb-3">
      <span
        className="grid place-items-center w-9 h-9 rounded-full"
        style={{ backgroundColor: "#F78300" }}
      >
        <Icon name={resolvedIcon} className="w-4 h-4 text-white" />
      </span>
      <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* PartComposer (manual builder + snapshot + inline controls)     */
/* -------------------------------------------------------------- */

function PartComposer({
  siteId,
  title,
  iconKey,
  initialSections,
  onSectionsChange,
  /** called with current preview HTML (or null) */
  onSnapshotChange,
}: {
  siteId: string | number;
  title: string;
  iconKey:
    | "history-background"
    | "architecture-design"
    | "climate-topography"
    | "custom";
  initialSections?: FlowSection[] | null;
  onSectionsChange: (secs: FlowSection[]) => void;
  onSnapshotChange: (html: string | null) => void;
}) {
  const [sections, setSections] = useState<FlowSection[]>(
    () => initialSections || []
  );

  // re-hydrate if prop changes from server
  const lastInitRef = useRef<string>("");
  useEffect(() => {
    const nextKey = JSON.stringify(initialSections || []);
    if (nextKey !== lastInitRef.current) {
      lastInitRef.current = nextKey;
      setSections(initialSections || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialSections || [])]);

  const previewRef = useRef<HTMLDivElement>(null);

  // sizing that mirrors the public page
  const { px: publicMainWidth, Sizer } = usePublicMainWidth();

  // toasts
  const { toasts, add: addToast, remove: removeToast } = useToasts();

  // pick image via gallery modal handshake
  const [showGallery, setShowGallery] = useState(false);
  const pickImage = async (slotId: string) =>
    new Promise<ImageSlot>((resolve) => {
      setShowGallery(true);
      (window as any).__pick = (img: any) => {
        setShowGallery(false);
        resolve({
          slotId,
          src: img.publicUrl,
          alt: img.alt_text || "",
          caption: img.caption || null, // default from gallery
          // keep a copy for fallback in FlowComposer
          // @ts-ignore – FlowComposer extends ImageSlot at runtime
          galleryCaption: img.caption || null,
          aspectRatio:
            typeof img.aspectRatio === "number" ? img.aspectRatio : undefined,
        });
      };
    });

  /* ---- insertion popover state ---- */
  const [insertAt, setInsertAt] = useState<number | null>(null);

  /* ---- helpers ---- */

  const makeNewSection = (kind: SectionKind): FlowSection => {
    const base = { type: kind, paddingY: "none", bg: "none" } as FlowSection;
    return kind === "full-width-image"
      ? { ...base, images: [{ slotId: "fw-1" }] }
      : kind === "two-images"
      ? { ...base, images: [{ slotId: "slot_1" }, { slotId: "slot_2" }] }
      : kind === "three-images"
      ? {
          ...base,
          images: [
            { slotId: "slot_1" },
            { slotId: "slot_2" },
            { slotId: "slot_3" },
          ],
        }
      : kind === "image-left-text-right"
      ? { ...base, images: [{ slotId: "left-1" }], text: { text: "" } }
      : kind === "image-right-text-left"
      ? { ...base, images: [{ slotId: "right-1" }], text: { text: "" } }
      : { ...base, text: { text: "" } };
  };

  const addSectionAt = (kind: SectionKind, index: number) => {
    const next = [...sections];
    next.splice(index, 0, makeNewSection(kind));
    setSections(next);
    onSectionsChange(next);
    setInsertAt(null);
    addToast("Section inserted");
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const arr = [...sections];
    const [s] = arr.splice(idx, 1);
    arr.splice(j, 0, s);
    setSections(arr);
    onSectionsChange(arr);
    addToast(dir < 0 ? "Moved up" : "Moved down");
  };

  const deleteSection = (idx: number) => {
    const arr = [...sections];
    arr.splice(idx, 1);
    setSections(arr);
    onSectionsChange(arr);
    addToast("Section deleted");
  };

  const updateOne = (idx: number, updated: FlowSection) => {
    const arr = [...sections];
    arr[idx] = updated;
    setSections(arr);
    onSectionsChange(arr);
  };

  // Sync the snapshot; strip editor-only UI
  useDebouncedEffect(
    () => {
      const root = previewRef.current;
      if (!root) return onSnapshotChange(null);
      const html = snapshotCleanHTML(root);
      onSnapshotChange(html && sections.length ? html : null);
    },
    [JSON.stringify(sections || [])] as const,
    250
  );

  // Close insertion popover on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInsertAt(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------
  // Section type options (formerly sidebar)
  // ------------------------------------------
  const sectionDefs: {
    kind: SectionKind;
    label: string;
    iconLeft?: string;
    iconRight?: string;
    tooltip: string;
  }[] = [
    {
      kind: "image-left-text-right",
      label: "Image Left / Text Right",
      iconLeft: "image",
      iconRight: "align-center",
      tooltip: "Two-column: image on the left, text on the right",
    },
    {
      kind: "image-right-text-left",
      label: "Image Right / Text Left",
      iconLeft: "align-center",
      iconRight: "image",
      tooltip: "Two-column: text on the left, image on the right",
    },
    {
      kind: "full-width-text",
      label: "Full-width Text",
      iconLeft: "align-center",
      tooltip: "Single column, text spans the full width",
    },
    {
      kind: "full-width-image",
      label: "Full-width Image",
      iconLeft: "image",
      tooltip: "Single column, image spans the full width",
    },
    {
      kind: "two-images",
      label: "Two Images",
      iconLeft: "image",
      iconRight: "image",
      tooltip: "Two images in a row",
    },
    {
      kind: "three-images",
      label: "Three Images",
      iconLeft: "image",
      iconRight: "image",
      tooltip: "Three images in a row",
    },
  ];

  const InsertionButton = ({
    index,
    topOffset = -10, // px offset to sit at the junction
  }: {
    index: number;
    topOffset?: number;
  }) => (
    <div
      className="absolute"
      style={{ left: -28, top: topOffset }}
      data-edit-only
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setInsertAt((cur) => (cur === index ? null : index));
        }}
        title="Add section here"
        className="grid place-items-center w-7 h-7 rounded-full bg-emerald-600 text-white shadow-md hover:shadow-lg transition transform hover:scale-105 active:scale-100"
      >
        +
      </button>

      {/* Popover */}
      {insertAt === index && (
        <>
          {/* click-outside catcher */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setInsertAt(null)}
            data-edit-only
          />
          <div
            className="absolute z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
            style={{ left: 36 }}
            data-edit-only
          >
            <div className="text-xs text-gray-500 px-2 py-1">Add section</div>
            <div className="max-h-64 overflow-auto space-y-1">
              {sectionDefs.map((def) => (
                <button
                  key={def.kind}
                  className="w-full text-left px-2 py-2 rounded-md hover:bg-emerald-50 flex items-center gap-2"
                  title={def.tooltip}
                  onClick={() => addSectionAt(def.kind, index)}
                >
                  {def.iconLeft && (
                    <span className="inline-flex h-5 w-5 rounded bg-gray-100 border border-gray-200 grid place-items-center">
                      <Icon name={def.iconLeft as any} className="w-3 h-3" />
                    </span>
                  )}
                  {def.iconRight && (
                    <span className="inline-flex h-5 w-5 rounded bg-gray-100 border border-gray-200 grid place-items-center">
                      <Icon name={def.iconRight as any} className="w-3 h-3" />
                    </span>
                  )}
                  <span className="text-sm text-gray-800">{def.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const SectionControls = ({ index }: { index: number }) => (
    <div
      className="absolute top-1/2 -translate-y-1/2"
      style={{ right: -40 }}
      data-edit-only
    >
      <div className="flex flex-col gap-1">
        <button
          className="px-2 py-1 rounded border bg-white hover:bg-gray-50 shadow-sm disabled:opacity-40"
          onClick={() => moveSection(index, -1)}
          disabled={index === 0}
          title="Move up"
        >
          ↑
        </button>
        <button
          className="px-2 py-1 rounded border bg-white hover:bg-gray-50 shadow-sm disabled:opacity-40"
          onClick={() => moveSection(index, +1)}
          disabled={index === sections.length - 1}
          title="Move down"
        >
          ↓
        </button>
        <button
          className="px-2 py-1 rounded border bg-white hover:bg-red-50 text-red-600 shadow-sm"
          onClick={() => deleteSection(index)}
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );

  // ------------------------------------------

  return (
    <>
      <Sizer />
      <ToastViewport toasts={toasts} onClose={removeToast} />

      {/* Single wide preview column (sidebar removed) */}
      <div
        className="rounded-xl bg-white shadow-sm"
        style={{
          padding: 20,
          width: publicMainWidth ? publicMainWidth : undefined,
          maxWidth: "100%",
          marginInline: "auto",
        }}
      >
        <CardHeader title={title} iconKey={iconKey} />

        <div ref={previewRef} className="relative">
          {/* No sections: show first add affordance */}
          {sections.length === 0 && (
            <div
              className="relative border border-dashed border-gray-300 rounded-xl p-10 text-center"
              data-edit-only
            >
              <div className="text-gray-500 mb-3">No content yet</div>
              <div className="inline-block relative">
                <button
                  type="button"
                  className="grid place-items-center w-12 h-12 rounded-full bg-emerald-600 text-white shadow-md hover:shadow-lg transition transform hover:scale-105 active:scale-100"
                  onClick={() => setInsertAt(0)}
                  title="Add first section"
                >
                  +
                </button>
                {/* Popover for first add */}
                {insertAt === 0 && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setInsertAt(null)}
                      data-edit-only
                    />
                    <div
                      className="absolute z-50 mt-3 left-1/2 -translate-x-1/2 w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                      data-edit-only
                    >
                      <div className="text-xs text-gray-500 px-2 py-1">
                        Add section
                      </div>
                      <div className="max-h-64 overflow-auto space-y-1">
                        {sectionDefs.map((def) => (
                          <button
                            key={def.kind}
                            className="w-full text-left px-2 py-2 rounded-md hover:bg-emerald-50 flex items-center gap-2"
                            title={def.tooltip}
                            onClick={() => addSectionAt(def.kind, 0)}
                          >
                            {def.iconLeft && (
                              <span className="inline-flex h-5 w-5 rounded bg-gray-100 border border-gray-200 grid place-items-center">
                                <Icon
                                  name={def.iconLeft as any}
                                  className="w-3 h-3"
                                />
                              </span>
                            )}
                            {def.iconRight && (
                              <span className="inline-flex h-5 w-5 rounded bg-gray-100 border border-gray-200 grid place-items-center">
                                <Icon
                                  name={def.iconRight as any}
                                  className="w-3 h-3"
                                />
                              </span>
                            )}
                            <span className="text-sm text-gray-800">
                              {def.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Sections list with junction “+” and per-section controls */}
          {sections.map((s, i) => (
            <div key={i} className="relative my-6">
              {/* Junction “+” (before each section, including the first) */}
              <InsertionButton index={i} topOffset={-12} />

              {/* The actual section content (single-section composer) */}
              <div className="flow-section-wrapper">
                <FlowComposer
                  sections={[s]}
                  onChange={(arr) => {
                    if (Array.isArray(arr) && arr[0]) {
                      updateOne(i, arr[0] as FlowSection);
                    }
                  }}
                  onPickImage={(slot) => pickImage(slot)}
                  showToolbar={false}
                  showControls={false}
                  debugFrames={false}
                />
              </div>

              {/* Controls on the right, outside the content */}
              <SectionControls index={i} />
            </div>
          ))}

          {/* Note: by design we do NOT render a trailing "+" after the last section,
              since your requirement specified the junctions and the first add. */}
        </div>
      </div>

      {/* Image gallery modal */}
      <GalleryBrowserModal
        show={showGallery}
        onClose={() => setShowGallery(false)}
        onImageSelect={(img) => {
          const fn = (window as any).__pick;
          if (typeof fn === "function") fn(img);
        }}
        siteId={siteId}
      />
    </>
  );
}

/* -------------------------------------------------------------- */
/* Custom Sections helpers                                        */
/* -------------------------------------------------------------- */

function newCustomSection(): CustomSection {
  return {
    id:
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`) ||
      String(+new Date()),
    title: "Untitled Section",
    sections_json: [],
    layout_html: null,
  };
}

/* -------------------------------------------------------------- */
/* Exported page component                                        */
/* -------------------------------------------------------------- */

export default function ArticlesSection({
  siteId,
  /* manual builder data per default part (existing *_layout_json) */
  history_layout_json,
  architecture_layout_json,
  climate_layout_json,
  /* snapshots (passed through) */
  history_layout_html,
  architecture_layout_html,
  climate_layout_html,
  /* custom sections (manual) */
  custom_sections_json,
  onChange,
}: ArticlesSectionProps) {
  const customSections = useMemo<CustomSection[]>(
    () =>
      (custom_sections_json || []).map((s) => ({ sections_json: [], ...s })),
    [custom_sections_json]
  );

  return (
    <div className="space-y-8">
      {/* History & Background */}
      <PartComposer
        siteId={siteId}
        title="History & Background"
        iconKey="history-background"
        initialSections={history_layout_json || []}
        onSectionsChange={(secs) => onChange({ history_layout_json: secs })}
        onSnapshotChange={(html) => onChange({ history_layout_html: html })}
      />

      {/* Architecture & Design */}
      <PartComposer
        siteId={siteId}
        title="Architecture & Design"
        iconKey="architecture-design"
        initialSections={architecture_layout_json || []}
        onSectionsChange={(secs) =>
          onChange({ architecture_layout_json: secs })
        }
        onSnapshotChange={(html) =>
          onChange({ architecture_layout_html: html })
        }
      />

      {/* Climate, Geography & Environment */}
      <PartComposer
        siteId={siteId}
        title="Climate, Geography & Environment"
        iconKey="climate-topography"
        initialSections={climate_layout_json || []}
        onSectionsChange={(secs) => onChange({ climate_layout_json: secs })}
        onSnapshotChange={(html) => onChange({ climate_layout_html: html })}
      />

      {/* Custom Sections */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-gray-900">
            Custom Sections
          </h3>
          <button
            type="button"
            onClick={() =>
              onChange({
                custom_sections_json: [...customSections, newCustomSection()],
              })
            }
            className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-500"
          >
            Add Section
          </button>
        </div>

        {customSections.length === 0 ? (
          <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-6 text-sm text-gray-500">
            No custom sections yet.
          </div>
        ) : (
          customSections.map((cs, idx) => (
            <div key={cs.id} className="space-y-4">
              {/* For custom sections we reuse PartComposer with inline controls */}
              <PartComposer
                siteId={siteId}
                title={cs.title || "Untitled Section"}
                iconKey="custom"
                initialSections={cs.sections_json || []}
                onSectionsChange={(secs) =>
                  updateCustom(idx, { sections_json: secs })
                }
                onSnapshotChange={(html) =>
                  updateCustom(idx, { layout_html: html })
                }
              />

              {/* Title input for the custom section */}
              <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Section Title
                </label>
                <input
                  className={inputStyles}
                  value={cs.title}
                  onChange={(e) => updateCustom(idx, { title: e.target.value })}
                  placeholder="e.g., Cultural Significance"
                />

                <div className="pt-3" data-edit-only>
                  <button
                    type="button"
                    onClick={() => removeCustom(idx)}
                    className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-500"
                  >
                    Delete Custom Section
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  function updateCustom(index: number, patch: Partial<CustomSection>) {
    const next = [...customSections];
    next[index] = { ...next[index], ...patch };
    onChange({ custom_sections_json: next });
  }

  function removeCustom(index: number) {
    const next = [...customSections];
    next.splice(index, 1);
    onChange({ custom_sections_json: next });
  }
}
