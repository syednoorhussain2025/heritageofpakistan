// src/app/admin/listings/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";

/* ─────────────────────────── Small UI helpers ─────────────────────────── */

type Tab = "listing" | "photo";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded shadow-sm p-4">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
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
      <div className="text-sm font-medium mb-1">{label}</div>
      {children}
    </label>
  );
}

function Btn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-3 py-2 rounded ${props.className ?? "bg-gray-200"}`}
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

export default function EditListing({ params }: { params: { id: string } }) {
  return (
    <AdminGuard>
      <EditContent id={params.id} />
    </AdminGuard>
  );
}

function EditContent({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>("listing");
  const [site, setSite] = useState<any>(null);
  const [saving, setSaving] = useState(false);

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

  if (!site) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit: {site.title}</h1>
        <div className="flex gap-2">
          <Btn
            onClick={() => setTab("listing")}
            className={
              tab === "listing" ? "bg-black text-white" : "bg-gray-200"
            }
          >
            Listing
          </Btn>
          <Btn
            onClick={() => setTab("photo")}
            className={tab === "photo" ? "bg-black text-white" : "bg-gray-200"}
          >
            Photo Story
          </Btn>
        </div>
      </div>

      {tab === "listing" ? (
        <ListingForm site={site} onSave={saveSite} saving={saving} />
      ) : (
        <PhotoStoryForm siteId={site.id} slug={site.slug} title={site.title} />
      )}
    </div>
  );
}

/* ─────────────────────────── Listing tab (ALL fields) ─────────────────────────── */

function ListingForm({
  site,
  onSave,
  saving,
}: {
  site: any;
  onSave: (n: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<any>(site);

  // dropdown data + multi-selects
  const [provinces, setProvinces] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allRegions, setAllRegions] = useState<any[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);

  useEffect(() => setForm(site), [site]);

  useEffect(() => {
    (async () => {
      const [{ data: prov }, { data: cats }, { data: regs }, sc, sr] =
        await Promise.all([
          supabase.from("provinces").select("id, name").order("name"),
          supabase
            .from("categories")
            .select("id, name, parent_id")
            .order("name"),
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
      {/* HERO */}
      <Section title="Hero (Cover)">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Title (Site Name)">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.title || ""}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="Slug (URL) e.g. lahore-fort">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.slug || ""}
              onChange={(e) => set("slug", e.target.value)}
            />
          </Field>
          <Field label="Tagline (~50 words)">
            <textarea
              className="w-full border rounded px-3 py-2"
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

        {/* Ratings are phase 2 (computed from reviews). Shown as read-only placeholders. */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="Average Rating (read-only)">
            <input
              className="w-full border rounded px-3 py-2 bg-gray-100"
              value={form.avg_rating ?? ""}
              readOnly
            />
          </Field>
          <Field label="Review Count (read-only)">
            <input
              className="w-full border rounded px-3 py-2 bg-gray-100"
              value={form.review_count ?? ""}
              readOnly
            />
          </Field>
        </div>
      </Section>

      {/* HERO RIGHT */}
      <Section title="Hero (Right side)">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Heritage Type (free text)">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.heritage_type || ""}
              onChange={(e) => set("heritage_type", e.target.value)}
            />
          </Field>
          <Field label="Location (free text)">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.location_free || ""}
              onChange={(e) => set("location_free", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* CATEGORIES / REGIONS (multi-selects) */}
      <Section title="Heritage Categories & Regions (multi-select)">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium mb-2">Categories</div>
            <MultiSelect
              items={allCategories}
              selectedIds={selectedCatIds}
              setSelectedIds={setSelectedCatIds}
              labelKey="name"
            />
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Regions</div>
            <MultiSelect
              items={allRegions}
              selectedIds={selectedRegionIds}
              setSelectedIds={setSelectedRegionIds}
              labelKey="name"
            />
          </div>
        </div>
      </Section>

      {/* WHERE IS IT / LOCATION */}
      <Section title="Sidebar — Where is it / Location">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Field label="Latitude">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.latitude || ""}
              onChange={(e) => set("latitude", e.target.value)}
            />
          </Field>
          <Field label="Longitude">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.longitude || ""}
              onChange={(e) => set("longitude", e.target.value)}
            />
          </Field>
          <div />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <Field label="Town/City/Village">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.town_city_village || ""}
              onChange={(e) => set("town_city_village", e.target.value)}
            />
          </Field>
          <Field label="Tehsil">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.tehsil || ""}
              onChange={(e) => set("tehsil", e.target.value)}
            />
          </Field>
          <Field label="District">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.district || ""}
              onChange={(e) => set("district", e.target.value)}
            />
          </Field>
          <Field label="Region / Province (dropdown of 6)">
            <select
              className="w-full border rounded px-3 py-2"
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

      {/* GENERAL INFO (the full list) */}
      <Section title="Sidebar — General Info">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Name is same as Title; show read-only */}
          <Field label="Name (auto from Title)">
            <input
              className="w-full border rounded px-3 py-2 bg-gray-100"
              value={form.title || ""}
              readOnly
            />
          </Field>

          <Field label="Architectural Style">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.architectural_style || ""}
              onChange={(e) => set("architectural_style", e.target.value)}
            />
          </Field>
          <Field label="Construction Materials">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.construction_materials || ""}
              onChange={(e) => set("construction_materials", e.target.value)}
            />
          </Field>
          <Field label="Local Name">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.local_name || ""}
              onChange={(e) => set("local_name", e.target.value)}
            />
          </Field>
          <Field label="Architect">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.architect || ""}
              onChange={(e) => set("architect", e.target.value)}
            />
          </Field>
          <Field label="Construction Date">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.construction_date || ""}
              onChange={(e) => set("construction_date", e.target.value)}
            />
          </Field>
          <Field label="Built by">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.built_by || ""}
              onChange={(e) => set("built_by", e.target.value)}
            />
          </Field>
          <Field label="Dynasty">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.dynasty || ""}
              onChange={(e) => set("dynasty", e.target.value)}
            />
          </Field>
          <Field label="Conservation Status">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.conservation_status || ""}
              onChange={(e) => set("conservation_status", e.target.value)}
            />
          </Field>
          <Field label="Current Use">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.current_use || ""}
              onChange={(e) => set("current_use", e.target.value)}
            />
          </Field>
          <Field label="Restored by">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.restored_by || ""}
              onChange={(e) => set("restored_by", e.target.value)}
            />
          </Field>
          <Field label="Known for">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.known_for || ""}
              onChange={(e) => set("known_for", e.target.value)}
            />
          </Field>
          <Field label="Era">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.era || ""}
              onChange={(e) => set("era", e.target.value)}
            />
          </Field>
          <Field label="Inhabited by">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.inhabited_by || ""}
              onChange={(e) => set("inhabited_by", e.target.value)}
            />
          </Field>
          <Field label="National Park Established in">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.national_park_established_in || ""}
              onChange={(e) =>
                set("national_park_established_in", e.target.value)
              }
            />
          </Field>
          <Field label="Population">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.population || ""}
              onChange={(e) => set("population", e.target.value)}
            />
          </Field>
          <Field label="Ethnic Groups">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.ethnic_groups || ""}
              onChange={(e) => set("ethnic_groups", e.target.value)}
            />
          </Field>
          <Field label="Languages Spoken">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.languages_spoken || ""}
              onChange={(e) => set("languages_spoken", e.target.value)}
            />
          </Field>
          <Field label="Excavation Status">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.excavation_status || ""}
              onChange={(e) => set("excavation_status", e.target.value)}
            />
          </Field>
          <Field label="Excavated by">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.excavated_by || ""}
              onChange={(e) => set("excavated_by", e.target.value)}
            />
          </Field>
          <Field label="Administered by (label editable later)">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.administered_by || ""}
              onChange={(e) => set("administered_by", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* UNESCO / PROTECTED */}
      <Section title="Sidebar — UNESCO & Protection">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="UNESCO Status">
            <select
              className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
              value={form.unesco_line || ""}
              onChange={(e) => set("unesco_line", e.target.value)}
            />
          </Field>
          <Field label="Protected under (free text)">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.protected_under || ""}
              onChange={(e) => set("protected_under", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* CLIMATE & TOPOGRAPHY */}
      <Section title="Sidebar — Climate & Topography">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Field label="Landform">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.landform || ""}
              onChange={(e) => set("landform", e.target.value)}
            />
          </Field>
          <Field label="Altitude">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.altitude || ""}
              onChange={(e) => set("altitude", e.target.value)}
            />
          </Field>
          <Field label="Mountain Range">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.mountain_range || ""}
              onChange={(e) => set("mountain_range", e.target.value)}
            />
          </Field>
          <Field label="Weather Type">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.weather_type || ""}
              onChange={(e) => set("weather_type", e.target.value)}
            />
          </Field>
          <Field label="Average Temp in Summers">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.avg_temp_summers || ""}
              onChange={(e) => set("avg_temp_summers", e.target.value)}
            />
          </Field>
          <Field label="Average Temp in Winters">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.avg_temp_winters || ""}
              onChange={(e) => set("avg_temp_winters", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* DID YOU KNOW */}
      <Section title="Sidebar — Did you Know">
        <Field label="Interesting fact (free text)">
          <textarea
            className="w-full border rounded px-3 py-2"
            value={form.did_you_know || ""}
            onChange={(e) => set("did_you_know", e.target.value)}
          />
        </Field>
      </Section>

      {/* TRAVEL GUIDE */}
      <Section title="Sidebar — Travel Guide">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Location (Travel Guide)">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.travel_location || ""}
              onChange={(e) => set("travel_location", e.target.value)}
            />
          </Field>
          <Field label="How to Reach">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.travel_how_to_reach || ""}
              onChange={(e) => set("travel_how_to_reach", e.target.value)}
            />
          </Field>
          <Field label="Nearest Major City">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.travel_nearest_major_city || ""}
              onChange={(e) => set("travel_nearest_major_city", e.target.value)}
            />
          </Field>

          <Field label="Airport Access">
            <select
              className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
              value={form.travel_best_time_free || ""}
              onChange={(e) => set("travel_best_time_free", e.target.value)}
            />
          </Field>
          <Field label="Full Travel Guide URL (optional button)">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.travel_full_guide_url || ""}
              onChange={(e) => set("travel_full_guide_url", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* BEST TIME PRESET */}
      <Section title="Sidebar — Best Time to Visit (preset)">
        <Field label="Preset Key (temporary; global presets later)">
          <input
            className="w-full border rounded px-3 py-2"
            value={form.best_time_option_key || ""}
            onChange={(e) => set("best_time_option_key", e.target.value)}
          />
        </Field>
      </Section>

      {/* PLACES TO STAY */}
      <Section title="Sidebar — Places to Stay">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Hotels Available">
            <select
              className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
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

      {/* RIGHT COLUMN: ARTICLES */}
      <Section title="Right Column — Articles">
        <Field label="History & Background">
          <textarea
            rows={8}
            className="w-full border rounded px-3 py-2"
            value={form.history_content || ""}
            onChange={(e) => set("history_content", e.target.value)}
          />
        </Field>
        <Field label="Architecture & Design (optional)">
          <textarea
            rows={6}
            className="w-full border rounded px-3 py-2"
            value={form.architecture_content || ""}
            onChange={(e) => set("architecture_content", e.target.value)}
          />
        </Field>
        <Field label="Climate, Geography & Environment (optional)">
          <textarea
            rows={6}
            className="w-full border rounded px-3 py-2"
            value={form.climate_env_content || ""}
            onChange={(e) => set("climate_env_content", e.target.value)}
          />
        </Field>
      </Section>

      {/* CUSTOM LONG-FORM SECTIONS */}
      <Section title="Custom Long-form Sections">
        <CustomSectionsEditor siteId={site.id} />
      </Section>

      {/* GALLERY */}
      <Section title="Gallery Uploader">
        <GalleryManager siteId={site.id} />
      </Section>

      {/* BIBLIOGRAPHY */}
      <Section title="Bibliography, Sources & Further Reading">
        <BibliographyManager siteId={site.id} />
      </Section>

      {/* PUBLISH */}
      <Section title="Publish">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.is_published}
            onChange={(e) => set("is_published", e.target.checked)}
          />
          <span>Published (visible on the public site)</span>
        </label>
        <div className="mt-4">
          <Btn
            onClick={saveAll}
            className="bg-black text-white"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Btn>
        </div>
      </Section>
    </div>
  );
}

/* ────────── Multi-select (Categories / Regions) ────────── */

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
  function toggle(id: string) {
    if (selectedIds.includes(id))
      setSelectedIds(selectedIds.filter((x) => x !== id));
    else setSelectedIds([...selectedIds, id]);
  }
  return (
    <div className="max-h-72 overflow-auto border rounded p-2 space-y-1">
      {items.map((it) => (
        <label key={it.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selectedIds.includes(it.id)}
            onChange={() => toggle(it.id)}
          />
          <span>{it[labelKey]}</span>
        </label>
      ))}
      {items.length === 0 && (
        <div className="text-sm text-gray-500">No items yet.</div>
      )}
    </div>
  );
}

/* ────────── Cover uploader (Supabase Storage: site-images/covers) ────────── */

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
    <div className="flex items-center gap-3">
      <input type="file" accept="image/*" onChange={handle} />
      {value ? <img src={value} className="h-12 rounded" alt="" /> : null}
    </div>
  );
}

/* ────────── Gallery Manager (upload, caption, credit, reorder, delete) ────────── */

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
      await supabase.from("site_images").insert({
        site_id: siteId,
        storage_path: key,
        sort_order: order++,
      });
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

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <div className="mb-3">
        <input type="file" accept="image/*" multiple onChange={onUpload} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rows.map((img) => (
          <div key={img.id} className="border rounded p-2 bg-white">
            {img.publicUrl ? (
              <img
                src={img.publicUrl}
                className="w-full h-36 object-cover rounded mb-2"
                alt={img.alt_text || ""}
              />
            ) : (
              <div className="w-full h-36 bg-gray-100 rounded mb-2" />
            )}
            <div className="flex gap-2 mb-2">
              <Btn onClick={() => move(img.id, -1)}>↑</Btn>
              <Btn onClick={() => move(img.id, 1)}>↓</Btn>
              <Btn
                onClick={() => updateRow(img.id, { is_cover: !img.is_cover })}
                className={img.is_cover ? "bg-black text-white" : "bg-gray-200"}
              >
                {img.is_cover ? "Cover ✓" : "Make Cover"}
              </Btn>
              <Btn
                onClick={() => removeRow(img.id, img.storage_path)}
                className="bg-red-600 text-white"
              >
                Delete
              </Btn>
            </div>
            <Field label="Alt text">
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                value={img.alt_text || ""}
                onChange={(e) =>
                  updateRow(img.id, { alt_text: e.target.value })
                }
              />
            </Field>
            <Field label="Caption">
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                value={img.caption || ""}
                onChange={(e) => updateRow(img.id, { caption: e.target.value })}
              />
            </Field>
            <Field label="Credit">
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                value={img.credit || ""}
                onChange={(e) => updateRow(img.id, { credit: e.target.value })}
              />
            </Field>
          </div>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="text-sm text-gray-600">
          No images yet. Use the uploader above.
        </div>
      )}
    </div>
  );
}

/* ────────── Bibliography manager (structured, reorderable) ────────── */

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

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Btn onClick={addItem} className="bg-black text-white">
          Add Source
        </Btn>
      </div>
      <div className="space-y-3">
        {items.map((s, i) => (
          <div key={s.id} className="border rounded p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">#{i + 1}</div>
              <div className="flex gap-2">
                <Btn onClick={() => move(s.id, -1)}>↑</Btn>
                <Btn onClick={() => move(s.id, 1)}>↓</Btn>
                <Btn
                  onClick={() => removeItem(s.id)}
                  className="bg-red-600 text-white"
                >
                  Delete
                </Btn>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Source Title">
                <input
                  className="w-full border rounded px-2 py-1"
                  value={s.title || ""}
                  onChange={(e) => updateItem(s.id, { title: e.target.value })}
                />
              </Field>
              <Field label="Authors / Publication">
                <input
                  className="w-full border rounded px-2 py-1"
                  value={s.authors || ""}
                  onChange={(e) =>
                    updateItem(s.id, { authors: e.target.value })
                  }
                />
              </Field>
              <Field label="Year">
                <input
                  className="w-full border rounded px-2 py-1"
                  value={s.year || ""}
                  onChange={(e) => updateItem(s.id, { year: e.target.value })}
                />
              </Field>
              <Field label="Publisher / Website">
                <input
                  className="w-full border rounded px-2 py-1"
                  value={s.publisher_or_site || ""}
                  onChange={(e) =>
                    updateItem(s.id, { publisher_or_site: e.target.value })
                  }
                />
              </Field>
              <Field label="URL">
                <input
                  className="w-full border rounded px-2 py-1"
                  value={s.url || ""}
                  onChange={(e) => updateItem(s.id, { url: e.target.value })}
                />
              </Field>
              <Field label="Notes">
                <input
                  className="w-full border rounded px-2 py-1"
                  value={s.notes || ""}
                  onChange={(e) => updateItem(s.id, { notes: e.target.value })}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div className="text-sm text-gray-600">No sources yet.</div>
      )}
    </div>
  );
}

/* ────────── Custom long-form sections (title + content + reorder) ────────── */

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

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <div className="mb-3">
        <Btn onClick={addSection} className="bg-black text-white">
          Add Custom Section
        </Btn>
      </div>
      <div className="space-y-3">
        {items.map((s, i) => (
          <div key={s.id} className="border rounded p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">#{i + 1}</div>
              <div className="flex gap-2">
                <Btn onClick={() => move(s.id, -1)}>↑</Btn>
                <Btn onClick={() => move(s.id, 1)}>↓</Btn>
                <Btn
                  onClick={() => removeItem(s.id)}
                  className="bg-red-600 text-white"
                >
                  Delete
                </Btn>
              </div>
            </div>
            <Field label="Section Title">
              <input
                className="w-full border rounded px-2 py-1"
                value={s.title || ""}
                onChange={(e) => updateItem(s.id, { title: e.target.value })}
              />
            </Field>
            <Field label="Content">
              <textarea
                className="w-full border rounded px-2 py-2"
                rows={6}
                value={s.content || ""}
                onChange={(e) => updateItem(s.id, { content: e.target.value })}
              />
            </Field>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div className="text-sm text-gray-600">No custom sections yet.</div>
      )}
    </div>
  );
}

/* ────────── Photo Story tab (hero + image/text items with upload) ────────── */

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

  // NEW: hero cover uploader for Photo Story
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

  if (!loaded) return <div>Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Title: <b>{title}</b> ·{" "}
        <a
          className="text-blue-600"
          href={`/heritage/${slug}/story`}
          target="_blank"
        >
          Open Photo Story
        </a>
      </div>

      {/* Existing hero URL input (kept as-is) */}
      <Field label="Photo Story Hero URL">
        <input
          className="w-full border rounded px-3 py-2"
          value={ps.hero_photo_url || ""}
          onChange={(e) => setPs({ ...ps, hero_photo_url: e.target.value })}
        />
      </Field>

      {/* NEW: Hero cover uploader + preview */}
      <Field label="Upload Photo Story Hero (optional)">
        <div className="flex items-center gap-3">
          <input type="file" accept="image/*" onChange={onUploadHero} />
          {ps.hero_photo_url ? (
            <img
              src={ps.hero_photo_url}
              className="h-12 rounded"
              alt="Photo Story hero"
            />
          ) : null}
        </div>
      </Field>

      <Field label="Subtitle (optional)">
        <input
          className="w-full border rounded px-3 py-2"
          value={ps.subtitle || ""}
          onChange={(e) => setPs({ ...ps, subtitle: e.target.value })}
        />
      </Field>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Story Items</div>
          <Btn onClick={addItem}>Add Story Item</Btn>
        </div>

        {items.map((it, idx) => (
          <div key={it.id} className="border rounded p-3 mb-3 bg-white">
            <div className="text-sm text-gray-500 mb-2">Item #{idx + 1}</div>

            <div className="flex items-center gap-3 mb-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(idx, f);
                }}
              />
              {it.image_url ? (
                <img src={it.image_url} className="h-12 rounded" alt="" />
              ) : null}
            </div>

            <Field label="Text (optional)">
              <textarea
                className="w-full border rounded px-3 py-2"
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

      <Btn onClick={saveStory} className="bg-black text-white">
        Save Photo Story
      </Btn>
    </div>
  );
}
