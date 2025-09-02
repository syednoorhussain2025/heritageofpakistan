"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Local UI bits */
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
const inputStyles =
  "w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500";

async function publicUrl(bucket: string, key: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}

/** ============ Photo Story (formerly PhotoStoryForm) ============ */
export default function PhotoStory({
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

  if (!loaded)
    return <div className="text-gray-500 p-6">Loading Photo Story…</div>;

  return (
    <div className="space-y-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="text-sm text-gray-600">
        Title: <b className="text-gray-900">{title}</b> ·{" "}
        <a
          className="text-indigo-600 hover:underline"
          href={`/heritage/${slug}/story`}
          target="_blank"
        >
          Open Photo Story
        </a>
      </div>

      <Field label="Photo Story Hero URL">
        <input
          className={inputStyles}
          value={ps.hero_photo_url || ""}
          onChange={(e) => setPs({ ...ps, hero_photo_url: e.target.value })}
        />
      </Field>

      <Field label="Upload Photo Story Hero (optional)">
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/*"
            onChange={onUploadHero}
            className="text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
          />
          {ps.hero_photo_url ? (
            <img
              src={ps.hero_photo_url}
              className="h-12 w-12 object-cover rounded-lg"
              alt="Photo Story hero"
            />
          ) : null}
        </div>
      </Field>

      <Field label="Subtitle (optional)">
        <input
          className={inputStyles}
          value={ps.subtitle || ""}
          onChange={(e) => setPs({ ...ps, subtitle: e.target.value })}
        />
      </Field>

      <div className="mt-6 border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-gray-900">Story Items</div>
          <Btn
            onClick={addItem}
            className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
          >
            Add Story Item
          </Btn>
        </div>

        {items.map((it, idx) => (
          <div
            key={it.id}
            className="border border-gray-200 rounded-lg p-4 mb-4 bg-white"
          >
            <div className="text-sm text-gray-600 mb-3 font-semibold">
              Item #{idx + 1}
            </div>

            <div className="flex items-center gap-3 mb-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(idx, f);
                }}
                className="text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
              />
              {it.image_url ? (
                <img
                  src={it.image_url}
                  className="h-12 w-12 object-cover rounded-lg"
                  alt=""
                />
              ) : null}
            </div>

            <Field label="Text (optional)">
              <textarea
                className={inputStyles}
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

      <Btn
        onClick={saveStory}
        className="bg-indigo-600 text-white hover:bg-indigo-500"
      >
        Save Photo Story
      </Btn>
    </div>
  );
}
