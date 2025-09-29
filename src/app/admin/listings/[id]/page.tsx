// src/app/admin/listings/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";
import { FaArrowLeft, FaTrash, FaMagic } from "react-icons/fa";
import Icon from "@/components/Icon";
import Papa from "papaparse";

/* Externalized Components */
import GalleryUploader from "./GalleryUploader";
import PhotoStory from "./PhotoStory";
import Bibliography from "./Bibliography";
import ArticlesSection from "./ArticlesSection";
import TravelDetails from "./TravelDetails";
import CategoriesRegionsSelector from "./CategoriesRegionsSelector";

/* NEW: travel guide selector modal */
import ConnectTravelGuideModal, {
  SelectedGuide,
} from "@/components/ConnectTravelGuideModal";

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
    sections: ["articles"],
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
  tools,
}: {
  title: string;
  children: React.ReactNode;
  id: string;
  tools?: React.ReactNode;
}) {
  const iconKey = SECTION_ICONS[id];

  // Frameless sections (no outer card/header/tools)
  const isFrameless = id === "articles" || id === "photo";
  if (isFrameless) {
    return (
      <section id={id} className="scroll-mt-24 p-0 bg-transparent">
        {children}
      </section>
    );
  }

  // Default (carded) sections
  return (
    <section
      id={id}
      className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 scroll-mt-24"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 flex items-center gap-3">
          {iconKey && (
            <span className="grid place-items-center w-8 h-8 rounded-full bg-[#F78300]">
              <Icon name={iconKey} className="w-4 h-4 text-white" />
            </span>
          )}
          {title}
        </h2>
        {tools ? <div className="mb-4">{tools}</div> : null}
      </div>
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

/* Small bottom-right toast for auto-save */
function SavingToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <div className="flex items-center gap-2 rounded-lg bg-black/80 text-white px-3 py-2 shadow-lg">
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"
          />
        </svg>
        <span className="text-sm font-medium">Saving…</span>
      </div>
    </div>
  );
}

/* Sidebar controls */
function SidebarControls({
  published,
  onTogglePublished,
  onSave,
  saving,
  uploaderSlot,
  autoSaveEnabled,
  onToggleAutoSave,
  lastSavedAt,
}: {
  published: boolean;
  onTogglePublished: (v: boolean) => void;
  onSave: (opts?: { silent?: boolean }) => void | Promise<void>;
  saving: boolean;
  uploaderSlot?: React.ReactNode; // 👈 slot rendered below Save
  autoSaveEnabled: boolean;
  onToggleAutoSave: (v: boolean) => void;
  lastSavedAt: Date | null;
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

        <label className="inline-flex items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
            checked={autoSaveEnabled}
            onChange={(e) => onToggleAutoSave(e.target.checked)}
          />
          <span className="text-gray-900 font-medium">Auto Save</span>
        </label>

        <div>
          <Btn
            onClick={() => onSave({ silent: false })}
            className="w-full bg-black text-white hover:bg-gray-900 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Btn>
          <div className="mt-1 text-[11px] text-gray-500">
            Last saved: {lastSavedAt ? lastSavedAt.toLocaleTimeString() : "—"}
          </div>
        </div>

        {/* Uploader lives here */}
        {uploaderSlot ? (
          <div className="pt-2 border-t border-gray-200">{uploaderSlot}</div>
        ) : null}
      </div>
    </nav>
  );
}

/* ---------------- CSV canonicalization & mapping (shared) ---------------- */

type CanonicalKV = Record<string, any>;

/** Headers including Cover + Travel Details (descriptive for template) */
const TEMPLATE_HEADERS = [
  // Cover
  "title (Site Name, no brackets)", // Site Name
  "slug (matching the title)",
  "heritage_type (e.g Colonial Era Building, Lake, Mughal Era Garden)",
  "cover_location (City/town, Province)(e.g Lahore, Punjab)",
  "tagline (around 50 words introduction of the site)",

  // Location block
  "latitude",
  "longitude",
  "town_city_village",
  "tehsil",
  "district (e.g Lahore, Islamabad, Faisalabad)",
  "province (e.g Punjab, Gilgit Baltistan) ",

  // General info
  "architectural_style (e.g Mughal Architecture, Sikh Architecture, Indo Saracenic)",
  "construction_materials (e.g Brick, plaster, marble)",
  "local_name (e.g Shahi Qila for Lahore Fort)",
  "architect (e.g Nayar Ali Dada for Alhamra)",
  "construction_date (e.g 18th Century, 1956,)",
  "built_by",
  "dynasty (e.g Mughal Dynasty)",
  "conservation_status (e.g Needs Conservation, Under threat)",
  "current_use (e.g Heritage Site, Hotel, Toursit site)",
  "restored_by (e.g Agha Khan Cultural Service)",
  "known_for (e.g Frescoes, Natural Views)",
  "era (e.g Mughal Era)",
  "inhabited_by (e.g Gojar Tribes, Pashtuns etc)",
  "national_park_established_in (e.g 1976)",
  "population (e.g Est 550)",
  "ethnic_groups (e.g Gojars, Bakarwals)",
  "languages_spoken (e.g urdu, pashto)",
  "excavation_status (e.g Excavated in 1922)",
  "excavated_by (e.g John Marshal)",
  "administered_by (e.g Punjab Archaeology Department)",

  // UNESCO
  "unesco_status",
  "unesco_line",
  "protected_under (e.g Antiquities Act 1975)",

  // Climate
  "landform (e.g Mountains, Land, Lake)",
  "altitude (e.g 2300 meters (5333 feet) above sea level)",
  "mountain_range (e.g Karakoram)",
  "weather_type (e.g Moderate Summers, Extreme Cold Winters)",
  "avg_temp_summers (e.g Ranges from 8°C to 23°C)",
  "avg_temp_winters",

  // Travel
  "travel_location (City, Province)(e.g Malam Jabba, Khyber Pakhtunkhwa )",
  "travel_how_to_reach (e.g 45 km from Mingora (1.5 Hours Drive)",
  "travel_nearest_major_city (e.g Mingora, Khyber Pakhtunkhwa)",
  "travel_airport_access (Yes/No)",
  "travel_international_flight",
  "travel_access_options (etc By Road Only, By Road & Airport), By Road, Railway and Airport",
  "travel_road_type_condition (etc Metalled Road)",
  "travel_best_time_free (e.g Summers)",
  "travel_full_guide_url",

  // Best time
  "best_time_option_key (e.g The Best Time to Visit mountain regions of Khyberpakhtunkhwa is Summers. Preferably from April to September. Winters are Extremely Cold and Snowfall blocks most of access. Hence Winters are not recommended.)",

  // Stay
  "stay_hotels_available (Yes/No/limited options)",
  "stay_spending_night_recommended (Yes/No or Good Place to stay)",
  "stay_camping_possible (Not recommended, Not suitable, Yes)",
  "stay_places_to_eat_available (Yes, No, Limited Options)",

  // Misc
  "did_you_know (One line interesting fact e.g The Jahanabad Buddha near Malam Jabba is one of the largest carved Buddha reliefs in Pakistan)",
] as const;

type CanonicalKey = (typeof TEMPLATE_HEADERS)[number];
function normHeader(h: string): string {
  const base = h.replace(/\(.*/, "").trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** IMPORTANT:
 * Coerce to the exact lowercase enum values that satisfy the DB CHECK constraint.
 * We assume the constraint allows only: 'none' | 'inscribed' | 'tentative'.
 */
function normalizeUnescoStatus(v: any): "none" | "inscribed" | "tentative" {
  if (v == null) return "none";
  const s = String(v).trim().toLowerCase();
  if (s.includes("inscrib")) return "inscribed";
  if (s.includes("tentative")) return "tentative";
  if (s === "inscribed" || s === "tentative" || s === "none") return s as any;
  return "none";
}

function normalizeYesNo(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(s)) return "Yes";
  if (["n", "no", "false", "0"].includes(s)) return "No";
  return v;
}
function normalizeSlug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Map common header variants → canonical keys */
const HEADER_TO_FIELD: Record<
  string,
  CanonicalKey | "province_name" | "location_free"
> = {
  // Cover
  title: "title",
  name: "title",
  site_name: "title",
  slug: "slug",
  heritage_type: "heritage_type",
  heritage: "heritage_type",
  type: "heritage_type",
  cover_location: "cover_location",
  location: "cover_location",
  place: "cover_location",
  tagline: "tagline",

  // Location
  latitude: "latitude",
  lat: "latitude",
  longitude: "longitude",
  lon: "longitude",
  lng: "longitude",
  town: "town_city_village",
  city: "town_city_village",
  village: "town_city_village",
  town_city_village: "town_city_village",
  tehsil: "tehsil",
  district: "district",
  province: "province_name",
  region: "province_name",
  region_province: "province_name",

  // General info
  architectural_style: "architectural_style",
  construction_materials: "construction_materials",
  local_name: "local_name",
  architect: "architect",
  construction_date: "construction_date",
  built_by: "built_by",
  dynasty: "dynasty",
  conservation_status: "conservation_status",
  current_use: "current_use",
  restored_by: "restored_by",
  known_for: "known_for",
  era: "era",
  inhabited_by: "inhabited_by",
  national_park_established_in: "national_park_established_in",
  population: "population",
  ethnic_groups: "ethnic_groups",
  languages_spoken: "languages_spoken",
  excavation_status: "excavation_status",
  excavated_by: "excavated_by",
  administered_by: "administered_by",

  // UNESCO
  unesco_status: "unesco_status",
  unesco_line: "unesco_line",
  protected_under: "protected_under",

  // Climate
  landform: "landform",
  altitude: "altitude",
  mountain_range: "mountain_range",
  weather_type: "weather_type",
  avg_temp_summers: "avg_temp_summers",
  average_temp_summers: "avg_temp_summers",
  avg_temp_winters: "avg_temp_winters",
  average_temp_winters: "avg_temp_winters",

  // Travel
  travel_location: "travel_location",
  location_travel_guide: "travel_location",
  travel_how_to_reach: "travel_how_to_reach",
  how_to_reach: "travel_how_to_reach",
  travel_nearest_major_city: "travel_nearest_major_city",
  nearest_major_city: "travel_nearest_major_city",
  travel_airport_access: "travel_airport_access",
  airport_access: "travel_airport_access",
  travel_international_flight: "travel_international_flight",
  international_flight: "travel_international_flight",
  travel_access_options: "travel_access_options",
  access_options: "travel_access_options",
  travel_road_type_condition: "travel_road_type_condition",
  road_type_condition: "travel_road_type_condition",
  travel_best_time_free: "travel_best_time_free",
  best_time_free: "travel_best_time_free",
  travel_full_guide_url: "travel_full_guide_url",

  // Best time
  best_time_option_key: "best_time_option_key",

  // Stay
  stay_hotels_available: "stay_hotels_available",
  hotels_available: "stay_hotels_available",
  stay_spending_night_recommended: "stay_spending_night_recommended",
  spending_night_recommended: "stay_spending_night_recommended",
  stay_camping_possible: "stay_camping_possible",
  camping_possible: "stay_camping_possible",
  stay_places_to_eat_available: "stay_places_to_eat_available",
  places_to_eat_available: "stay_places_to_eat_available",

  // Misc
  did_you_know: "did_you_know",
};

/* Root Page */
function EditContent({ id }: { id: string }) {
  const [site, setSite] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState<boolean>(false);
  const [listingTab, setListingTab] = useState<ListingTabKey>("overview");

  // NEW: auto-save state (default ON) + last saved timestamp
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autoSaving, setAutoSaving] = useState<boolean>(false); // controls bottom-right toast

  // Registerable save function ref (now accepts {silent})
  const saveListingRef = useRef<
    ((opts?: { silent?: boolean }) => Promise<void> | void) | undefined
  >(undefined);

  // Uploader plumbing (shared cache + appliers registered by ListingForm)
  const [uploadCache, setUploadCache] = useState<CanonicalKV | null>(null);
  const [lastUploadName, setLastUploadName] = useState<string | null>(null);
  const applyCoverRef = useRef<((p: CanonicalKV) => void) | null>(null);
  const applyDetailsRef = useRef<((p: CanonicalKV) => void) | null>(null);

  const [provinces, setProvinces] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allRegions, setAllRegions] = useState<any[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);

  // NEW: Guide linking UI state
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [linkedGuideMeta, setLinkedGuideMeta] = useState<{
    id: string;
    regionName: string;
    status: "draft" | "published" | "archived";
  } | null>(null);

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

  // When site is loaded or its region_travel_guide_id changes, fetch linked guide meta
  useEffect(() => {
    async function loadLinked() {
      if (!site?.region_travel_guide_id) {
        setLinkedGuideMeta(null);
        return;
      }
      const { data, error } = await supabase
        .from("region_travel_guides")
        .select("id,status, region_id, regions:region_id (id, name, slug)")
        .eq("id", site.region_travel_guide_id)
        .maybeSingle();
      if (error) {
        console.warn("Failed to fetch linked guide:", error.message);
        setLinkedGuideMeta(null);
        return;
      }
      if (!data) {
        setLinkedGuideMeta(null);
        return;
      }
      setLinkedGuideMeta({
        id: data.id,
        regionName: data.regions?.name || "Travel Guide",
        status: data.status,
      });
    }
    loadLinked();
  }, [site?.region_travel_guide_id]);

  // 🔗 LISTEN for TravelDetails' fallback event to open the modal
  useEffect(() => {
    const handler = () => setGuideModalOpen(true);
    // Some TS setups need a generic EventListener; cast to any to avoid DOM lib mismatch.
    document.addEventListener("connect-guide:open", handler as any);
    return () =>
      document.removeEventListener("connect-guide:open", handler as any);
  }, []);

  // ---------- sanitize payload before saving ----------
  function sanitizeForSave(payload: any) {
    const next = { ...payload };

    // Coerce numeric fields and empty strings to null
    for (const k of Object.keys(next)) {
      if (NUMERIC_DETAIL_KEYS.has(k as any)) {
        if (next[k] === "" || next[k] === undefined) {
          next[k] = null;
        } else if (typeof next[k] === "string") {
          const n = Number(next[k].replace?.(/,/g, "") ?? next[k]);
          next[k] = Number.isFinite(n) ? n : null;
        }
      }
    }

    // Province select can be "", coerce to null/number
    if (next.province_id === "") next.province_id = null;
    if (next.province_id != null && next.province_id !== "") {
      const pid = Number(next.province_id);
      next.province_id = Number.isFinite(pid) ? pid : null;
    }

    // 🔒 Canonicalize UNESCO status (lowercase) to satisfy DB check constraint.
    next.unesco_status = normalizeUnescoStatus(next.unesco_status ?? "none");

    return next;
  }
  // ---------------------------------------------------

  async function saveSite(next: any) {
    setSaving(true);
    const payload = sanitizeForSave(next);
    const { data, error } = await supabase
      .from("sites")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", payload.id)
      .select()
      .single();
    setSaving(false);
    if (error) return alert(error.message);
    setSite(data);
    setLastSavedAt(new Date()); // record save time
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

  // NEW: periodic auto-save every 60s when enabled
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const timer = setInterval(async () => {
      if (saveListingRef.current && !saving) {
        setAutoSaving(true);
        try {
          await saveListingRef.current({ silent: true });
        } finally {
          setAutoSaving(false);
        }
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [autoSaveEnabled, saving]);

  if (!site)
    return (
      <div
        className="p-10 text-gray-700 text-center min-h-screen"
        style={{ backgroundColor: "#f4f4f4" }}
      >
        Loading…
      </div>
    );

  // Sidebar importer slot (desktop & mobile)
  const uploaderSlot = (
    <SidebarImporter
      provinces={provinces}
      onParsed={(payload, fname) => {
        setUploadCache(payload);
        setLastUploadName(fname || null);
        // Auto-apply to both sections once on upload
        if (applyCoverRef.current) applyCoverRef.current(payload);
        if (applyDetailsRef.current) applyDetailsRef.current(payload);
      }}
      lastUploadName={lastUploadName}
    />
  );

  /* -------- travel guide: helpers -------- */

  // Transform region_travel_guide_summary → partial site fields
  function mapSummaryToSiteFields(s: any): Partial<Record<string, any>> {
    if (!s) return {};
    const accessOptionsMap: Record<string, string> = {
      by_road_only: "By Road Only",
      by_trek_only: "By Trek Only",
      by_jeep_and_trek_only: "By Jeep and Trek Only",
      by_road_and_railway: "By Road and Railway",
      by_road_and_airport: "By Road and Air",
      by_road_railway_airport: "By Road, Air and Railway",
    };
    const bestTimeMap: Record<string, string> = {
      year_long: "Year long",
      winters: "Winters",
      summers: "Summers",
      spring: "Spring",
      spring_and_summers: "Spring and Summers",
      winter_and_spring: "Winter and Spring",
    };

    return {
      // Climate / topo
      landform: s.landform ?? null,
      altitude: s.altitude ?? null,
      mountain_range: s.mountain_range ?? null,
      weather_type: s.climate_type ?? null,
      avg_temp_winters: s.temp_winter ?? null,
      avg_temp_summers: s.temp_summers ?? null,

      // Travel summary
      travel_location: s.location ?? null,
      travel_how_to_reach: s.how_to_reach ?? null,
      travel_nearest_major_city: s.nearest_major_city ?? null,
      travel_airport_access: s.airport_access ? "Yes" : "No",
      travel_access_options: s.access_options
        ? accessOptionsMap[s.access_options] || ""
        : "",
      travel_road_type_condition: s.road_type_condition ?? "",
      travel_best_time_free: s.best_time_to_visit
        ? bestTimeMap[s.best_time_to_visit] || ""
        : "",

      // Stay
      stay_hotels_available: s.hotels_available
        ? titleCase(s.hotels_available.replace(/_/g, " "))
        : null,
      stay_spending_night_recommended: s.spending_night_recommended
        ? titleCase(s.spending_night_recommended.replace(/_/g, " "))
        : null,
      stay_camping_possible: s.camping
        ? titleCase(s.camping.replace(/_/g, " "))
        : null,
      stay_places_to_eat_available: s.places_to_eat
        ? titleCase(s.places_to_eat.replace(/_/g, " "))
        : null,
    };
  }
  function titleCase(s: string) {
    return s
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  async function attachGuide(g: SelectedGuide) {
    // 1) persist on site
    const { data, error } = await supabase
      .from("sites")
      .update({
        region_travel_guide_id: g.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", site.id)
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    setSite(data);
    setLinkedGuideMeta({
      id: g.id,
      regionName: g.name,
      status: g.status,
    });

    // 2) (preview) fetch summary → compute inherited mapping (we keep for next step UI)
    const { data: s, error: sErr } = await supabase
      .from("region_travel_guide_summary")
      .select("*")
      .eq("guide_id", g.id)
      .maybeSingle();
    if (!sErr && s) {
      // Optionally prefill blanks from the summary:
      // const mapped = mapSummaryToSiteFields(s);
      // setForm((prev: any) => ({ ...mapped, ...prev }));
    }
  }

  async function detachGuide() {
    const { data, error } = await supabase
      .from("sites")
      .update({
        region_travel_guide_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", site.id)
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }
    setSite(data);
    setLinkedGuideMeta(null);
  }

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
            onSave={async (opts) => {
              if (saveListingRef.current) await saveListingRef.current(opts);
            }}
            uploaderSlot={uploaderSlot}
            autoSaveEnabled={autoSaveEnabled}
            onToggleAutoSave={setAutoSaveEnabled}
            lastSavedAt={lastSavedAt}
          />
        </div>

        <div className="px-3 sm:px-4 lg:px-6 py-6 lg:ml:[17rem] lg:ml-[17rem]">
          <div className="lg:hidden mb-4">
            <SidebarControls
              published={published}
              onTogglePublished={setPublished}
              saving={saving}
              onSave={async (opts) => {
                if (saveListingRef.current) await saveListingRef.current(opts);
              }}
              uploaderSlot={uploaderSlot}
              autoSaveEnabled={autoSaveEnabled}
              onToggleAutoSave={setAutoSaveEnabled}
              lastSavedAt={lastSavedAt}
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
              uploadCache={uploadCache}
              onRegisterUploadAppliers={(applyCover, applyDetails) => {
                applyCoverRef.current = applyCover;
                applyDetailsRef.current = applyDetails;
              }}
              /* NEW props for toolbar buttons */
              onOpenGuideModal={() => setGuideModalOpen(true)}
              linkedGuideMeta={linkedGuideMeta}
              onUnlinkGuide={detachGuide}
            />
          </main>
        </div>
      </div>

      {/* Bottom-right auto-save indicator */}
      <SavingToast visible={autoSaving} />

      {/* Connect Guide Modal */}
      <ConnectTravelGuideModal
        isOpen={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        onSelect={async (g) => {
          await attachGuide(g);
          setGuideModalOpen(false);
        }}
        includeDrafts={false}
      />
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

// Cover + TravelDetails field groups for apply/clear
const COVER_KEYS = [
  "title",
  "slug",
  "heritage_type",
  "location_free",
  "tagline",
] as const;
const DETAIL_KEYS = [
  "latitude",
  "longitude",
  "town_city_village",
  "tehsil",
  "district",
  "province_id",
  "architectural_style",
  "construction_materials",
  "local_name",
  "architect",
  "construction_date",
  "built_by",
  "dynasty",
  "conservation_status",
  "current_use",
  "restored_by",
  "known_for",
  "era",
  "inhabited_by",
  "national_park_established_in",
  "population",
  "ethnic_groups",
  "languages_spoken",
  "excavation_status",
  "excavated_by",
  "administered_by",
  "unesco_status",
  "unesco_line",
  "protected_under",
  "landform",
  "altitude",
  "mountain_range",
  "weather_type",
  "avg_temp_summers",
  "avg_temp_winters",
  "travel_location",
  "travel_how_to_reach",
  "travel_nearest_major_city",
  "travel_airport_access",
  "travel_international_flight",
  "travel_access_options",
  "travel_road_type_condition",
  "travel_best_time_free",
  "travel_full_guide_url",
  "best_time_option_key",
  "stay_hotels_available",
  "stay_spending_night_recommended",
  "stay_camping_possible",
  "stay_places_to_eat_available",
  "did_you_know",
] as const;

/* numeric columns we must null instead of sending "" */
const NUMERIC_DETAIL_KEYS = new Set<string>(["latitude", "longitude"]);

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
  uploadCache,
  onRegisterUploadAppliers,
  // NEW:
  onOpenGuideModal,
  linkedGuideMeta,
  onUnlinkGuide,
}: {
  site: any;
  onSave: (n: any) => void;
  saving: boolean;
  onRegisterSave: (fn: (opts?: { silent?: boolean }) => Promise<void>) => void;
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
  uploadCache: CanonicalKV | null;
  onRegisterUploadAppliers: (
    applyCover: (p: CanonicalKV) => void,
    applyDetails: (p: CanonicalKV) => void
  ) => void;

  // NEW props for travel guide linking controls in toolbar
  onOpenGuideModal: () => void;
  linkedGuideMeta: { id: string; regionName: string; status: string } | null;
  onUnlinkGuide: () => Promise<void> | void;
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

  // 🔔 Update: always request PhotoStory to save silently to avoid duplicate success alerts
  const requestPhotoStorySave = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent("photostory:save", { detail: { silent: true } })
    );
  }, []);

  const saveAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      // Ensure the in-form value is normalized too, so user sees what will be saved
      setForm((prev: any) => ({
        ...prev,
        unesco_status: normalizeUnescoStatus(prev.unesco_status ?? "none"),
      }));
      await onSave({
        ...form,
        unesco_status: normalizeUnescoStatus(form.unesco_status ?? "none"),
      });
      await saveCategoryJoins();
      await saveRegionJoins();

      // ✅ Trigger PhotoStory save silently (manual & autosave)
      requestPhotoStorySave();

      if (!opts?.silent) alert("Saved.");
    },
    [form, onSave, requestPhotoStorySave, selectedCatIds, selectedRegionIds]
  );

  useEffect(() => {
    onRegisterSave(saveAll);
  }, [saveAll, onRegisterSave]);

  function set<K extends string>(key: K, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  // Apply / Clear helpers
  const applyCover = useCallback((payload: CanonicalKV) => {
    COVER_KEYS.forEach((k) => {
      if (payload[k] !== undefined) set(k as any, payload[k]);
    });
  }, []);
  const applyDetails = useCallback((payload: CanonicalKV) => {
    DETAIL_KEYS.forEach((k) => {
      if (payload[k] !== undefined) {
        if (k === "unesco_status") {
          set(k as any, normalizeUnescoStatus(payload[k]));
        } else {
          set(k as any, payload[k]);
        }
      }
    });
  }, []);
  const clearCover = useCallback(() => {
    COVER_KEYS.forEach((k) => set(k as any, ""));
  }, []);
  const clearDetails = useCallback(() => {
    DETAIL_KEYS.forEach((k) => {
      if (k === "province_id") {
        set(k as any, null);
      } else if (k === "unesco_status") {
        set(k as any, "none");
      } else if (NUMERIC_DETAIL_KEYS.has(k as string)) {
        set(k as any, null); // numeric fields -> null
      } else {
        set(k as any, "");
      }
    });
  }, []);

  // Expose appliers to parent so sidebar uploader can auto-apply once
  useEffect(() => {
    onRegisterUploadAppliers(applyCover, applyDetails);
  }, [applyCover, applyDetails, onRegisterUploadAppliers]);

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

  // Small chip for linked guide status
  const linkedChip = linkedGuideMeta && (
    <span className="inline-flex items-center gap-2 text-xs rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-1">
      <Icon name="book" className="w-3.5 h-3.5 text-emerald-700" />
      {linkedGuideMeta.regionName}
      <span className="ml-1 rounded bg-white/70 px-1.5 py-[1px] border border-emerald-200">
        {linkedGuideMeta.status}
      </span>
    </span>
  );

  return (
    <div className="space-y-8">
      {/* Cover */}
      {visibleSections.has("hero") && (
        <Section
          title="Cover"
          id="hero"
          tools={
            <div className="flex items-center gap-2">
              <Btn
                onClick={() => uploadCache && applyCover(uploadCache)}
                disabled={!uploadCache}
                className="bg-[var(--brand-blue,#1e40af)] text-white hover:opacity-90"
                title={
                  uploadCache
                    ? "Apply data from last upload"
                    : "Upload a CSV from the sidebar first"
                }
              >
                Add from uploader
              </Btn>
              <Btn
                onClick={clearCover}
                className="bg-white text-gray-800 border border-gray-300 hover:bg-gray-50"
              >
                Clear All
              </Btn>
            </div>
          }
        >
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
        <Section
          title="Site Details"
          id="location"
          tools={
            <div className="flex items-center gap-2">
              {/* NEW: connect / change guide */}
              {linkedChip}
              <Btn
                onClick={onOpenGuideModal}
                className="bg-[var(--brand-blue,#1e40af)] text-white hover:opacity-90"
                title={
                  linkedGuideMeta
                    ? "Change Travel Guide"
                    : "Connect Travel Guide"
                }
              >
                {linkedGuideMeta
                  ? "Change Travel Guide"
                  : "Connect Travel Guide"}
              </Btn>
              {linkedGuideMeta && (
                <Btn
                  onClick={() => onUnlinkGuide()}
                  className="bg-white text-gray-800 border border-gray-300 hover:bg-gray-50"
                >
                  Remove Link
                </Btn>
              )}

              {/* existing tools */}
              <Btn
                onClick={() => uploadCache && applyDetails(uploadCache)}
                disabled={!uploadCache}
                className="bg-[var(--brand-blue,#1e40af)] text-white hover:opacity-90"
                title={
                  uploadCache
                    ? "Apply data from last upload"
                    : "Upload a CSV from the sidebar first"
                }
              >
                Add from uploader
              </Btn>
              <Btn
                onClick={clearDetails}
                className="bg-white text-gray-800 border border-gray-300 hover:bg-gray-50"
              >
                Clear All
              </Btn>
            </div>
          }
        >
          <TravelDetails
            form={form}
            setField={set}
            provinces={provinces}
            inputStyles={inputStyles}
            readOnlyInputStyles={readOnlyInputStyles}
          />
        </Section>
      )}

      {/* Article */}
      {visibleSections.has("articles") && (
        <Section title="Article" id="articles">
          <ArticlesSection
            siteId={form.id}
            history_layout_json={form.history_layout_json || []}
            architecture_layout_json={form.architecture_layout_json || []}
            climate_layout_json={form.climate_layout_json || []}
            history_layout_html={form.history_layout_html || null}
            architecture_layout_html={form.architecture_layout_html || null}
            climate_layout_html={form.climate_layout_html || null}
            custom_sections_json={form.custom_sections_json || []}
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

      {/* Photo Story (frameless; PhotoStory owns its layout) */}
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

/* ---------------- Sidebar Importer (CSV-only, client-side) ---------------- */

function SidebarImporter({
  provinces,
  onParsed,
  lastUploadName,
}: {
  provinces: Array<{ id: string | number; name: string }>;
  onParsed: (payload: CanonicalKV, filename?: string) => void;
  lastUploadName: string | null;
}) {
  const [status, setStatus] = useState<string | null>(null);

  // Quote each header (many contain commas/parentheses)
  const templateHref = useMemo(() => {
    const headerLine = TEMPLATE_HEADERS.map(
      (h) => `"${String(h).replace(/"/g, '""')}"`
    ).join(",");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(
      headerLine + "\n"
    )}`;
  }, []);

  function mapProvinceNameToId(name: string | null | undefined) {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    const hit = provinces.find(
      (p) => String(p.name).trim().toLowerCase() === n
    );
    return hit ? hit.id : null;
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Parsing CSV…");
    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.errors?.length) {
          setStatus(`Failed to parse: ${res.errors[0].message}`);
          return;
        }
        const rows = (res.data || []).filter((r) =>
          Object.values(r || {}).some((v) => String(v || "").trim() !== "")
        );
        if (!rows.length) {
          setStatus("No rows found in the CSV.");
          return;
        }
        // Use first row
        const src = rows[0];
        const kv: CanonicalKV = {};
        let applied = 0;

        for (const [rawKey, rawVal] of Object.entries(src)) {
          const nh = normHeader(rawKey);
          const target = HEADER_TO_FIELD[nh];
          if (!target) continue;

          let val: any = rawVal;

          // Normalizations
          if (target === "unesco_status") val = normalizeUnescoStatus(val);
          if (
            target === "travel_airport_access" ||
            target === "stay_hotels_available" ||
            target === "stay_spending_night_recommended" ||
            target === "stay_places_to_eat_available"
          ) {
            val = normalizeYesNo(val);
          }

          if (target === "province_name") {
            const pid = mapProvinceNameToId(String(val || ""));
            if (pid != null) {
              kv["province_id"] = pid;
              applied++;
            }
            continue;
          }

          // Numbers for lat/lng only (others coerced on save if needed)
          if (["latitude", "longitude"].includes(target) && val != null) {
            const num = Number(String(val).replace(/,/g, ""));
            if (!Number.isNaN(num)) val = num;
          }

          // Cover specific
          if (target === "cover_location") {
            kv["location_free"] = val;
            applied++;
            continue;
          }
          if (target === "slug" && typeof val === "string") {
            val = normalizeSlug(val);
          }

          kv[target] = val;
          applied++;
        }

        onParsed(kv, file.name);
        setStatus(`Parsed and cached ${applied} fields from “${file.name}”.`);
      },
      error: (err) => setStatus(`Error: ${err?.message || "unknown error"}`),
    });

    // allow re-upload of same file
    e.currentTarget.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-gray-900">
        Import data (CSV)
      </div>
      <div className="text-xs text-gray-600">
        Upload once. Then use{" "}
        <span className="font-medium">Add from uploader</span> in sections.
      </div>
      {lastUploadName ? (
        <div className="text-xs text-gray-700">
          Last upload: <span className="font-medium">{lastUploadName}</span>
        </div>
      ) : null}
      {status ? <div className="text-xs text-gray-700">{status}</div> : null}
      <div className="flex items-center gap-2">
        <a
          href={templateHref}
          download="site_template.csv"
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
        >
          Download CSV template
        </a>
        <label className="inline-flex cursor-pointer items-center rounded-md bg-[var(--brand-orange,#F78300)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-95">
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="sr-only"
          />
        </label>
      </div>
    </div>
  );
}
