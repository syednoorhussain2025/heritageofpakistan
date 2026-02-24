"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabase/browser";
import IconPickerModal from "@/components/IconPickerModal";
import { getVariantPublicUrl } from "@/lib/imagevariants";

/* --------------------------- Types --------------------------- */

type IconRow = { name: string; svg_content: string };

type MainItem = {
  id: string;
  label: string;
  slug: string;
  icon_name: string | null;
  url: string | null;
  sort_order: number;
};

type SubItem = {
  id: string;
  main_item_id: string;
  label: string;
  icon_name: string | null;
  url: string | null;
  title: string | null;
  detail: string | null;
  site_id: string | null;
  site_image_id: string | null;
  sort_order: number;
  // UI-only — not persisted
  _previewUrl?: string;
};

/* ------------------ Site + Image Picker Modal ------------------ */

type SiteRow = { id: string; title: string };
type ImageRow = { id: string; storage_path: string; caption: string | null };

function SiteImagePickerModal({
  isOpen,
  onClose,
  onSelect,
  currentImageId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (siteId: string | null, imageId: string | null, previewUrl: string | null) => void;
  currentImageId: string | null;
}) {
  const [step, setStep] = useState<"search" | "images">("search");
  const [query, setQuery] = useState("");
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteRow | null>(null);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep("search");
      setQuery("");
      setSites([]);
      setSelectedSite(null);
      setImages([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const searchSites = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sites")
      .select("id,title")
      .ilike("title", `%${query.trim()}%`)
      .eq("is_published", true)
      .order("title")
      .limit(20);
    setSites(((data as any[]) || []).map((s) => ({ id: s.id, title: s.title })));
    setLoading(false);
  };

  const loadImages = async (site: SiteRow) => {
    setSelectedSite(site);
    setStep("images");
    setLoading(true);
    const { data } = await supabase
      .from("site_images")
      .select("id,storage_path,caption")
      .eq("site_id", site.id)
      .order("sort_order", { ascending: true });
    setImages(
      ((data as any[]) || []).map((i) => ({
        id: i.id,
        storage_path: i.storage_path,
        caption: i.caption,
      }))
    );
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {step === "search" ? "Select preview image" : selectedSite?.title}
            </h3>
            <p className="text-xs text-slate-500">
              {step === "search"
                ? "Search for a site to browse its images"
                : "Click an image to use it as the menu preview"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Icon name="times" size={18} />
          </button>
        </div>

        {/* Search step */}
        {step === "search" && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchSites()}
                placeholder="Search sites by title…"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[var(--brand-orange)] focus:outline-none"
              />
              <button
                type="button"
                onClick={searchSites}
                className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
              >
                Search
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <p className="text-sm text-slate-500">Loading…</p>
              )}
              {!loading && sites.length === 0 && query && (
                <p className="text-sm text-slate-500">No sites found.</p>
              )}
              {!loading && sites.length === 0 && !query && (
                <p className="text-sm text-slate-400">Type a site name above and press Search.</p>
              )}
              <ul className="divide-y divide-slate-100">
                {sites.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => loadImages(s)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-50 rounded-lg"
                    >
                      <span className="font-medium text-slate-800">{s.title}</span>
                      <span className="text-xs text-[var(--brand-orange)]">
                        Browse images →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Images step */}
        {step === "images" && selectedSite && (
          <div className="flex flex-col p-5">
            <button
              type="button"
              onClick={() => setStep("search")}
              className="mb-4 self-start text-xs text-slate-500 hover:text-slate-800"
            >
              ← Back to search
            </button>
            {loading && (
              <p className="text-sm text-slate-500">Loading images…</p>
            )}
            {!loading && images.length === 0 && (
              <p className="text-sm text-slate-500">No images found for this site.</p>
            )}
            <div className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto md:grid-cols-4">
              {images.map((img) => {
                const thumbSrc = getVariantPublicUrl(img.storage_path, "thumb");
                const isSelected = currentImageId === img.id;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      onSelect(selectedSite.id, img.id, getVariantPublicUrl(img.storage_path, "thumb"));
                      onClose();
                    }}
                    className={`group relative overflow-hidden rounded-lg border-2 transition-all ${
                      isSelected
                        ? "border-[var(--brand-orange)] ring-2 ring-orange-200"
                        : "border-slate-200 hover:border-[var(--brand-orange)]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbSrc}
                      alt={img.caption ?? ""}
                      className="h-28 w-full object-cover"
                      loading="lazy"
                    />
                    {isSelected && (
                      <div className="absolute right-1.5 top-1.5 rounded-full bg-[var(--brand-orange)] p-0.5">
                        <Icon name="check" size={10} className="text-white" />
                      </div>
                    )}
                    {img.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-1 text-[10px] text-white">
                        {img.caption}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------- Main admin page ----------------------- */

export default function HeaderAdminPage() {
  const [mainItems, setMainItems] = useState<MainItem[]>([]);
  const [subItems, setSubItems] = useState<SubItem[]>([]);
  const [icons, setIcons] = useState<IconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

  const [iconModalForMain, setIconModalForMain] = useState<string | null>(null);
  const [iconModalForSub, setIconModalForSub] = useState<string | null>(null);
  const [imageModalForSub, setImageModalForSub] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [{ data: main }, { data: subs }, { data: iconsData }] =
        await Promise.all([
          supabase
            .from("header_main_items")
            .select("*")
            .order("sort_order", { ascending: true }),
          supabase
            .from("header_sub_items")
            .select("*")
            .order("sort_order", { ascending: true }),
          supabase.from("icons").select("name,svg_content").order("name"),
        ]);

      const loadedSubs: SubItem[] = (subs as any[]) || [];

      // Load preview URLs for sub items that already have a site_image_id
      const imageIds = loadedSubs
        .map((s) => s.site_image_id)
        .filter(Boolean) as string[];

      let previewMap: Record<string, string> = {};
      if (imageIds.length > 0) {
        const { data: imgRows } = await supabase
          .from("site_images")
          .select("id,storage_path")
          .in("id", imageIds);
        if (imgRows) {
          (imgRows as any[]).forEach((r) => {
            previewMap[r.id] = getVariantPublicUrl(r.storage_path, "thumb");
          });
        }
      }

      setMainItems((main as any[]) || []);
      setSubItems(
        loadedSubs.map((s) => ({
          ...s,
          _previewUrl: s.site_image_id ? previewMap[s.site_image_id] : undefined,
        }))
      );
      setIcons((iconsData as any[]) || []);
      setLoading(false);
    }

    load();
  }, []);

  const subsByMain = useMemo(() => {
    const map: Record<string, SubItem[]> = {};
    subItems.forEach((s) => {
      const arr = map[s.main_item_id] || (map[s.main_item_id] = []);
      arr.push(s);
    });
    return map;
  }, [subItems]);

  const nextMainSort = useMemo(
    () =>
      mainItems.length === 0
        ? 0
        : Math.max(...mainItems.map((m) => m.sort_order)) + 1,
    [mainItems]
  );

  function addMainItem() {
    const id = crypto.randomUUID();
    setMainItems((prev) => [
      ...prev,
      {
        id,
        label: "New menu",
        slug: `menu-${Date.now()}`,
        icon_name: null,
        url: null,
        sort_order: nextMainSort,
      },
    ]);
  }

  function removeMainItem(id: string) {
    setMainItems((prev) => prev.filter((m) => m.id !== id));
    setSubItems((prev) => prev.filter((s) => s.main_item_id !== id));
  }

  function updateMainItem(id: string, patch: Partial<MainItem>) {
    setMainItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }

  function addSubItem(mainId: string) {
    const id = crypto.randomUUID();
    const current = subItems.filter((s) => s.main_item_id === mainId);
    const maxSort =
      current.length === 0
        ? 0
        : Math.max(...current.map((s) => s.sort_order)) + 1;
    setSubItems((prev) => [
      ...prev,
      {
        id,
        main_item_id: mainId,
        label: "New item",
        icon_name: null,
        url: null,
        title: null,
        detail: null,
        site_id: null,
        site_image_id: null,
        sort_order: maxSort,
      },
    ]);
  }

  function removeSubItem(id: string) {
    setSubItems((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSubItem(id: string, patch: Partial<SubItem>) {
    setSubItems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  async function saveAll() {
    setSaving(true);
    setSaveError(false);
    setMessage("Saving…");

    try {
      const now = new Date().toISOString();

      const { error: mainErr } = await supabase
        .from("header_main_items")
        .upsert(mainItems.map((m) => ({ ...m, updated_at: now })));
      if (mainErr) throw mainErr;

      // Strip UI-only fields before persisting
      const { error: subErr } = await supabase
        .from("header_sub_items")
        .upsert(
          subItems.map(({ _previewUrl, ...s }) => ({ ...s, updated_at: now }))
        );
      if (subErr) throw subErr;

      setMessage("Saved successfully.");
    } catch (e: any) {
      console.error(e);
      setSaveError(true);
      setMessage("Error saving — check console.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100 text-slate-800">
        <main className="mx-auto max-w-5xl px-4 py-8">

          {/* Page header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
                <Icon name="admin" size={26} className="text-slate-600" />
                Header Editor
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage main navigation items, sub-menu entries, icons and preview images.
              </p>
            </div>
            <Link
              href="/admin"
              className="text-sm text-[var(--brand-orange)] hover:underline"
            >
              ← Back to Admin Dashboard
            </Link>
          </div>

          {/* Toolbar */}
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              onClick={addMainItem}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
            >
              <span className="text-base leading-none">+</span> Add main menu
            </button>

            <div className="flex items-center gap-3">
              {message && (
                <span
                  className={`text-sm font-medium ${
                    saveError ? "text-red-600" : saving ? "text-slate-500" : "text-emerald-600"
                  }`}
                >
                  {saving ? "⏳ " : saveError ? "✕ " : "✓ "}
                  {message}
                </span>
              )}
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading…
            </div>
          ) : mainItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-sm text-slate-500">
                No main menu items yet. Click <strong>+ Add main menu</strong> to create one.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {mainItems
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((m) => (
                  <div
                    key={m.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    {/* Main item header */}
                    <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
                      <div className="flex flex-1 items-center gap-3 flex-wrap">
                        {/* Icon */}
                        <button
                          type="button"
                          onClick={() => setIconModalForMain(m.id)}
                          title="Change icon"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-[var(--brand-orange)] hover:text-[var(--brand-orange)]"
                        >
                          {m.icon_name ? (
                            <Icon name={m.icon_name} size={18} />
                          ) : (
                            <span className="text-[11px] text-slate-400">icon</span>
                          )}
                        </button>

                        {/* Label */}
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            Label
                          </label>
                          <input
                            value={m.label}
                            onChange={(e) =>
                              updateMainItem(m.id, { label: e.target.value })
                            }
                            className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-800 focus:border-[var(--brand-orange)] focus:outline-none"
                          />
                        </div>

                        {/* Slug */}
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            Slug
                          </label>
                          <input
                            value={m.slug}
                            onChange={(e) =>
                              updateMainItem(m.id, { slug: e.target.value })
                            }
                            className="w-44 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-600 focus:border-[var(--brand-orange)] focus:outline-none"
                          />
                        </div>

                        {/* URL */}
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            URL (optional)
                          </label>
                          <input
                            value={m.url ?? ""}
                            placeholder="Leave empty for mega menu"
                            onChange={(e) =>
                              updateMainItem(m.id, { url: e.target.value || null })
                            }
                            className="w-52 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 placeholder-slate-300 focus:border-[var(--brand-orange)] focus:outline-none"
                          />
                        </div>

                        <span className="text-xs text-slate-400">Sort: {m.sort_order}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeMainItem(m.id)}
                        className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                      >
                        <Icon name="trash" size={13} />
                        Delete
                      </button>
                    </div>

                    {/* Sub items section */}
                    <div className="p-5">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                          Sub Menu Items
                        </span>
                        <button
                          type="button"
                          onClick={() => addSubItem(m.id)}
                          className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <span className="text-sm leading-none">+</span> Add sub item
                        </button>
                      </div>

                      {(subsByMain[m.id] || []).length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">
                          No sub items. Click <strong>+ Add sub item</strong> to add one.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {(subsByMain[m.id] || [])
                            .slice()
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((s, idx) => (
                              <div
                                key={s.id}
                                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                              >
                                {/* Sub item top bar */}
                                <div className="mb-3 flex items-center justify-between">
                                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                                    Sub item #{idx + 1}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[11px] text-slate-400">
                                      Sort: {s.sort_order}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeSubItem(s.id)}
                                      className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700"
                                    >
                                      <Icon name="trash" size={12} />
                                      Remove
                                    </button>
                                  </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-[160px_1fr_1fr_1fr]">
                                  {/* Image preview + picker */}
                                  <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-medium text-slate-500">
                                      Preview Image
                                    </label>
                                    {s._previewUrl ? (
                                      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={s._previewUrl}
                                          alt=""
                                          className="h-24 w-full object-cover"
                                        />
                                        <div className="absolute inset-0 flex items-end justify-center bg-black/0 hover:bg-black/30 transition-colors">
                                          <button
                                            type="button"
                                            onClick={() => setImageModalForSub(s.id)}
                                            className="mb-2 hidden rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white group-hover:block"
                                          >
                                            Change
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div
                                        onClick={() => setImageModalForSub(s.id)}
                                        className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white hover:border-[var(--brand-orange)] hover:bg-orange-50"
                                      >
                                        <Icon name="image" size={20} className="text-slate-300" />
                                        <span className="text-[11px] text-slate-400">No image</span>
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setImageModalForSub(s.id)}
                                      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 text-center"
                                    >
                                      {s.site_image_id ? "Change image…" : "Choose image…"}
                                    </button>
                                  </div>

                                  {/* Label + icon */}
                                  <div className="flex flex-col gap-2">
                                    <div>
                                      <label className="text-[11px] font-medium text-slate-500">
                                        Label
                                      </label>
                                      <input
                                        value={s.label}
                                        onChange={(e) =>
                                          updateSubItem(s.id, { label: e.target.value })
                                        }
                                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-[var(--brand-orange)] focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[11px] font-medium text-slate-500">
                                        Icon
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => setIconModalForSub(s.id)}
                                        className="mt-1 flex w-full items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs hover:border-[var(--brand-orange)]"
                                      >
                                        {s.icon_name ? (
                                          <>
                                            <Icon name={s.icon_name} size={14} className="text-[var(--brand-orange)]" />
                                            <span className="text-slate-700">{s.icon_name}</span>
                                          </>
                                        ) : (
                                          <span className="text-slate-400">Select icon…</span>
                                        )}
                                      </button>
                                    </div>
                                    <div>
                                      <label className="text-[11px] font-medium text-slate-500">
                                        URL
                                      </label>
                                      <input
                                        value={s.url ?? ""}
                                        onChange={(e) =>
                                          updateSubItem(s.id, { url: e.target.value || null })
                                        }
                                        placeholder="https://…"
                                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs placeholder-slate-300 focus:border-[var(--brand-orange)] focus:outline-none"
                                      />
                                    </div>
                                  </div>

                                  {/* Title */}
                                  <div className="flex flex-col gap-2">
                                    <div>
                                      <label className="text-[11px] font-medium text-slate-500">
                                        Title (right panel heading)
                                      </label>
                                      <input
                                        value={s.title ?? ""}
                                        onChange={(e) =>
                                          updateSubItem(s.id, { title: e.target.value || null })
                                        }
                                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-[var(--brand-orange)] focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[11px] font-medium text-slate-500">
                                        Detail (right panel description)
                                      </label>
                                      <textarea
                                        value={s.detail ?? ""}
                                        onChange={(e) =>
                                          updateSubItem(s.id, { detail: e.target.value || null })
                                        }
                                        rows={3}
                                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs leading-relaxed focus:border-[var(--brand-orange)] focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </main>
      </div>

      {/* Icon picker for main items */}
      {iconModalForMain && (
        <IconPickerModal
          isOpen={true}
          onClose={() => setIconModalForMain(null)}
          onSelect={(iconName) => {
            updateMainItem(iconModalForMain, { icon_name: iconName });
            setIconModalForMain(null);
          }}
          icons={icons}
          currentIcon={
            mainItems.find((m) => m.id === iconModalForMain)?.icon_name ?? null
          }
        />
      )}

      {/* Icon picker for sub items */}
      {iconModalForSub && (
        <IconPickerModal
          isOpen={true}
          onClose={() => setIconModalForSub(null)}
          onSelect={(iconName) => {
            updateSubItem(iconModalForSub, { icon_name: iconName });
            setIconModalForSub(null);
          }}
          icons={icons}
          currentIcon={
            subItems.find((s) => s.id === iconModalForSub)?.icon_name ?? null
          }
        />
      )}

      {/* Image picker for sub items */}
      {imageModalForSub && (
        <SiteImagePickerModal
          isOpen={true}
          onClose={() => setImageModalForSub(null)}
          currentImageId={
            subItems.find((s) => s.id === imageModalForSub)?.site_image_id ?? null
          }
          onSelect={(siteId, imageId, previewUrl) => {
            updateSubItem(imageModalForSub, {
              site_id: siteId,
              site_image_id: imageId,
              _previewUrl: previewUrl ?? undefined,
            });
          }}
        />
      )}
    </AdminGuard>
  );
}
