"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

/* ---------- Config ---------- */
const MASTER_IMG_BUCKET = "master_site_images";

/* ---------- Types ---------- */
type MasterSite = {
  id: string;
  name: string;
  slug: string;
  province_id: number;
  latitude: number | null;
  longitude: number | null;
  priority: "A" | "B" | "C";
  unesco_status: "none" | "inscribed" | "tentative";
  photographed: boolean;
  added_to_website: boolean;
  public_site_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Province = { id: number; name: string; slug?: string };
type Region = { id: string; name: string };
type Category = { id: string; name: string };
type PublicSite = { id: string; title: string; slug: string; province_id?: number | null };

type MasterSiteImage = {
  id: string;
  master_site_id: string;
  path: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  alt_text: string | null;
  created_at: string;
};

export default function MasterSiteModal({
  onClose,
  onSaved,
  provinces,
  allRegions,
  allCategories,
  initial,
}: {
  onClose: () => void;
  onSaved: () => void;
  provinces: Province[];
  allRegions: Region[];
  allCategories: Category[];
  initial: MasterSite | null;
}) {
  /* ---------- Form state ---------- */
  const [name, setName] = useState<string>(initial?.name || "");
  const [slug, setSlug] = useState<string>(initial?.slug || "");

  const [provinceId, setProvinceId] = useState<number>(
    initial?.province_id || provinces[0]?.id || 1
  );
  const [lat, setLat] = useState<string>(
    initial?.latitude != null ? String(initial.latitude) : ""
  );
  const [lng, setLng] = useState<string>(
    initial?.longitude != null ? String(initial.longitude) : ""
  );

  const [priority, setPriority] = useState<"A" | "B" | "C">(initial?.priority || "B");
  const [unesco, setUnesco] = useState<"none" | "inscribed" | "tentative">(
    initial?.unesco_status || "none"
  );

  const [photographed, setPhotographed] = useState<boolean>(initial?.photographed || false);
  const [completed, setCompleted] = useState<boolean>(initial?.added_to_website || false);

  const [publicSite, setPublicSite] = useState<PublicSite | null>(null);
  const [notes, setNotes] = useState<string>(initial?.notes || "");

  // taxonomy (normalized)
  const [regionIds, setRegionIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);

  // images (single)
  const [images, setImages] = useState<MasterSiteImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // master id (works for both edit and new)
  const [masterId, setMasterId] = useState<string | null>(initial?.id || null);

  // image preview
  const [showPreview, setShowPreview] = useState(false);

  /* ---------- Load existing relations & image when editing ---------- */
  useEffect(() => {
    if (!initial) return;
    (async () => {
      const [{ data: rs }, { data: cs }] = await Promise.all([
        supabase
          .schema("admin_core")
          .from("master_site_regions")
          .select("region_id")
          .eq("master_site_id", initial.id),
        supabase
          .schema("admin_core")
          .from("master_site_categories")
          .select("category_id")
          .eq("master_site_id", initial.id),
      ]);
      setRegionIds((rs || []).map((r: any) => r.region_id));
      setCategoryIds((cs || []).map((c: any) => c.category_id));

      if (initial.public_site_id) {
        const { data: pub } = await supabase
          .from("sites")
          .select("id, title, slug, province_id")
          .eq("id", initial.public_site_id)
          .maybeSingle();
        if (pub) setPublicSite(pub as PublicSite);
      }

      const { data: imgs } = await supabase
        .schema("admin_core")
        .from("master_site_images")
        .select("*")
        .eq("master_site_id", initial.id)
        .order("created_at", { ascending: false })
        .limit(1);
      setImages((imgs || []) as MasterSiteImage[]);
      setMasterId(initial.id);
    })();
  }, [initial]);

  /* ---------- Helpers ---------- */
  function slugify(s: string) {
    return s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function publicUrl(path: string) {
    const { data } = supabase.storage.from(MASTER_IMG_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function compressToJpeg(file: File, maxDim = 1600, quality = 0.82) {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b as Blob), "image/jpeg", quality)
    );
    return { blob, width: w, height: h, bytes: blob.size };
  }

  /** Ensure we have a master row; if not, create a draft using current form values. */
  async function ensureMasterId(): Promise<string | null> {
    if (masterId) return masterId;
    if (!name.trim()) {
      alert("Enter a Site Name before adding an image.");
      return null;
    }
    const safeSlug = slugify(name);
    setSlug(safeSlug);

    const payload = {
      name: name.trim(),
      slug: safeSlug,
      province_id: provinceId,
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
      priority,
      unesco_status: unesco,
      photographed,
      added_to_website: completed,
      public_site_id: completed ? publicSite?.id ?? null : null,
      notes: notes || null,
    };

    const { data: inserted, error } = await supabase
      .schema("admin_core")
      .from("master_sites")
      .insert(payload)
      .select()
      .single();

    if (error) {
      alert(error.message || "Could not create the site.");
      return null;
    }
    setMasterId(inserted.id);
    return inserted.id as string;
  }

  async function handlePickImage() {
    const id = await ensureMasterId();
    if (!id) return;
    fileInputRef.current?.click();
  }

  async function handleUpload(file: File) {
    const id = await ensureMasterId();
    if (!id) return;

    setUploading(true);
    try {
      const { blob, width, height, bytes } = await compressToJpeg(file);
      const safeSlug = slug || slugify(name) || "site";
      const key = `${id}/${Date.now()}-${safeSlug}.jpg`;

      const { error: upErr } = await supabase.storage
        .from(MASTER_IMG_BUCKET)
        .upload(key, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;

      const { data: inserted, error: dbErr } = await supabase
        .schema("admin_core")
        .from("master_site_images")
        .insert({
          master_site_id: id,
          path: key,
          width,
          height,
          bytes,
          alt_text: null,
        })
        .select()
        .single();
      if (dbErr) throw dbErr;

      // single-photo rule: remove older one if present
      if (images[0]) {
        await Promise.all([
          supabase
            .schema("admin_core")
            .from("master_site_images")
            .delete()
            .eq("id", images[0].id),
          supabase.storage.from(MASTER_IMG_BUCKET).remove([images[0].path]),
        ]);
      }

      setImages([inserted as MasterSiteImage]);
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteImage() {
    const img = images[0];
    if (!img) return;
    if (!confirm("Delete this image?")) return;
    const [{ error: delRowErr }, { error: delFileErr }] = await Promise.all([
      supabase
        .schema("admin_core")
        .from("master_site_images")
        .delete()
        .eq("id", img.id),
      supabase.storage.from(MASTER_IMG_BUCKET).remove([img.path]),
    ]);
    if (delRowErr || delFileErr) {
      alert(delRowErr?.message || delFileErr?.message || "Delete failed");
      return;
    }
    setImages([]);
  }

  /* ---------- Save (create or update) ---------- */
  async function save() {
    if (!name.trim()) return alert("Please enter a name.");

    const safeSlug = slugify(name);
    if (slug !== safeSlug) setSlug(safeSlug);

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        slug: safeSlug,
        province_id: provinceId,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,
        priority,
        unesco_status: unesco,
        photographed,
        added_to_website: completed,
        public_site_id: completed ? publicSite?.id ?? null : null,
        notes: notes || null,
      };

      let id = masterId;

      if (!id) {
        const { data: inserted, error } = await supabase
          .schema("admin_core")
          .from("master_sites")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        id = inserted.id;
        setMasterId(id);
      } else {
        const { error } = await supabase
          .schema("admin_core")
          .from("master_sites")
          .update(payload)
          .eq("id", id);
        if (error) throw error;

        await supabase
          .schema("admin_core")
          .from("master_site_regions")
          .delete()
          .eq("master_site_id", id);
        await supabase
          .schema("admin_core")
          .from("master_site_categories")
          .delete()
          .eq("master_site_id", id);
      }

      if (regionIds.length) {
        await supabase
          .schema("admin_core")
          .from("master_site_regions")
          .insert(regionIds.map((rid) => ({ master_site_id: id, region_id: rid })));
      }
      if (categoryIds.length) {
        await supabase
          .schema("admin_core")
          .from("master_site_categories")
          .insert(categoryIds.map((cid) => ({ master_site_id: id, category_id: cid })));
      }

      onSaved();
    } catch (e: any) {
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- UI bits ---------- */
  function PriorityButton({ v }: { v: "A" | "B" | "C" }) {
    const active = priority === v;
    return (
      <button
        type="button"
        onClick={() => setPriority(v)}
        className={`px-4 py-2 rounded-md font-semibold border transition
          ${active ? "bg-[#0f2746] text-white border-[#0f2746]" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
      >
        {v}
      </button>
    );
  }

  /* ---------- Render ---------- */
  const thumb = images[0];

  // Close preview on ESC
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setShowPreview(false);
    }
    if (showPreview) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [showPreview]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* panel */}
      <div className="relative w-full sm:max-w-5xl bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[95vh] flex flex-col">
        {/* header */}
        <div className="px-4 sm:px-6 py-3 border-b bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
              {initial ? "Edit Site" : "Add Site"}
            </h2>
            <button onClick={onClose} className="text-slate-600 hover:text-slate-900">✕</button>
          </div>
        </div>

        {/* body */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-4">
              {/* Site name + province stack, image on right */}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0 space-y-3">
                  <label className="block">
                    <div className="font-medium mb-1">Site Name</div>
                    <input
                      className="w-full border border-slate-300 rounded-md px-3 py-2"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!initial) setSlug(slugify(e.target.value));
                      }}
                    />
                  </label>
                  <label className="block">
                    <div className="font-medium mb-1">Province</div>
                    <select
                      className="w-full border border-slate-300 rounded-md px-3 py-2"
                      value={provinceId}
                      onChange={(e) => setProvinceId(Number(e.target.value))}
                    >
                      {provinces.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Enlarged one-photo widget */}
                <div className="w-[220px] shrink-0">
                  <div className="font-medium mb-1 invisible sm:visible sm:h-0">Image</div>
                  <div className="border border-slate-200 rounded-md bg-white p-3">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb ? publicUrl(thumb.path) : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="}
                        alt=""
                        className={`w-full h-32 object-cover rounded ${thumb ? "cursor-zoom-in" : "bg-slate-100"}`}
                        onClick={() => {
                          if (thumb) setShowPreview(true);
                        }}
                        draggable={false}
                      />
                      {thumb && (
                        <button
                          type="button"
                          onClick={handleDeleteImage}
                          className="absolute top-1.5 right-1.5 text-xs px-2 py-0.5 rounded bg-white/90 border border-slate-300 hover:bg-white"
                          title="Delete"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={handlePickImage}
                      className="mt-3 w-full px-2 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 text-sm disabled:opacity-60"
                    >
                      {uploading ? "Uploading…" : thumb ? "Replace image" : "Add image"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUpload(f);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="font-medium mb-1">Latitude</div>
                  <input
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                    inputMode="decimal"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="24.8607"
                  />
                </label>
                <label className="block">
                  <div className="font-medium mb-1">Longitude</div>
                  <input
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                    inputMode="decimal"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="67.0011"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="font-medium">Priority</div>
                <div className="flex gap-2">
                  <PriorityButton v="A" />
                  <PriorityButton v="B" />
                  <PriorityButton v="C" />
                </div>

                <div className="flex flex-wrap gap-8 pt-2">
                  <label className="inline-flex items-center gap-3 select-none">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-emerald-600"
                      checked={photographed}
                      onChange={(e) => setPhotographed(e.target.checked)}
                    />
                    <span className="text-[15px]">Photographed (Visited)</span>
                  </label>

                  <label className="inline-flex items-center gap-3 select-none">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-emerald-600"
                      checked={completed}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setCompleted(next);
                        if (next) setSitePickerOpen(true);
                        else setPublicSite(null);
                      }}
                    />
                    <span className="text-[15px]">Completed</span>
                  </label>
                </div>
              </div>

              <label className="block">
                <div className="font-medium mb-1">UNESCO Status</div>
                <select
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  value={unesco}
                  onChange={(e) => setUnesco(e.target.value as any)}
                >
                  <option value="none">None</option>
                  <option value="inscribed">World Heritage List</option>
                  <option value="tentative">Tentative List</option>
                </select>
              </label>
            </div>

            {/* Right column */}
            <div>
              <MapPicker
                lat={lat}
                lng={lng}
                onPick={(la, ln) => {
                  setLat(la.toFixed(6));
                  setLng(ln.toFixed(6));
                }}
              />

              <div className="mt-3 grid grid-cols-1 gap-3">
                <MultiSearchSelect
                  label="Regions"
                  placeholder="Search regions…"
                  items={allRegions}
                  selected={regionIds}
                  setSelected={setRegionIds}
                  chipClass={{
                    base: "bg-[#e9eff6] text-[#0f2746] border border-[#b9c9dc]",
                    hover: "hover:bg-[#dbe7f3]",
                  }}
                />
                <MultiSearchSelect
                  label="Categories"
                  placeholder="Search categories…"
                  items={allCategories}
                  selected={categoryIds}
                  setSelected={setCategoryIds}
                  chipClass={{
                    base: "bg-[#f7e7df] text-[#8b3a2a] border border-[#e9c9bd]",
                    hover: "hover:bg-[#f2d9cd]",
                  }}
                />
              </div>

              <label className="block mt-3">
                <div className="font-medium mb-1">Notes</div>
                <textarea
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              {completed && (
                <div className="mt-3 text-sm text-slate-700">
                  {publicSite ? (
                    <>Linked to public site: <span className="font-medium">{publicSite.title}</span> <span className="text-slate-500">({publicSite.slug})</span></>
                  ) : (
                    <button onClick={() => setSitePickerOpen(true)} className="underline" style={{ color: "#0f2746" }}>
                      Choose public site…
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-4 sm:px-6 py-3 border-t bg-white sticky bottom-0 z-10">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-md text-white disabled:opacity-60"
              style={{ backgroundColor: "#0f2746" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {sitePickerOpen && (
        <PublicSitePicker
          provinces={provinces}
          onClose={() => setSitePickerOpen(false)}
          onSelect={(s) => {
            setPublicSite(s);
            setSitePickerOpen(false);
          }}
        />
      )}

      {/* Mid-sized image preview */}
      {showPreview && images[0] && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="relative rounded-lg shadow-2xl bg-black/20"
            style={{ width: "min(80vw, 960px)", height: "min(70vh, 600px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicUrl(images[0].path)}
              alt=""
              className="absolute inset-0 w-full h-full object-contain rounded-lg"
              draggable={false}
            />
            <button
              className="absolute -top-4 -right-4 text-white text-xl bg-black/70 rounded-full px-3 py-1"
              onClick={() => setShowPreview(false)}
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Compact multiselect with inline chips (no layout shift) ---------- */
function MultiSearchSelect<T extends { id: string; name: string }>({
  label,
  placeholder,
  items,
  selected,
  setSelected,
  chipClass,
}: {
  label: string;
  placeholder: string;
  items: T[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  chipClass?: { base: string; hover?: string };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedItems = useMemo(
    () => items.filter((i) => selected.includes(i.id)),
    [items, selected]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 50);
    return items.filter((it) => it.name.toLowerCase().includes(s)).slice(0, 50);
  }, [q, items]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="relative" ref={boxRef}>
      <label className="block mb-1 font-medium">{label}</label>

      {/* Field with inline chips and caret */}
      <div
        className="relative border border-slate-300 rounded-md bg-white px-2 py-1 min-h-[44px] cursor-text"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {/* chips + input */}
        <div className="flex flex-wrap items-center gap-1 pr-16 max-h-28 overflow-y-auto">
          {selectedItems.map((it) => (
            <span
              key={it.id}
              className={`inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full ${
                chipClass?.base ?? "bg-slate-100 text-slate-800 border border-slate-200"
              } ${chipClass?.hover ?? ""}`}
              title={it.name}
            >
              {it.name}
              <button
                type="button"
                className="opacity-80 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(it.id);
                }}
                aria-label={`Remove ${it.name}`}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={selectedItems.length ? "" : placeholder}
            className="min-w-[140px] flex-1 outline-none py-1 text-sm"
          />
        </div>

        {/* right badge */}
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">
          {selected.length ? `${selected.length} selected` : "—"}
        </span>
      </div>

      {/* dropdown */}
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-slate-300 rounded-md shadow-sm">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
          )}
          {filtered.map((it) => {
            const isOn = selected.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${
                  isOn ? "bg-slate-50" : ""
                }`}
                onClick={() => toggle(it.id)}
              >
                <span>{it.name}</span>
                <input type="checkbox" checked={isOn} readOnly className="h-4 w-4 pointer-events-none" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Public site picker ---------- */
function PublicSitePicker({
  provinces,
  onClose,
  onSelect,
}: {
  provinces: Province[];
  onClose: () => void;
  onSelect: (s: PublicSite) => void;
}) {
  const [q, setQ] = useState("");
  const [provinceId, setProvinceId] = useState<number | "">("");
  const [rows, setRows] = useState<PublicSite[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("sites")
      .select("id, title, slug, province_id")
      .order("title", { ascending: true })
      .limit(50);
    if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
    if (provinceId !== "") query = query.eq("province_id", provinceId);
    const { data } = await query;
    setRows((data || []) as PublicSite[]);
    setLoading(false);
  }, [q, provinceId]);

  useEffect(() => {
    search();
  }, [search]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[85vh] flex flex-col">
        <div className="px-4 sm:px-6 py-3 border-b bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Link public site</h3>
            <button onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title…"
              className="border border-slate-300 rounded-md px-3 py-2 sm:col-span-2"
            />
            <select
              value={provinceId}
              onChange={(e) => setProvinceId(e.target.value ? Number(e.target.value) : "")}
              className="border border-slate-300 rounded-md px-3 py-2"
            >
              <option value="">All provinces</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Slug</th>
                  <th className="px-3 py-2 text-left">Province</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-500">Searching…</td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-500">No results.</td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2 text-slate-500">{r.slug}</td>
                    <td className="px-3 py-2">
                      {provinces.find((p) => p.id === (r as any).province_id)?.name || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
                        onClick={() => onSelect(r)}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ---------- Google Map picker ---------- */
function MapPicker({
  lat,
  lng,
  onPick,
}: {
  lat: string;
  lng: string;
  onPick: (la: number, ln: number) => void;
}) {
  const [ready, setReady] = useState<boolean>(!!(globalThis as any)?.google?.maps);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if ((globalThis as any)?.google?.maps) {
      setReady(true);
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    const existing = document.getElementById("gmaps-script-lite");
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }
    const s = document.createElement("script");
    s.id = "gmaps-script-lite";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  const center = useMemo(() => {
    const la = Number(lat);
    const ln = Number(lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
    return { lat: 30.3753, lng: 69.3451 }; // Pakistan center
  }, [lat, lng]);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const g = (globalThis as any).google;
    const map = new g.maps.Map(containerRef.current, {
      center,
      zoom: 6,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: true,
      gestureHandling: "greedy",
    });
    const marker = new g.maps.Marker({ position: center, map, draggable: true });

    map.addListener("click", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      marker.setPosition(p);
      onPick(p.lat, p.lng);
    });
    marker.addListener("dragend", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      onPick(p.lat, p.lng);
    });

    // Places search
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search location…";
    Object.assign(input.style, {
      boxSizing: "border-box",
      border: "1px solid #d1d5db",
      borderRadius: "8px",
      width: "320px",
      height: "38px",
      padding: "0 12px",
      margin: "10px",
      background: "#fff",
      fontSize: "14px",
    } as CSSStyleDeclaration);
    map.controls[g.maps.ControlPosition.TOP_LEFT].push(input);

    let autocomplete: any;
    if (g.maps.places) {
      autocomplete = new g.maps.places.Autocomplete(input, { fields: ["geometry", "name", "formatted_address"] });
      autocomplete.bindTo("bounds", map);
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const loc = place?.geometry?.location;
        if (!loc) return;
        const p = { lat: loc.lat(), lng: loc.lng() };
        if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
        else { map.setCenter(p); map.setZoom(12); }
        marker.setPosition(p);
        onPick(p.lat, p.lng);
      });
    }

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      marker.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [ready]); // eslint-disable-line

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setPosition(center);
    map.setCenter(center);
  }, [center]);

  if (!ready) {
    return (
      <div className="h-56 w-full border border-slate-300 rounded-md grid place-items-center text-sm text-slate-600 bg-white">
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          ? "Loading map…"
          : "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable map"}
      </div>
    );
  }
  return <div ref={containerRef} className="h-56 w-full border border-slate-300 rounded-md bg-white" />;
}
