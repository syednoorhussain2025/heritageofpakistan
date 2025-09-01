// src/app/admin/fonts/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";
import JSZip from "jszip"; // Import JSZip for handling ZIP files
import {
  FaCheckCircle,
  FaCloudUploadAlt,
  FaExternalLinkAlt,
  FaLink,
  FaTrash,
} from "react-icons/fa";

type Provider = "custom" | "google";

type FontRow = {
  id: string;
  provider: Provider;
  name: string;
  css_family: string;
  weight: number | null;
  style: string | null;
  url: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

const BUCKET = "fonts";

/* ---------- small helpers ---------- */
function guessFormat(url: string) {
  const lower = url.toLowerCase();
  if (lower.endsWith(".woff2")) return "woff2";
  if (lower.endsWith(".woff")) return "woff";
  if (lower.endsWith(".otf")) return "opentype";
  return "truetype";
}

function humanError(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as any).message === "string"
  ) {
    return (e as any).message;
  }
  return String(e ?? "Unknown error");
}

/* ---------- common section shell ---------- */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-300/50 backdrop-blur-sm">
      <div className="px-5 py-3 border-b border-slate-100 rounded-t-2xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// Helper component to load Google Fonts for previewing
const GoogleFontLoader = ({ fonts }: { fonts: FontRow[] }) => {
  const loadedFonts = useMemo(() => {
    const fontHrefs = fonts
      .filter((font) => font.provider === "google" && font.metadata?.href)
      .map((font) => font.metadata!.href as string);
    return [...new Set(fontHrefs)]; // Return only unique hrefs
  }, [fonts]);

  return (
    <>
      {loadedFonts.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
    </>
  );
};

export default function FontManagerPage() {
  const [tab, setTab] = useState<Provider>("custom");
  const [rows, setRows] = useState<FontRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bucketOk, setBucketOk] = useState<boolean | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  // Form states
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState<string>("400");
  const [style, setStyle] = useState<"normal" | "italic">("normal");
  const [gDisplayName, setGDisplayName] = useState(""); // State for Google Font display name
  const [gFamily, setGFamily] = useState("");
  const [gWeights, setGWeights] = useState("400;600");

  const googleHref = useMemo(() => {
    if (!gFamily.trim()) return "";
    const fam = encodeURIComponent(gFamily.trim());
    const w = encodeURIComponent(gWeights.replace(/\s/g, ""));
    return `https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=swap`;
  }, [gFamily, gWeights]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const { data: userData } = await supabase.auth.getUser();
      setAuthEmail(userData?.user?.email ?? null);
      try {
        const { error: probeErr } = await supabase.storage
          .from(BUCKET)
          .list("", { limit: 1 }); // ⬅️ removed invalid cacheControl
        if (probeErr) {
          setBucketOk(false);
          setError(
            `Fonts bucket probe failed: ${probeErr.message}. Check storage.objects SELECT policy.`
          );
        } else {
          setBucketOk(true);
        }
      } catch (e) {
        setBucketOk(false);
        setError(`Fonts bucket probe failed: ${humanError(e)}`);
      }
      await refresh();
      setLoading(false);
    })();
  }, []);

  const refresh = async () => {
    const { data, error } = await supabase
      .from("fonts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows((data as FontRow[]) ?? []);
  };

  const PreviewFace = ({ row }: { row: FontRow }) => {
    if (row.provider !== "custom" || !row.url) return null;
    const css = `
      @font-face {
        font-family: "${row.css_family}";
        src: url("${row.url}") format("${guessFormat(row.url)}");
        font-weight: ${row.weight ?? 400};
        font-style: ${row.style || "normal"};
        font-display: swap;
      }`;
    return <style dangerouslySetInnerHTML={{ __html: css }} />;
  };

  // Main handler for custom font uploads (handles both single and ZIP files)
  async function handleFileUpload() {
    try {
      setError(null);
      setOk(null);
      setBusy(true);

      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("Please select a file.");
        return;
      }

      if (file.type === "application/zip" || file.name.endsWith(".zip")) {
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);
        const fontFiles: File[] = [];

        for (const filename in contents.files) {
          const zipEntry = contents.files[filename];
          if (!zipEntry.dir && /\.(woff2|woff|ttf|otf)$/i.test(zipEntry.name)) {
            const blob = await zipEntry.async("blob");
            fontFiles.push(
              new File([blob], zipEntry.name, { type: blob.type })
            );
          }
        }

        if (fontFiles.length === 0) {
          setError(
            "No valid font files (.woff2, .woff, .ttf, .otf) were found in the ZIP."
          );
          return;
        }

        for (const fontFile of fontFiles) {
          const baseName =
            displayName.trim() ||
            fontFile.name.split(".").slice(0, -1).join(".");
          await uploadSingleFont(fontFile, baseName);
        }
        setOk(`${fontFiles.length} fonts uploaded successfully from ZIP.`);
      } else {
        const baseName =
          displayName.trim() || file.name.split(".").slice(0, -1).join(".");
        await uploadSingleFont(file, baseName);
        setOk("Font uploaded successfully.");
      }

      if (fileRef.current) fileRef.current.value = "";
      setDisplayName("");
      setFamily("");
      await refresh();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  // Helper function to upload a single custom font file
  async function uploadSingleFont(file: File, name: string) {
    if (bucketOk === false) {
      throw new Error("Fonts bucket is not readable.");
    }
    const fam = (family || name).trim();
    if (!fam) {
      throw new Error("CSS Family name could not be determined.");
    }

    const path = `${crypto.randomUUID()}/${file.name}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file);
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = pub?.publicUrl ?? null;

    const { error: insErr } = await supabase.from("fonts").insert({
      provider: "custom",
      name: name,
      css_family: fam,
      weight: Number(weight) || 400,
      style,
      url,
      metadata: null,
    });
    if (insErr) throw insErr;
  }

  async function handleDelete(row: FontRow) {
    console.log("Attempting to delete font with ID:", row.id);
    try {
      setError(null);
      setOk(null);
      setBusy(true);

      if (row.provider === "custom" && row.url) {
        const marker = `/storage/v1/object/public/${BUCKET}/`;
        if (row.url.includes(marker)) {
          const key = row.url.split(marker)[1]!;
          await supabase.storage.from(BUCKET).remove([key]);
        }
      }

      const { error: delErr } = await supabase
        .from("fonts")
        .delete()
        .eq("id", row.id);
      if (delErr) throw delErr;

      await refresh();
      setOk("Font deleted.");
    } catch (e) {
      console.error("Deletion failed:", e);
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function addGoogleFont() {
    try {
      setError(null);
      setOk(null);
      if (!gFamily.trim()) {
        setError("Enter a Google font family.");
        return;
      }
      if (!gWeights.trim()) {
        setError("Enter weights (e.g., 400;600).");
        return;
      }

      setBusy(true);
      const fam = gFamily.trim();
      const { error: insErr } = await supabase.from("fonts").insert({
        provider: "google",
        name: gDisplayName.trim() || fam, // Use display name, or fall back
        css_family: fam, // Must be the real font family
        weight: null,
        style: null,
        url: null,
        metadata: { weights: gWeights.replace(/\s/g, ""), href: googleHref },
      });
      if (insErr) throw insErr;

      setOk("Google font saved.");
      setGFamily("");
      setGWeights("400;600");
      setGDisplayName(""); // Reset the display name field
      await refresh();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminGuard>
      <GoogleFontLoader fonts={rows} />
      <div className="min-h-screen bg-slate-100/70 text-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-2xl font-bold text-slate-900">Font Manager</h1>
            {authEmail && (
              <span className="text-xs text-slate-500">
                Signed in: {authEmail}
              </span>
            )}
          </div>

          <div className="mb-6">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <button
                className={`px-4 py-2 text-sm font-semibold border-r border-slate-200 transition ${
                  tab === "custom"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setTab("custom")}
              >
                Custom Uploads
              </button>
              <button
                className={`px-4 py-2 text-sm font-semibold transition ${
                  tab === "google"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setTab("google")}
              >
                Google Fonts
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}
          {ok && (
            <div className="mb-4 p-3 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-2">
              <FaCheckCircle /> {ok}
            </div>
          )}

          {tab === "custom" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Upload a font">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-slate-700">
                      Display Name
                    </label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Inter (or leave blank for ZIP)"
                      className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700">
                      CSS Family
                    </label>
                    <input
                      value={family}
                      onChange={(e) => setFamily(e.target.value)}
                      placeholder="Defaults to Display Name or filename"
                      className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-slate-700">
                        Weight
                      </label>
                      <input
                        type="number"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-700">
                        Style
                      </label>
                      <select
                        value={style}
                        onChange={(e) =>
                          setStyle(e.target.value as "normal" | "italic")
                        }
                        className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                      >
                        <option value="normal">normal</option>
                        <option value="italic">italic</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700">
                      Font file or ZIP archive
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".woff2,.woff,.ttf,.otf,.zip"
                      className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    />
                  </div>
                  <button
                    onClick={handleFileUpload}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    <FaCloudUploadAlt /> Upload
                  </button>
                </div>
              </Section>
              <Section title="Your custom fonts">
                {loading ? (
                  <div className="text-slate-500">Loading…</div>
                ) : (
                  <div className="space-y-4">
                    {rows.filter((r) => r.provider === "custom").length ===
                    0 ? (
                      <div className="text-slate-500">No custom fonts yet.</div>
                    ) : (
                      rows
                        .filter((r) => r.provider === "custom")
                        .map((r) => (
                          <div
                            key={r.id}
                            className="border border-slate-200 rounded-2xl p-4 flex items-center justify-between bg-white shadow-sm"
                          >
                            <PreviewFace row={r} />
                            <div>
                              <div className="font-semibold text-slate-900">
                                {r.name}
                              </div>
                              <div className="text-sm text-slate-600">
                                family: <code>{r.css_family}</code> · weight:{" "}
                                <code>{r.weight ?? 400}</code> · style:{" "}
                                <code>{r.style || "normal"}</code>
                              </div>
                              <div
                                className="mt-2 text-base text-slate-800"
                                style={{
                                  fontFamily: `"${r.css_family}", sans-serif`,
                                  fontWeight: r.weight ?? 400,
                                  fontStyle: r.style || "normal",
                                }}
                              >
                                The quick brown fox jumps over the lazy dog.
                              </div>
                              {r.url && (
                                <a
                                  className="mt-2 inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
                                  href={r.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <FaExternalLinkAlt /> file
                                </a>
                              )}
                            </div>
                            <button
                              onClick={() => handleDelete(r)}
                              className="ml-4 px-3 py-2 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
                              disabled={busy}
                              title="Delete font"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </Section>
            </div>
          )}

          {tab === "google" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Add a Google Font">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-slate-700">
                      Display Name (Optional)
                    </label>
                    <input
                      value={gDisplayName}
                      onChange={(e) => setGDisplayName(e.target.value)}
                      placeholder="e.g. Main Body Font"
                      className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700">
                      Font Family
                    </label>
                    <input
                      value={gFamily}
                      onChange={(e) => setGFamily(e.target.value)}
                      placeholder="e.g. Roboto"
                      className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Case-sensitive name from fonts.google.com.
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700">
                      Weights
                    </label>
                    <input
                      value={gWeights}
                      onChange={(e) => setGWeights(e.target.value)}
                      placeholder="e.g. 400;700;900"
                      className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-slate-100 border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Separate weights with a semicolon.
                    </p>
                  </div>
                  {googleHref && (
                    <div>
                      <label className="text-sm font-semibold text-slate-700">
                        Generated Link
                      </label>
                      <a
                        className="mt-1 text-sm text-blue-600 hover:underline break-all block"
                        href={googleHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {googleHref}{" "}
                        <FaExternalLinkAlt className="inline ml-1" />
                      </a>
                    </div>
                  )}
                  <button
                    onClick={addGoogleFont}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    <FaLink /> Add Google Font
                  </button>
                </div>
              </Section>
              <Section title="Your Google Fonts">
                {loading ? (
                  <div className="text-slate-500">Loading…</div>
                ) : (
                  <div className="space-y-4">
                    {rows.filter((r) => r.provider === "google").length ===
                    0 ? (
                      <div className="text-slate-500">No Google fonts yet.</div>
                    ) : (
                      rows
                        .filter((r) => r.provider === "google")
                        .map((r) => (
                          <div
                            key={r.id}
                            className="border border-slate-200 rounded-2xl p-4 flex items-center justify-between bg-white shadow-sm"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">
                                {r.name}
                              </div>
                              <div className="text-sm text-slate-600">
                                weights:{" "}
                                <code>{r.metadata?.weights || "N/A"}</code>
                              </div>
                              <div
                                className="mt-2 text-base text-slate-800"
                                style={{
                                  fontFamily: `"${r.css_family}", sans-serif`,
                                }}
                              >
                                The quick brown fox jumps over the lazy dog.
                                (400)
                              </div>
                              <div
                                className="mt-1 text-base text-slate-800"
                                style={{
                                  fontFamily: `"${r.css_family}", sans-serif`,
                                  fontWeight: 700,
                                }}
                              >
                                The quick brown fox jumps over the lazy dog.
                                (700)
                              </div>
                            </div>
                            <button
                              onClick={() => handleDelete(r)}
                              className="ml-4 px-3 py-2 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
                              disabled={busy}
                              title="Delete font"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
