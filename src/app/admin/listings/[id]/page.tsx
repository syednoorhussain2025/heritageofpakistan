// src/app/admin/listings/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NextImage from "next/image";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabase/browser";
import { withTimeout } from "@/lib/async/withTimeout";
import { FaArrowLeft, FaTrash, FaMagic } from "react-icons/fa";
import Icon from "@/components/Icon";
// @ts-expect-error - papaparse has no type declarations in this project; treat as any
import Papa from "papaparse";
import { encode } from "blurhash";

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

const LISTING_LOAD_TIMEOUT_MS = 30000;

function isLikelyAuthError(error: any): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "").toLowerCase();
  const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);

  if (status === 401 || status === 403) return true;
  if (code === "401" || code === "403" || code === "pgrst301") return true;
  if (code.includes("auth") || code.includes("jwt")) return true;

  return (
    message.includes("not authenticated") ||
    message.includes("jwt") ||
    message.includes("auth") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  );
}

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

  const isFrameless = id === "articles" || id === "photo";
  if (isFrameless) {
    return (
      <section id={id} className="scroll-mt-24 p-0 bg-transparent">
        {children}
      </section>
    );
  }

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

/** Build hero / thumb paths like ".../file_hero.jpg" and ".../file_thumb.jpg" */
function makeVariantPath(
  storagePath: string,
  variant: "hero" | "thumb"
): string {
  const dotIndex = storagePath.lastIndexOf(".");
  if (dotIndex === -1) return `${storagePath}_${variant}`;
  const base = storagePath.slice(0, dotIndex);
  const ext = storagePath.slice(dotIndex);
  return `${base}_${variant}${ext}`;
}

/**
 * Extract width, height, blurhash and blurDataURL from a File (client side).
 * Kept here in case you want to reuse for other admin tools.
 */
async function extractImageMetaFromFile(file: File): Promise<{
  width: number | null;
  height: number | null;
  blurHash: string | null;
  blurDataUrl: string | null;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || null;
        const height = img.naturalHeight || null;

        let blurHash: string | null = null;
        let blurDataUrl: string | null = null;

        try {
          const canvas = document.createElement("canvas");
          const targetW = 32;
          const targetH =
            width && height ? Math.round((height / width) * targetW) : 32;

          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            try {
              blurHash = encode(
                imageData.data,
                imageData.width,
                imageData.height,
                4,
                3
              );
            } catch {
              blurHash = null;
            }
            try {
              blurDataUrl = canvas.toDataURL("image/jpeg", 0.7);
            } catch {
              blurDataUrl = null;
            }
          }
        } catch {
        }

        resolve({ width, height, blurHash, blurDataUrl });
      };
      img.onerror = () => {
        resolve({
          width: null,
          height: null,
          blurHash: null,
          blurDataUrl: null,
        });
      };
      if (typeof reader.result === "string") {
        img.src = reader.result;
      } else {
        resolve({
          width: null,
          height: null,
          blurHash: null,
          blurDataUrl: null,
        });
      }
    };

    reader.onerror = () =>
      resolve({
        width: null,
        height: null,
        blurHash: null,
        blurDataUrl: null,
      });

    reader.readAsDataURL(file);
  });
}

/**
 * Resize an image file client side.
 */
async function resizeImageForUpload(
  file: File,
  maxWidth = 1600,
  maxHeight = 1600
): Promise<{
  blob: Blob;
  width: number | null;
  height: number | null;
  blurHash: string | null;
  blurDataUrl: string | null;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || 0;
        let height = img.naturalHeight || 0;

        if (!width || !height) {
          resolve({
            blob: file,
            width: null,
            height: null,
            blurHash: null,
            blurDataUrl: null,
          });
          return;
        }

        const ratio = Math.min(
          maxWidth / width,
          maxHeight / height,
          1
        );
        const targetW = Math.round(width * ratio);
        const targetH = Math.round(height * ratio);

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({
            blob: file,
            width,
            height,
            blurHash: null,
            blurDataUrl: null,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, targetW, targetH);

        let blurHash: string | null = null;
        let blurDataUrl: string | null = null;

        try {
          const imageData = ctx.getImageData(0, 0, targetW, targetH);
          blurHash = encode(
            imageData.data,
            imageData.width,
            imageData.height,
            4,
            3
          );
        } catch {
          blurHash = null;
        }

        try {
          blurDataUrl = canvas.toDataURL("image/jpeg", 0.7);
        } catch {
          blurDataUrl = null;
        }

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                blob: file,
                width: targetW,
                height: targetH,
                blurHash,
                blurDataUrl,
              });
              return;
            }
            resolve({
              blob,
              width: targetW,
              height: targetH,
              blurHash,
              blurDataUrl,
            });
          },
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () =>
        reject(new Error("Failed to load image for resizing."));
      img.src = reader.result as string;
    };

    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
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

/* Small bottom right toast for auto save */
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
  lastSavedAt,
}: {
  published: boolean;
  onTogglePublished: (v: boolean) => void;
  onSave: (opts?: { silent?: boolean }) => void | Promise<void>;
  saving: boolean;
  uploaderSlot?: React.ReactNode;
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

        {uploaderSlot ? (
          <div className="pt-2 border-t border-gray-200">{uploaderSlot}</div>
        ) : null}
      </div>
    </nav>
  );
}

/* ---------------- CSV canonicalization and mapping (shared) ---------------- */

type CanonicalKV = Record<string, any>;

const TEMPLATE_HEADERS = [
  "title (Site Name, no brackets)",
  "slug (matching the title)",
  "heritage_type (e.g Colonial Era Building, Lake, Mughal Era Garden)",
  "cover_location (City/town, Province)(e.g Lahore, Punjab)",
  "tagline (around 50 words introduction of the site)",
  "latitude",
  "longitude",
  "town_city_village",
  "tehsil",
  "district (e.g Lahore, Islamabad, Faisalabad)",
  "province (e.g Punjab, Gilgit Baltistan) ",
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
  "unesco_status",
  "unesco_line",
  "protected_under (e.g Antiquities Act 1975)",
  "landform (e.g Mountains, Land, Lake)",
  "altitude (e.g 2300 meters (5333 feet) above sea level)",
  "mountain_range (e.g Karakoram)",
  "weather_type (e.g Moderate Summers, Extreme Cold Winters)",
  "avg_temp_summers (e.g Ranges from 8°C to 23°C)",
  "avg_temp_winters",
  "travel_location (City, Province)(e.g Malam Jabba, Khyber Pakhtunkhwa )",
  "travel_how_to_reach (e.g 45 km from Mingora (1.5 Hours Drive)",
  "travel_nearest_major_city (e.g Mingora, Khyber Pakhtunkhwa)",
  "travel_airport_access (Yes/No)",
  "travel_international_flight",
  "travel_access_options (etc By Road Only, By Road & Airport), By Road, Railway and Airport)",
  "travel_road_type_condition (etc Metalled Road)",
  "travel_best_time_free (e.g Summers)",
  "travel_full_guide_url",
  "best_time_option_key (e.g The Best Time to Visit mountain regions of Khyberpakhtunkhwa is Summers. Preferably from April to September. Winters are Extremely Cold and Snowfall blocks most of access. Hence Winters are not recommended.)",
  "stay_hotels_available (Yes/No/limited options)",
  "stay_spending_night_recommended (Yes/No or Good Place to stay)",
  "stay_camping_possible (Not recommended, Not suitable, Yes)",
  "stay_places_to_eat_available (Yes, No, Limited Options)",
  "did_you_know (One line interesting fact e.g The Jahanabad Buddha near Malam Jabba is one of the largest carved Buddha reliefs in Pakistan)",
] as const;

function normHeader(h: string): string {
  const base = h.replace(/\(.*/, "").trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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

const HEADER_TO_FIELD: Record<string, string> = {
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

  unesco_status: "unesco_status",
  unesco_line: "unesco_line",
  protected_under: "protected_under",

  landform: "landform",
  altitude: "altitude",
  mountain_range: "mountain_range",
  weather_type: "weather_type",
  avg_temp_summers: "avg_temp_summers",
  average_temp_summers: "avg_temp_summers",
  avg_temp_winters: "avg_temp_winters",
  average_temp_winters: "avg_temp_winters",

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

  best_time_option_key: "best_time_option_key",

  stay_hotels_available: "stay_hotels_available",
  hotels_available: "stay_hotels_available",
  stay_spending_night_recommended: "stay_spending_night_recommended",
  spending_night_recommended: "stay_spending_night_recommended",
  stay_camping_possible: "stay_camping_possible",
  camping_possible: "stay_camping_possible",
  stay_places_to_eat_available: "stay_places_to_eat_available",
  places_to_eat_available: "stay_places_to_eat_available",

  did_you_know: "did_you_know",
};

/* Root Page */
function EditContent({ id }: { id: string }) {
  const [site, setSite] = useState<any>(null);
  const [siteLoading, setSiteLoading] = useState(true);
  const [siteLoadError, setSiteLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState<boolean>(false);
  const [listingTab, setListingTab] = useState<ListingTabKey>("overview");

  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const saveListingRef = useRef<
    ((opts?: { silent?: boolean }) => Promise<void> | void) | undefined
  >(undefined);

  const [uploadCache, setUploadCache] = useState<CanonicalKV | null>(null);
  const [lastUploadName, setLastUploadName] = useState<string | null>(null);
  const applyCoverRef = useRef<((p: CanonicalKV) => void) | null>(null);
  const applyDetailsRef = useRef<((p: CanonicalKV) => void) | null>(null);

  const [provinces, setProvinces] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allRegions, setAllRegions] = useState<any[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);

  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [linkedGuideMeta, setLinkedGuideMeta] = useState<{
    id: string;
    regionName: string;
    status: "draft" | "published" | "archived";
  } | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      setSiteLoading(true);
      setSiteLoadError(null);

      try {
        const { data, error } = await withTimeout(
          supabase.from("sites").select("*").eq("id", id).single(),
          LISTING_LOAD_TIMEOUT_MS,
          "admin.listing.fetchSite"
        );

        if (!active) return;
        if (error) throw error;

        if (!data) {
          setSiteLoadError("Listing not found.");
          return;
        }

        setSite(data);
        setPublished(!!data.is_published);
      } catch (error: any) {
        if (!active) return;

        console.warn("[admin/listings/[id]] listing load failed", error);

        if (isLikelyAuthError(error)) {
          const redirectTo = window.location.pathname + window.location.search;
          window.location.replace(
            `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`
          );
          return;
        }

        setSiteLoadError(String(error?.message ?? "Failed to load listing."));
      } finally {
        if (active) setSiteLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

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

      const regionName =
        (Array.isArray((data as any).regions) &&
          (data as any).regions[0]?.name) ||
        "Travel Guide";

      setLinkedGuideMeta({
        id: data.id,
        regionName,
        status: data.status,
      });
    }
    loadLinked();
  }, [site?.region_travel_guide_id]);

  useEffect(() => {
    const handler = () => setGuideModalOpen(true);
    document.addEventListener("connect-guide:open", handler as any);
    return () =>
      document.removeEventListener("connect-guide:open", handler as any);
  }, []);

  function sanitizeForSave(payload: any) {
    const next = { ...payload };

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

    if (next.province_id === "") next.province_id = null;
    if (next.province_id != null && next.province_id !== "") {
      const pid = Number(next.province_id);
      next.province_id = Number.isFinite(pid) ? pid : null;
    }

    next.unesco_status = normalizeUnescoStatus(next.unesco_status ?? "none");

    return next;
  }

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
    setLastSavedAt(new Date());
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
    setSelectedRegionIds(
      (sr?.map((r: any) => r.region_id) as string[]) || []
    );
  }, [id]);

  useEffect(() => {
    loadTaxonomies();
  }, [loadTaxonomies]);

  if (siteLoading)
    return (
      <div
        className="p-10 text-gray-700 text-center min-h-screen"
        style={{ backgroundColor: "#f4f4f4" }}
      >
        Loading…
      </div>
    );

  if (siteLoadError) {
    return (
      <div
        className="p-10 text-center min-h-screen"
        style={{ backgroundColor: "#f4f4f4" }}
      >
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-red-700">
            Failed to load listing
          </h2>
          <p className="mt-2 text-sm text-gray-700 break-words">
            {siteLoadError}
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Btn
              onClick={() => window.location.reload()}
              className="bg-black text-white hover:bg-gray-900"
            >
              Retry
            </Btn>
            <Link
              href={`/auth/sign-in?redirectTo=${encodeURIComponent(
                window.location.pathname + window.location.search
              )}`}
              className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Sign In Again
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!site) return null;

  const uploaderSlot = (
    <SidebarImporter
      provinces={provinces}
      onParsed={(payload, fname) => {
        setUploadCache(payload);
        setLastUploadName(fname || null);
        if (applyCoverRef.current) applyCoverRef.current(payload);
        if (applyDetailsRef.current) applyDetailsRef.current(payload);
      }}
      lastUploadName={lastUploadName}
    />
  );

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
      landform: s.landform ?? null,
      altitude: s.altitude ?? null,
      mountain_range: s.mountain_range ?? null,
      weather_type: s.climate_type ?? null,
      avg_temp_winters: s.temp_winter ?? null,
      avg_temp_summers: s.temp_summers ?? null,

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

    const { data: s, error: sErr } = await supabase
      .from("region_travel_guide_summary")
      .select("*")
      .eq("guide_id", g.id)
      .maybeSingle();
    if (!sErr && s) {
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
              onOpenGuideModal={() => setGuideModalOpen(true)}
              linkedGuideMeta={linkedGuideMeta}
              onUnlinkGuide={detachGuide}
            />
          </main>
        </div>
      </div>

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

/* inputs and helpers */
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

  // Clear cover selection in form; will persist on save
  async function deleteCover() {
    if (
      !form.cover_photo_url &&
      !form.cover_image_id &&
      !form.cover_photo_thumb_url
    )
      return;
    setDeletingCover(true);
    try {
      set("cover_photo_url", "");
      set("cover_photo_thumb_url", "");
      set("cover_image_id", null);
      setCoverMeta({});
    } finally {
      setDeletingCover(false);
    }
  }

  const requestPhotoStorySave = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent("photostory:save", { detail: { silent: true } })
    );
  }, []);

  const saveAll = useCallback(
    async (opts?: { silent?: boolean }) => {
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
        set(k as any, null);
      } else {
        set(k as any, "");
      }
    });
  }, []);

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
              <div className="w-full aspect-video bg-gray-100 border border-gray-300 rounded-2xl overflow-hidden">
                {form.cover_photo_url ? (
                  <div className="relative w-full h-full">
                    <NextImage
                      src={form.cover_photo_url}
                      alt={
                        form.title
                          ? `Cover for ${form.title}`
                          : "Cover preview"
                      }
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 800px, 100vw"
                      priority
                    />
                  </div>
                ) : (
                  <div className="grid place-items-center h-full text-sm text-gray-500">
                    No cover selected
                  </div>
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
                      title="Remove cover"
                      aria-label="Remove cover"
                    >
                      <FaTrash className="w-4 h-4" />
                    </button>
                  )}
                  <CoverUploader
                    value={form.cover_photo_url}
                    onChange={(url) => set("cover_photo_url", url)}
                    onSelect={(img) => {
                      set("cover_image_id", img.id);
                      set(
                        "cover_photo_thumb_url",
                        img.thumbUrl || img.url
                      );
                    }}
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

      {visibleSections.has("location") && (
        <Section
          title="Site Details"
          id="location"
          tools={
            <div className="flex items-center gap-2">
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

      {visibleSections.has("gallery") && (
        <Section title="Gallery" id="gallery">
          <GalleryUploader siteId={form.id} />
        </Section>
      )}

      {visibleSections.has("bibliography") && (
        <Section title="Bibliography" id="bibliography">
          <Bibliography siteId={form.id} />
        </Section>
      )}

      {visibleSections.has("photo") && (
        <Section title="Photo Story" id="photo">
          <PhotoStory siteId={form.id} slug={form.slug} title={form.title} />
        </Section>
      )}
    </div>
  );
}

/* CoverUploader: selects from gallery and writes into form */
type LibraryImage = {
  id: string; // site_images.id
  storage_path: string;
  url: string; // original
  heroUrl: string; // hero variant
  thumbUrl: string; // thumbnail variant
  name: string;
};

function CoverUploader({
  value,
  onChange,
  onSelect,
  siteId,
  showPreview = true,
}: {
  value?: string;
  onChange: (url: string) => void;
  onSelect?: (img: LibraryImage) => void;
  siteId: string | number;
  showPreview?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500"
        >
          Choose File
        </button>
        {showPreview && value ? (
          <div className="relative h-14 w-14">
            <NextImage
              src={value}
              alt="Cover preview"
              fill
              className="rounded-xl object-cover"
              sizes="56px"
            />
          </div>
        ) : null}
      </div>

      <CoverLibraryModal
        siteId={String(siteId)}
        open={open}
        currentUrl={value ?? null}
        onClose={() => setOpen(false)}
        onPick={(img) => {
          onChange(img.heroUrl || img.url);
          if (onSelect) onSelect(img);
          setOpen(false);
        }}
      />
    </>
  );
}

function CoverLibraryThumb({
  img,
  alt,
  className,
}: {
  img: LibraryImage;
  alt: string;
  className: string;
}) {
  const candidates = useMemo(
    () =>
      Array.from(
        new Set([img.thumbUrl, img.heroUrl, img.url].filter(Boolean))
      ),
    [img.thumbUrl, img.heroUrl, img.url]
  );

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [candidates]);

  const src = candidates[Math.min(index, candidates.length - 1)] || img.url;

  return (
    <NextImage
      src={src}
      alt={alt}
      fill
      unoptimized
      className={className}
      sizes="288px"
      draggable={false}
      onError={() => {
        setIndex((curr) => (curr + 1 < candidates.length ? curr + 1 : curr));
      }}
    />
  );
}

/* -------- Cover library modal using site_images (outside click closes) -------- */

function CoverLibraryModal({
  siteId,
  open,
  currentUrl,
  onClose,
  onPick,
}: {
  siteId: string;
  open: boolean;
  currentUrl: string | null;
  onClose: () => void;
  onPick: (img: LibraryImage) => void;
}) {
  const BUCKET = "site-images";
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<LibraryImage[]>([]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const refresh = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("site_images")
        .select("id, storage_path")
        .eq("site_id", siteId)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const rows = data ?? [];
      const mapped: LibraryImage[] = await Promise.all(
        rows.map(async (row: any) => {
          const storagePath = row.storage_path as string;

          const originalUrl = await publicUrl(BUCKET, storagePath);

          const heroPath = makeVariantPath(storagePath, "hero");
          const thumbPath = makeVariantPath(storagePath, "thumb");

          const heroUrl = await publicUrl(BUCKET, heroPath);
          const thumbUrl = await publicUrl(BUCKET, thumbPath);

          const name =
            storagePath.split("/").pop() || storagePath;

          return {
            id: row.id,
            storage_path: storagePath,
            url: originalUrl,
            heroUrl,
            thumbUrl,
            name,
          };
        })
      );

      setImages(mapped);
    } catch (e) {
      console.error(e);
      alert("Failed to load gallery images.");
    } finally {
      setLoading(false);
    }
  }, [open, siteId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white w-full max-w-5xl h-[90vh] max-h-[90vh] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex-col flex"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="font-semibold text-gray-900">
            Choose Cover from Gallery
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="hidden sm:inline">
              To add or remove photos use the Gallery tab.
            </span>
            <button
              type="button"
              className="px-3 py-2 rounded-md bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-sm text-gray-600">Loading photos…</div>
          ) : images.length === 0 ? (
            <div className="text-sm text-gray-600">
              No gallery photos yet. Add images in the Gallery section first.
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-3">
              {images.map((img) => {
                const isCurrent =
                  !!currentUrl &&
                  (
                    img.thumbUrl === currentUrl ||
                    img.heroUrl === currentUrl ||
                    img.url === currentUrl
                  );

                const imageClass = isCurrent
                  ? "opacity-90"
                  : "hover:ring-2 hover:ring-indigo-500 cursor-pointer transition";

                return (
                  <div
                    key={img.id}
                    className={`relative rounded-lg border ${
                      isCurrent ? "border-indigo-500" : "border-gray-200"
                    } bg-white overflow-hidden`}
                    onClick={() => {
                      if (isCurrent) return;
                      onPick(img);
                    }}
                    role="button"
                    aria-disabled={isCurrent}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!isCurrent) {
                          onPick(img);
                        }
                      }
                    }}
                  >
                    <div className="relative h-44 w-72">
                      <CoverLibraryThumb
                        img={img}
                        alt={img.name}
                        className={`object-cover ${imageClass}`}
                      />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-white text-xs">
                      <div className="truncate">{img.name}</div>
                    </div>
                    {isCurrent ? (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-600 text-white">
                        Current cover
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sidebar Importer (CSV only, client side) ---------------- */

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
      complete: (res: any) => {
        if (res.errors?.length) {
          setStatus(`Failed to parse: ${res.errors[0].message}`);
          return;
        }
        const rows = (res.data || []).filter((r: any) =>
          Object.values(r || {}).some((v) => String(v || "").trim() !== "")
        );
        if (!rows.length) {
          setStatus("No rows found in the CSV.");
          return;
        }
        const src = rows[0];
        const kv: CanonicalKV = {};
        let applied = 0;

        for (const [rawKey, rawVal] of Object.entries(src)) {
          const nh = normHeader(rawKey);
          const target = HEADER_TO_FIELD[nh];
          if (!target) continue;

          let val: any = rawVal;

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

          if (["latitude", "longitude"].includes(target) && val != null) {
            const num = Number(String(val).replace(/,/g, ""));
            if (!Number.isNaN(num)) val = num;
          }

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
      error: (err: any) =>
        setStatus(`Error: ${err?.message || "unknown error"}`),
    });

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
