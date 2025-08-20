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
    <section className="border border-gray-200 rounded-xl p-4 md:p-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
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
    if (error) {
      alert(error.message);
      return;
    }
    setSite(data);
  }

  if (!site) {
    return (
      <main className="p-6">
        <div className="animate-pulse text-gray-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Listing</h1>
        <div className="flex gap-2">
          <Btn
            className={`${
              tab === "listing" ? "bg-black text-white" : "bg-gray-200"
            }`}
            onClick={() => setTab("listing")}
          >
            Listing
          </Btn>
          <Btn
            className={`${
              tab === "photo" ? "bg-black text-white" : "bg-gray-200"
            }`}
            onClick={() => setTab("photo")}
          >
            Photo Story
          </Btn>
        </div>
      </header>

      {tab === "listing" ? (
        <ListingForm value={site} onSave={saveSite} saving={saving} />
      ) : (
        <PhotoStory value={site} onSave={saveSite} saving={saving} />
      )}
    </main>
  );
}

/* ───────────────────────────── Listing Form ───────────────────────────── */

function ListingForm({
  value,
  onSave,
  saving,
}: {
  value: any;
  onSave: (next: any) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<any>(value);

  function set<K extends string>(key: K, val: any) {
    setForm((prev: any) => ({ ...prev, [key]: val }));
  }

  async function saveAll() {
    await onSave(form);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Section title="Basic">
        <div className="space-y-3">
          <Field label="Title">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>

          <Field label="Slug">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.slug ?? ""}
              onChange={(e) => set("slug", e.target.value)}
            />
          </Field>

          <Field label="Short Description">
            <textarea
              className="w-full border rounded px-3 py-2 min-h-[100px]"
              value={form.short_description ?? ""}
              onChange={(e) => set("short_description", e.target.value)}
            />
          </Field>

          <Field label="Full Description (Markdown)">
            <textarea
              className="w-full border rounded px-3 py-2 min-h-[200px]"
              value={form.full_description ?? ""}
              onChange={(e) => set("full_description", e.target.value)}
            />
          </Field>

          <div className="flex items-center gap-2 pt-2">
            <Btn
              className="bg-black text-white disabled:opacity-60"
              disabled={saving}
              onClick={saveAll}
            >
              {saving ? "Saving…" : "Save"}
            </Btn>
          </div>
        </div>
      </Section>

      <Section title="Location">
        <div className="space-y-3">
          <Field label="City">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.city ?? ""}
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>

          <Field label="Province / Region">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.region ?? ""}
              onChange={(e) => set("region", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.latitude ?? ""}
                onChange={(e) => set("latitude", e.target.value)}
              />
            </Field>
            <Field label="Longitude">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.longitude ?? ""}
                onChange={(e) => set("longitude", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Hero Image">
        <HeroImageEditor form={form} setForm={setForm} onSave={onSave} />
      </Section>

      <Section title="Meta">
        <div className="space-y-3">
          <Field label="Tags (comma separated)">
            <input
              className="w-full border rounded px-3 py-2"
              value={form.tags ?? ""}
              onChange={(e) => set("tags", e.target.value)}
            />
          </Field>

          <Field label="Published">
            <select
              className="w-full border rounded px-3 py-2"
              value={String(form.published ?? "false")}
              onChange={(e) => set("published", e.target.value === "true")}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </Field>
        </div>
      </Section>
    </div>
  );
}

/* ───────────────────────────── Hero Image UI ──────────────────────────── */

function HeroImageEditor({
  form,
  setForm,
  onSave,
}: {
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: (next: any) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const hero = form.hero_photo_url as string | null;

  async function uploadHero(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()!;
      const key = `hero/${form.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("photos")
        .upload(key, file, {
          cacheControl: "3600",
          upsert: true,
        });
      if (error) throw error;
      const url = await publicUrl("photos", key);
      setForm((prev: any) => ({ ...prev, hero_photo_url: url }));
      await onSave({ ...form, hero_photo_url: url });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function removeHero() {
    setForm((prev: any) => ({ ...prev, hero_photo_url: null }));
    await onSave({ ...form, hero_photo_url: null });
  }

  return (
    <div className="space-y-3">
      {hero ? (
        <div className="space-y-2">
          <img
            alt="Hero"
            src={hero}
            className="w-full h-56 object-cover rounded-md border"
          />
          <div className="flex gap-2">
            <Btn onClick={removeHero}>Remove</Btn>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-md py-10 cursor-pointer hover:bg-gray-50">
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await uploadHero(f);
            }}
          />
          <div className="text-sm text-gray-600">
            {uploading ? "Uploading…" : "Click to choose hero image"}
          </div>
        </label>
      )}
    </div>
  );
}

/* ───────────────────────────── Photo Story UI ─────────────────────────── */

function PhotoStory({
  value,
  onSave,
  saving,
}: {
  value: any;
  onSave: (next: any) => Promise<void>;
  saving: boolean;
}) {
  const [ps, setPs] = useState<any>({
    id: value.id,
    hero_photo_url: value.hero_photo_url ?? null,
    title: value.photo_story_title ?? "",
    subtitle: value.photo_story_subtitle ?? "",
    blocks: value.photo_story_blocks ?? [],
  });

  function set<K extends string>(key: K, val: any) {
    setPs((prev: any) => ({ ...prev, [key]: val }));
  }

  async function saveAll() {
    await onSave({
      ...value,
      hero_photo_url: ps.hero_photo_url,
      photo_story_title: ps.title,
      photo_story_subtitle: ps.subtitle,
      photo_story_blocks: ps.blocks,
    });
  }

  return (
    <div className="space-y-6">
      <Section title="Photo Story Header">
        <div className="space-y-3">
          <Field label="Title">
            <input
              className="w-full border rounded px-3 py-2"
              value={ps.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="Subtitle">
            <input
              className="w-full border rounded px-3 py-2"
              value={ps.subtitle}
              onChange={(e) => set("subtitle", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Blocks">
        <BlocksEditor value={ps.blocks} onChange={(b) => set("blocks", b)} />
      </Section>

      <div className="flex items-center gap-2">
        <Btn
          className="bg-black text-white disabled:opacity-60"
          disabled={saving}
          onClick={saveAll}
        >
          {saving ? "Saving…" : "Save Photo Story"}
        </Btn>
      </div>
    </div>
  );
}

/* ───────────────────────────── Blocks Editor ──────────────────────────── */

type Block =
  | { type: "paragraph"; text: string }
  | { type: "image"; url: string; caption?: string };

function BlocksEditor({
  value,
  onChange,
}: {
  value: Block[];
  onChange: (next: Block[]) => void;
}) {
  function addParagraph() {
    onChange([...value, { type: "paragraph", text: "" }]);
  }
  function addImage() {
    onChange([...value, { type: "image", url: "", caption: "" }]);
  }
  function setAt(i: number, next: Block) {
    const arr = value.slice();
    arr[i] = next;
    onChange(arr);
  }
  function removeAt(i: number) {
    const arr = value.slice();
    arr.splice(i, 1);
    onChange(arr);
  }

  return (
    <div className="space-y-4">
      {value.map((b, i) => (
        <div
          key={i}
          className="border rounded-md p-3 bg-gray-50 flex flex-col gap-2"
        >
          <div className="text-sm text-gray-600">Block {i + 1}</div>

          {b.type === "paragraph" ? (
            <textarea
              className="w-full border rounded px-3 py-2 min-h-[120px] bg-white"
              value={b.text}
              onChange={(e) => setAt(i, { ...b, text: e.target.value })}
            />
          ) : (
            <div className="space-y-2">
              <input
                className="w-full border rounded px-3 py-2 bg-white"
                placeholder="Image URL"
                value={b.url}
                onChange={(e) => setAt(i, { ...b, url: e.target.value })}
              />
              <input
                className="w-full border rounded px-3 py-2 bg-white"
                placeholder="Caption"
                value={b.caption ?? ""}
                onChange={(e) => setAt(i, { ...b, caption: e.target.value })}
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Btn onClick={() => removeAt(i)}>Remove</Btn>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <Btn onClick={addParagraph}>Add Paragraph</Btn>
        <Btn onClick={addImage}>Add Image</Btn>
      </div>
    </div>
  );
}
