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

  // Remove editor decoration classes applied to inline text blocks
  node.querySelectorAll(".flow-editor-decor").forEach((el) => {
    el.classList.remove(
      "flow-editor-decor",
      "ring-1",
      "ring-dashed",
      "ring-gray-300",
      "rounded-lg",
      "p-2"
    );
  });

  // Remove contenteditable & data flags
  node.querySelectorAll("[contenteditable], [data-editing]").forEach((el) => {
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-editing");
  });

  return (node.innerHTML || "").trim();
}

/* -------------------------------------------------------------- */
/* Image Picker Modal                                             */
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

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[80vh] flex flex-col">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                  <button
                    type="button"
                    key={img.publicUrl}
                    className="group w-full text-left"
                    onClick={() =>
                      onImageSelect({
                        ...img,
                        aspectRatio:
                          d?.w && d?.h && d.h > 0 ? d.w / d.h : undefined,
                      })
                    }
                    title={img.alt_text || ""}
                  >
                    <div className="relative w-full h-32 bg-white rounded-md border border-gray-300 grid place-items-center overflow-hidden">
                      <img
                        src={img.publicUrl}
                        alt={img.alt_text || ""}
                        className="max-h-full max-w-full object-contain"
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
/* PartComposer (manual builder + snapshot)                       */
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
          caption: img.caption || null,
          aspectRatio:
            typeof img.aspectRatio === "number" ? img.aspectRatio : undefined,
        });
      };
    });

  /* ---- outside controls ---- */

  const addSection = (kind: SectionKind) => {
    const base = { type: kind, paddingY: "sm", bg: "none" } as FlowSection;
    const next: FlowSection =
      kind === "full-width-image"
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

    const arr = [...sections, next];
    setSections(arr);
    onSectionsChange(arr);
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const arr = [...sections];
    const [s] = arr.splice(idx, 1);
    arr.splice(j, 0, s);
    setSections(arr);
    onSectionsChange(arr);
  };

  const deleteSection = (idx: number) => {
    const arr = [...sections];
    arr.splice(idx, 1);
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

  return (
    <>
      <Sizer />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Preview card (wider) */}
        <div className="lg:col-span-10">
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
            <div ref={previewRef}>
              <FlowComposer
                sections={sections}
                onChange={(arr) => {
                  setSections(arr);
                  onSectionsChange(arr);
                }}
                onPickImage={(slot) => pickImage(slot)}
                showToolbar={false}
                showControls={false}
                debugFrames={false}
              />
            </div>
          </div>
        </div>

        {/* Sidebar card (narrower) */}
        <div className="lg:col-span-2">
          <div className="rounded-xl bg-white shadow-sm border border-gray-200">
            <div className="p-4 md:p-5 space-y-4">
              <div>
                <div className="text-sm text-gray-600 mb-2">
                  Build this section:
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["image-left-text-right", "Image Left / Text Right"],
                      ["image-right-text-left", "Image Right / Text Left"],
                      ["full-width-text", "Full-width Text"],
                      ["full-width-image", "Full-width Image"],
                      ["two-images", "Two Images"],
                      ["three-images", "Three Images"],
                    ] as [SectionKind, string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      className="px-2.5 py-1.5 rounded-md border text-xs hover:bg-gray-50"
                      onClick={() => addSection(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {sections.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-800 mb-2">
                    Sections
                  </div>
                  <div className="space-y-2">
                    {sections.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 text-xs border rounded-md px-2 py-1"
                      >
                        <span className="truncate">
                          {s.type.replaceAll("-", " ")}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            className="px-2 py-0.5 rounded border hover:bg-gray-50"
                            onClick={() => moveSection(i, -1)}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            className="px-2 py-0.5 rounded border hover:bg-gray-50"
                            onClick={() => moveSection(i, +1)}
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            className="px-2 py-0.5 rounded border text-red-600 hover:bg-red-50"
                            onClick={() => deleteSection(i)}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500">
                Tip: Click an image area to pick a photo. Click inside a text
                box to edit inline. Editor borders & controls are removed from
                the published page automatically.
              </div>
            </div>
          </div>
        </div>
      </div>

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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Preview (wider) */}
                <div className="lg:col-span-10">
                  <div className="rounded-xl bg-white shadow-sm p-5">
                    <CardHeader
                      title={cs.title || "Untitled Section"}
                      iconKey="custom"
                    />
                    <PartComposer
                      siteId={siteId}
                      title=""
                      iconKey="custom"
                      initialSections={cs.sections_json || []}
                      onSectionsChange={(secs) =>
                        updateCustom(idx, { sections_json: secs })
                      }
                      onSnapshotChange={(html) =>
                        updateCustom(idx, { layout_html: html })
                      }
                    />
                  </div>
                </div>

                {/* Sidebar (narrower) */}
                <div className="lg:col-span-2">
                  <div className="rounded-xl bg-white shadow-sm border border-gray-200">
                    <div className="p-4 md:p-5 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Section Title
                        </label>
                        <input
                          className={inputStyles}
                          value={cs.title}
                          onChange={(e) =>
                            updateCustom(idx, { title: e.target.value })
                          }
                          placeholder="e.g., Cultural Significance"
                        />
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => removeCustom(idx)}
                          className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-500"
                        >
                          Delete Section
                        </button>
                      </div>
                    </div>
                  </div>
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
