// src/app/admin/listings/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation"; // ✅ reads route param on client
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";
import {
  useEditor,
  EditorContent,
  Editor,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import YouTube from "@tiptap/extension-youtube";
import Image from "@tiptap/extension-image";
import { Node } from "@tiptap/core";

// icons & image extension helpers
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
  FaCode, // Icon for HTML view
} from "react-icons/fa";

/* ─────────────────────────── Small UI helpers ─────────────────────────── */

type Tab = "listing" | "photo";

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id: string; // For sidebar navigation
}) {
  return (
    <section
      id={id}
      className="bg-gray-800 rounded-lg shadow-md p-6 scroll-mt-20"
    >
      <h2 className="text-xl font-semibold mb-4 text-white">{title}</h2>
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
      <div className="text-sm font-medium mb-1.5 text-gray-300">{label}</div>
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
      <div className="text-sm font-medium mb-1.5 text-gray-300">{label}</div>
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
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 disabled:opacity-50 ${
        props.className ?? "bg-gray-600 text-white hover:bg-gray-500"
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

/* ───────────────────────────── Root wrapper ───────────────────────────── */

// ⬇️ Reads {id} from the URL on the client (avoids Next 15 PageProps typing)
export default function EditListing() {
  const { id } = useParams<{ id: string }>();
  return (
    <AdminGuard>
      <EditContent id={id} />
    </AdminGuard>
  );
}

const navLinks = [
  { id: "hero", title: "Hero" },
  { id: "hero-right", title: "Hero (Right Side)" },
  { id: "categories-regions", title: "Categories & Regions" },
  { id: "location", title: "Location" },
  { id: "general-info", title: "General Info" },
  { id: "unesco", title: "UNESCO & Protection" },
  { id: "climate", title: "Climate & Topography" },
  { id: "did-you-know", title: "Did You Know" },
  { id: "travel-guide", title: "Travel Guide" },
  { id: "best-time", title: "Best Time to Visit" },
  { id: "places-to-stay", title: "Places to Stay" },
  { id: "articles", title: "Articles" },
  { id: "custom-sections", title: "Custom Sections" },
  { id: "gallery", title: "Gallery" },
  { id: "bibliography", title: "Bibliography" },
  { id: "publish", title: "Publish" },
];

function NavigationSidebar({
  completionStatus,
}: {
  completionStatus: Record<string, boolean>;
}) {
  return (
    <nav className="w-64 lg:fixed top-32">
      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-3">On this page</h3>
        <ul className="space-y-1">
          {navLinks.map((link) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                className="flex items-center justify-between p-1 rounded-md text-sm text-gray-400 hover:text-indigo-400 hover:bg-gray-700/50 transition-colors"
              >
                <span>{link.title}</span>
                {completionStatus[link.id] && (
                  <span className="text-green-400 font-bold text-lg">✓</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function EditContent({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>("listing");
  const [site, setSite] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [completionStatus, setCompletionStatus] = useState<
    Record<string, boolean>
  >({});

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

  if (!site)
    return (
      <div className="p-10 text-white text-center bg-gray-900 min-h-screen">
        Loading…
      </div>
    );

  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Edit: {site.title}</h1>
          <div className="flex gap-2">
            <Btn
              onClick={() => setTab("listing")}
              className={
                tab === "listing"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }
            >
              Listing
            </Btn>
            <Btn
              onClick={() => setTab("photo")}
              className={
                tab === "photo"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }
            >
              Photo Story
            </Btn>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {tab === "listing" && (
            <>
              <NavigationSidebar completionStatus={completionStatus} />
              <div className="w-64 flex-shrink-0 hidden lg:block" />
            </>
          )}
          <main className="flex-grow min-w-0">
            {tab === "listing" ? (
              <ListingForm
                site={site}
                onSave={saveSite}
                saving={saving}
                onCompletionChange={setCompletionStatus}
              />
            ) : (
              <PhotoStoryForm
                siteId={site.id}
                slug={site.slug}
                title={site.title}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

const inputStyles =
  "w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500";
const readOnlyInputStyles =
  "w-full bg-gray-600 border border-gray-500 rounded-md px-3 py-2 text-gray-300 cursor-not-allowed";

const sectionFields: Record<string, string[]> = {
  hero: ["title", "slug", "tagline", "cover_photo_url"],
  "hero-right": ["heritage_type", "location_free"],
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
  onCompletionChange,
}: {
  site: any;
  onSave: (n: any) => void;
  saving: boolean;
  onCompletionChange: (status: Record<string, boolean>) => void;
}) {
  const [form, setForm] = useState<any>(site);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allRegions, setAllRegions] = useState<any[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);

  const completionStatus = useMemo(() => {
    const status: Record<string, boolean> = {};
    const isFilled = (value: any) =>
      value !== null &&
      value !== undefined &&
      value !== "" &&
      value !== "<p></p>";
    for (const sectionId in sectionFields) {
      status[sectionId] = sectionFields[sectionId].every((field) =>
        isFilled(form[field])
      );
    }
    status["categories-regions"] =
      selectedCatIds.length > 0 && selectedRegionIds.length > 0;
    return status;
  }, [form, selectedCatIds, selectedRegionIds]);

  useEffect(() => {
    onCompletionChange(completionStatus);
  }, [completionStatus, onCompletionChange]);

  useEffect(() => setForm(site), [site]);

  useEffect(() => {
    (async () => {
      const [
        { data: prov },
        { data: cats },
        { data: regs },
        { data: sc },
        { data: sr },
      ] = await Promise.all([
        supabase.from("provinces").select("id, name").order("name"),
        supabase.from("categories").select("id, name, parent_id").order("name"),
        supabase.from("regions").select("id, name, parent_id").order("name"),
        supabase
          .from("site_categories")
          .select("category_id")
          .eq("site_id", site.id),
        supabase
          .from("site_regions")
          .select("region_id")
          .eq("site_id", site.id),
      ]);
      setProvinces(prov || []);
      setAllCategories(cats || []);
      setAllRegions(regs || []);
      setSelectedCatIds((sc?.map((r: any) => r.category_id) as string[]) || []);
      setSelectedRegionIds(
        (sr?.map((r: any) => r.region_id) as string[]) || []
      );
    })();
  }, [site.id]);

  function set<K extends string>(key: K, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  async function saveAll() {
    await onSave(form);
    await saveCategoryJoins();
    await saveRegionJoins();
    alert("Saved.");
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

  return (
    <div className="space-y-8">
      <Section title="Hero (Cover)" id="hero">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Field label="Title (Site Name)">
            <input
              className={inputStyles}
              value={form.title || ""}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="Slug (URL) e.g. lahore-fort)">
            <input
              className={inputStyles}
              value={form.slug || ""}
              onChange={(e) => set("slug", e.target.value)}
            />
          </Field>
          <Field label="Tagline (~50 words)">
            <textarea
              className={inputStyles}
              rows={3}
              value={form.tagline || ""}
              onChange={(e) => set("tagline", e.target.value)}
            />
          </Field>
          <Field label="Cover Photo">
            <CoverUploader
              value={form.cover_photo_url}
              onChange={(url) => set("cover_photo_url", url)}
              siteId={form.id}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-6 mt-6">
          <Field label="Average Rating (read-only)">
            <input
              className={readOnlyInputStyles}
              value={form.avg_rating ?? ""}
              readOnly
            />
          </Field>
          <Field label="Review Count (read-only)">
            <input
              className={readOnlyInputStyles}
              value={form.review_count ?? ""}
              readOnly
            />
          </Field>
        </div>
      </Section>
      <Section title="Hero (Right side)" id="hero-right">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Field label="Heritage Type (free text)">
            <input
              className={inputStyles}
              value={form.heritage_type || ""}
              onChange={(e) => set("heritage_type", e.target.value)}
            />
          </Field>
          <Field label="Location (free text)">
            <input
              className={inputStyles}
              value={form.location_free || ""}
              onChange={(e) => set("location_free", e.target.value)}
            />
          </Field>
        </div>
      </Section>
      <Section
        title="Heritage Categories & Regions (multi-select)"
        id="categories-regions"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="text-base font-semibold mb-3 text-gray-100">
              Categories
            </div>
            <MultiSelect
              items={allCategories}
              selectedIds={selectedCatIds}
              setSelectedIds={setSelectedCatIds}
              labelKey="name"
            />
          </div>
          <div>
            <div className="text-base font-semibold mb-3 text-gray-100">
              Regions
            </div>
            <MultiSelect
              items={allRegions}
              selectedIds={selectedRegionIds}
              setSelectedIds={setSelectedRegionIds}
              labelKey="name"
            />
          </div>
        </div>
      </Section>
      <Section title="Sidebar — Where is it / Location" id="location">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Field label="Latitude">
            <input
              className={inputStyles}
              value={form.latitude || ""}
              onChange={(e) => set("latitude", e.target.value)}
            />
          </Field>
          <Field label="Longitude">
            <input
              className={inputStyles}
              value={form.longitude || ""}
              onChange={(e) => set("longitude", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Field label="Town/City/Village">
            <input
              className={inputStyles}
              value={form.town_city_village || ""}
              onChange={(e) => set("town_city_village", e.target.value)}
            />
          </Field>
          <Field label="Tehsil">
            <input
              className={inputStyles}
              value={form.tehsil || ""}
              onChange={(e) => set("tehsil", e.target.value)}
            />
          </Field>
          <Field label="District">
            <input
              className={inputStyles}
              value={form.district || ""}
              onChange={(e) => set("district", e.target.value)}
            />
          </Field>
          <Field label="Region / Province (dropdown of 6)">
            <select
              className={inputStyles}
              value={form.province_id || ""}
              onChange={(e) =>
                set(
                  "province_id",
                  e.target.value ? Number(e.target.value) : null
                )
              }
            >
              <option value="">— Select —</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>
      <Section title="Sidebar — General Info" id="general-info">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Field label="Name (auto from Title)">
            <input
              className={readOnlyInputStyles}
              value={form.title || ""}
              readOnly
            />
          </Field>
          <Field label="Architectural Style">
            <input
              className={inputStyles}
              value={form.architectural_style || ""}
              onChange={(e) => set("architectural_style", e.target.value)}
            />
          </Field>
          <Field label="Construction Materials">
            <input
              className={inputStyles}
              value={form.construction_materials || ""}
              onChange={(e) => set("construction_materials", e.target.value)}
            />
          </Field>
          <Field label="Local Name">
            <input
              className={inputStyles}
              value={form.local_name || ""}
              onChange={(e) => set("local_name", e.target.value)}
            />
          </Field>
          <Field label="Architect">
            <input
              className={inputStyles}
              value={form.architect || ""}
              onChange={(e) => set("architect", e.target.value)}
            />
          </Field>
          <Field label="Construction Date">
            <input
              className={inputStyles}
              value={form.construction_date || ""}
              onChange={(e) => set("construction_date", e.target.value)}
            />
          </Field>
          <Field label="Built by">
            <input
              className={inputStyles}
              value={form.built_by || ""}
              onChange={(e) => set("built_by", e.target.value)}
            />
          </Field>
          <Field label="Dynasty">
            <input
              className={inputStyles}
              value={form.dynasty || ""}
              onChange={(e) => set("dynasty", e.target.value)}
            />
          </Field>
          <Field label="Conservation Status">
            <input
              className={inputStyles}
              value={form.conservation_status || ""}
              onChange={(e) => set("conservation_status", e.target.value)}
            />
          </Field>
          <Field label="Current Use">
            <input
              className={inputStyles}
              value={form.current_use || ""}
              onChange={(e) => set("current_use", e.target.value)}
            />
          </Field>
          <Field label="Restored by">
            <input
              className={inputStyles}
              value={form.restored_by || ""}
              onChange={(e) => set("restored_by", e.target.value)}
            />
          </Field>
          <Field label="Known for">
            <input
              className={inputStyles}
              value={form.known_for || ""}
              onChange={(e) => set("known_for", e.target.value)}
            />
          </Field>
          <Field label="Era">
            <input
              className={inputStyles}
              value={form.era || ""}
              onChange={(e) => set("era", e.target.value)}
            />
          </Field>
          <Field label="Inhabited by">
            <input
              className={inputStyles}
              value={form.inhabited_by || ""}
              onChange={(e) => set("inhabited_by", e.target.value)}
            />
          </Field>
          <Field label="National Park Established in">
            <input
              className={inputStyles}
              value={form.national_park_established_in || ""}
              onChange={(e) =>
                set("national_park_established_in", e.target.value)
              }
            />
          </Field>
          <Field label="Population">
            <input
              className={inputStyles}
              value={form.population || ""}
              onChange={(e) => set("population", e.target.value)}
            />
          </Field>
          <Field label="Ethnic Groups">
            <input
              className={inputStyles}
              value={form.ethnic_groups || ""}
              onChange={(e) => set("ethnic_groups", e.target.value)}
            />
          </Field>
          <Field label="Languages Spoken">
            <input
              className={inputStyles}
              value={form.languages_spoken || ""}
              onChange={(e) => set("languages_spoken", e.target.value)}
            />
          </Field>
          <Field label="Excavation Status">
            <input
              className={inputStyles}
              value={form.excavation_status || ""}
              onChange={(e) => set("excavation_status", e.target.value)}
            />
          </Field>
          <Field label="Excavated by">
            <input
              className={inputStyles}
              value={form.excavated_by || ""}
              onChange={(e) => set("excavated_by", e.target.value)}
            />
          </Field>
          <Field label="Administered by (label editable later)">
            <input
              className={inputStyles}
              value={form.administered_by || ""}
              onChange={(e) => set("administered_by", e.target.value)}
            />
          </Field>
        </div>
      </Section>
      <Section title="Sidebar — UNESCO & Protection" id="unesco">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Field label="UNESCO Status">
            <select
              className={inputStyles}
              value={form.unesco_status || "None"}
              onChange={(e) => set("unesco_status", e.target.value)}
            >
              <option>None</option>
              <option>Inscribed on the UNESCO World Heritage Site List</option>
              <option>On the UNESCO World Heritage Tentative List</option>
            </select>
          </Field>
          <Field label="UNESCO Line (optional one-liner)">
            <input
              className={inputStyles}
              value={form.unesco_line || ""}
              onChange={(e) => set("unesco_line", e.target.value)}
            />
          </Field>
          <Field label="Protected under (free text)">
            <input
              className={inputStyles}
              value={form.protected_under || ""}
              onChange={(e) => set("protected_under", e.target.value)}
            />
          </Field>
        </div>
      </Section>
      <Section title="Sidebar — Climate & Topography" id="climate">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Field label="Landform">
            <input
              className={inputStyles}
              value={form.landform || ""}
              onChange={(e) => set("landform", e.target.value)}
            />
          </Field>
          <Field label="Altitude">
            <input
              className={inputStyles}
              value={form.altitude || ""}
              onChange={(e) => set("altitude", e.target.value)}
            />
          </Field>
          <Field label="Mountain Range">
            <input
              className={inputStyles}
              value={form.mountain_range || ""}
              onChange={(e) => set("mountain_range", e.target.value)}
            />
          </Field>
          <Field label="Weather Type">
            <input
              className={inputStyles}
              value={form.weather_type || ""}
              onChange={(e) => set("weather_type", e.target.value)}
            />
          </Field>
          <Field label="Average Temp in Summers">
            <input
              className={inputStyles}
              value={form.avg_temp_summers || ""}
              onChange={(e) => set("avg_temp_summers", e.target.value)}
            />
          </Field>
          <Field label="Average Temp in Winters">
            <input
              className={inputStyles}
              value={form.avg_temp_winters || ""}
              onChange={(e) => set("avg_temp_winters", e.target.value)}
            />
          </Field>
        </div>
      </Section>
      <Section title="Sidebar — Did you Know" id="did-you-know">
        <Field label="Interesting fact (free text)">
          <textarea
            className={inputStyles}
            value={form.did_you_know || ""}
            onChange={(e) => set("did_you_know", e.target.value)}
          />
        </Field>
      </Section>
      <Section title="Sidebar — Travel Guide" id="travel-guide">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Field label="Location (Travel Guide)">
            <input
              className={inputStyles}
              value={form.travel_location || ""}
              onChange={(e) => set("travel_location", e.target.value)}
            />
          </Field>
          <Field label="How to Reach">
            <input
              className={inputStyles}
              value={form.travel_how_to_reach || ""}
              onChange={(e) => set("travel_how_to_reach", e.target.value)}
            />
          </Field>
          <Field label="Nearest Major City">
            <input
              className={inputStyles}
              value={form.travel_nearest_major_city || ""}
              onChange={(e) => set("travel_nearest_major_city", e.target.value)}
            />
          </Field>
          <Field label="Airport Access">
            <select
              className={inputStyles}
              value={form.travel_airport_access || ""}
              onChange={(e) => set("travel_airport_access", e.target.value)}
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
          <Field label="International Flight">
            <select
              className={inputStyles}
              value={form.travel_international_flight || ""}
              onChange={(e) =>
                set("travel_international_flight", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>Domestic Only</option>
            </select>
          </Field>
          <Field label="Access Options">
            <select
              className={inputStyles}
              value={form.travel_access_options || ""}
              onChange={(e) => set("travel_access_options", e.target.value)}
            >
              <option value="">— Select —</option>
              <option>By Road Only</option>
              <option>By Road and Air</option>
              <option>By Road, Air and Railway</option>
            </select>
          </Field>
          <Field label="Road Type & Condition">
            <select
              className={inputStyles}
              value={form.travel_road_type_condition || ""}
              onChange={(e) =>
                set("travel_road_type_condition", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Metalled</option>
              <option>Dirt</option>
              <option>Mixed</option>
            </select>
          </Field>
          <Field label="Best Time to Visit (short free text)">
            <input
              className={inputStyles}
              value={form.travel_best_time_free || ""}
              onChange={(e) => set("travel_best_time_free", e.target.value)}
            />
          </Field>
          <Field label="Full Travel Guide URL (optional button)">
            <input
              className={inputStyles}
              value={form.travel_full_guide_url || ""}
              onChange={(e) => set("travel_full_guide_url", e.target.value)}
            />
          </Field>
        </div>
      </Section>
      <Section title="Sidebar — Best Time to Visit (preset)" id="best-time">
        <Field label="Preset Key (temporary; global presets later)">
          <input
            className={inputStyles}
            value={form.best_time_option_key || ""}
            onChange={(e) => set("best_time_option_key", e.target.value)}
          />
        </Field>
      </Section>
      <Section title="Sidebar — Places to Stay" id="places-to-stay">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Field label="Hotels Available">
            <select
              className={inputStyles}
              value={form.stay_hotels_available || ""}
              onChange={(e) => set("stay_hotels_available", e.target.value)}
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
              <option>Limited Options</option>
            </select>
          </Field>
          <Field label="Spending Night Recommended">
            <select
              className={inputStyles}
              value={form.stay_spending_night_recommended || ""}
              onChange={(e) =>
                set("stay_spending_night_recommended", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
          <Field label="Camping Possible">
            <select
              className={inputStyles}
              value={form.stay_camping_possible || ""}
              onChange={(e) => set("stay_camping_possible", e.target.value)}
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
              <option>Not Recommended</option>
              <option>Not Suitable</option>
            </select>
          </Field>
          <Field label="Places to Eat Available">
            <select
              className={inputStyles}
              value={form.stay_places_to_eat_available || ""}
              onChange={(e) =>
                set("stay_places_to_eat_available", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
        </div>
      </Section>
      <Section title="Right Column — Articles" id="articles">
        <FieldBlock label="History & Background">
          <RichTextEditor
            siteId={site.id}
            value={form.history_content || ""}
            onChange={(content) => set("history_content", content)}
          />
        </FieldBlock>
        <div className="mt-6">
          <FieldBlock label="Architecture & Design (optional)">
            <RichTextEditor
              siteId={site.id}
              value={form.architecture_content || ""}
              onChange={(content) => set("architecture_content", content)}
            />
          </FieldBlock>
        </div>
        <div className="mt-6">
          <FieldBlock label="Climate, Geography & Environment (optional)">
            <RichTextEditor
              siteId={site.id}
              value={form.climate_env_content || ""}
              onChange={(content) => set("climate_env_content", content)}
            />
          </FieldBlock>
        </div>
      </Section>
      <Section title="Custom Long-form Sections" id="custom-sections">
        <CustomSectionsEditor siteId={site.id} />
      </Section>
      <Section title="Gallery Uploader" id="gallery">
        <GalleryManager siteId={site.id} />
      </Section>
      <Section
        title="Bibliography, Sources & Further Reading"
        id="bibliography"
      >
        <BibliographyManager siteId={site.id} />
      </Section>
      <Section title="Publish" id="publish">
        <label className="inline-flex items-center gap-3 p-2">
          <input
            type="checkbox"
            className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-600"
            checked={!!form.is_published}
            onChange={(e) => set("is_published", e.target.checked)}
          />
          <span className="text-gray-200">
            Published (visible on the public site)
          </span>
        </label>
        <div className="mt-6">
          <Btn
            onClick={saveAll}
            className="bg-indigo-600 text-white hover:bg-indigo-500"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Btn>
        </div>
      </Section>
    </div>
  );
}

/* ────────────────── Other Components ────────────────── */

function MultiSelect({
  items,
  selectedIds,
  setSelectedIds,
  labelKey,
}: {
  items: any[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  labelKey: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.includes(it.id)),
    [items, selectedIds]
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery) {
      return items;
    }
    return items.filter((item) =>
      item[labelKey].toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery, labelKey]);

  return (
    <div className="bg-gray-700 border border-gray-600 rounded-md p-3">
      <input
        type="text"
        placeholder="Search..."
        className={`${inputStyles} bg-gray-800 mb-3`}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-gray-600">
          {selectedItems.map((item) => (
            <div
              key={item.id}
              className="bg-indigo-600 text-white rounded-full px-3 py-1 text-sm flex items-center gap-2"
            >
              <span>{item[labelKey]}</span>
              <button
                onClick={() => toggle(item.id)}
                className="text-indigo-200 hover:text-white font-bold"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="max-h-60 overflow-auto space-y-2">
        {filteredItems.map((it) => (
          <label
            key={it.id}
            className="flex items-center gap-3 text-sm cursor-pointer p-1 rounded-md hover:bg-gray-600"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded bg-gray-800 border-gray-500 text-indigo-500 focus:ring-indigo-600"
              checked={selectedIds.includes(it.id)}
              onChange={() => toggle(it.id)}
            />
            <span className="text-gray-200">{it[labelKey]}</span>
          </label>
        ))}
        {filteredItems.length === 0 && (
          <div className="text-sm text-gray-400 p-2">
            No items match your search.
          </div>
        )}
      </div>
    </div>
  );
}

function CoverUploader({
  value,
  onChange,
  siteId,
}: {
  value?: string;
  onChange: (url: string) => void;
  siteId: string | number;
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
        className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-gray-200 hover:file:bg-gray-500"
      />
      {value ? (
        <img
          src={value}
          className="h-14 w-14 object-cover rounded-lg"
          alt="Cover preview"
        />
      ) : null}
    </div>
  );
}

function GalleryManager({ siteId }: { siteId: string | number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_images")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true });
    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }
    const withUrls = await Promise.all(
      (data || []).map(async (r: any) => ({
        ...r,
        publicUrl: r.storage_path
          ? await publicUrl("site-images", r.storage_path)
          : null,
      }))
    );
    setRows(withUrls);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [siteId]);
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let order = rows.length;
    for (const file of files) {
      const key = `gallery/${siteId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage
        .from("site-images")
        .upload(key, file, { upsert: false });
      if (error) {
        alert(error.message);
        continue;
      }
      await supabase
        .from("site_images")
        .insert({ site_id: siteId, storage_path: key, sort_order: order++ });
    }
    await load();
  }
  async function updateRow(id: string, patch: any) {
    const { error } = await supabase
      .from("site_images")
      .update(patch)
      .eq("id", id);
    if (error) return alert(error.message);
    await load();
  }
  async function removeRow(id: string, storage_path: string) {
    const { error } = await supabase.from("site_images").delete().eq("id", id);
    if (error) return alert(error.message);
    await supabase.storage.from("site-images").remove([storage_path]);
    await load();
  }
  async function move(id: string, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === id);
    const swap = rows[idx + dir];
    if (!swap) return;
    const a = rows[idx];
    const b = swap;
    await supabase
      .from("site_images")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    await supabase
      .from("site_images")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    await load();
  }
  if (loading) return <div className="text-gray-400">Loading Gallery…</div>;
  return (
    <div>
      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onUpload}
          className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((img) => (
          <div
            key={img.id}
            className="border border-gray-700 rounded-lg p-3 bg-gray-800/50 space-y-3"
          >
            {img.publicUrl ? (
              <img
                src={img.publicUrl}
                className="w-full h-40 object-cover rounded-md mb-2"
                alt={img.alt_text || ""}
              />
            ) : (
              <div className="w-full h-40 bg-gray-700 rounded-md mb-2" />
            )}
            <div className="flex gap-2 flex-wrap">
              <Btn onClick={() => move(img.id, -1)}>↑</Btn>
              <Btn onClick={() => move(img.id, 1)}>↓</Btn>
              <Btn
                onClick={() => updateRow(img.id, { is_cover: !img.is_cover })}
                className={
                  img.is_cover ? "bg-green-600 text-white" : "bg-gray-600"
                }
              >
                {img.is_cover ? "Cover ✓" : "Make Cover"}
              </Btn>
              <Btn
                onClick={() => removeRow(img.id, img.storage_path)}
                className="bg-red-700 text-white hover:bg-red-600"
              >
                Delete
              </Btn>
            </div>
            <Field label="Alt text">
              <input
                className={inputStyles}
                value={img.alt_text || ""}
                onChange={(e) =>
                  updateRow(img.id, { alt_text: e.target.value })
                }
              />
            </Field>
            <Field label="Caption">
              <input
                className={inputStyles}
                value={img.caption || ""}
                onChange={(e) => updateRow(img.id, { caption: e.target.value })}
              />
            </Field>
            <Field label="Credit">
              <input
                className={inputStyles}
                value={img.credit || ""}
                onChange={(e) => updateRow(img.id, { credit: e.target.value })}
              />
            </Field>
          </div>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="text-sm text-gray-500">
          No images yet. Use the uploader above.
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Photo Story (restored) ───────────────────── */

function PhotoStoryForm({
  siteId,
  slug,
  title,
}: {
  siteId: string | number;
  slug: string;
  title: string;
}) {
  const [ps, setPs] = useState<any>({
    site_id: siteId,
    hero_photo_url: "",
    subtitle: "",
  });
  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("photo_stories")
        .select("*")
        .eq("site_id", siteId)
        .maybeSingle();
      setPs(data || { site_id: siteId, hero_photo_url: "", subtitle: "" });
      const { data: it } = await supabase
        .from("photo_story_items")
        .select("*")
        .eq("site_id", siteId)
        .order("sort_order");
      setItems(it || []);
      setLoaded(true);
    })();
  }, [siteId]);
  async function saveStory() {
    await supabase.from("photo_stories").upsert(ps);
    for (const [i, it] of items.entries()) {
      await supabase
        .from("photo_story_items")
        .upsert({ ...it, site_id: siteId, sort_order: i });
    }
    alert("Photo Story saved");
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        site_id: siteId,
        image_url: "",
        text_block: "",
        sort_order: prev.length,
      },
    ]);
  }
  async function onUpload(idx: number, f: File) {
    const key = `story/${siteId}/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage
      .from("photo-story")
      .upload(key, f, { upsert: false });
    if (error) return alert(error.message);
    const url = await publicUrl("photo-story", key);
    setItems((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, image_url: url } : x))
    );
  }
  async function onUploadHero(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const key = `story-hero/${siteId}/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage
      .from("photo-story")
      .upload(key, f, { upsert: false });
    if (error) return alert(error.message);
    const url = await publicUrl("photo-story", key);
    setPs((prev: any) => ({ ...prev, hero_photo_url: url }));
  }

  if (!loaded)
    return <div className="text-gray-400 p-6">Loading Photo Story…</div>;

  return (
    <div className="space-y-6 p-6 bg-gray-800 rounded-lg">
      <div className="text-sm text-gray-400">
        Title: <b className="text-white">{title}</b> ·{" "}
        <a
          className="text-indigo-400 hover:underline"
          href={`/heritage/${slug}/story`}
          target="_blank"
        >
          Open Photo Story
        </a>
      </div>
      <Field label="Photo Story Hero URL">
        <input
          className={inputStyles}
          value={ps.hero_photo_url || ""}
          onChange={(e) => setPs({ ...ps, hero_photo_url: e.target.value })}
        />
      </Field>
      <Field label="Upload Photo Story Hero (optional)">
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/*"
            onChange={onUploadHero}
            className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-gray-200 hover:file:bg-gray-500"
          />
          {ps.hero_photo_url ? (
            <img
              src={ps.hero_photo_url}
              className="h-12 w-12 object-cover rounded-lg"
              alt="Photo Story hero"
            />
          ) : null}
        </div>
      </Field>
      <Field label="Subtitle (optional)">
        <input
          className={inputStyles}
          value={ps.subtitle || ""}
          onChange={(e) => setPs({ ...ps, subtitle: e.target.value })}
        />
      </Field>
      <div className="mt-6 border-t border-gray-700 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-white">Story Items</div>
          <Btn onClick={addItem} className="bg-gray-700 hover:bg-gray-600">
            Add Story Item
          </Btn>
        </div>
        {items.map((it, idx) => (
          <div
            key={it.id}
            className="border border-gray-700 rounded-lg p-4 mb-4 bg-gray-900/50"
          >
            <div className="text-sm text-gray-400 mb-3 font-semibold">
              Item #{idx + 1}
            </div>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(idx, f);
                }}
                className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-gray-200 hover:file:bg-gray-500"
              />
              {it.image_url ? (
                <img
                  src={it.image_url}
                  className="h-12 w-12 object-cover rounded-lg"
                  alt=""
                />
              ) : null}
            </div>
            <Field label="Text (optional)">
              <textarea
                className={inputStyles}
                value={it.text_block || ""}
                onChange={(e) =>
                  setItems(
                    items.map((x, i) =>
                      i === idx ? { ...x, text_block: e.target.value } : x
                    )
                  )
                }
              />
            </Field>
          </div>
        ))}
      </div>
      <Btn
        onClick={saveStory}
        className="bg-indigo-600 text-white hover:bg-indigo-500"
      >
        Save Photo Story
      </Btn>
    </div>
  );
}

/* ─────────────────── Bibliography Manager ─────────────────── */

function BibliographyManager({ siteId }: { siteId: string | number }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bibliography_sources")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true });
    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }
    setItems(data || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [siteId]);
  async function addItem() {
    const sort_order = items.length;
    const { data, error } = await supabase
      .from("bibliography_sources")
      .insert({ site_id: siteId, title: "Untitled", sort_order })
      .select()
      .single();
    if (error) return alert(error.message);
    setItems([...items, data]);
  }
  async function updateItem(id: string, patch: any) {
    const { data, error } = await supabase
      .from("bibliography_sources")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return alert(error.message);
    setItems(items.map((it) => (it.id === id ? data : it)));
  }
  async function removeItem(id: string) {
    const { error } = await supabase
      .from("bibliography_sources")
      .delete()
      .eq("id", id);
    if (error) return alert(error.message);
    setItems(items.filter((it) => it.id !== id));
  }
  async function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((r) => r.id === id);
    const swap = items[idx + dir];
    if (!swap) return;
    const a = items[idx];
    const b = swap;
    await supabase
      .from("bibliography_sources")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    await supabase
      .from("bibliography_sources")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    await load();
  }
  if (loading)
    return <div className="text-gray-400">Loading Bibliography…</div>;
  return (
    <div>
      <div className="mb-4">
        <Btn
          onClick={addItem}
          className="bg-indigo-600 text-white hover:bg-indigo-500"
        >
          Add Source
        </Btn>
      </div>
      <div className="space-y-4">
        {items.map((s, i) => (
          <div
            key={s.id}
            className="border border-gray-700 rounded-lg p-4 bg-gray-800/50"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-400">
                Source #{i + 1}
              </div>
              <div className="flex gap-2">
                <Btn onClick={() => move(s.id, -1)}>↑</Btn>
                <Btn onClick={() => move(s.id, 1)}>↓</Btn>
                <Btn
                  onClick={() => removeItem(s.id)}
                  className="bg-red-700 text-white hover:bg-red-600"
                >
                  Delete
                </Btn>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Source Title">
                <input
                  className={inputStyles}
                  value={s.title || ""}
                  onChange={(e) => updateItem(s.id, { title: e.target.value })}
                />
              </Field>
              <Field label="Authors / Publication">
                <input
                  className={inputStyles}
                  value={s.authors || ""}
                  onChange={(e) =>
                    updateItem(s.id, { authors: e.target.value })
                  }
                />
              </Field>
              <Field label="Year">
                <input
                  className={inputStyles}
                  value={s.year || ""}
                  onChange={(e) => updateItem(s.id, { year: e.target.value })}
                />
              </Field>
              <Field label="Publisher / Website">
                <input
                  className={inputStyles}
                  value={s.publisher_or_site || ""}
                  onChange={(e) =>
                    updateItem(s.id, { publisher_or_site: e.target.value })
                  }
                />
              </Field>
              <Field label="URL">
                <input
                  className={inputStyles}
                  value={s.url || ""}
                  onChange={(e) => updateItem(s.id, { url: e.target.value })}
                />
              </Field>
              <Field label="Notes">
                <input
                  className={inputStyles}
                  value={s.notes || ""}
                  onChange={(e) => updateItem(s.id, { notes: e.target.value })}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div className="text-sm text-gray-500">No sources yet.</div>
      )}
    </div>
  );
}

/* ───────────────────── Custom Sections Editor ───────────────────── */

function CustomSectionsEditor({ siteId }: { siteId: string | number }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("custom_sections")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true });
    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }
    setItems(data || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [siteId]);
  async function addSection() {
    const sort_order = items.length;
    const { data, error } = await supabase
      .from("custom_sections")
      .insert({
        site_id: siteId,
        title: "New Section",
        content: "",
        sort_order,
      })
      .select()
      .single();
    if (error) return alert(error.message);
    setItems([...items, data]);
  }
  async function updateItem(id: string, patch: any) {
    const { data, error } = await supabase
      .from("custom_sections")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return alert(error.message);
    setItems(items.map((it) => (it.id === id ? data : it)));
  }
  async function removeItem(id: string) {
    const { error } = await supabase
      .from("custom_sections")
      .delete()
      .eq("id", id);
    if (error) return alert(error.message);
    setItems(items.filter((it) => it.id !== id));
  }
  async function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((r) => r.id === id);
    const swap = items[idx + dir];
    if (!swap) return;
    const a = items[idx];
    const b = swap;
    await supabase
      .from("custom_sections")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    await supabase
      .from("custom_sections")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    await load();
  }
  if (loading) return <div className="text-gray-400">Loading Sections…</div>;
  return (
    <div>
      <div className="mb-4">
        <Btn
          onClick={addSection}
          className="bg-indigo-600 text-white hover:bg-indigo-500"
        >
          Add Custom Section
        </Btn>
      </div>
      <div className="space-y-4">
        {items.map((s, i) => (
          <div
            key={s.id}
            className="border border-gray-700 rounded-lg p-4 bg-gray-800/50"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-400">
                Section #{i + 1}
              </div>
              <div className="flex gap-2">
                <Btn onClick={() => move(s.id, -1)}>↑</Btn>
                <Btn onClick={() => move(s.id, 1)}>↓</Btn>
                <Btn
                  onClick={() => removeItem(s.id)}
                  className="bg-red-700 text-white hover:bg-red-600"
                >
                  Delete
                </Btn>
              </div>
            </div>
            <Field label="Section Title">
              <input
                className={inputStyles}
                value={s.title || ""}
                onChange={(e) => updateItem(s.id, { title: e.target.value })}
              />
            </Field>
            <FieldBlock label="Content">
              <RichTextEditor
                siteId={siteId}
                value={s.content || ""}
                onChange={(content) => updateItem(s.id, { content })}
              />
            </FieldBlock>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div className="text-sm text-gray-500">No custom sections yet.</div>
      )}
    </div>
  );
}

/* ─────────────────────────── Gallery Browser Modal ─────────────────────────── */

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

/* ───────────────────────────── Toolbar (icons) ───────────────────────────── */

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

/* ───────────────────── Custom Figure Node for Images with Captions ───────────────────── */

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

/* ───────────────────────────── RichTextEditor ───────────────────────────── */

function RichTextEditor({
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
        heading: {
          levels: [1, 2, 3, 4, 5],
        },
      }),
      Underline,
      Image, // Keep the base Image node
      Figure, // Add the new Figure wrapper node
      Figcaption, // Add the new Figcaption node
      YouTube.configure({
        modestBranding: true,
        rel: 0, // ✅ must be a number (0 = don't show related videos)
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
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
      <div className="p-4 border rounded-md bg-gray-100 text-gray-500">
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
          margin: 0 auto; /* Center the image within the figure */
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
      `}</style>
    </>
  );
}

export {};
