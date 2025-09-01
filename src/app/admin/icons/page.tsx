// src/app/admin/icons/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaCloudUploadAlt,
  FaExclamationCircle,
  FaSpinner,
  FaTrash,
} from "react-icons/fa";
import DOMPurify from "isomorphic-dompurify";

// Type definition for an icon record in the database
type IconRow = {
  id: string;
  name: string;
  tags: string[];
  svg_content: string;
  storage_path: string | null;
  created_at: string;
};

// --- SVG Processing Utilities ---

/**
 * Sanitizes and normalizes an SVG string.
 * - Removes potentially harmful scripts.
 * - Sets width, height to "1em" and fill to "currentColor" for easy styling.
 * - Removes extraneous attributes.
 * @param svgString The raw SVG content from a file.
 * @returns A sanitized and normalized SVG string.
 */
function processSvg(svgString: string): string {
  // 1. Sanitize the SVG to prevent XSS attacks
  const sanitized = DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOWED_TAGS: [
      "svg",
      "path",
      "g",
      "circle",
      "rect",
      "ellipse",
      "line",
      "polyline",
      "polygon",
    ],
    ALLOWED_ATTR: [
      "d",
      "fill",
      "stroke",
      "stroke-width",
      "transform",
      "viewbox",
      "cx",
      "cy",
      "r",
      "x",
      "y",
      "width",
      "height",
      "points",
    ],
  });

  // 2. Use the browser's DOM parser to manipulate the SVG
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "image/svg+xml");
  const svgElement = doc.querySelector("svg");

  if (svgElement) {
    // 3. Normalize attributes for consistent styling
    svgElement.setAttribute("width", "1em");
    svgElement.setAttribute("height", "1em");
    svgElement.setAttribute("fill", "currentColor");

    // Remove fixed color attributes from child elements to allow CSS control
    svgElement.querySelectorAll("*").forEach((el) => {
      el.removeAttribute("fill");
      el.removeAttribute("stroke");
      el.removeAttribute("style");
    });

    // 4. Serialize the element back to a string
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgElement);
  }

  throw new Error("Invalid SVG file: could not find <svg> element.");
}

/**
 * Converts a string to a URL-friendly slug.
 * @param s The string to convert.
 */
function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// --- Main Component ---

export default function IconManagerPage() {
  const [icons, setIcons] = useState<IconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [iconName, setIconName] = useState("");
  const [iconTags, setIconTags] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const loadIcons = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("icons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setIcons(data as IconRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadIcons();
  }, [loadIcons]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "image/svg+xml") {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsText(file);
      // Auto-fill name from filename
      setIconName(slugify(file.name.replace(".svg", "")));
    } else {
      setSelectedFile(null);
      setPreview(null);
      setError("Please select a valid .svg file.");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !iconName.trim()) {
      setError("Please provide a file and a unique name.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const rawSvg = await selectedFile.text();
      const processedSvg = processSvg(rawSvg);
      const name = slugify(iconName.trim());
      const tags = iconTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      // Upload the original file to storage for backup
      const path = `${name}-${Date.now()}.svg`;
      const { error: uploadError } = await supabase.storage
        .from("icons")
        .upload(path, selectedFile);
      if (uploadError) throw uploadError;

      // Insert metadata and the processed SVG content into the database
      const { error: insertError } = await supabase.from("icons").insert({
        name,
        tags,
        svg_content: processedSvg,
        storage_path: path,
      });
      if (insertError) {
        // If DB insert fails, try to remove the orphaned file from storage
        await supabase.storage.from("icons").remove([path]);
        throw insertError;
      }

      setSuccess(`Icon "${name}" uploaded successfully!`);
      // Reset form
      setIconName("");
      setIconTags("");
      setSelectedFile(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadIcons();
    } catch (e: any) {
      setError(e.message || "An unknown error occurred.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (icon: IconRow) => {
    if (!confirm(`Are you sure you want to delete the icon "${icon.name}"?`))
      return;

    setBusy(true);
    setError(null);
    try {
      // Delete from database
      const { error: dbError } = await supabase
        .from("icons")
        .delete()
        .eq("id", icon.id);
      if (dbError) throw dbError;

      // Delete from storage if a path exists
      if (icon.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("icons")
          .remove([icon.storage_path]);
        if (storageError)
          console.warn(
            "Failed to delete from storage, but DB record was removed:",
            storageError.message
          );
      }

      setSuccess(`Icon "${icon.name}" deleted.`);
      setIcons(icons.filter((i) => i.id !== icon.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredIcons = icons.filter(
    (icon) =>
      icon.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      icon.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100/70 text-slate-800 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-slate-900">Icon Manager</h1>
            <Link
              href="/admin"
              className="text-sm text-slate-600 hover:text-slate-800 hover:underline flex items-center gap-2"
            >
              <FaArrowLeft /> Back to Dashboard
            </Link>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
              <FaExclamationCircle /> {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-2">
              <FaCheckCircle /> {success}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Upload Form */}
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xl shadow-slate-300/50 backdrop-blur-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                Upload New Icon
              </h2>
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Icon Name (unique key)
                </label>
                <input
                  value={iconName}
                  onChange={(e) => setIconName(e.target.value)}
                  placeholder="e.g., fort-outline"
                  className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Tags (comma-separated)
                </label>
                <input
                  value={iconTags}
                  onChange={(e) => setIconTags(e.target.value)}
                  placeholder="e.g., landmark, punjab"
                  className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  SVG File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  onChange={handleFileChange}
                  className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
              </div>
              {preview && (
                <div>
                  <label className="text-sm font-semibold text-slate-700">
                    Preview
                  </label>
                  <div className="mt-1 p-4 border border-slate-200 rounded-xl bg-white shadow-sm flex items-center justify-center">
                    <div
                      className="w-16 h-16 text-slate-800"
                      dangerouslySetInnerHTML={{ __html: preview }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleUpload}
                disabled={busy || !selectedFile || !iconName}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {busy ? (
                  <FaSpinner className="animate-spin" />
                ) : (
                  <FaCloudUploadAlt />
                )}
                {busy ? "Uploading..." : "Upload Icon"}
              </button>
            </div>

            {/* Icon Grid */}
            <div className="lg:col-span-2">
              <input
                type="text"
                placeholder="Search by name or tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full mb-4 rounded-md px-4 py-2 text-slate-900 placeholder-slate-400 bg-white border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
              />
              {loading ? (
                <div className="text-center text-slate-500">
                  Loading icons...
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredIcons.map((icon) => (
                    <div
                      key={icon.id}
                      className="group relative bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center aspect-square text-center shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div
                        className="w-[50px] h-[50px] text-[50px] text-slate-700 transition-colors group-hover:text-blue-600"
                        dangerouslySetInnerHTML={{ __html: icon.svg_content }}
                      />
                      <p className="text-xs font-mono mt-2 text-slate-600 break-all">
                        {icon.name}
                      </p>
                      <button
                        onClick={() => handleDelete(icon)}
                        disabled={busy}
                        className="absolute top-1 right-1 p-1.5 bg-red-50 text-red-600 border border-red-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                        title="Delete icon"
                      >
                        <FaTrash size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
