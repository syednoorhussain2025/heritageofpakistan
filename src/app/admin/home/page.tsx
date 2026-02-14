// src/app/admin/home/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effect to clean up the object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Load the homepage row
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
        setSiteTitle(row.site_title ?? v.site_title ?? "Heritage of Pakistan");
        setSiteSubtitle(
          row.site_subtitle ?? v.site_subtitle ?? "Discover, Explore, Preserve"
        );
        setHeroUrl(row.hero_image_url ?? v.hero_image_url ?? null);
      }
      setLoading(false);
    })();
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);

    // Clear any previous previews and URLs
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setHeroUrl("");

    if (selectedFile) {
      // Create a local URL for instant preview
      setPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setPreviewUrl(null);
    }
  }

  function handleRemoveImage() {
    setFile(null);
    setHeroUrl("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function onSave() {
    setSaving(true);
    setMessage(null);
    let finalUrl = heroUrl; // Start with the existing or pasted URL

    try {
      // Step 1: Upload a new file if one is selected
      if (file) {
        setMessage("Uploading image..."); // Set uploading status
        const ext = file.name.split(".").pop() || "jpg";
        const path = `home/hero-${Date.now()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("site-images")
          .upload(path, file, { cacheControl: "3600", upsert: true });

        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

        const { data } = supabase.storage
          .from("site-images")
          .getPublicUrl(path);
        finalUrl = data?.publicUrl || null;
      }

      setMessage("Saving settings..."); // Update status before DB operation

      // Step 2: Save all settings to the database
      const jsonValue = {
        site_title: siteTitle,
        site_subtitle: siteSubtitle,
        hero_image_url: finalUrl,
      };

      const { error } = await supabase.from("global_settings").upsert(
        {
          key: "homepage",
          site_title: siteTitle,
          site_subtitle: siteSubtitle,
          hero_image_url: finalUrl,
          value: jsonValue,
        },
        { onConflict: "key" }
      );
      if (error) throw error;

      // Step 3: Clean up and provide success feedback
      setHeroUrl(finalUrl);
      setMessage("Homepage settings saved.");
      setFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (e: any) {
      setMessage(e?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-900 text-white min-h-screen p-6">Loading…</div>
    );
  }

  const currentImage = previewUrl || heroUrl;

  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">
            Home Page Editor
          </h1>
          <Link href="/admin" className="text-sm text-blue-400 hover:underline">
            ← Back to Admin
          </Link>
        </div>

        <div className="bg-gray-800 rounded-xl shadow-md p-5 space-y-5 border border-gray-700">
          {/* Text Inputs */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Title
            </label>
            <input
              type="text"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Heritage of Pakistan"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Subtitle
            </label>
            <input
              type="text"
              value={siteSubtitle}
              onChange={(e) => setSiteSubtitle(e.target.value)}
              className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Discover, Explore, Preserve"
            />
          </div>

          {/* Image Inputs */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Hero Cover Photo (upload)
              </label>
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
                  <button
                    onClick={handleRemoveImage}
                    className="text-gray-400 hover:text-white text-2xl font-bold"
                    title="Remove image"
                  >
                    &times;
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Uploading a file will clear a pasted URL.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                …or paste a Hero Image URL
              </label>
              <div className="flex items-center">
                <input
                  type="url"
                  value={heroUrl || ""}
                  onChange={(e) => {
                    setHeroUrl(e.target.value);
                    if (e.target.value) handleRemoveImage();
                  }}
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://…"
                  disabled={!!file}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Pasting a URL disables file upload.
              </p>
            </div>
          </div>

          {/* Image Preview */}
          {currentImage && (
            <div>
              <div className="text-sm font-medium mb-2 text-gray-300">
                Preview
              </div>
              <div className="rounded-lg overflow-hidden border border-gray-700">
                <img
                  src={currentImage}
                  alt="Hero preview"
                  className="w-full h-64 object-cover"
                />
              </div>
            </div>
          )}

          {/* Save Button & Status */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Page"}
            </button>
            {message && (
              <span className="text-sm text-gray-400">{message}</span>
            )}
          </div>
        </div>

        <div className="text-sm text-gray-500 text-center">
          Tip: Refresh the homepage after saving to see your changes.
        </div>
      </div>
    </div>
  );
}
