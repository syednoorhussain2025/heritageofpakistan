"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import IconPickerModal from "@/components/IconPickerModal";
import { supabase } from "@/lib/supabase/browser";

/* ─────────────────────────── Types ─────────────────────────── */
type IconRow = { name: string; svg_content: string };

type Site = {
  id: string;
  title: string;
  cover_photo_thumb_url: string | null;
  location_free: string | null;
};

type Bucket = {
  id: string;
  label: string;
  icon_key: string | null;
  sort_order: number;
  is_active: boolean;
  category_ids: string[];
};

type Category = { id: string; name: string; parent_id: string | null };

type Tab = "popular" | "buckets";

/* ─────────────────────────── Page root ─────────────────────────── */
export default function ExploreAdminPage() {
  return (
    <AdminGuard>
      <Main />
    </AdminGuard>
  );
}

function Main() {
  const [tab, setTab] = useState<Tab>("popular");
  const [allIcons, setAllIcons] = useState<IconRow[]>([]);

  useEffect(() => {
    supabase
      .from("icons")
      .select("name,svg_content")
      .order("name")
      .then(({ data }) => setAllIcons((data as IconRow[]) ?? []));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800">
      <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Explore Page</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage popular sites and type buckets for the mobile Explore screen.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors"
          >
            <Icon name="arrow-left" size={13} />
            Dashboard
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 shadow-sm ring-1 ring-slate-200 w-fit">
          {(["popular", "buckets"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t
                  ? "bg-[var(--brand-blue)] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t === "popular" ? "Popular Sites" : "Type Buckets"}
            </button>
          ))}
        </div>

        {tab === "popular" ? (
          <PopularSitesTab />
        ) : (
          <TypeBucketsTab allIcons={allIcons} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 — Popular Sites
═══════════════════════════════════════════════════════════════ */
function PopularSitesTab() {
  const [selected, setSelected] = useState<Site[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Site[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Load existing selection */
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "explore_popular_sites")
        .maybeSingle();

      const ids: string[] = data?.value?.site_ids ?? [];
      if (!ids.length) { setLoading(false); return; }

      const { data: sites } = await supabase
        .from("sites")
        .select("id,title,cover_photo_thumb_url,location_free")
        .in("id", ids);

      if (sites) {
        const ordered = ids
          .map((id) => (sites as Site[]).find((s) => s.id === id))
          .filter(Boolean) as Site[];
        setSelected(ordered);
      }
      setLoading(false);
    })();
  }, []);

  /* Live search */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("sites")
        .select("id,title,cover_photo_thumb_url,location_free")
        .ilike("title", `%${q}%`)
        .eq("is_published", true)
        .is("deleted_at", null)
        .order("title")
        .limit(12);
      setResults((data as Site[]) ?? []);
      setSearching(false);
    }, 250);
  }, [query]);

  const add = (site: Site) => {
    if (selected.length >= 10) return;
    if (selected.find((s) => s.id === site.id)) return;
    setSelected((prev) => [...prev, site]);
    setQuery("");
    setResults([]);
  };

  const remove = (id: string) =>
    setSelected((prev) => prev.filter((s) => s.id !== id));

  const moveUp = (i: number) => {
    if (i === 0) return;
    setSelected((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const moveDown = (i: number) => {
    setSelected((prev) => {
      if (i === prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    await supabase
      .from("app_settings")
      .upsert(
        [{ key: "explore_popular_sites", value: { site_ids: selected.map((s) => s.id) } }],
        { onConflict: "key" }
      );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const alreadySelected = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected]
  );

  return (
    <div className="space-y-6">
      {/* Selected list */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Selected Sites</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {selected.length} / 10 — shown as suggestions in the Explore search sheet
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--brand-blue)] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60 transition-all flex items-center gap-2"
          >
            {saving ? (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : saved ? (
              <Icon name="check" size={13} />
            ) : (
              <Icon name="save" size={13} />
            )}
            {saved ? "Saved!" : "Save"}
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : selected.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">
            No sites selected yet. Search below to add some.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {selected.map((site, i) => (
              <li key={site.id} className="flex items-center gap-3 px-5 py-3">
                {/* Thumbnail */}
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                  {site.cover_photo_thumb_url ? (
                    <img
                      src={site.cover_photo_thumb_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <Icon name="image" size={16} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{site.title}</div>
                  {site.location_free && (
                    <div className="text-xs text-slate-400 truncate">{site.location_free}</div>
                  )}
                </div>

                {/* Reorder */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="w-6 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                  >
                    <Icon name="chevron-up" size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === selected.length - 1}
                    className="w-6 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-20 transition-colors"
                  >
                    <Icon name="chevron-down" size={11} />
                  </button>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => remove(site.id)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Icon name="times" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Search to add */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Add a Site</h2>
          <p className="text-xs text-slate-500 mt-0.5">Search published sites by name</p>
        </div>
        <div className="px-5 py-4">
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30 focus:border-[var(--brand-blue)] transition-all"
            />
          </div>

          {searching && (
            <div className="mt-3 text-xs text-slate-400 text-center">Searching…</div>
          )}

          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              {results.map((site) => {
                const already = alreadySelected.has(site.id);
                const full = selected.length >= 10;
                return (
                  <li
                    key={site.id}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                      already || full
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-slate-50 cursor-pointer"
                    }`}
                    onClick={() => !already && !full && add(site)}
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                      {site.cover_photo_thumb_url ? (
                        <img src={site.cover_photo_thumb_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Icon name="image" size={14} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{site.title}</div>
                      {site.location_free && (
                        <div className="text-xs text-slate-400 truncate">{site.location_free}</div>
                      )}
                    </div>
                    {already ? (
                      <span className="text-xs text-slate-400">Added</span>
                    ) : full ? (
                      <span className="text-xs text-slate-400">Full</span>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-[var(--brand-blue)]/10 flex items-center justify-center text-[var(--brand-blue)]">
                        <Icon name="plus" size={12} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2 — Type Buckets
═══════════════════════════════════════════════════════════════ */
function TypeBucketsTab({ allIcons }: { allIcons: IconRow[] }) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [reordering, setReordering] = useState(false);

  /* Load buckets + categories */
  useEffect(() => {
    (async () => {
      const [{ data: bData }, { data: bcData }, { data: cData }] =
        await Promise.all([
          supabase
            .from("explore_type_buckets")
            .select("id,label,icon_key,sort_order,is_active")
            .order("sort_order"),
          supabase
            .from("explore_bucket_categories")
            .select("bucket_id,category_id"),
          supabase
            .from("categories")
            .select("id,name,parent_id")
            .order("name"),
        ]);

      const catMap: Record<string, string[]> = {};
      ((bcData ?? []) as { bucket_id: string; category_id: string }[]).forEach(
        ({ bucket_id, category_id }) => {
          if (!catMap[bucket_id]) catMap[bucket_id] = [];
          catMap[bucket_id].push(category_id);
        }
      );

      setBuckets(
        ((bData ?? []) as Omit<Bucket, "category_ids">[]).map((b) => ({
          ...b,
          category_ids: catMap[b.id] ?? [],
        }))
      );
      setCategories((cData as Category[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const openNew = () => {
    setEditingBucket({
      id: "",
      label: "",
      icon_key: null,
      sort_order: buckets.length,
      is_active: true,
      category_ids: [],
    });
    setIsNew(true);
    setCatSearch("");
  };

  const openEdit = (b: Bucket) => {
    setEditingBucket({ ...b, category_ids: [...b.category_ids] });
    setIsNew(false);
    setCatSearch("");
  };

  const saveBucket = async () => {
    if (!editingBucket || !editingBucket.label.trim()) return;
    setSaving(true);

    if (isNew) {
      const { data: inserted, error } = await supabase
        .from("explore_type_buckets")
        .insert({
          label: editingBucket.label.trim(),
          icon_key: editingBucket.icon_key,
          sort_order: editingBucket.sort_order,
          is_active: editingBucket.is_active,
        })
        .select("id")
        .single();

      if (error || !inserted) { setSaving(false); return; }

      const bucketId = inserted.id;

      if (editingBucket.category_ids.length) {
        await supabase.from("explore_bucket_categories").insert(
          editingBucket.category_ids.map((cid) => ({
            bucket_id: bucketId,
            category_id: cid,
          }))
        );
      }

      const newBucket: Bucket = { ...editingBucket, id: bucketId };
      setBuckets((prev) => [...prev, newBucket]);
    } else {
      await supabase
        .from("explore_type_buckets")
        .update({
          label: editingBucket.label.trim(),
          icon_key: editingBucket.icon_key,
          is_active: editingBucket.is_active,
        })
        .eq("id", editingBucket.id);

      await supabase
        .from("explore_bucket_categories")
        .delete()
        .eq("bucket_id", editingBucket.id);

      if (editingBucket.category_ids.length) {
        await supabase.from("explore_bucket_categories").insert(
          editingBucket.category_ids.map((cid) => ({
            bucket_id: editingBucket.id,
            category_id: cid,
          }))
        );
      }

      setBuckets((prev) =>
        prev.map((b) => (b.id === editingBucket.id ? editingBucket : b))
      );
    }

    setSaving(false);
    setEditingBucket(null);
  };

  const deleteBucket = async (id: string) => {
    if (!confirm("Delete this bucket?")) return;
    await supabase.from("explore_type_buckets").delete().eq("id", id);
    setBuckets((prev) => prev.filter((b) => b.id !== id));
    if (editingBucket?.id === id) setEditingBucket(null);
  };

  const moveUp = async (i: number) => {
    if (i === 0) return;
    const next = [...buckets];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setBuckets(next);
    await saveOrder(next);
  };

  const moveDown = async (i: number) => {
    if (i === buckets.length - 1) return;
    const next = [...buckets];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setBuckets(next);
    await saveOrder(next);
  };

  const saveOrder = async (ordered: Bucket[]) => {
    setReordering(true);
    await Promise.all(
      ordered.map((b, idx) =>
        supabase
          .from("explore_type_buckets")
          .update({ sort_order: idx })
          .eq("id", b.id)
      )
    );
    setReordering(false);
  };

  const toggleCategory = (catId: string) => {
    if (!editingBucket) return;
    const has = editingBucket.category_ids.includes(catId);
    setEditingBucket((prev) =>
      prev
        ? {
            ...prev,
            category_ids: has
              ? prev.category_ids.filter((id) => id !== catId)
              : [...prev.category_ids, catId],
          }
        : prev
    );
  };

  const filteredCats = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    return q
      ? categories.filter((c) => c.name.toLowerCase().includes(q))
      : categories;
  }, [categories, catSearch]);

  if (loading) {
    return (
      <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left — bucket list */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Type Buckets</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Plain-language categories shown in the Type chip sheet
            </p>
          </div>
          <div className="flex items-center gap-2">
            {reordering && (
              <span className="text-xs text-slate-400">Saving order…</span>
            )}
            <button
              type="button"
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-blue)] text-white text-xs font-semibold hover:brightness-110 transition-all"
            >
              <Icon name="plus" size={11} />
              New
            </button>
          </div>
        </div>

        {buckets.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">
            No buckets yet. Create your first one.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {buckets.map((b, i) => (
              <li
                key={b.id}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
                  editingBucket?.id === b.id
                    ? "bg-[var(--brand-blue)]/5"
                    : "hover:bg-slate-50"
                }`}
                onClick={() => openEdit(b)}
              >
                {/* Icon */}
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  {b.icon_key ? (
                    <Icon name={b.icon_key} size={16} className="text-[var(--brand-orange)]" />
                  ) : (
                    <div className="w-4 h-4 rounded bg-slate-300" />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${b.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                    {b.label}
                  </div>
                  <div className="text-xs text-slate-400">
                    {b.category_ids.length} categor{b.category_ids.length === 1 ? "y" : "ies"}
                  </div>
                </div>

                {/* Reorder */}
                <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="w-6 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-20"
                  >
                    <Icon name="chevron-up" size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === buckets.length - 1}
                    className="w-6 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-20"
                  >
                    <Icon name="chevron-down" size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right — edit panel */}
      {editingBucket && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">
              {isNew ? "New Bucket" : "Edit Bucket"}
            </h2>
            <button
              type="button"
              onClick={() => setEditingBucket(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Icon name="times" size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Icon picker trigger */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Icon
              </label>
              <button
                type="button"
                onClick={() => setIconPickerOpen(true)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-[var(--brand-orange)] transition-colors w-full"
              >
                {editingBucket.icon_key ? (
                  <Icon
                    name={editingBucket.icon_key}
                    size={20}
                    className="text-[var(--brand-orange)]"
                  />
                ) : (
                  <div className="w-5 h-5 rounded bg-slate-200" />
                )}
                <span className="text-sm text-slate-600">
                  {editingBucket.icon_key ?? "Select an icon"}
                </span>
              </button>
            </div>

            {/* Label */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Label
              </label>
              <input
                type="text"
                value={editingBucket.label}
                onChange={(e) =>
                  setEditingBucket((prev) =>
                    prev ? { ...prev, label: e.target.value } : prev
                  )
                }
                placeholder="e.g. Forts & Citadels"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30 focus:border-[var(--brand-blue)] transition-all"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active
              </span>
              <button
                type="button"
                onClick={() =>
                  setEditingBucket((prev) =>
                    prev ? { ...prev, is_active: !prev.is_active } : prev
                  )
                }
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  editingBucket.is_active
                    ? "bg-[var(--brand-blue)]"
                    : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    editingBucket.is_active ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            {/* Category mapping */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Mapped Categories ({editingBucket.category_ids.length} selected)
              </label>
              <input
                type="text"
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                placeholder="Search categories…"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30 focus:border-[var(--brand-blue)] transition-all mb-2"
              />
              <div className="rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
                {filteredCats.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400 text-center">
                    No categories found
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {filteredCats.map((cat) => {
                      const checked = editingBucket.category_ids.includes(cat.id);
                      return (
                        <li
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                            checked
                              ? "bg-[var(--brand-blue)]/5 text-[var(--brand-blue)]"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors ${
                              checked
                                ? "bg-[var(--brand-blue)] border-[var(--brand-blue)]"
                                : "border-slate-300"
                            }`}
                          >
                            {checked && (
                              <Icon name="check" size={9} className="text-white" />
                            )}
                          </div>
                          <span className="truncate">{cat.name}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
            <button
              type="button"
              onClick={saveBucket}
              disabled={saving || !editingBucket.label.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              {saving ? (
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Icon name="save" size={13} />
              )}
              {saving ? "Saving…" : "Save Bucket"}
            </button>
            {!isNew && (
              <button
                type="button"
                onClick={() => deleteBucket(editingBucket.id)}
                className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm font-semibold hover:bg-red-100 transition-colors flex items-center gap-1.5"
              >
                <Icon name="trash" size={13} />
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Icon picker modal */}
      <IconPickerModal
        isOpen={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        icons={allIcons}
        currentIcon={editingBucket?.icon_key ?? null}
        onSelect={(name) => {
          setEditingBucket((prev) =>
            prev ? { ...prev, icon_key: name } : prev
          );
          setIconPickerOpen(false);
        }}
      />
    </div>
  );
}
