"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabase/browser";
import IconPickerModal from "@/components/IconPickerModal"; // already exists :contentReference[oaicite:1]{index=1}

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
};

/* ------------------ Site + Image Picker (inline) ------------------ */

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
  onSelect: (siteId: string | null, imageId: string | null) => void;
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
    setImages(((data as any[]) || []).map((i) => ({
      id: i.id,
      storage_path: i.storage_path,
      caption: i.caption,
    })));
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Select preview image
          </h3>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-gray-400 hover:text-gray-700"
          >
            &times;
          </button>
        </div>

        {step === "search" && (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sites by title…"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={searchSites}
                className="rounded-md bg-[var(--brand-orange)] px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
              >
                Search
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading && <p className="text-sm text-gray-500">Loading…</p>}
              {!loading && sites.length === 0 && (
                <p className="text-sm text-gray-500">No sites yet.</p>
              )}
              <ul className="divide-y text-sm">
                {sites.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => loadImages(s)}
                      className="flex w-full items-center justify-between px-2 py-2 hover:bg-gray-50"
                    >
                      <span>{s.title}</span>
                      <span className="text-xs text-gray-400">
                        View images →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {step === "images" && selectedSite && (
          <div className="flex flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {selectedSite.title}
                </p>
                <p className="text-xs text-gray-500">
                  Select one image as header preview
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep("search")}
                className="text-xs text-blue-600 hover:underline"
              >
                ← Back to search
              </button>
            </div>
            <div className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto md:grid-cols-4">
              {loading && (
                <p className="col-span-full text-sm text-gray-500">
                  Loading images…
                </p>
              )}
              {!loading &&
                images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      onSelect(selectedSite.id, img.id);
                      onClose();
                    }}
                    className={`group relative overflow-hidden rounded-md border-2 ${
                      currentImageId === img.id
                        ? "border-[var(--brand-orange)]"
                        : "border-gray-200 hover:border-[var(--brand-orange)]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.storage_path}
                      alt={img.caption ?? ""}
                      className="h-28 w-full object-cover"
                    />
                    {img.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/40 p-1 text-[10px] text-white">
                        {img.caption}
                      </div>
                    )}
                  </button>
                ))}
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

  // Icon picker state
  const [iconModalForMain, setIconModalForMain] = useState<string | null>(null);
  const [iconModalForSub, setIconModalForSub] = useState<string | null>(null);

  // Image picker state
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

      setMainItems((main as any[]) || []);
      setSubItems((subs as any[]) || []);
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
    setMessage("Saving…");

    try {
      const now = new Date().toISOString();

      const { error: mainErr } = await supabase
        .from("header_main_items")
        .upsert(
          mainItems.map((m) => ({
            ...m,
            updated_at: now,
          }))
        );
      if (mainErr) throw mainErr;

      const { error: subErr } = await supabase
        .from("header_sub_items")
        .upsert(
          subItems.map((s) => ({
            ...s,
            updated_at: now,
          }))
        );
      if (subErr) throw subErr;

      setMessage("Saved successfully.");
    } catch (e: any) {
      console.error(e);
      setMessage("Error while saving header. Check console.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100/70 text-slate-800">
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold">
                <Icon name="admin" size={30} />
                Header Editor
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Manage main navigation, mega menu sub-items, icons and preview
                photos.
              </p>
            </div>
            <Link
              href="/admin"
              className="text-sm text-[var(--brand-orange)] hover:underline"
            >
              ← Back to Admin Dashboard
            </Link>
          </div>

          {message && (
            <div className="mb-4 rounded-md bg-white px-3 py-2 text-sm text-slate-700 shadow">
              {saving ? "⏳ " : ""} {message}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={addMainItem}
              className="rounded-md bg-[var(--brand-orange)] px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              + Add main menu
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : mainItems.length === 0 ? (
            <p className="text-sm text-slate-600">
              No main menu items yet. Click “Add main menu” to create one.
            </p>
          ) : (
            <div className="space-y-5">
              {mainItems
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl bg-white p-4 shadow-sm border border-slate-200"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="flex gap-2">
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-slate-700">
                              Label
                            </label>
                            <input
                              value={m.label}
                              onChange={(e) =>
                                updateMainItem(m.id, {
                                  label: e.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-slate-700">
                              Slug (internal)
                            </label>
                            <input
                              value={m.slug}
                              onChange={(e) =>
                                updateMainItem(m.id, {
                                  slug: e.target.value,
                                })
                              }
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-mono"
                            />
                          </div>
                          <div className="w-1/3">
                            <label className="block text-xs font-medium text-slate-700">
                              URL (optional)
                            </label>
                            <input
                              value={m.url ?? ""}
                              onChange={(e) =>
                                updateMainItem(m.id, {
                                  url: e.target.value || null,
                                })
                              }
                              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIconModalForMain(m.id)}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 text-xs"
                          >
                            {m.icon_name ? (
                              <>
                                <Icon name={m.icon_name} size={16} />
                                <span>{m.icon_name}</span>
                              </>
                            ) : (
                              <span>Select icon…</span>
                            )}
                          </button>
                          <span className="text-xs text-slate-500">
                            Sort: {m.sort_order}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMainItem(m.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Sub items */}
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Sub menu items
                        </span>
                        <button
                          type="button"
                          onClick={() => addSubItem(m.id)}
                          className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-100"
                        >
                          + Add sub item
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(subsByMain[m.id] || [])
                          .slice()
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((s) => (
                            <div
                              key={s.id}
                              className="grid gap-2 rounded-md bg-white p-2 text-xs md:grid-cols-[2fr_2fr_1.5fr_auto]"
                            >
                              <div>
                                <label className="text-[11px] font-medium text-slate-600">
                                  Label (left column)
                                </label>
                                <input
                                  value={s.label}
                                  onChange={(e) =>
                                    updateSubItem(s.id, {
                                      label: e.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => setIconModalForSub(s.id)}
                                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                                >
                                  {s.icon_name ? (
                                    <>
                                      <Icon name={s.icon_name} size={14} />
                                      <span>{s.icon_name}</span>
                                    </>
                                  ) : (
                                    <span>Select icon…</span>
                                  )}
                                </button>
                              </div>
                              <div>
                                <label className="text-[11px] font-medium text-slate-600">
                                  Title (right side)
                                </label>
                                <input
                                  value={s.title ?? ""}
                                  onChange={(e) =>
                                    updateSubItem(s.id, {
                                      title: e.target.value || null,
                                    })
                                  }
                                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                                />
                                <label className="mt-1 block text-[11px] font-medium text-slate-600">
                                  Detail
                                </label>
                                <textarea
                                  value={s.detail ?? ""}
                                  onChange={(e) =>
                                    updateSubItem(s.id, {
                                      detail: e.target.value || null,
                                    })
                                  }
                                  rows={2}
                                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-medium text-slate-600">
                                  URL
                                </label>
                                <input
                                  value={s.url ?? ""}
                                  onChange={(e) =>
                                    updateSubItem(s.id, {
                                      url: e.target.value || null,
                                    })
                                  }
                                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => setImageModalForSub(s.id)}
                                  className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] hover:bg-slate-100"
                                >
                                  {s.site_image_id
                                    ? "Change image…"
                                    : "Choose image…"}
                                </button>
                              </div>
                              <div className="flex flex-col items-end justify-between">
                                <span className="text-[11px] text-slate-500">
                                  Sort: {s.sort_order}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeSubItem(s.id)}
                                  className="text-[11px] text-red-500 hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

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
                mainItems.find((m) => m.id === iconModalForMain)?.icon_name ??
                null
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
                subItems.find((s) => s.id === iconModalForSub)?.icon_name ??
                null
              }
            />
          )}

          {/* Image picker for sub items */}
          {imageModalForSub && (
            <SiteImagePickerModal
              isOpen={true}
              onClose={() => setImageModalForSub(null)}
              currentImageId={
                subItems.find((s) => s.id === imageModalForSub)?.site_image_id ??
                null
              }
              onSelect={(siteId, imageId) => {
                updateSubItem(imageModalForSub, {
                  site_id: siteId,
                  site_image_id: imageId,
                });
              }}
            />
          )}
        </main>
      </div>
    </AdminGuard>
  );
}
