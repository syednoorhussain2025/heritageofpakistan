// src/app/admin/home/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type GSRow = {
  key: string;
  site_title?: string | null;
  site_subtitle?: string | null;
  hero_image_url?: string | null;
  value?: any | null; // jsonb
};

export default function AdminHomeEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [siteTitle, setSiteTitle] = useState("Heritage of Pakistan");
  const [siteSubtitle, setSiteSubtitle] = useState(
    "Discover, Explore, Preserve"
  );
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  // Load the homepage row (by key only; no 'id')
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("global_settings")
        .select("key, site_title, site_subtitle, hero_image_url, value")
        .eq("key", "homepage")
        .maybeSingle();

      if (!error && data) {
        const row = data as GSRow;
        const v = (row.value || {}) as Record<string, any>;
        // Prefer explicit columns; fallback to JSON value
        setSiteTitle(row.site_title ?? v.site_title ?? "Heritage of Pakistan");
        setSiteSubtitle(
          row.site_subtitle ?? v.site_subtitle ?? "Discover, Explore, Preserve"
        );
        setHeroUrl(row.hero_image_url ?? v.hero_image_url ?? null);
      }
      setLoading(false);
    })();
  }, []);

  async function uploadHeroIfNeeded(): Promise<string | null> {
    if (!file) return heroUrl || null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `home/hero-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("site-images")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
    if (upErr) {
      setMessage(`Upload failed: ${upErr.message}`);
      return null;
    }
    const { data } = supabase.storage.from("site-images").getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      const url = await uploadHeroIfNeeded();
      if (!url && file) {
        setSaving(false);
        return;
      }

      // Keep JSON 'value' in sync to satisfy NOT NULL value schemas.
      const jsonValue = {
        site_title: siteTitle,
        site_subtitle: siteSubtitle,
        hero_image_url: url ?? heroUrl,
      };

      const { error } = await supabase.from("global_settings").upsert(
        {
          key: "homepage",
          site_title: siteTitle,
          site_subtitle: siteSubtitle,
          hero_image_url: url ?? heroUrl,
          value: jsonValue,
        },
        { onConflict: "key" }
      ); // <-- no .select('id'), no 'id' used anywhere
      if (error) throw error;

      setHeroUrl(url ?? heroUrl);
      setMessage("Homepage settings saved.");
    } catch (e: any) {
      setMessage(e?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Home Page Editor</h1>
        <Link href="/admin" className="text-sm text-blue-600 underline">
          ← Back to Admin
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={siteTitle}
            onChange={(e) => setSiteTitle(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Heritage of Pakistan"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Subtitle</label>
          <input
            type="text"
            value={siteSubtitle}
            onChange={(e) => setSiteSubtitle(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Discover, Explore, Preserve"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">
              Hero Cover Photo (upload)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Uploading replaces the current hero image.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              …or paste a Hero Image URL
            </label>
            <input
              type="url"
              value={heroUrl || ""}
              onChange={(e) => setHeroUrl(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="https://…"
            />
            <p className="text-xs text-gray-500 mt-1">
              If you paste a URL, file upload is ignored.
            </p>
          </div>
        </div>

        {heroUrl ? (
          <div>
            <div className="text-sm font-medium mb-2">Preview</div>
            <div className="rounded-lg overflow-hidden border">
              <img
                src={heroUrl}
                alt="Hero preview"
                className="w-full h-64 object-cover"
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-black text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {message ? (
            <span className="text-sm text-gray-700">{message}</span>
          ) : null}
        </div>
      </div>

      <div className="text-sm text-gray-600">
        Tip: Refresh the homepage after saving to see your changes.
      </div>
    </div>
  );
}
