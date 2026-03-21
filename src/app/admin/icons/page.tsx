"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabase/browser";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaCloudUploadAlt,
  FaExclamationCircle,
  FaSpinner,
  FaTrash,
  FaPaintBrush,
  FaClipboard,
  FaUndo,
  FaLayerGroup,
  FaTimes,
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
      "defs",
      "clipPath",
      "mask",
      "use",
      "symbol",
      "linearGradient",
      "radialGradient",
      "stop",
    ],
    ALLOWED_ATTR: [
      // Shape attributes
      "d",
      "points",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "width",
      "height",
      // SVG root
      "viewBox",
      "xmlns",
      // Fill
      "fill",
      "fill-rule",
      "fill-opacity",
      "clip-rule",
      // Stroke — critical for Lucide, Heroicons, Tabler etc.
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "stroke-miterlimit",
      "stroke-dasharray",
      "stroke-dashoffset",
      "stroke-opacity",
      // Other
      "opacity",
      "transform",
      "id",
      "href",
      "clip-path",
      "mask",
      // Gradient
      "offset",
      "stop-color",
      "stop-opacity",
      "gradientUnits",
      "gradientTransform",
      "x1",
      "y1",
      "x2",
      "y2",
    ],
  });

  // 2. Use the browser's DOM parser to manipulate the SVG
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "image/svg+xml");
  const svgElement = doc.querySelector("svg");

  if (!svgElement) {
    throw new Error("Invalid SVG file: could not find <svg> element.");
  }

  // Check for XML parse errors
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid SVG file: could not be parsed.");
  }

  // 3. Normalize root SVG attributes for consistent styling
  svgElement.setAttribute("width", "1em");
  svgElement.setAttribute("height", "1em");
  // Preserve viewBox from original — critical for correct rendering
  // (already retained by DOMPurify above)

  // 4. Detect if this is a stroke-based icon (e.g. Lucide, Heroicons outline)
  //    by checking if any child uses stroke but not fill.
  const children = Array.from(svgElement.querySelectorAll("*"));
  const isStrokeBased = children.some(
    (el) =>
      el.getAttribute("stroke") &&
      el.getAttribute("stroke") !== "none" &&
      (!el.getAttribute("fill") || el.getAttribute("fill") === "none")
  );

  if (isStrokeBased) {
    // Stroke-based icon: set fill="none" on root, use currentColor for strokes
    svgElement.setAttribute("fill", "none");
    svgElement.setAttribute("stroke", "currentColor");
    children.forEach((el) => {
      const stroke = el.getAttribute("stroke");
      const fill = el.getAttribute("fill");
      // Remove hardcoded colors, let parent currentColor flow through
      if (stroke && stroke !== "none") el.setAttribute("stroke", "currentColor");
      if (fill && fill !== "none") el.setAttribute("fill", "currentColor");
      el.removeAttribute("style");
    });
  } else {
    // Fill-based icon: set fill="currentColor" on root
    svgElement.setAttribute("fill", "currentColor");
    children.forEach((el) => {
      const fill = el.getAttribute("fill");
      // Only remove hardcoded colors; preserve "none" fills (used for cutouts)
      if (fill && fill !== "none") el.removeAttribute("fill");
      el.removeAttribute("stroke");
      el.removeAttribute("style");
    });
  }

  // 5. Serialize the element back to a string
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgElement);
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

const initialStyles = {
  color: "#334155",
  circleEnabled: false,
  circleBorderOnly: false,
  circleBorderColor: "#38bdf8",
  circleBorderWidth: 2,
  circleBackgroundColor: "#f0f9ff",
  circleBoxShadow: false,
};

export default function IconManagerPage() {
  const [icons, setIcons] = useState<IconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [iconName, setIconName] = useState("");
  const [iconTags, setIconTags] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Styler state
  const [styles, setStyles] = useState(initialStyles);
  const [activeTab, setActiveTab] = useState("upload");

  // Bulk upload state
  type BulkItem = {
    file: File;
    name: string;
    preview: string | null;
    error: string | null;
    status: "pending" | "uploading" | "done" | "skipped" | "error";
  };
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkSkipDuplicates, setBulkSkipDuplicates] = useState(true);
  const [bulkTags, setBulkTags] = useState("");
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

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
        try {
          const processed = processSvg(reader.result as string);
          setPreview(processed);
          setError(null);
        } catch (err: any) {
          setPreview(null);
          setError(err.message || "Failed to process SVG.");
        }
      };
      reader.readAsText(file);
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

      const path = `${name}-${Date.now()}.svg`;
      const { error: uploadError } = await supabase.storage
        .from("icons")
        .upload(path, selectedFile);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("icons").insert({
        name,
        tags,
        svg_content: processedSvg,
        storage_path: path,
      });
      if (insertError) {
        await supabase.storage.from("icons").remove([path]);
        throw insertError;
      }

      setSuccess(`Icon "${name}" uploaded successfully!`);
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

  const handleDelete = async (
    e: React.MouseEvent<HTMLButtonElement>,
    icon: IconRow
  ) => {
    e.stopPropagation(); // Prevent the copy-on-click on the parent div
    if (!confirm(`Are you sure you want to delete the icon "${icon.name}"?`))
      return;

    setBusy(true);
    setError(null);
    try {
      const { error: dbError } = await supabase
        .from("icons")
        .delete()
        .eq("id", icon.id);
      if (dbError) throw dbError;

      if (icon.storage_path) {
        await supabase.storage.from("icons").remove([icon.storage_path]);
      }

      setSuccess(`Icon "${icon.name}" deleted.`);
      setIcons(icons.filter((i) => i.id !== icon.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (f) => f.type === "image/svg+xml" || f.name.endsWith(".svg")
    );
    const items: BulkItem[] = files.map((file) => ({
      file,
      name: slugify(file.name.replace(/\.svg$/i, "")),
      preview: null,
      error: null,
      status: "pending",
    }));
    setBulkItems(items);
    setBulkProgress(0);
    // Process previews asynchronously
    items.forEach((item, idx) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const processed = processSvg(reader.result as string);
          setBulkItems((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, preview: processed, error: null } : it))
          );
        } catch (err: any) {
          setBulkItems((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, error: err.message, status: "error" } : it))
          );
        }
      };
      reader.readAsText(item.file);
    });
  };

  const handleBulkNameChange = (idx: number, value: string) => {
    setBulkItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, name: slugify(value) } : it))
    );
  };

  const handleBulkRemove = (idx: number) => {
    setBulkItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleBulkUpload = async () => {
    const pending = bulkItems.filter((it) => it.status === "pending" && it.preview && !it.error);
    if (pending.length === 0) return;
    setBulkUploading(true);
    setBulkProgress(0);
    const tags = bulkTags.split(",").map((t) => t.trim()).filter(Boolean);
    const existingNames = new Set(icons.map((i) => i.name));
    let done = 0;

    for (const item of bulkItems) {
      if (item.status !== "pending" || !item.preview || item.error) continue;
      const name = slugify(item.name);

      if (bulkSkipDuplicates && existingNames.has(name)) {
        setBulkItems((prev) =>
          prev.map((it) => (it === item ? { ...it, status: "skipped" } : it))
        );
        done++;
        setBulkProgress(done);
        continue;
      }

      setBulkItems((prev) =>
        prev.map((it) => (it === item ? { ...it, status: "uploading" } : it))
      );

      try {
        const rawSvg = await item.file.text();
        const processedSvg = processSvg(rawSvg);
        const path = `${name}-${Date.now()}.svg`;

        const { error: storageErr } = await supabase.storage
          .from("icons")
          .upload(path, item.file);
        if (storageErr) throw storageErr;

        const { error: dbErr } = await supabase.from("icons").insert({
          name,
          tags,
          svg_content: processedSvg,
          storage_path: path,
        });
        if (dbErr) {
          await supabase.storage.from("icons").remove([path]);
          throw dbErr;
        }

        existingNames.add(name);
        setBulkItems((prev) =>
          prev.map((it) => (it === item ? { ...it, status: "done" } : it))
        );
      } catch (err: any) {
        setBulkItems((prev) =>
          prev.map((it) =>
            it === item ? { ...it, status: "error", error: err.message } : it
          )
        );
      }

      done++;
      setBulkProgress(done);
    }

    setBulkUploading(false);
    await loadIcons();
  };

  const handleIconClick = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopySuccess(`Copied "${name}"!`);
    setTimeout(() => setCopySuccess(""), 2500);
  };

  const handleCopySettings = () => {
    const cssOutput = `
.icon-wrapper-style {
  /* This is an example wrapper. Adjust size as needed. */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;${
    styles.circleEnabled
      ? `
  border-radius: 50%;
  background-color: ${
    styles.circleBorderOnly ? "transparent" : styles.circleBackgroundColor
  };
  border: ${styles.circleBorderWidth}px solid ${styles.circleBorderColor};
  ${
    styles.circleBoxShadow ? `box-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.1);` : ""
  }`
      : ""
  }
}

.icon-svg-style {
  /* This is the icon element. Adjust size as needed. */
  color: ${styles.color};
  font-size: 40px;
  width: 1em;
  height: 1em;
}
    `
      .trim()
      .replace(/^ +/gm, ""); // clean up indentation for copying

    navigator.clipboard.writeText(cssOutput);
    setSuccess("CSS styles copied to clipboard!");
    setTimeout(() => setSuccess(null), 3000);
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
      <div className="min-h-screen bg-slate-100/70 text-slate-800">
        {/* Copy Success Toast */}
        {copySuccess && (
          <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white py-2 px-4 rounded-lg shadow-lg text-sm flex items-center gap-2">
            <FaCheckCircle /> {copySuccess}
          </div>
        )}
        <div className="px-4 sm:px-6 lg:px-8 py-8">
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

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* --- Sidebar with Tabs --- */}
            <div className="lg:col-span-1 sticky top-8">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-300/50 backdrop-blur-sm overflow-hidden">
                {/* Tab Buttons */}
                <div className="flex border-b border-slate-200">
                  <button
                    onClick={() => setActiveTab("upload")}
                    className={`flex-1 p-3 font-semibold text-sm transition-colors ${
                      activeTab === "upload"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Upload
                  </button>
                  <button
                    onClick={() => setActiveTab("bulk")}
                    className={`flex-1 p-3 font-semibold text-sm transition-colors ${
                      activeTab === "bulk"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Bulk
                  </button>
                  <button
                    onClick={() => setActiveTab("styler")}
                    className={`flex-1 p-3 font-semibold text-sm transition-colors ${
                      activeTab === "styler"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Styler
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                  {activeTab === "upload" && (
                    <div className="space-y-4">
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
                  )}

                  {activeTab === "bulk" && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                        <FaLayerGroup /> Bulk Upload
                      </h2>

                      <div>
                        <label className="text-sm font-semibold text-slate-700">
                          Tags for all (comma-separated)
                        </label>
                        <input
                          value={bulkTags}
                          onChange={(e) => setBulkTags(e.target.value)}
                          placeholder="e.g., landmark, outline"
                          className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkSkipDuplicates}
                          onChange={(e) => setBulkSkipDuplicates(e.target.checked)}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm font-medium text-slate-700">
                          Skip duplicates
                        </span>
                      </label>

                      <div>
                        <label className="text-sm font-semibold text-slate-700">
                          SVG Files
                        </label>
                        <input
                          ref={bulkFileInputRef}
                          type="file"
                          accept=".svg,image/svg+xml"
                          multiple
                          onChange={handleBulkFileChange}
                          className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                        />
                      </div>

                      {bulkItems.length > 0 && (
                        <>
                          <div className="text-xs text-slate-500">
                            {bulkItems.length} file{bulkItems.length !== 1 ? "s" : ""} selected
                            {bulkUploading && ` — ${bulkProgress}/${bulkItems.filter(it => it.status !== "error" || it.preview).length} processed`}
                          </div>

                          {/* Per-icon list */}
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {bulkItems.map((item, idx) => (
                              <div
                                key={idx}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                                  item.status === "done"
                                    ? "bg-emerald-50 border-emerald-200"
                                    : item.status === "error"
                                    ? "bg-red-50 border-red-200"
                                    : item.status === "skipped"
                                    ? "bg-amber-50 border-amber-200"
                                    : item.status === "uploading"
                                    ? "bg-blue-50 border-blue-200"
                                    : "bg-white border-slate-200"
                                }`}
                              >
                                {/* Preview */}
                                <div
                                  className="w-8 h-8 shrink-0 text-slate-700"
                                  style={{ fontSize: "32px" }}
                                  dangerouslySetInnerHTML={{ __html: item.preview || "" }}
                                />
                                {/* Name input */}
                                <input
                                  value={item.name}
                                  onChange={(e) => handleBulkNameChange(idx, e.target.value)}
                                  disabled={bulkUploading || item.status === "done"}
                                  className="flex-1 min-w-0 rounded px-2 py-1 bg-slate-100 font-mono text-slate-800 border border-transparent focus:outline-none focus:ring-1 focus:ring-[#F78300]/40 disabled:opacity-60"
                                />
                                {/* Status badge */}
                                <span className="shrink-0">
                                  {item.status === "done" && <FaCheckCircle className="text-emerald-500" />}
                                  {item.status === "error" && <FaExclamationCircle className="text-red-500" title={item.error || ""} />}
                                  {item.status === "skipped" && <span className="text-amber-600 font-semibold">skip</span>}
                                  {item.status === "uploading" && <FaSpinner className="animate-spin text-blue-500" />}
                                </span>
                                {/* Remove */}
                                {!bulkUploading && item.status !== "done" && (
                                  <button
                                    onClick={() => handleBulkRemove(idx)}
                                    className="shrink-0 text-slate-400 hover:text-red-500 transition-colors"
                                  >
                                    <FaTimes />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          <button
                            onClick={handleBulkUpload}
                            disabled={
                              bulkUploading ||
                              bulkItems.every((it) => it.status !== "pending" || it.error)
                            }
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
                          >
                            {bulkUploading ? (
                              <>
                                <FaSpinner className="animate-spin" />
                                Uploading {bulkProgress}/{bulkItems.filter(it => !it.error || it.status !== "pending").length}…
                              </>
                            ) : (
                              <>
                                <FaCloudUploadAlt />
                                Upload {bulkItems.filter((it) => it.status === "pending" && it.preview && !it.error).length} Icons
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === "styler" && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                        <FaPaintBrush /> Icon Styler
                      </h2>

                      {/* Icon Color */}
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-slate-700">
                          Color
                        </label>
                        <input
                          type="color"
                          value={styles.color}
                          onChange={(e) =>
                            setStyles({ ...styles, color: e.target.value })
                          }
                          className="w-8 h-8 rounded border border-slate-300"
                        />
                        <input
                          type="text"
                          value={styles.color}
                          readOnly
                          className="w-full text-sm rounded-md px-2 py-1 bg-slate-100 font-mono"
                        />
                      </div>

                      {/* Circle Toggle */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={styles.circleEnabled}
                          onChange={(e) =>
                            setStyles({
                              ...styles,
                              circleEnabled: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm font-medium text-slate-700">
                          Add Circle
                        </span>
                      </label>

                      {/* Circle Options */}
                      {styles.circleEnabled && (
                        <div className="pl-6 space-y-3 border-l-2 border-slate-200">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={styles.circleBorderOnly}
                              onChange={(e) =>
                                setStyles({
                                  ...styles,
                                  circleBorderOnly: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-sm">Border Only</span>
                          </label>

                          {!styles.circleBorderOnly && (
                            <div className="flex items-center gap-2">
                              <label className="text-sm whitespace-nowrap">
                                BG
                              </label>
                              <input
                                type="color"
                                value={styles.circleBackgroundColor}
                                onChange={(e) =>
                                  setStyles({
                                    ...styles,
                                    circleBackgroundColor: e.target.value,
                                  })
                                }
                                className="w-8 h-8 rounded border border-slate-300"
                              />
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <label className="text-sm whitespace-nowrap">
                              Border
                            </label>
                            <input
                              type="color"
                              value={styles.circleBorderColor}
                              onChange={(e) =>
                                setStyles({
                                  ...styles,
                                  circleBorderColor: e.target.value,
                                })
                              }
                              className="w-8 h-8 rounded border border-slate-300"
                            />
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={styles.circleBorderWidth}
                              onChange={(e) =>
                                setStyles({
                                  ...styles,
                                  circleBorderWidth: Number(e.target.value),
                                })
                              }
                              className="w-16 text-sm rounded-md px-2 py-1 bg-slate-100"
                            />
                            <span className="text-xs">px</span>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={styles.circleBoxShadow}
                              onChange={(e) =>
                                setStyles({
                                  ...styles,
                                  circleBoxShadow: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-sm">Box Shadow</span>
                          </label>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleCopySettings}
                          className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-md text-white bg-slate-700 hover:bg-slate-800"
                        >
                          <FaClipboard /> Copy CSS
                        </button>
                        <button
                          onClick={() => setStyles(initialStyles)}
                          className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-md text-slate-600 bg-slate-200 hover:bg-slate-300"
                        >
                          <FaUndo /> Reset
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Icon Grid */}
            <div className="lg:col-span-4">
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
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4">
                  {filteredIcons.map((icon) => {
                    const wrapperStyle: React.CSSProperties = {};
                    if (styles.circleEnabled) {
                      wrapperStyle.borderRadius = "50%";
                      wrapperStyle.backgroundColor = styles.circleBorderOnly
                        ? "transparent"
                        : styles.circleBackgroundColor;
                      wrapperStyle.border = `${styles.circleBorderWidth}px solid ${styles.circleBorderColor}`;
                      if (styles.circleBoxShadow) {
                        wrapperStyle.boxShadow =
                          "0 4px 14px 0 rgba(0,0,0,0.08)";
                      }
                    }

                    return (
                      <div
                        key={icon.id}
                        onClick={() => handleIconClick(icon.name)}
                        className="group relative bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center aspect-square text-center shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                        style={wrapperStyle}
                      >
                        <div
                          className="w-[50%] h-[50%]"
                          style={{
                            color: styles.color,
                            fontSize: "clamp(24px, 5vw, 50px)",
                          }}
                          dangerouslySetInnerHTML={{
                            __html: icon.svg_content,
                          }}
                        />
                        <p className="text-xs font-mono mt-2 text-slate-600 break-all">
                          {icon.name}
                        </p>
                        <button
                          onClick={(e) => handleDelete(e, icon)}
                          disabled={busy}
                          className="absolute top-1 right-1 p-1.5 bg-red-50 text-red-600 border border-red-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                          title="Delete icon"
                        >
                          <FaTrash size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
