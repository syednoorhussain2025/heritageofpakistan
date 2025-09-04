// src/app/admin/listings/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";
import { FaArrowLeft, FaTrash, FaMagic } from "react-icons/fa";
import Icon from "@/components/Icon";

/* Externalized Components */
import GalleryUploader from "./GalleryUploader";
import PhotoStory from "./PhotoStory";
import Bibliography from "./Bibliography";
import ArticlesSection from "./ArticlesSection";
import TravelDetails from "./TravelDetails";
import CategoriesRegionsSelector from "./CategoriesRegionsSelector";

/* Icon maps, tabs */
const TAB_ICONS: Record<
  | "overview"
  | "categories"
  | "location"
  | "content"
  | "media"
  | "bibliography"
  | "photo",
  string
> = {
  overview: "image",
  categories: "categorytax",
  location: "adminmap",
  content: "history-background",
  media: "gallery",
  bibliography: "bibliography-sources",
  photo: "gallery",
};

const SECTION_ICONS: Record<string, string> = {
  hero: "image",
  "categories-regions": "categorytax",
  location: "where-is-it",
  "general-info": "general-info",
  unesco: "unesco",
  climate: "climate-topography",
  "did-you-know": "did-you-know",
  "travel-guide": "travel-guide",
  "best-time": "best-time-to-visit",
  "places-to-stay": "places-to-stay",
  articles: "general-info",
  "custom-sections": "history-background",
  gallery: "gallery",
  bibliography: "bibliography-sources",
  photo: "gallery",
};

type ListingTabKey =
  | "overview"
  | "categories"
  | "location"
  | "content"
  | "media"
  | "bibliography"
  | "photo";

const LISTING_TABS: {
  key: ListingTabKey;
  label: string;
  sections: string[];
}[] = [
  { key: "overview", label: "Cover", sections: ["hero"] },
  { key: "categories", label: "Taxanomy", sections: ["categories-regions"] },
  {
    key: "location",
    label: "Site Details",
    sections: [
      "location",
      "general-info",
      "unesco",
      "climate",
      "did-you-know",
      "travel-guide",
      "best-time",
      "places-to-stay",
    ],
  },
  {
    key: "content",
    label: "Article",
    sections: ["articles"], // custom sections handled inside ArticlesSection
  },
  { key: "media", label: "Gallery", sections: ["gallery"] },
  { key: "bibliography", label: "Bibliography", sections: ["bibliography"] },
  { key: "photo", label: "Photo Story", sections: ["photo"] },
];

/* UI helpers */
function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id: string;
}) {
  const iconKey = SECTION_ICONS[id];
  const isArticles = id === "articles"; // frameless + no title for Article section only

  if (isArticles) {
    // Frameless wrapper & no title for Article section
    return (
      <section id={id} className="scroll-mt-24 p-0 bg-transparent">
        {children}
      </section>
    );
  }

  // Default (framed) wrapper for all other sections
  return (
    <section
      id={id}
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 scroll-mt-24"
    >
      <h2 className="text-2xl font-semibold mb-4 text-gray-900 flex items-center gap-3">
        {iconKey && (
          <span className="grid place-items-center w-8 h-8 rounded-full bg-[#F78300]">
            <Icon name={iconKey} className="w-4 h-4 text-white" />
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-base font-semibold mb-1.5 text-gray-800">
        {label}
      </div>
      {children}
    </label>
  );
}

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

function Btn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-indigo-500 disabled:opacity-50 ${
        props.className ?? "bg-gray-200 text-gray-800 hover:bg-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

async function publicUrl(bucket: string, key: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}

function parseStoragePathFromPublicUrl(url: string | undefined | null) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length);
  const [bucket, ...pathParts] = rest.split("/");
  return { bucket, path: pathParts.join("/") };
}

/* Root wrapper */
export default function EditListing() {
  const { id } = useParams<{ id: string }>();
  return (
    <AdminGuard>
      <EditContent id={id} />
    </AdminGuard>
  );
}

/* Sidebar controls */
function SidebarControls({
  published,
  onTogglePublished,
  onSave,
  saving,
}: {
  published: boolean;
  onTogglePublished: (v: boolean) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
}) {
  return (
    <nav className="lg:fixed lg:left-4 lg:top-28 lg:w-64 w-full lg:w-64 z-30">
      <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-4">
        <label className="inline-flex items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
            checked={published}
            onChange={(e) => onTogglePublished(e.target.checked)}
          />
          <span className="text-gray-900 font-medium">Published</span>
        </label>
        <div>
          <Btn
            onClick={onSave}
            className="w-full bg-black text-white hover:bg-gray-900 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Btn>
        </div>
      </div>
    </nav>
  );
}

/* Page */
function EditContent({ id }: { id: string }) {
  const [site, setSite] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState<boolean>(false);
  const [listingTab, setListingTab] = useState<ListingTabKey>("overview");
  const saveListingRef = useRef<(() => Promise<void> | void) | undefined>(
    undefined
  );

  const [provinces, setProvinces] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allRegions, setAllRegions] = useState<any[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        alert(error.message);
        return;
      }
      setSite(data);
      setPublished(!!data.is_published);
    })();
  }, [id]);

  async function saveSite(next: any) {
    setSaving(true);
    const { data, error } = await supabase
      .from("sites")
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq("id", next.id)
      .select()
      .single();
    setSaving(false);
    if (error) return alert(error.message);
    setSite(data);
  }

  const loadTaxonomies = useCallback(async () => {
    const [
      { data: prov },
      { data: cats },
      { data: regs },
      { data: sc },
      { data: sr },
    ] = await Promise.all([
      supabase.from("provinces").select("id, name").order("name"),
      supabase
        .from("categories")
        .select("id, name, parent_id, icon_key")
        .order("name"),
      supabase
        .from("regions")
        .select("id, name, parent_id, icon_key")
        .order("name"),
      supabase.from("site_categories").select("category_id").eq("site_id", id),
      supabase.from("site_regions").select("region_id").eq("site_id", id),
    ]);

    setProvinces(prov || []);
    setAllCategories(cats || []);
    setAllRegions(regs || []);
    setSelectedCatIds((sc?.map((r: any) => r.category_id) as string[]) || []);
    setSelectedRegionIds((sr?.map((r: any) => r.region_id) as string[]) || []);
  }, [id]);

  useEffect(() => {
    loadTaxonomies();
  }, [loadTaxonomies]);

  if (!site)
    return (
      <div
        className="p-10 text-gray-700 text-center min-h-screen"
        style={{ backgroundColor: "#f4f4f4" }}
      >
        Loading…
      </div>
    );

  return (
    <div
      className="text-gray-900 min-h-screen"
      style={{ backgroundColor: "#f4f4f4" }}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-gray-50/95 backdrop-blur border-b border-gray-200">
        <div className="px-3 sm:px-4 lg:px-6 py-2">
          <div className="flex items-center gap-3 sm:gap-4 whitespace-nowrap overflow-x-auto no-scrollbar">
            <Link
              href="/admin/listings"
              className="flex items-center justify-center h-9 w-9 rounded-full bg-white border border-gray-300 hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Back to Listings"
            >
              <FaArrowLeft className="text-gray-600 h-4 w-4" />
            </Link>
            <h1 className="text-lg md:text-xl font-bold text-gray-900">
              Edit: {site.title}
            </h1>
            <div className="ml-auto flex items-center gap-2">
              {LISTING_TABS.map((t) => {
                const active = listingTab === t.key;
                const base =
                  "px-3 py-1.5 rounded-md text-sm font-medium border inline-flex items-center gap-2";
                const styles = active
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100";
                return (
                  <button
                    key={t.key}
                    onClick={() => setListingTab(t.key)}
                    className={`${base} ${styles}`}
                  >
                    <Icon
                      name={TAB_ICONS[t.key]}
                      className="w-4 h-4 text-current"
                    />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="relative">
        <div className="hidden lg:block">
          <SidebarControls
            published={published}
            onTogglePublished={setPublished}
            saving={saving}
            onSave={async () => {
              if (saveListingRef.current) await saveListingRef.current();
            }}
          />
        </div>

        <div className="px-3 sm:px-4 lg:px-6 py-6 lg:ml-[17rem]">
          <div className="lg:hidden mb-4">
            <SidebarControls
              published={published}
              onTogglePublished={setPublished}
              saving={saving}
              onSave={async () => {
                if (saveListingRef.current) await saveListingRef.current();
              }}
            />
          </div>

          <main className="min-w-0 space-y-8">
            <ListingForm
              site={site}
              onSave={saveSite}
              saving={saving}
              onRegisterSave={(fn) => (saveListingRef.current = fn)}
              externalPublished={published}
              listingTab={listingTab}
              provinces={provinces}
              allCategories={allCategories}
              allRegions={allRegions}
              selectedCatIds={selectedCatIds}
              setSelectedCatIds={setSelectedCatIds}
              selectedRegionIds={selectedRegionIds}
              setSelectedRegionIds={setSelectedRegionIds}
              onTaxonomyChanged={loadTaxonomies}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

/* inputs & helpers */
const inputStyles =
  "w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500";
const readOnlyInputStyles =
  "w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-500 cursor-not-allowed";

const sectionFields: Record<string, string[]> = {
  hero: ["title", "slug", "tagline", "cover_photo_url"],
  location: [
    "latitude",
    "longitude",
    "town_city_village",
    "tehsil",
    "district",
    "province_id",
  ],
  unesco: ["unesco_status", "unesco_line", "protected_under"],
  climate: [
    "landform",
    "altitude",
    "mountain_range",
    "weather_type",
    "avg_temp_summers",
    "avg_temp_winters",
  ],
  "did-you-know": ["did_you_know"],
  articles: ["history_content"],
};

function ListingForm({
  site,
  onSave,
  saving,
  onRegisterSave,
  externalPublished,
  listingTab,
  provinces,
  allCategories,
  allRegions,
  selectedCatIds,
  setSelectedCatIds,
  selectedRegionIds,
  setSelectedRegionIds,
  onTaxonomyChanged,
}: {
  site: any;
  onSave: (n: any) => void;
  saving: boolean;
  onRegisterSave: (fn: () => Promise<void>) => void;
  externalPublished: boolean;
  listingTab: ListingTabKey;
  provinces: any[];
  allCategories: any[];
  allRegions: any[];
  selectedCatIds: string[];
  setSelectedCatIds: (ids: string[]) => void;
  selectedRegionIds: string[];
  setSelectedRegionIds: (ids: string[]) => void;
  onTaxonomyChanged: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<any>(site);
  const [deletingCover, setDeletingCover] = useState(false);
  const [coverMeta, setCoverMeta] = useState<{
    w?: number;
    h?: number;
    kb?: number;
  }>({});

  useEffect(() => setForm(site), [site]);
  useEffect(() => {
    setForm((prev: any) => ({ ...prev, is_published: externalPublished }));
  }, [externalPublished]);

  useEffect(() => {
    let abort = false;
    async function computeMeta(url: string) {
      try {
        const img = new Image();
        const sizePromise = (async () => {
          const resp = await fetch(url, { method: "HEAD" });
          const len = resp.headers.get("content-length");
          if (!len) return undefined;
          return Math.round(parseInt(len, 10) / 1024);
        })();
        const dims = await new Promise<{ w: number; h: number } | undefined>(
          (resolve) => {
            img.onload = () =>
              resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(undefined);
            img.src = url;
          }
        );
        const kb = await sizePromise;
        if (!abort) setCoverMeta({ w: dims?.w, h: dims?.h, kb });
      } catch {
        if (!abort) setCoverMeta({});
      }
    }
    if (form.cover_photo_url) computeMeta(form.cover_photo_url);
    else setCoverMeta({});
    return () => {
      abort = true;
    };
  }, [form.cover_photo_url]);

  async function deleteCover() {
    if (!form.cover_photo_url) return;
    const parsed = parseStoragePathFromPublicUrl(form.cover_photo_url);
    if (!parsed) {
      set("cover_photo_url", "");
      return;
    }
    setDeletingCover(true);
    try {
      const { error } = await supabase.storage
        .from(parsed.bucket)
        .remove([parsed.path]);
      if (error) alert(error.message);
      set("cover_photo_url", "");
    } finally {
      setDeletingCover(false);
    }
  }

  const saveAll = useCallback(async () => {
    await onSave(form);
    await saveCategoryJoins();
    await saveRegionJoins();
    alert("Saved.");
  }, [form, onSave, selectedCatIds, selectedRegionIds]);

  useEffect(() => {
    onRegisterSave(saveAll);
  }, [saveAll, onRegisterSave]);

  function set<K extends string>(key: K, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  async function saveCategoryJoins() {
    const { data: curr } = await supabase
      .from("site_categories")
      .select("category_id")
      .eq("site_id", site.id);
    const current = new Set((curr || []).map((x: any) => x.category_id));
    const desired = new Set(selectedCatIds);
    const toAdd = [...desired].filter((id) => !current.has(id));
    const toDel = [...current].filter((id) => !desired.has(id));
    if (toAdd.length)
      await supabase
        .from("site_categories")
        .insert(toAdd.map((id) => ({ site_id: site.id, category_id: id })));
    for (const id of toDel)
      await supabase
        .from("site_categories")
        .delete()
        .eq("site_id", site.id)
        .eq("category_id", id);
  }

  async function saveRegionJoins() {
    const { data: curr } = await supabase
      .from("site_regions")
      .select("region_id")
      .eq("site_id", site.id);
    const current = new Set((curr || []).map((x: any) => x.region_id));
    const desired = new Set(selectedRegionIds);
    const toAdd = [...desired].filter((id) => !current.has(id));
    const toDel = [...current].filter((id) => !desired.has(id));
    if (toAdd.length)
      await supabase
        .from("site_regions")
        .insert(toAdd.map((id) => ({ site_id: site.id, region_id: id })));
    for (const id of toDel)
      await supabase
        .from("site_regions")
        .delete()
        .eq("site_id", site.id)
        .eq("region_id", id);
  }

  const visibleSections = useMemo(() => {
    const tabCfg = {
      key: listingTab,
      sections: LISTING_TABS.find((t) => t.key === listingTab)!.sections,
    };
    return new Set(tabCfg.sections);
  }, [listingTab]);

  return (
    <div className="space-y-8">
      {/* Cover */}
      {visibleSections.has("hero") && (
        <Section title="Cover" id="hero">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Field label="Site Name">
                <input
                  className={inputStyles}
                  value={form.title || ""}
                  onChange={(e) => set("title", e.target.value)}
                />
              </Field>

              <Field label="Slug (URL)">
                <div className="flex items-center gap-2">
                  <input
                    className={inputStyles + " flex-1"}
                    value={form.slug || ""}
                    onChange={(e) => set("slug", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const src = (form.title || "")
                        .toString()
                        .trim()
                        .toLowerCase();
                      const slug = src
                        .normalize("NFKD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9\s-]/g, "")
                        .replace(/\s+/g, "-")
                        .replace(/-+/g, "-")
                        .replace(/^-|-$/g, "");
                      set("slug", slug);
                    }}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                    title="Generate from Site Name"
                  >
                    <FaMagic className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Auto</span>
                  </button>
                </div>
              </Field>

              <Field label="Heritage Type">
                <input
                  className={inputStyles}
                  value={form.heritage_type || ""}
                  onChange={(e) => set("heritage_type", e.target.value)}
                />
              </Field>

              <Field label="Location">
                <input
                  className={inputStyles}
                  value={form.location_free || ""}
                  onChange={(e) => set("location_free", e.target.value)}
                />
              </Field>
            </div>

            <div className="space-y-3">
              <div className="w-full aspect-video bg-gray-100 border border-gray-300 rounded-2xl overflow-hidden grid place-items-center">
                {form.cover_photo_url ? (
                  <img
                    src={form.cover_photo_url}
                    className="w-full h-full object-cover"
                    alt="Cover preview"
                  />
                ) : (
                  <div className="text-sm text-gray-500">No cover uploaded</div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  {coverMeta.w && coverMeta.h
                    ? `${coverMeta.w}×${coverMeta.h}`
                    : "—"}
                  {typeof coverMeta.kb === "number"
                    ? ` — ${coverMeta.kb} KB`
                    : coverMeta.w || coverMeta.h
                    ? " — …"
                    : ""}
                </div>
                <div className="flex items-center gap-2">
                  {!!form.cover_photo_url && (
                    <button
                      type="button"
                      onClick={deleteCover}
                      disabled={deletingCover}
                      className="inline-flex items-center justify-center p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-60"
                      title="Remove image"
                      aria-label="Remove image"
                    >
                      <FaTrash className="w-4 h-4" />
                    </button>
                  )}
                  <CoverUploader
                    value={form.cover_photo_url}
                    onChange={(url) => set("cover_photo_url", url)}
                    siteId={form.id}
                    showPreview={false}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Field label="Tagline">
              <textarea
                className={inputStyles}
                rows={3}
                value={form.tagline || ""}
                onChange={(e) => set("tagline", e.target.value)}
              />
            </Field>
          </div>
        </Section>
      )}

      {/* Taxonomy */}
      {visibleSections.has("categories-regions") && (
        <Section title="Taxanomy (multi-select)" id="categories-regions">
          <CategoriesRegionsSelector
            allCategories={allCategories}
            allRegions={allRegions}
            selectedCatIds={selectedCatIds}
            setSelectedCatIds={setSelectedCatIds}
            selectedRegionIds={selectedRegionIds}
            setSelectedRegionIds={setSelectedRegionIds}
            onTaxonomyChanged={onTaxonomyChanged}
          />
        </Section>
      )}

      {/* Site Details */}
      {visibleSections.has("location") && (
        <Section title="Site Details" id="location">
          <TravelDetails
            form={form}
            setField={set}
            provinces={provinces}
            inputStyles={inputStyles}
            readOnlyInputStyles={readOnlyInputStyles}
          />
        </Section>
      )}

      {/* Article (frameless + no 'Article' title) */}
      {visibleSections.has("articles") && (
        <Section title="Article" id="articles">
          <ArticlesSection
            siteId={form.id}
            /* defaults */
            history_content={form.history_content || ""}
            architecture_content={form.architecture_content || ""}
            climate_env_content={form.climate_env_content || ""}
            history_template_id={form.history_template_id || null}
            architecture_template_id={form.architecture_template_id || null}
            climate_template_id={form.climate_template_id || null}
            history_images_json={form.history_images_json || {}}
            architecture_images_json={form.architecture_images_json || {}}
            climate_images_json={form.climate_images_json || {}}
            history_layout_html={form.history_layout_html}
            architecture_layout_html={form.architecture_layout_html}
            climate_layout_html={form.climate_layout_html}
            /* custom sections (NEW) */
            custom_sections_json={form.custom_sections_json || []}
            /* merge all changes */
            onChange={(patch) =>
              setForm((prev: any) => ({ ...prev, ...patch }))
            }
          />
        </Section>
      )}

      {/* Gallery */}
      {visibleSections.has("gallery") && (
        <Section title="Gallery" id="gallery">
          <GalleryUploader siteId={form.id} />
        </Section>
      )}

      {/* Bibliography */}
      {visibleSections.has("bibliography") && (
        <Section title="Bibliography" id="bibliography">
          <Bibliography siteId={form.id} />
        </Section>
      )}

      {/* Photo Story */}
      {visibleSections.has("photo") && (
        <Section title="Photo Story" id="photo">
          <PhotoStory siteId={form.id} slug={form.slug} title={form.title} />
        </Section>
      )}
    </div>
  );
}

/* CoverUploader */
function CoverUploader({
  value,
  onChange,
  siteId,
  showPreview = true,
}: {
  value?: string;
  onChange: (url: string) => void;
  siteId: string | number;
  showPreview?: boolean;
}) {
  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const key = `covers/${siteId}/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage
      .from("site-images")
      .upload(key, f, { upsert: false });
    if (error) return alert(error.message);
    const url = await publicUrl("site-images", key);
    onChange(url);
  }
  return (
    <div className="flex items-center gap-4">
      <input
        type="file"
        accept="image/*"
        onChange={handle}
        className="text-sm text-gray-700 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
      />
      {showPreview && value ? (
        <img
          src={value}
          className="h-14 w-14 object-cover rounded-xl"
          alt="Cover preview"
        />
      ) : null}
    </div>
  );
}
