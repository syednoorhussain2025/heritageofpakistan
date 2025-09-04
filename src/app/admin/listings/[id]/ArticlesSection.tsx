// src/app/admin/listings/ArticlesSection.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import FlowComposer from "@/modules/flow-layout/FlowComposer";
import {
  seedDefaultSectionTypes,
  loadArchetypeRows,
  loadTemplates,
  type SectionTypeRow,
} from "@/modules/flow-layout/db";
import { DEFAULT_SETTINGS } from "@/modules/flow-layout/default-sections";
import type { TemplateDef } from "@/modules/flow-layout/types";
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
};

export type CustomSection = {
  id: string;
  title: string;
  content: string;
  template_id: string | null;
  images_json: Record<string, ImagePick>;
  /** NEW: persisted preview HTML for public page */
  layout_html?: string | null;
};

type ArticlesSectionProps = {
  siteId: string | number;

  /* default sections */
  history_content: string;
  architecture_content?: string;
  climate_env_content?: string;

  history_template_id?: string | null;
  architecture_template_id?: string | null;
  climate_template_id?: string | null;

  history_images_json?: Record<string, ImagePick> | null;
  architecture_images_json?: Record<string, ImagePick> | null;
  climate_images_json?: Record<string, ImagePick> | null;

  /* snapshots (optional; passed through) */
  history_layout_html?: string | null;
  architecture_layout_html?: string | null;
  climate_layout_html?: string | null;

  /* custom sections */
  custom_sections_json?: CustomSection[];

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

/** parse a space value from config -> px number */
function parseSpace(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t.endsWith("px")) {
      const n = parseInt(t, 10);
      return Number.isFinite(n) ? n : null;
    }
    // token aliases for convenience
    const tokenMap: Record<string, number> = {
      none: 0,
      xs: 8,
      sm: 12,
      md: 24,
      lg: 32,
      xl: 48,
    };
    if (t in tokenMap) return tokenMap[t];
    const asNum = Number(t);
    if (Number.isFinite(asNum)) return asNum;
  }
  return null;
}

/** Build INLINE styles from a section-type config_json (avoids Tailwind purge issues) */
function styleFromConfig(cfg: any): React.CSSProperties {
  const s: React.CSSProperties = {};

  const pt = parseSpace(cfg?.paddingTop ?? cfg?.paddingY);
  const pb = parseSpace(cfg?.paddingBottom ?? cfg?.paddingY);
  const pl = parseSpace(cfg?.paddingLeft ?? cfg?.paddingX);
  const pr = parseSpace(cfg?.paddingRight ?? cfg?.paddingX);
  const mt = parseSpace(cfg?.marginTop ?? cfg?.marginY);
  const mb = parseSpace(cfg?.marginBottom ?? cfg?.marginY);

  if (pt != null) s.paddingTop = pt;
  if (pb != null) s.paddingBottom = pb;
  if (pl != null) s.paddingLeft = pl;
  if (pr != null) s.paddingRight = pr;
  if (mt != null) s.marginTop = mt;
  if (mb != null) s.marginBottom = mb;

  // Background: accept CSS color/gradient keywords or hex
  const bg = cfg?.background ?? cfg?.bg;
  if (typeof bg === "string" && bg.trim()) {
    s.background = bg.trim();
  }

  // Optional: rounded flag (could force a radius if needed)
  // if (cfg?.rounded === true) s.borderRadius = 16;

  return s;
}

/** Translate section-type rows into a runtime catalog used by FlowComposer */
function catalogFromRows(rows: SectionTypeRow[]) {
  const bySlug: Record<
    string,
    {
      blocks: any[];
      cssClass?: string;
    }
  > = {
    "full-width-image": {
      blocks: [{ id: "img_fw", kind: "image", imageSlotId: "slot_fw_1" }],
      cssClass: "sec-full-width-image",
    },
    "full-width-text": {
      blocks: [
        {
          id: "txt_fw",
          kind: "text",
          acceptsTextFlow: true,
          textPolicy: { targetWords: 220 },
        },
      ],
      cssClass: "sec-full-width-text",
    },
    "image-left-text-right": {
      blocks: [
        { id: "img_l", kind: "image", imageSlotId: "slot_left" },
        {
          id: "txt_r",
          kind: "text",
          acceptsTextFlow: true,
          textPolicy: { targetWords: 140 },
        },
      ],
      cssClass: "sec-img-left-text-right",
    },
    "image-right-text-left": {
      blocks: [
        {
          id: "txt_l",
          kind: "text",
          acceptsTextFlow: true,
          textPolicy: { targetWords: 140 },
        },
        { id: "img_r", kind: "image", imageSlotId: "slot_right" },
      ],
      cssClass: "sec-img-right-text-left",
    },
    "two-images": {
      blocks: [
        { id: "img_1", kind: "image", imageSlotId: "slot_1" },
        { id: "img_2", kind: "image", imageSlotId: "slot_2" },
      ],
      cssClass: "sec-two-images",
    },
    "three-images": {
      blocks: [
        { id: "img_1", kind: "image", imageSlotId: "slot_1" },
        { id: "img_2", kind: "image", imageSlotId: "slot_2" },
        { id: "img_3", kind: "image", imageSlotId: "slot_3" },
      ],
      cssClass: "sec-three-images",
    },
  };

  const map: Record<
    string,
    { blocks: any[]; cssClass?: string; style?: React.CSSProperties }
  > = {};

  rows.forEach((r: any) => {
    const def = bySlug[r.slug];
    if (!def) return;

    const cfg = r?.config_json ?? {};
    const inlineStyle = styleFromConfig(cfg);

    map[r.id] = {
      blocks: def.blocks,
      cssClass: def.cssClass || "",
      style: inlineStyle,
    };
  });
  return map;
}

/** Small debounce helper (deps must be a FIXED-LENGTH array of primitives) */
function useDebouncedEffect(
  effect: () => void,
  deps: readonly unknown[],
  delay = 500
) {
  const timeout = useRef<number | null>(null);
  useEffect(() => {
    if (timeout.current) window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => {
      effect();
    }, delay);
    return () => {
      if (timeout.current) window.clearTimeout(timeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* -------------------------------------------------------------- */
/* Image Picker Modal: true image ratios                          */
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
                    onClick={() => onImageSelect(img)}
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
/* Section Loader (templates + archetypes)                         */
/* -------------------------------------------------------------- */

async function loadTemplateWithSections(
  templateId: string
): Promise<TemplateDef | null> {
  const { data: t } = await supabase
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (!t) return null;

  const { data: ts } = await supabase
    .from("template_sections")
    .select("section_type_id, sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  return {
    id: t.id,
    name: t.name,
    sections: (ts || []).map((row: any) => ({
      sectionTypeId: row.section_type_id as string,
    })),
  } as TemplateDef;
}

/* -------------------------------------------------------------- */
/* PartComposer: preview card + separate sidebar card              */
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
    <div className="flex items-center gap-3 mb-4">
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
  text,
  templateId,
  initialImagesJson,
  onTemplateChange,
  onTextChange,
  onImagesChange,
  /** NEW: called with current preview HTML (or null) */
  onSnapshotChange,
}: {
  siteId: string | number;
  title: string;
  iconKey: "history-background" | "architecture-design" | "climate-topography";
  text: string;
  templateId?: string | null;
  initialImagesJson?: Record<string, ImagePick> | null;
  onTemplateChange: (id: string | null) => void;
  onTextChange: (v: string) => void;
  onImagesChange: (map: Record<string, ImagePick>) => void;
  onSnapshotChange: (html: string | null) => void;
}) {
  const [catalog, setCatalog] = useState<
    Record<
      string,
      { blocks: any[]; cssClass?: string; style?: React.CSSProperties }
    >
  >({});
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>(
    []
  );
  const [tpl, setTpl] = useState<TemplateDef | null>(null);

  const [imagesBySlot, setImagesBySlot] = useState<Record<string, ImagePick>>(
    () => initialImagesJson || {}
  );

  const previewRef = useRef<HTMLDivElement>(null);

  const lastInitRef = useRef<string>("");
  useEffect(() => {
    const next = JSON.stringify(initialImagesJson || {});
    if (next !== lastInitRef.current) {
      lastInitRef.current = next;
      setImagesBySlot(initialImagesJson || {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const [showGallery, setShowGallery] = useState(false);
  const pickImage = async (slotId: string) =>
    new Promise<ImagePick>((resolve) => {
      setShowGallery(true);
      (window as any).__pick = (img: any) => {
        setShowGallery(false);
        resolve({
          slotId,
          src: img.publicUrl,
          alt: img.alt_text || "",
          caption: img.caption || null,
        });
      };
    });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await seedDefaultSectionTypes(DEFAULT_SETTINGS);
      const rows = await loadArchetypeRows();
      if (!cancelled) setCatalog(catalogFromRows(rows));
      const tpls = await loadTemplates();
      if (!cancelled) setTemplates((tpls.rows as any) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!templateId) return setTpl(null);
      const def = await loadTemplateWithSections(templateId);
      if (!cancelled) setTpl(def);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const handlePickedChange = (map: Record<string, ImagePick>) => {
    const next = JSON.stringify(map || {});
    const prev = JSON.stringify(imagesBySlot || {});
    if (next === prev) return;
    setImagesBySlot(map);
    onImagesChange(map);
  };

  /** Persist the snapshot whenever inputs that affect preview change */
  useDebouncedEffect(
    () => {
      // If there is no template selected, don't persist placeholder HTML
      if (!tpl) {
        onSnapshotChange(null);
        return;
      }
      const html = (previewRef.current?.innerHTML || "").trim();
      onSnapshotChange(html || null);
    },
    // FIXED-LENGTH deps of primitives to avoid "changed size" error
    [
      text, // 1
      templateId ?? null, // 2
      JSON.stringify(imagesBySlot || {}), // 3
      tpl ? tpl.id : null, // 4
    ] as const,
    500
  );

  return (
    <div className="space-y-4">
      {/* Two separate floating cards with a visible gap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Preview card (wider) */}
        <div className="lg:col-span-9">
          <div className="rounded-2xl bg-white shadow-md border border-gray-200">
            <div className="p-4 md:p-6">
              <CardHeader title={title} iconKey={iconKey} />
              <div ref={previewRef}>
                {tpl ? (
                  <FlowComposer
                    masterText={text}
                    template={tpl}
                    sectionCatalog={catalog}
                    onPickImage={(slot) => pickImage(slot)}
                    initialPickedBySlot={imagesBySlot}
                    onPickedChange={handlePickedChange}
                  />
                ) : (
                  <div className="text-sm text-gray-500">
                    Pick a template in the right sidebar to preview.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar card (narrower) */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl bg-white shadow-md border border-gray-200">
            <div className="p-4 md:p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template
                </label>
                <select
                  className={inputStyles}
                  value={templateId || ""}
                  onChange={(e) => onTemplateChange(e.target.value || null)}
                >
                  <option value="">— Select template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Raw Text
                </label>
                <textarea
                  className={inputStyles + " min-h-[160px]"}
                  value={text}
                  onChange={(e) => onTextChange(e.target.value)}
                  placeholder="Plain text for this section"
                />
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
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Custom Sections                                                 */
/* -------------------------------------------------------------- */

function newCustomSection(): CustomSection {
  return {
    id:
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`) ||
      String(+new Date()),
    title: "Untitled Section",
    content: "",
    template_id: null,
    images_json: {},
    layout_html: null,
  };
}

/* -------------------------------------------------------------- */
/* Exported component                                              */
/* -------------------------------------------------------------- */

export default function ArticlesSection({
  siteId,
  /* default parts */
  history_content,
  architecture_content,
  climate_env_content,
  history_template_id,
  architecture_template_id,
  climate_template_id,
  history_images_json,
  architecture_images_json,
  climate_images_json,
  /* snapshots (passed through) */
  history_layout_html,
  architecture_layout_html,
  climate_layout_html,
  /* custom sections */
  custom_sections_json,
  onChange,
}: ArticlesSectionProps) {
  const customSections = useMemo<CustomSection[]>(
    () =>
      (custom_sections_json || []).map((s) => ({ layout_html: null, ...s })),
    [custom_sections_json]
  );

  return (
    <div className="space-y-10">
      {/* History & Background */}
      <PartComposer
        siteId={siteId}
        title="History & Background"
        iconKey="history-background"
        text={history_content || ""}
        templateId={history_template_id || null}
        initialImagesJson={history_images_json || {}}
        onTemplateChange={(id) => onChange({ history_template_id: id })}
        onTextChange={(v) => onChange({ history_content: v })}
        onImagesChange={(map) => onChange({ history_images_json: map })}
        onSnapshotChange={(html) => onChange({ history_layout_html: html })}
      />

      {/* Architecture & Design */}
      <PartComposer
        siteId={siteId}
        title="Architecture & Design"
        iconKey="architecture-design"
        text={architecture_content || ""}
        templateId={architecture_template_id || null}
        initialImagesJson={architecture_images_json || {}}
        onTemplateChange={(id) => onChange({ architecture_template_id: id })}
        onTextChange={(v) => onChange({ architecture_content: v })}
        onImagesChange={(map) => onChange({ architecture_images_json: map })}
        onSnapshotChange={(html) =>
          onChange({ architecture_layout_html: html })
        }
      />

      {/* Climate (optional) */}
      <PartComposer
        siteId={siteId}
        title="Climate, Geography & Environment"
        iconKey="climate-topography"
        text={climate_env_content || ""}
        templateId={climate_template_id || null}
        initialImagesJson={climate_images_json || {}}
        onTemplateChange={(id) => onChange({ climate_template_id: id })}
        onTextChange={(v) => onChange({ climate_env_content: v })}
        onImagesChange={(map) => onChange({ climate_images_json: map })}
        onSnapshotChange={(html) => onChange({ climate_layout_html: html })}
      />

      {/* Custom Sections Container */}
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
          <div className="rounded-2xl bg-white shadow-md border border-gray-200 p-6 text-sm text-gray-500">
            No custom sections yet.
          </div>
        ) : (
          customSections.map((cs, idx) => (
            <div key={cs.id} className="space-y-4">
              {/* Two separate floating cards */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Preview (wider) */}
                <div className="lg:col-span-9">
                  <div className="rounded-2xl bg-white shadow-md border border-gray-200">
                    <div className="p-4 md:p-6">
                      <CardHeader
                        title={cs.title || "Untitled Section"}
                        iconKey="custom"
                      />
                      <CustomComposerPreview
                        siteId={siteId}
                        content={cs.content}
                        templateId={cs.template_id}
                        imagesJson={cs.images_json}
                        onImagesChange={(map) =>
                          updateCustom(idx, { images_json: map })
                        }
                        onSnapshotChange={(html) =>
                          updateCustom(idx, { layout_html: html })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Sidebar (narrower) */}
                <div className="lg:col-span-3">
                  <div className="rounded-2xl bg-white shadow-md border border-gray-200">
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

                      <SidebarControlsForCustom
                        value={cs}
                        onChange={(patch) => updateCustom(idx, patch)}
                      />

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

/* ----- Custom section helpers ----- */

function SidebarControlsForCustom({
  value,
  onChange,
}: {
  value: CustomSection;
  onChange: (patch: Partial<CustomSection>) => void;
}) {
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>(
    []
  );

  useEffect(() => {
    (async () => {
      const tpls = await loadTemplates();
      setTemplates((tpls.rows as any) || []);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Template
        </label>
        <select
          className={inputStyles}
          value={value.template_id || ""}
          onChange={(e) => onChange({ template_id: e.target.value || null })}
        >
          <option value="">— Select template —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Raw Text
        </label>
        <textarea
          className={inputStyles + " min-h-[160px]"}
          value={value.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="Plain text for this section"
        />
      </div>
    </div>
  );
}

function CustomComposerPreview({
  siteId,
  content,
  templateId,
  imagesJson,
  onImagesChange,
  /** NEW: snapshot sink for customs */
  onSnapshotChange,
}: {
  siteId: string | number;
  content: string;
  templateId: string | null;
  imagesJson: Record<string, ImagePick>;
  onImagesChange: (map: Record<string, ImagePick>) => void;
  onSnapshotChange: (html: string | null) => void;
}) {
  const [catalog, setCatalog] = useState<
    Record<
      string,
      { blocks: any[]; cssClass?: string; style?: React.CSSProperties }
    >
  >({});
  const [tpl, setTpl] = useState<TemplateDef | null>(null);
  const [imagesBySlot, setImagesBySlot] = useState<Record<string, ImagePick>>(
    imagesJson || {}
  );
  const [showGallery, setShowGallery] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const lastInitRef = useRef<string>("");
  useEffect(() => {
    const next = JSON.stringify(imagesJson || {});
    if (next !== lastInitRef.current) {
      lastInitRef.current = next;
      setImagesBySlot(imagesJson || {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const pickImage = async (slotId: string) =>
    new Promise<ImagePick>((resolve) => {
      setShowGallery(true);
      (window as any).__pick = (img: any) => {
        setShowGallery(false);
        resolve({
          slotId,
          src: img.publicUrl,
          alt: img.alt_text || "",
          caption: img.caption || null,
        });
      };
    });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await seedDefaultSectionTypes(DEFAULT_SETTINGS);
      const rows = await loadArchetypeRows();
      if (!cancelled) setCatalog(catalogFromRows(rows));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!templateId) return setTpl(null);
      const def = await loadTemplateWithSections(templateId);
      if (!cancelled) setTpl(def);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const handlePickedChange = (map: Record<string, ImagePick>) => {
    const next = JSON.stringify(map || {});
    const prev = JSON.stringify(imagesBySlot || {});
    if (next === prev) return;
    setImagesBySlot(map);
    onImagesChange(map);
  };

  // Persist snapshot for custom section (avoid saving placeholder)
  useDebouncedEffect(
    () => {
      if (!tpl) {
        onSnapshotChange(null);
        return;
      }
      const html = (previewRef.current?.innerHTML || "").trim();
      onSnapshotChange(html || null);
    },
    // FIXED-LENGTH deps of primitives
    [
      content, // 1
      templateId ?? null, // 2
      JSON.stringify(imagesBySlot || {}), // 3
      tpl ? tpl.id : null, // 4
    ] as const,
    500
  );

  return (
    <>
      <div ref={previewRef}>
        {tpl ? (
          <FlowComposer
            masterText={content}
            template={tpl}
            sectionCatalog={catalog}
            onPickImage={(slot) => pickImage(slot)}
            initialPickedBySlot={imagesBySlot}
            onPickedChange={handlePickedChange}
          />
        ) : (
          <div className="text-sm text-gray-500">
            Pick a template in the sidebar to preview.
          </div>
        )}
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
