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
  FaPaintBrush,
  FaClipboard,
  FaUndo,
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
                    Upload Icon
                  </button>
                  <button
                    onClick={() => setActiveTab("styler")}
                    className={`flex-1 p-3 font-semibold text-sm transition-colors ${
                      activeTab === "styler"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Icon Styler
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
