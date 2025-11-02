// src/app/admin/listings/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";
import { FaExclamationCircle, FaTimes, FaArrowLeft } from "react-icons/fa";

/* =========================================================================
   CONFIG (matches provided schemas)
   ========================================================================= */
const TABLES = {
  gallery: "site_images", // site_id, alt_text, caption
  photoStoryItems: "photo_story_items", // site_id, image_url, text_block
  bibliographyLink: "listing_bibliography", // listing_id
} as const;

const COLS = {
  gallery: { siteId: "site_id", alt: "alt_text", caption: "caption" },
  storyItems: { siteId: "site_id", image: "image_url", text: "text_block" },
  biblio: { listingId: "listing_id" },
} as const;

/* =========================================================================
   TYPES
   ========================================================================= */
type SiteRow = {
  id: string;
  title: string | null;
  slug: string | null;
  cover_photo_url?: string | null;
  is_published: boolean | null;
  updated_at: string | null;
  deleted_at?: string | null;

  // taxonomy joins
  site_categories?: { category_id: string }[] | null;
  site_regions?: { region_id: string }[] | null;

  // article composer JSONs on sites table
  history_layout_json?: any[] | null;
  architecture_layout_json?: any[] | null;
  climate_layout_json?: any[] | null;
  custom_sections_json?: { sections_json?: any[] }[] | null;
};

type FilterOption = { id: string; name: string };

type Indicators = {
  cover: { ok: boolean; tip: string };
  gallery: { ok: boolean; count: number; tip: string };
  story: { ok: boolean; count: number; tip: string };
  taxonomy: { ok: boolean; tip: string; catCount: number; regCount: number };
  biblio: { ok: boolean; count: number; tip: string };
  article: { ok: boolean; count: number; tip: string };
};

type IndicatorKey = keyof Indicators;

/* =========================================================================
   UTILS
   ========================================================================= */
function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ---------- Shared sizing constants to keep visual rhythm consistent ----- */
const CONTROL_H = "h-10"; // 40px: primary action/input heights
const TOOL_H = "h-10"; // 40px: ALL compact controls in sorting card unified
const BAR_MIN_H = "min-h-[56px]"; // aligns orange and blue bars’ container heights

/* ───────────────────────── Tick/Cross with inline count ───────────────────────── */
const TickCross = ({
  ok,
  count,
  title,
}: {
  ok: boolean;
  count: number;
  title: string;
}) => {
  const color = ok ? "text-emerald-600" : "text-red-600";
  return (
    <span
      className={`inline-flex items-center justify-center text-lg font-semibold cursor-pointer ${color} hover:underline decoration-2 decoration-current`}
      title={title}
      aria-label={ok ? `Complete (${count})` : `Missing (${count})`}
    >
      {ok ? "✓" : "✗"}
      <span className={`ml-1 text-xs font-medium ${color}`}>({count})</span>
    </span>
  );
};

/* ───────────────────────── SearchableDropdown ───────────────────────── */
const SearchableDropdown = ({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        option.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [options, searchTerm]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <div className="relative w-48" ref={dropdownRef}>
      <button
        type="button"
        className={`w-full bg-white border border-slate-200 rounded-md px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200 flex items-center justify-between leading-none ${TOOL_H}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        {value ? (
          <FaTimes
            className="text-slate-400 hover:text-slate-600 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        ) : (
          <span className="text-slate-400">▾</span>
        )}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg">
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-slate-100 px-3 py-2 text-sm text-slate-800 border-b border-slate-200 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <ul className="max-h-60 overflow-y-auto">
            {filteredOptions.map((option) => (
              <li
                key={option.id}
                className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                  setSearchTerm("");
                }}
              >
                {option.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   PAGE
   ========================================================================= */
export default function AdminListingsPage() {
  const router = useRouter();

  // Data
  const [rowsActive, setRowsActive] = useState<SiteRow[]>([]);
  const [rowsDeleted, setRowsDeleted] = useState<SiteRow[]>([]);

  // UI state
  const [tab, setTab] = useState<"active" | "recycle">("active");
  const [cTab, setCTab] = useState<"all" | "complete" | "incomplete">("all");

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters (taxonomy)
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [regions, setRegions] = useState<FilterOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");

  // Indicator filters
  const [fCover, setFCover] = useState<"all" | "ok" | "missing">("all");
  const [fGallery, setFGallery] = useState<"all" | "ok" | "missing">("all");
  const [fStory, setFStory] = useState<"all" | "ok" | "missing">("all");
  const [fTaxonomy, setFTaxonomy] = useState<"all" | "ok" | "missing">("all");
  const [fBiblio, setFBiblio] = useState<"all" | "ok" | "missing">("all");
  const [fArticle, setFArticle] = useState<"all" | "ok" | "missing">("all");

  // Sorting
  const [sortBy, setSortBy] = useState<
    "title" | "cover" | "gallery" | "story" | "taxonomy" | "biblio" | "article"
  >("title");

  // Hard-delete password modal state
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [targetDelete, setTargetDelete] = useState<{
    id: string;
    title: string | null;
  } | null>(null);

  // Indicator data (computed)
  const [indicators, setIndicators] = useState<Record<string, Indicators>>({});

  // Base loads
  async function load() {
    setLoading(true);
    setError(null);
    const query = supabase
      .from("sites")
      .select(
        [
          "id",
          "title",
          "slug",
          "cover_photo_url",
          "is_published",
          "updated_at",
          "deleted_at",
          "site_categories(category_id)",
          "site_regions(region_id)",
          "history_layout_json",
          "architecture_layout_json",
          "climate_layout_json",
          "custom_sections_json",
        ].join(", ")
      )
      .order("updated_at", { ascending: false })
      .limit(400);

    const { data, error } = await query;

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const all = (data as any[]) || [];
    setRowsActive(all.filter((r) => !r.deleted_at));
    setRowsDeleted(all.filter((r) => r.deleted_at));
    setLoading(false);
  }

  async function loadFilters() {
    const { data: catData, error: catError } = await supabase
      .from("categories")
      .select("id, name");
    if (catError) setError(catError.message);
    else setCategories(catData || []);

    const { data: regData, error: regError } = await supabase
      .from("regions")
      .select("id, name");
    if (regError) setError(regError.message);
    else setRegions(regData || []);
  }

  useEffect(() => {
    load();
    loadFilters();
  }, []);

  const sourceRows = tab === "active" ? rowsActive : rowsDeleted;

  /* --------------------------------------------------------------------- */
  /* Pagination helper to avoid 1000-row truncation with PostgREST         */
  /* --------------------------------------------------------------------- */
  async function fetchAllRowsPaged<T>(
    table: string,
    selectCols: string,
    filterCol: string,
    filterIds: string[],
    pageSize = 1000
  ): Promise<T[]> {
    let from = 0;
    const out: T[] = [];
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select(selectCols)
        .in(filterCol, filterIds)
        .order(filterCol, { ascending: true }) // stable chunks
        .range(from, from + pageSize - 1);

      if (error) throw error;
      const chunk = (data as T[]) || [];
      out.push(...chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
    return out;
  }

  // Aggregate fetch for indicators (no DB changes)
  useEffect(() => {
    const abort = new AbortController();

    async function run() {
      if (!sourceRows?.length) {
        setIndicators({});
        return;
      }

      try {
        const ids = sourceRows.map((r) => r.id);

        // 1) Gallery rows from site_images (paged)
        const gData = await fetchAllRowsPaged<any>(
          TABLES.gallery,
          `${COLS.gallery.siteId}, ${COLS.gallery.alt}, ${COLS.gallery.caption}`,
          COLS.gallery.siteId,
          ids
        );

        // 2) Photo story items (paged)
        const sItems = await fetchAllRowsPaged<any>(
          TABLES.photoStoryItems,
          `${COLS.storyItems.siteId}, ${COLS.storyItems.image}, ${COLS.storyItems.text}`,
          COLS.storyItems.siteId,
          ids
        );

        // 3) Bibliography links (paged)
        const bData = await fetchAllRowsPaged<any>(
          TABLES.bibliographyLink,
          `${COLS.biblio.listingId}`,
          COLS.biblio.listingId,
          ids
        );

        // Group to maps
        const galleryBySite = new Map<
          string,
          { alt?: string | null; caption?: string | null }[]
        >();
        (gData || []).forEach((row: any) => {
          const sid = row[COLS.gallery.siteId];
          const cur = galleryBySite.get(sid) || [];
          cur.push({
            alt: row[COLS.gallery.alt],
            caption: row[COLS.gallery.caption],
          });
          galleryBySite.set(sid, cur);
        });

        const storyItemsBySite = new Map<
          string,
          { image?: string | null; text?: string | null }[]
        >();
        (sItems || []).forEach((row: any) => {
          const sid = row[COLS.storyItems.siteId];
          const cur = storyItemsBySite.get(sid) || [];
          cur.push({
            image: row[COLS.storyItems.image],
            text: row[COLS.storyItems.text],
          });
          storyItemsBySite.set(sid, cur);
        });

        const biblioCount = new Map<string, number>();
        (bData || []).forEach((row: any) => {
          const id = row[COLS.biblio.listingId];
          biblioCount.set(id, (biblioCount.get(id) || 0) + 1);
        });

        // Build indicators
        const next: Record<string, Indicators> = {};
        for (const r of sourceRows) {
          const coverOk = !!r.cover_photo_url;
          const coverTip = coverOk
            ? "Cover photo present"
            : "Cover photo missing";

          const gRows = galleryBySite.get(r.id) || [];
          const gCount = gRows.length;
          const gNeedsMin = gCount >= 10;
          const gAllAlt = gRows.every(
            (x) => !!(x.alt && String(x.alt).trim().length > 0)
          );
          const gAllCap = gRows.every(
            (x) => !!(x.caption && String(x.caption).trim().length > 0)
          );
          const gOk = gNeedsMin && gAllAlt && gAllCap;
          const gTip = gOk
            ? `Gallery OK. ${gCount} photos with alt and captions.`
            : [
                gNeedsMin
                  ? null
                  : `Needs at least 10 photos (currently ${gCount}).`,
                gAllAlt ? null : `Some photos missing alt text.`,
                gAllCap ? null : `Some photos missing captions.`,
              ]
                .filter(Boolean)
                .join(" ");

          const sRows = storyItemsBySite.get(r.id) || [];
          const blocksValid = sRows.filter((x) => {
            const hasImg = !!(x.image && String(x.image).trim().length > 0);
            const hasCaption = !!(x.text && String(x.text).trim().length > 0);
            return hasImg && hasCaption;
          });
          const sCount = blocksValid.length;
          const sOk = sCount >= 10;
          const sTip = sOk
            ? `Photo Story OK. ${sCount} blocks have image and caption.`
            : `Needs at least 10 Photo Story blocks with image and caption (currently ${sCount}).`;

          const catCount = r.site_categories?.length || 0;
          const regCount = r.site_regions?.length || 0;
          const tOk = catCount >= 2 && regCount >= 2;
          const tTip = tOk
            ? `Taxonomy OK. ${catCount} categories, ${regCount} regions.`
            : [
                catCount >= 2
                  ? null
                  : `Needs ≥2 categories (currently ${catCount}).`,
                regCount >= 2
                  ? null
                  : `Needs ≥2 regions (currently ${regCount}).`,
              ]
                .filter(Boolean)
                .join(" ");

          const bCount = biblioCount.get(r.id) || 0;
          const bOk = bCount >= 2;
          const bTip = bOk
            ? `Bibliography OK. ${bCount} citations linked.`
            : `Needs at least 2 citations (currently ${bCount}).`;

          const articleCount = countArticleBlocks(r);
          const aOk = articleCount >= 3;
          const aTip = aOk
            ? `Article OK. ${articleCount} blocks across sections.`
            : `Needs at least 3 article blocks (currently ${articleCount}).`;

          next[r.id] = {
            cover: { ok: coverOk, tip: coverTip },
            gallery: { ok: gOk, count: gCount, tip: gTip },
            story: { ok: sOk, count: sCount, tip: sTip },
            taxonomy: { ok: tOk, tip: tTip, catCount, regCount },
            biblio: { ok: bOk, count: bCount, tip: bTip },
            article: { ok: aOk, count: articleCount, tip: aTip },
          };
        }

        if (!abort.signal.aborted) setIndicators(next);
      } catch (e: any) {
        if (!abort.signal.aborted)
          setError(e.message || "Failed to load indicators.");
      }
    }

    run();
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sourceRows)]);

  const rowComplete = (ind?: Indicators) =>
    !!ind &&
    ind.cover.ok &&
    ind.gallery.ok &&
    ind.story.ok &&
    ind.taxonomy.ok &&
    ind.biblio.ok &&
    ind.article.ok;

  // Completeness counts for the orange bar (based on current tab set)
  const completenessCounts = useMemo(() => {
    const rows = sourceRows;
    let complete = 0;
    let incomplete = 0;
    rows.forEach((r) => {
      const ind = indicators[r.id];
      if (!ind) return; // wait for indicators
      if (rowComplete(ind)) complete += 1;
      else incomplete += 1;
    });
    return { all: rows.length, complete, incomplete };
  }, [sourceRows, indicators]);

  // Search + taxonomy filters
  const baseFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let filteredRows = sourceRows;

    if (selectedCategory) {
      filteredRows = filteredRows.filter((r: any) =>
        r.site_categories?.some(
          (sc: any) => sc.category_id === selectedCategory
        )
      );
    }

    if (selectedRegion) {
      filteredRows = filteredRows.filter((r: any) =>
        r.site_regions?.some((sr: any) => sr.region_id === selectedRegion)
      );
    }

    if (!needle) return filteredRows;

    return filteredRows.filter((r) =>
      [r.title ?? "", r.slug ?? ""].some((x) =>
        x.toLowerCase().includes(needle)
      )
    );
  }, [sourceRows, q, selectedCategory, selectedRegion, tab]);

  // Apply indicator filters + completeness sub-tab
  const indicatorFiltered = useMemo(() => {
    return baseFiltered.filter((r) => {
      const ind = indicators[r.id];
      if (!ind) return true;

      const pass =
        (fCover === "all" ||
          (fCover === "ok" ? ind.cover.ok : !ind.cover.ok)) &&
        (fGallery === "all" ||
          (fGallery === "ok" ? ind.gallery.ok : !ind.gallery.ok)) &&
        (fStory === "all" ||
          (fStory === "ok" ? ind.story.ok : !ind.story.ok)) &&
        (fTaxonomy === "all" ||
          (fTaxonomy === "ok" ? ind.taxonomy.ok : !ind.taxonomy.ok)) &&
        (fBiblio === "all" ||
          (fBiblio === "ok" ? ind.biblio.ok : !ind.biblio.ok)) &&
        (fArticle === "all" ||
          (fArticle === "ok" ? ind.article.ok : !ind.article.ok));

      if (!pass) return false;

      if (cTab === "all") return true;
      const isComplete = rowComplete(ind);
      return cTab === "complete" ? isComplete : !isComplete;
    });
  }, [
    baseFiltered,
    indicators,
    fCover,
    fGallery,
    fStory,
    fTaxonomy,
    fBiblio,
    fArticle,
    cTab,
  ]);

  // Sorting
  const sorted = useMemo(() => {
    const rows = [...indicatorFiltered];
    rows.sort((a, b) => {
      if (sortBy === "title") {
        const aa = (a.title || "").toLowerCase();
        const bb = (b.title || "").toLowerCase();
        return aa.localeCompare(bb);
      }
      const ia = indicators[a.id];
      const ib = indicators[b.id];
      const get = (k: IndicatorKey) => (x?: Indicators) =>
        x ? (x[k].ok ? 1 : 0) : 1;
      const keyMap: Record<typeof sortBy, IndicatorKey> = {
        cover: "cover",
        gallery: "gallery",
        story: "story",
        taxonomy: "taxonomy",
        biblio: "biblio",
        article: "article",
        title: "cover",
      };
      const k = keyMap[sortBy];
      const va = get(k)(ia);
      const vb = get(k)(ib);
      if (va !== vb) return va - vb;
      const aa = (a.title || "").toLowerCase();
      const bb = (b.title || "").toLowerCase();
      return aa.localeCompare(bb);
    });
    return rows;
  }, [indicatorFiltered, indicators, sortBy]);

  /* --------------------------------------------------------------------- */
  /* CRUD helpers                                                          */
  /* --------------------------------------------------------------------- */
  async function createNew() {
    const base = "Untitled Heritage";
    const slug = slugify(base) + "-" + String(Date.now()).slice(-5);
    setBusy("create");
    setError(null);
    const { data, error } = await supabase
      .from("sites")
      .insert({ title: base, slug, is_published: false })
      .select("id")
      .single();
    setBusy(null);
    if (error) return setError(error.message);
    router.push(`/admin/listings/${data!.id}`);
  }

  async function duplicate(id: string) {
    setBusy(id);
    setError(null);
    const { data: orig, error: e1 } = await supabase
      .from("sites")
      .select("*")
      .eq("id", id)
      .single();
    if (e1) {
      setBusy(null);
      return setError(e1.message);
    }
    const copy: any = { ...orig };
    delete copy.id;
    copy.title = (orig.title || "Copy") + " (Copy)";
    copy.slug = slugify(
      (orig.slug || "copy") + "-" + String(Date.now()).slice(-4)
    );
    copy.is_published = false;
    copy.updated_at = new Date().toISOString();
    copy.deleted_at = null;

    const { data: inserted, error: e2 } = await supabase
      .from("sites")
      .insert(copy)
      .select("id")
      .single();
    if (e2) {
      setBusy(null);
      return setError(e2.message);
    }

    const { error: rpcErr } = await supabase.rpc("clone_site_taxonomies", {
      p_from_site: id,
      p_to_site: inserted!.id,
    });
    if (rpcErr) {
      console.warn("clone_site_taxonomies RPC failed:", rpcErr.message);
    }

    setBusy(null);
    router.push(`/admin/listings/${inserted!.id}`);
  }

  async function remove(id: string) {
    if (
      !confirm(
        "Move this listing to Recycle Bin? It will be permanently deleted after 10 days."
      )
    )
      return;
    setBusy(id);
    setError(null);
    const { error } = await supabase
      .from("sites")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    if (error) return setError(error.message);
    await load();
  }

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    const { error } = await supabase
      .from("sites")
      .update({ deleted_at: null })
      .eq("id", id);
    setBusy(null);
    if (error) return setError(error.message);
    await load();
  }

  function confirmPermanentDelete(id: string, title: string | null) {
    setTargetDelete({ id, title });
    setPwd("");
    setPwdError(null);
    setShowPwdModal(true);
  }

  async function submitPermanentDelete() {
    if (!targetDelete) return;
    setPwdError(null);
    setPwdSubmitting(true);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user?.email) {
        throw new Error("Unable to verify current user.");
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: pwd,
      });
      if (signInErr) throw new Error("Incorrect password. Please try again.");

      const { error: delErr } = await supabase
        .from("sites")
        .delete()
        .eq("id", targetDelete.id);
      if (delErr) throw delErr;

      setShowPwdModal(false);
      setTargetDelete(null);
      await load();
    } catch (e: any) {
      setPwdError(e.message || "Deletion failed.");
    } finally {
      setPwdSubmitting(false);
    }
  }

  /* --------------------------------------------------------------------- */
  /* RENDER                                                                */
  /* --------------------------------------------------------------------- */
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100/70 text-slate-800 px-6 pt-8">
        <div className="max-w-7xl mx-auto">
          {/* HEADER BAR */}
          <div className="flex items-center gap-4 mb-3">
            <h1 className="text-3xl font-bold text-slate-900 flex-1">
              Manage Listings
            </h1>

            {/* Active/Recycle beside heading */}
            <div className="hidden sm:flex">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                <button
                  className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === "active"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => setTab("active")}
                >
                  Active ({rowsActive.length})
                </button>
                <button
                  className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === "recycle"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => setTab("recycle")}
                >
                  Recycle Bin ({rowsDeleted.length})
                </button>
              </div>
            </div>

            <Link
              href="/admin"
              className="text-sm text-slate-600 hover:text-slate-800 hover:underline flex items-center gap-2 whitespace-nowrap"
            >
              <FaArrowLeft /> Back to Dashboard
            </Link>
          </div>

          {/* Small-screen tabs */}
          <div className="sm:hidden mb-2 -mt-1">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
              <button
                className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "active"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => setTab("active")}
              >
                Active ({rowsActive.length})
              </button>
              <button
                className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "recycle"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => setTab("recycle")}
              >
                Recycle Bin ({rowsDeleted.length})
              </button>
            </div>
          </div>

          {/* Row: Orange left + Blue right */}
          <div className="flex flex-col md:flex-row gap-2 md:items-stretch mb-3">
            {/* ORANGE: Completeness chips with counts */}
            <div className="md:flex-none">
              <div
                className={`inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 shadow-sm ${BAR_MIN_H}`}
              >
                <button
                  className={`inline-flex items-center justify-center min-w-[132px] ${CONTROL_H} rounded-md text-sm font-medium px-3.5 ${
                    cTab === "all"
                      ? "bg-amber-600 text-white"
                      : "text-amber-800 hover:bg-amber-100"
                  }`}
                  onClick={() => setCTab("all")}
                >
                  All ({completenessCounts.all})
                </button>
                <button
                  className={`inline-flex items-center justify-center min-w-[132px] ${CONTROL_H} rounded-md text-sm font-medium px-3.5 ${
                    cTab === "complete"
                      ? "bg-amber-600 text-white"
                      : "text-amber-800 hover:bg-amber-100"
                  }`}
                  onClick={() => setCTab("complete")}
                >
                  Complete ({completenessCounts.complete})
                </button>
                <button
                  className={`inline-flex items-center justify-center min-w-[132px] ${CONTROL_H} rounded-md text-sm font-medium px-3.5 ${
                    cTab === "incomplete"
                      ? "bg-amber-600 text-white"
                      : "text-amber-800 hover:bg-amber-100"
                  }`}
                  onClick={() => setCTab("incomplete")}
                >
                  Incomplete ({completenessCounts.incomplete})
                </button>
              </div>
            </div>

            {/* BLUE: Search + New Listing */}
            <div className="md:flex-1">
              <div
                className={`flex gap-2 items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 shadow-sm ${BAR_MIN_H}`}
              >
                <input
                  placeholder={`Search ${
                    tab === "active" ? "active" : "recycled"
                  } by title or slug…`}
                  className={`w-full bg-white border border-sky-200 rounded-md px-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 ${CONTROL_H}`}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {tab === "active" && (
                  <button
                    className={`inline-flex items-center justify-center leading-none text-center rounded-md bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-60 ${CONTROL_H} px-7 min-w-[180px]`}
                    onClick={createNew}
                    disabled={busy === "create"}
                  >
                    {busy === "create" ? "Creating…" : "+ New Listing"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Compact sorting/taxonomy card */}
          <div className="mb-5">
            <div className="rounded-2xl border border-stone-300 bg-stone-100/70 p-3 sm:p-4 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                {/* Sort */}
                <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-lg px-3 py-1.5 min-h-[44px]">
                  <span className="text-xs text-slate-600">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as
                          | "title"
                          | "cover"
                          | "gallery"
                          | "story"
                          | "taxonomy"
                          | "biblio"
                          | "article"
                      )
                    }
                    className={`ml-auto bg-white border border-stone-300 rounded-md px-2 text-sm leading-none appearance-none ${TOOL_H}`}
                  >
                    <option value="title">Title (A→Z)</option>
                    <option value="cover">Cover (missing first)</option>
                    <option value="gallery">Gallery (missing first)</option>
                    <option value="story">Photo Story (missing first)</option>
                    <option value="taxonomy">Taxonomy (missing first)</option>
                    <option value="biblio">Bibliography (missing first)</option>
                    <option value="article">Article (missing first)</option>
                  </select>
                </div>

                {/* Categories */}
                <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-lg px-3 py-1.5 min-h-[44px]">
                  <span className="text-xs text-slate-600 whitespace-nowrap">
                    Categories
                  </span>
                  <SearchableDropdown
                    options={categories}
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    placeholder="All Categories"
                  />
                </div>

                {/* Regions */}
                <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-lg px-3 py-1.5 min-h-[44px]">
                  <span className="text-xs text-slate-600 whitespace-nowrap">
                    Regions
                  </span>
                  <SearchableDropdown
                    options={regions}
                    value={selectedRegion}
                    onChange={setSelectedRegion}
                    placeholder="All Regions"
                  />
                </div>
              </div>

              {/* Quality Filters row */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <FilterChip label="Cover" value={fCover} onChange={setFCover} />
                <FilterChip
                  label="Gallery"
                  value={fGallery}
                  onChange={setFGallery}
                />
                <FilterChip
                  label="Photo Story"
                  value={fStory}
                  onChange={setFStory}
                />
                <FilterChip
                  label="Taxonomy"
                  value={fTaxonomy}
                  onChange={setFTaxonomy}
                />
                <FilterChip
                  label="Bibliography"
                  value={fBiblio}
                  onChange={setFBiblio}
                />
                <FilterChip
                  label="Article"
                  value={fArticle}
                  onChange={setFArticle}
                />
              </div>
            </div>
          </div>

          {/* Errors */}
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
              <FaExclamationCircle />
              <span>{error}</span>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="text-center py-10 text-slate-500">
              Loading listings…
            </div>
          ) : (
            <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-600 w-14">
                      #
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Title
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-center">
                      Cover
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-center">
                      Gallery
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-center">
                      Photo Story
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-center">
                      Taxonomy
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-center">
                      Bibliography
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-center">
                      Article
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sorted.map((r, idx) => {
                    const ind = indicators[r.id];
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-3">
                          {tab === "active" ? (
                            <Link
                              href={`/admin/listings/${r.id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {r.title || "Untitled"}
                            </Link>
                          ) : (
                            <span className="text-slate-800">
                              {r.title || "Untitled"}
                            </span>
                          )}
                        </td>

                        {/* Indicator cells */}
                        <td className="px-4 py-3 text-center">
                          {ind ? (
                            <TickCross
                              ok={ind.cover.ok}
                              count={ind.cover.ok ? 1 : 0}
                              title={ind.cover.tip}
                            />
                          ) : (
                            <span className="text-slate-400">…</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {ind ? (
                            <TickCross
                              ok={ind.gallery.ok}
                              count={ind.gallery.count}
                              title={ind.gallery.tip}
                            />
                          ) : (
                            <span className="text-slate-400">…</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {ind ? (
                            <TickCross
                              ok={ind.story.ok}
                              count={ind.story.count}
                              title={ind.story.tip}
                            />
                          ) : (
                            <span className="text-slate-400">…</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {ind ? (
                            <TickCross
                              ok={ind.taxonomy.ok}
                              count={
                                ind.taxonomy.catCount + ind.taxonomy.regCount
                              }
                              title={ind.taxonomy.tip}
                            />
                          ) : (
                            <span className="text-slate-400">…</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {ind ? (
                            <TickCross
                              ok={ind.biblio.ok}
                              count={ind.biblio.count}
                              title={ind.biblio.tip}
                            />
                          ) : (
                            <span className="text-slate-400">…</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {ind ? (
                            <TickCross
                              ok={ind.article.ok}
                              count={ind.article.count}
                              title={ind.article.tip}
                            />
                          ) : (
                            <span className="text-slate-400">…</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {tab === "active" ? (
                              <>
                                <Link
                                  href={`/admin/listings/${r.id}`}
                                  className="px-2.5 py-1.5 border border-blue-200 bg-blue-50 rounded-md text-blue-700 text-xs hover:bg-blue-100 transition-colors"
                                >
                                  Edit
                                </Link>
                                <button
                                  onClick={() => duplicate(r.id)}
                                  className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-60"
                                  disabled={busy === r.id}
                                >
                                  Duplicate
                                </button>
                                <button
                                  onClick={() => remove(r.id)}
                                  className="px-2.5 py-1.5 border border-red-200 rounded-md text-red-700 bg-red-50 text-xs hover:bg-red-100 transition-colors disabled:opacity-60"
                                  disabled={busy === r.id}
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => restore(r.id)}
                                  className="px-2.5 py-1.5 border border-emerald-200 rounded-md text-emerald-700 bg-emerald-50 text-xs hover:bg-emerald-100 transition-colors disabled:opacity-60"
                                  disabled={busy === r.id}
                                >
                                  Restore
                                </button>
                                <button
                                  onClick={() =>
                                    confirmPermanentDelete(r.id, r.title)
                                  }
                                  className="px-2.5 py-1.5 border border-red-200 rounded-md text-red-700 bg-red-50 text-xs hover:bg-red-100 transition-colors disabled:opacity-60"
                                  disabled={busy === r.id}
                                >
                                  Permanently Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-slate-500"
                        colSpan={9}
                      >
                        {tab === "active"
                          ? "No listings match the current filters."
                          : "Recycle Bin is empty."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Password Confirmation Modal */}
        {showPwdModal && targetDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => !pwdSubmitting && setShowPwdModal(false)}
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  Confirm Permanent Deletion
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  You are about to permanently delete{" "}
                  <span className="font-medium">
                    {targetDelete.title || "this listing"}
                  </span>
                  . This action cannot be undone.
                </p>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Enter your account password to continue
                  </label>
                  <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    className={`mt-1 w-full rounded-md px-3 text-slate-900 placeholder-slate-400 bg-white border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300] ${CONTROL_H}`}
                    placeholder="••••••••"
                    disabled={pwdSubmitting}
                  />
                  {pwdError && (
                    <div className="mt-2 text-sm text-red-600 flex items-center gap-2">
                      <FaExclamationCircle /> {pwdError}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowPwdModal(false)}
                    disabled={pwdSubmitting}
                    className={`px-3 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 ${CONTROL_H}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitPermanentDelete}
                    disabled={pwdSubmitting || !pwd}
                    className={`px-4 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 ${CONTROL_H}`}
                  >
                    {pwdSubmitting ? "Deleting…" : "Confirm Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}

/* =========================================================================
   SMALL UI: FilterChip
   ========================================================================= */
function FilterChip({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "all" | "ok" | "missing";
  onChange: (v: "all" | "ok" | "missing") => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 bg-white border border-stone-300 rounded-md px-2 leading-none ${TOOL_H}`}
    >
      <span className="text-xs text-slate-600">{label}</span>
      <select
        className={`text-xs bg-transparent leading-none appearance-none px-2 rounded ${TOOL_H}`}
        value={value}
        onChange={(e) => onChange(e.target.value as any)}
      >
        <option value="all">All</option>
        <option value="ok">✓ Present</option>
        <option value="missing">✗ Missing</option>
      </select>
    </div>
  );
}

/* ========================================================================
   HELPERS
   ========================================================================= */
function countArticleBlocks(r: SiteRow): number {
  const len = (arr: unknown) => (Array.isArray(arr) ? arr.length : 0);

  const history = len(r.history_layout_json);
  const architecture = len(r.architecture_layout_json);
  const climate = len(r.climate_layout_json);

  const custom = Array.isArray(r.custom_sections_json)
    ? r.custom_sections_json.reduce((acc, cs: any) => {
        const n = Array.isArray(cs?.sections_json)
          ? cs.sections_json.length
          : 0;
        return acc + n;
      }, 0)
    : 0;

  return history + architecture + climate + custom;
}
