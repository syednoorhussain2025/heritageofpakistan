// src/app/admin/home/page.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/browser";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type GSRow = {
  key: string;
  site_title?: string | null;
  site_subtitle?: string | null;
  hero_image_url?: string | null;
  value?: any | null;
};

type SitePick = {
  id: string;
  title: string;
  location_free: string | null;
  cover_photo_thumb_url: string | null;
  heritage_type: string | null;
};

type MobileHomepageConfig = {
  featured: string[];
  unknown_pakistan: string[];
  category_pills: string[];
};

type Category = { id: string; name: string; slug: string };

// ─── SiteSelectorModal ────────────────────────────────────────────────────────

function SiteSelectorModal({
  title,
  selectedIds,
  onSave,
  onClose,
}: {
  title: string;
  selectedIds: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SitePick[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SitePick[]>([]);
  const [loadingSelected, setLoadingSelected] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load currently selected sites on mount
  useEffect(() => {
    if (selectedIds.length === 0) { setLoadingSelected(false); return; }
    (async () => {
      const { data } = await supabase
        .from("sites")
        .select("id, title, location_free, cover_photo_thumb_url, heritage_type")
        .in("id", selectedIds);
      if (data) {
        // Preserve order
        const map = new Map(data.map((s: SitePick) => [s.id, s]));
        setSelected(selectedIds.map((id) => map.get(id)).filter(Boolean) as SitePick[]);
      }
      setLoadingSelected(false);
    })();
  }, []);

  // Search sites
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("sites")
        .select("id, title, location_free, cover_photo_thumb_url, heritage_type")
        .eq("is_published", true)
        .ilike("title", `%${query.trim()}%`)
        .limit(20);
      setResults((data as SitePick[]) || []);
      setSearching(false);
    }, 300);
  }, [query]);

  function toggleSite(site: SitePick) {
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === site.id);
      if (exists) return prev.filter((s) => s.id !== site.id);
      return [...prev, site];
    });
  }

  function removeSelected(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setSelected((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setSelected((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  const selectedIds_set = new Set(selected.map((s) => s.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Select Sites — {title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-700">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites by name..."
            className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {query.trim() === "" && (
            <p className="text-gray-500 text-sm text-center py-6">Type a site name to search…</p>
          )}
          {searching && (
            <p className="text-gray-400 text-sm text-center py-6">Searching…</p>
          )}
          {!searching && query.trim() !== "" && results.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-6">No sites found.</p>
          )}
          {results.map((site) => {
            const isChecked = selectedIds_set.has(site.id);
            return (
              <button
                key={site.id}
                onClick={() => toggleSite(site)}
                className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-800 transition-colors text-left border-b border-gray-800 ${isChecked ? "bg-gray-800/60" : ""}`}
              >
                {/* Thumb */}
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-700">
                  {site.cover_photo_thumb_url
                    ? <img src={site.cover_photo_thumb_url} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full bg-gradient-to-br from-orange-400 to-green-500" />
                  }
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{site.title}</div>
                  <div className="text-xs text-gray-400 truncate">{site.location_free || "—"}</div>
                </div>
                {/* Badge */}
                {site.heritage_type && (
                  <span className="text-xs bg-orange-500/20 text-orange-300 rounded-full px-2 py-0.5 shrink-0">{site.heritage_type}</span>
                )}
                {/* Checkbox */}
                <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center ${isChecked ? "bg-blue-600 border-blue-600" : "border-gray-500"}`}>
                  {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected order */}
        <div className="border-t border-gray-700 px-5 py-4 space-y-2 max-h-60 overflow-y-auto">
          <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
            Selected ({selected.length}) — drag ↕ to reorder
          </div>
          {loadingSelected && <p className="text-gray-500 text-xs">Loading…</p>}
          {selected.length === 0 && !loadingSelected && (
            <p className="text-gray-600 text-xs">No sites selected yet.</p>
          )}
          {selected.map((site, i) => (
            <div key={site.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <div className="w-7 h-7 rounded overflow-hidden shrink-0 bg-gray-700">
                {site.cover_photo_thumb_url
                  ? <img src={site.cover_photo_thumb_url} className="w-full h-full object-cover" alt="" />
                  : <div className="w-full h-full bg-gradient-to-br from-orange-400 to-green-500" />
                }
              </div>
              <span className="text-sm text-white flex-1 truncate">{site.title}</span>
              {/* Up/down */}
              <button onClick={() => moveUp(i)} disabled={i === 0} className="text-gray-500 hover:text-white disabled:opacity-20 text-xs px-1">▲</button>
              <button onClick={() => moveDown(i)} disabled={i === selected.length - 1} className="text-gray-500 hover:text-white disabled:opacity-20 text-xs px-1">▼</button>
              <button onClick={() => removeSelected(site.id)} className="text-gray-500 hover:text-red-400 text-lg leading-none ml-1">&times;</button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onSave(selected.map((s) => s.id)); onClose(); }}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Save ({selected.length} sites)
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SelectedSiteChips ────────────────────────────────────────────────────────

function SelectedSiteChips({ ids }: { ids: string[] }) {
  const [sites, setSites] = useState<SitePick[]>([]);

  useEffect(() => {
    if (ids.length === 0) { setSites([]); return; }
    (async () => {
      const { data } = await supabase
        .from("sites")
        .select("id, title, location_free, cover_photo_thumb_url, heritage_type")
        .in("id", ids);
      if (data) {
        const map = new Map(data.map((s: SitePick) => [s.id, s]));
        setSites(ids.map((id) => map.get(id)).filter(Boolean) as SitePick[]);
      }
    })();
  }, [ids.join(",")]);

  if (ids.length === 0) return <p className="text-xs text-gray-600 italic">No sites selected.</p>;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {sites.map((site) => (
        <div key={site.id} className="flex items-center gap-1.5 bg-gray-700 rounded-full px-2 py-1">
          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-gray-600">
            {site.cover_photo_thumb_url
              ? <img src={site.cover_photo_thumb_url} className="w-full h-full object-cover" alt="" />
              : <div className="w-full h-full bg-gradient-to-br from-orange-400 to-green-500" />
            }
          </div>
          <span className="text-xs text-gray-200 max-w-[120px] truncate">{site.title}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

function SectionCard({
  label,
  description,
  ids,
  onEdit,
}: {
  label: string;
  description: string;
  ids: string[];
  onEdit: () => void;
}) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-white font-semibold text-base">{label}</h3>
          <p className="text-gray-400 text-xs mt-0.5">{description}</p>
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          + Select Sites
        </button>
      </div>
      <div>
        <span className="text-xs text-gray-500">{ids.length} site{ids.length !== 1 ? "s" : ""} selected</span>
        <SelectedSiteChips ids={ids} />
      </div>
    </div>
  );
}

// ─── CategoryPillsEditor ──────────────────────────────────────────────────────

function CategoryPillsEditor({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (slugs: string[]) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug")
        .order("name");
      setCategories((data as Category[]) || []);
    })();
  }, []);

  function toggle(slug: string) {
    onChange(
      selected.includes(slug)
        ? selected.filter((s) => s !== slug)
        : [...selected, slug]
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
      <div>
        <h3 className="text-white font-semibold text-base">Category Pills</h3>
        <p className="text-gray-400 text-xs mt-0.5">Choose which categories appear as quick-filter pills on the home screen.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const active = selected.includes(cat.slug);
          return (
            <button
              key={cat.id}
              onClick={() => toggle(cat.slug)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400"
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-gray-500">{selected.length} categor{selected.length !== 1 ? "ies" : "y"} selected</p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminHomeEditor() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"website" | "mobile">("website");

  // Website tab state
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [siteTitle, setSiteTitle] = useState("Heritage of Pakistan");
  const [siteSubtitle, setSiteSubtitle] = useState("Discover, Explore, Preserve");
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mobile tab state
  const [mobileSaving, setMobileSaving] = useState(false);
  const [mobileMessage, setMobileMessage] = useState<string | null>(null);
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [unknownPakistanIds, setUnknownPakistanIds] = useState<string[]>([]);
  const [categoryPills, setCategoryPills] = useState<string[]>([]);

  // Modal state
  const [openModal, setOpenModal] = useState<null | "featured" | "unknown_pakistan">(null);

  // Cleanup preview URL
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  // Load all settings on mount
  useEffect(() => {
    (async () => {
      setLoading(true);

      const [websiteRes, mobileRes] = await Promise.all([
        supabase
          .from("global_settings")
          .select("key, site_title, site_subtitle, hero_image_url, value")
          .eq("key", "homepage")
          .maybeSingle(),
        supabase
          .from("global_settings")
          .select("value")
          .eq("key", "mobile_homepage")
          .maybeSingle(),
      ]);

      if (!websiteRes.error && websiteRes.data) {
        const row = websiteRes.data as GSRow;
        const v = (row.value || {}) as Record<string, any>;
        setSiteTitle(row.site_title ?? v.site_title ?? "Heritage of Pakistan");
        setSiteSubtitle(row.site_subtitle ?? v.site_subtitle ?? "Discover, Explore, Preserve");
        setHeroUrl(row.hero_image_url ?? v.hero_image_url ?? null);
      }

      if (!mobileRes.error && mobileRes.data) {
        const cfg = (mobileRes.data.value || {}) as MobileHomepageConfig;
        setFeaturedIds(cfg.featured || []);
        setUnknownPakistanIds(cfg.unknown_pakistan || []);
        setCategoryPills(cfg.category_pills || []);
      }

      setLoading(false);
    })();
  }, []);

  // ── Website save ──
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setHeroUrl("");
    setPreviewUrl(selectedFile ? URL.createObjectURL(selectedFile) : null);
  }

  function handleRemoveImage() {
    setFile(null);
    setHeroUrl("");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSaveWebsite() {
    setSaving(true);
    setMessage(null);
    let finalUrl = heroUrl;
    try {
      if (file) {
        setMessage("Uploading image...");
        const ext = file.name.split(".").pop() || "jpg";
        const path = `home/hero-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("site-images")
          .upload(path, file, { cacheControl: "3600", upsert: true });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const { data } = supabase.storage.from("site-images").getPublicUrl(path);
        finalUrl = data?.publicUrl || null;
      }
      setMessage("Saving settings...");
      const jsonValue = { site_title: siteTitle, site_subtitle: siteSubtitle, hero_image_url: finalUrl };
      const { error } = await supabase.from("global_settings").upsert(
        { key: "homepage", site_title: siteTitle, site_subtitle: siteSubtitle, hero_image_url: finalUrl, value: jsonValue },
        { onConflict: "key" }
      );
      if (error) throw error;
      setHeroUrl(finalUrl);
      setMessage("Homepage settings saved.");
      setFile(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      setMessage(e?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  // ── Mobile save ──
  async function onSaveMobile() {
    setMobileSaving(true);
    setMobileMessage(null);
    try {
      const cfg: MobileHomepageConfig = {
        featured: featuredIds,
        unknown_pakistan: unknownPakistanIds,
        category_pills: categoryPills,
      };
      const { error } = await supabase.from("global_settings").upsert(
        { key: "mobile_homepage", value: cfg },
        { onConflict: "key" }
      );
      if (error) throw error;
      setMobileMessage("Mobile homepage saved.");
    } catch (e: any) {
      setMobileMessage(e?.message || "Failed to save.");
    } finally {
      setMobileSaving(false);
    }
  }

  if (loading) {
    return <div className="bg-gray-900 text-white min-h-screen p-6">Loading…</div>;
  }

  const currentImage = previewUrl || heroUrl;

  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen">
      <div className="max-w-4xl mx-auto p-6 space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Home Page Editor</h1>
          <Link href="/admin" className="text-sm text-blue-400 hover:underline">← Back to Admin</Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-800 rounded-xl p-1 w-fit border border-gray-700">
          {(["website", "mobile"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "website" ? "Website" : "Mobile App Homepage"}
            </button>
          ))}
        </div>

        {/* ── Website Tab ── */}
        {activeTab === "website" && (
          <div className="bg-gray-800 rounded-xl shadow-md p-5 space-y-5 border border-gray-700">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Title</label>
              <input
                type="text"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Heritage of Pakistan"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Subtitle</label>
              <input
                type="text"
                value={siteSubtitle}
                onChange={(e) => setSiteSubtitle(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Discover, Explore, Preserve"
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">Hero Cover Photo (upload)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    disabled={!!heroUrl}
                  />
                  {(file || heroUrl) && (
                    <button onClick={handleRemoveImage} className="text-gray-400 hover:text-white text-2xl font-bold">&times;</button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Uploading a file will clear a pasted URL.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">…or paste a Hero Image URL</label>
                <input
                  type="url"
                  value={heroUrl || ""}
                  onChange={(e) => { setHeroUrl(e.target.value); if (e.target.value) handleRemoveImage(); }}
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://…"
                  disabled={!!file}
                />
                <p className="text-xs text-gray-500 mt-1">Pasting a URL disables file upload.</p>
              </div>
            </div>
            {currentImage && (
              <div>
                <div className="text-sm font-medium mb-2 text-gray-300">Preview</div>
                <div className="rounded-lg overflow-hidden border border-gray-700">
                  <img src={currentImage} alt="Hero preview" className="w-full h-64 object-cover" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={onSaveWebsite}
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save Page"}
              </button>
              {message && <span className="text-sm text-gray-400">{message}</span>}
            </div>
          </div>
        )}

        {/* ── Mobile Tab ── */}
        {activeTab === "mobile" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Control what appears on each section of the mobile app home screen.
            </p>

            {/* Featured */}
            <SectionCard
              label="Featured Sites"
              description="Hero carousel at the top. Show your best 4–5 sites. These rotate automatically."
              ids={featuredIds}
              onEdit={() => setOpenModal("featured")}
            />

            {/* Unknown Pakistan */}
            <SectionCard
              label="Beyond the Tourist Trail"
              description="Lesser-known, off the beaten path sites. Hand-pick obscure gems to spark curiosity."
              ids={unknownPakistanIds}
              onEdit={() => setOpenModal("unknown_pakistan")}
            />

            {/* Category Pills */}
            <CategoryPillsEditor
              selected={categoryPills}
              onChange={setCategoryPills}
            />

            {/* Save */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={onSaveMobile}
                disabled={mobileSaving}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mobileSaving ? "Saving…" : "Save Mobile Homepage"}
              </button>
              {mobileMessage && (
                <span className={`text-sm ${mobileMessage.includes("saved") ? "text-green-400" : "text-red-400"}`}>
                  {mobileMessage}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="text-sm text-gray-500 text-center">
          Tip: Refresh the app after saving to see your changes.
        </div>
      </div>

      {/* Modals */}
      {openModal === "featured" && (
        <SiteSelectorModal
          title="Featured Sites"
          selectedIds={featuredIds}
          onSave={setFeaturedIds}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "unknown_pakistan" && (
        <SiteSelectorModal
          title="Beyond the Tourist Trail"
          selectedIds={unknownPakistanIds}
          onSave={setUnknownPakistanIds}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  );
}
