// src/app/admin/listings/[id]/GalleryUploader.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { FaTrash, FaCheckCircle } from "react-icons/fa";
import { Lightbox } from "@/components/ui/Lightbox"; // keep your existing path
import { generateCaptionsAction } from "./gallery-actions"; // ← server action for AI captions

async function publicUrl(bucket: string, key: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}

type Row = {
  id: string;
  site_id: string | number;
  storage_path: string;
  sort_order: number | null;
  alt_text: string | null;
  caption: string | null;
  publicUrl?: string | null;
};

type Meta = { w?: number; h?: number; kb?: number };

type UploadItem = {
  key: string;
  name: string;
  progress: number; // 0..100
  done: boolean;
};

export default function GalleryUploader({
  siteId,
}: {
  siteId: string | number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaMap, setMetaMap] = useState<Record<string, Meta>>({});
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // 🔹 AI caption generator state
  const [contextArticle, setContextArticle] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // file input ref (prevents React synthetic event null issues)
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete-all modal (with password re-auth)
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Lightbox state
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

  // Site title for Lightbox metadata
  const [siteTitle, setSiteTitle] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [{ data: userData }, { data: siteData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("sites").select("title").eq("id", siteId).maybeSingle(),
      ]);
      setCurrentEmail(userData.user?.email ?? null);
      setCurrentUserId(userData.user?.id ?? null);
      setSiteTitle(siteData?.title || "");
    })();
  }, [siteId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_images")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const withUrls: Row[] = await Promise.all(
      (data || []).map(async (r: any) => ({
        ...r,
        publicUrl: r.storage_path
          ? await publicUrl("site-images", r.storage_path)
          : null,
      }))
    );

    setRows(withUrls);
    setLoading(false);
    computeAllMeta(withUrls);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    // Copy files immediately; never touch the event after awaits
    const inputEl = fileInputRef.current;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const now = Date.now();
    const startItems: UploadItem[] = files.map((file, i) => ({
      key: `gallery/${siteId}/${now + i}-${file.name}`,
      name: file.name,
      progress: 1,
      done: false,
    }));
    setUploads((prev) => [...prev, ...startItems]);

    let order = rows.length;

    for (const file of files) {
      const thisKey = startItems.find((u) => u.name === file.name)?.key!;
      const intervalId = window.setInterval(() => {
        setUploads((prev) =>
          prev.map((u) =>
            u.key === thisKey && !u.done
              ? { ...u, progress: Math.min(95, u.progress + 3) }
              : u
          )
        );
      }, 120);

      try {
        const { error } = await supabase.storage
          .from("site-images")
          .upload(thisKey, file, { upsert: false });
        if (error) {
          alert(error.message);
          setUploads((prev) =>
            prev.map((u) => (u.key === thisKey ? { ...u, done: true } : u))
          );
          continue;
        }

        await supabase.from("site_images").insert({
          site_id: siteId,
          storage_path: thisKey,
          sort_order: order++,
        });

        setUploads((prev) =>
          prev.map((u) =>
            u.key === thisKey ? { ...u, progress: 100, done: true } : u
          )
        );
      } finally {
        window.clearInterval(intervalId);
      }
    }

    await load();

    // remove finished bars after a moment
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => !u.done));
    }, 800);

    // Clear input safely via ref
    if (inputEl) inputEl.value = "";
  }

  async function updateRow(id: string, patch: Partial<Row>) {
    const { error } = await supabase
      .from("site_images")
      .update(patch)
      .eq("id", id);
    if (error) return alert(error.message);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function removeRow(id: string, storage_path: string) {
    const { error } = await supabase.from("site_images").delete().eq("id", id);
    if (error) return alert(error.message);
    await supabase.storage.from("site-images").remove([storage_path]);
    setRows((prev) => prev.filter((r) => r.id !== id));
    setMetaMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function computeMetaForRow(r: Row): Promise<Meta> {
    if (!r.publicUrl) return {};
    try {
      const img = new Image();
      const dims = await new Promise<Meta>((resolve) => {
        img.onload = () =>
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({});
        img.src = r.publicUrl!;
      });
      const resp = await fetch(r.publicUrl, { method: "HEAD" });
      const len = resp.headers.get("content-length");
      const kb = len ? Math.round(parseInt(len, 10) / 1024) : undefined;
      return { ...dims, kb };
    } catch {
      return {};
    }
  }

  async function computeAllMeta(items: Row[]) {
    const entries = await Promise.all(
      items.map(async (r) => [r.id, await computeMetaForRow(r)] as const)
    );
    const map: Record<string, Meta> = {};
    for (const [id, meta] of entries) map[id] = meta;
    setMetaMap(map);
  }

  // -------- Delete All (hard delete with password re-auth) --------

  const galleryFolder = useMemo(() => `gallery/${siteId}`, [siteId]);

  function openDeleteAllModal() {
    setConfirmEmail(currentEmail ?? "");
    setConfirmPassword("");
    setShowConfirm(true);
  }

  function closeDeleteAllModal() {
    if (!deletingAll) setShowConfirm(false);
  }

  async function listAllStorageKeysUnder(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase.storage
        .from("site-images")
        .list(prefix, {
          limit: pageSize,
          offset: page * pageSize,
          sortBy: { column: "name", order: "asc" },
        });
      if (error || !data || data.length === 0) break;
      for (const item of data) {
        if (item.name) keys.push(`${prefix}/${item.name}`);
      }
      if (data.length < pageSize) break;
      page += 1;
    }
    return keys;
  }

  async function deleteAllConfirmed() {
    if (!currentUserId) {
      alert("No authenticated user found. Please sign in again.");
      return;
    }
    if (!confirmEmail || !confirmPassword) {
      alert("Please enter your email and password to confirm.");
      return;
    }

    setDeletingAll(true);
    try {
      // re-authenticate
      const { data, error } = await supabase.auth.signInWithPassword({
        email: confirmEmail.trim(),
        password: confirmPassword,
      });
      if (error || !data.user) {
        throw new Error(
          error?.message || "Authentication failed. Check your email/password."
        );
      }
      if (data.user.id !== currentUserId) {
        await supabase.auth.signOut();
        throw new Error(
          "Authenticated as a different user. Please use the same account."
        );
      }

      // 1) DB hard delete
      const { error: dbErr } = await supabase
        .from("site_images")
        .delete()
        .eq("site_id", siteId);
      if (dbErr) throw dbErr;

      // 2) Storage hard delete (union of known keys + listing)
      let keys = rows.map((r) => r.storage_path).filter(Boolean);
      try {
        const listed = await listAllStorageKeysUnder(galleryFolder);
        const set = new Set([...keys, ...listed]);
        keys = Array.from(set);
      } catch {
        // ignore listing failures; proceed with DB keys
      }

      const chunkSize = 100;
      for (let i = 0; i < keys.length; i += chunkSize) {
        const slice = keys.slice(i, i + chunkSize);
        if (slice.length) {
          const { error: rmErr } = await supabase.storage
            .from("site-images")
            .remove(slice);
          if (rmErr) throw rmErr;
        }
      }

      await load();
      setShowConfirm(false);
    } catch (err: any) {
      alert(err?.message || "Failed to delete all images.");
    } finally {
      setDeletingAll(false);
    }
  }

  // -------- Lightbox adapter (add site.id to satisfy Lightbox types) --------
  const lightboxPhotos = useMemo(
    () =>
      rows
        .filter((r) => !!r.publicUrl)
        .map((r) => ({
          id: r.id,
          storagePath: r.storage_path,
          url: r.publicUrl as string,
          caption: r.caption || r.alt_text || "",
          isBookmarked: false,
          author: { name: "Uploaded by Admin", profileUrl: "" },
          site: {
            id: String(siteId), // ✅ required by LightboxSite
            name: siteTitle || "Site",
            location: "",
            region: "",
            latitude: null as any,
            longitude: null as any,
            categories: [] as string[],
          },
        })),
    [rows, siteId, siteTitle]
  );

  // ---------------- Render ----------------

  if (loading) return <div className="text-gray-500">Loading Gallery…</div>;

  const uploadingCount = uploads.filter((u) => !u.done).length;
  const totalCount = uploads.length;
  const showPopup = uploadingCount > 0;

  return (
    <div className="relative">
      {/* Uploader controls */}
      <div className="mb-3 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onUpload}
          className="text-sm text-gray-700 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
        />
        {rows.length > 0 && (
          <button
            type="button"
            onClick={openDeleteAllModal}
            className="px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium"
            title="Hard delete all images"
          >
            Delete All
          </button>
        )}
      </div>

      {/* Top row: empty left (keeps uploader alignment) + captions panel on the right */}
      <div className="mb-4 grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-4 items-start">
        <div />
        {/* left column intentionally empty to keep panel aligned to the right of uploader */}
        <aside className="lg:sticky lg:top-4">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60">
              <h3 className="text-sm font-semibold text-gray-900">
                Image Captions
              </h3>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">
                  Context article (optional but recommended)
                </label>
                <textarea
                  className="mt-1 w-full border border-gray-300 rounded-xl p-3 min-h-[120px] text-sm focus:ring-2 focus:ring-black/10 focus:border-black/30"
                  placeholder="Paste a short article/description of this site to guide captions…"
                  value={contextArticle}
                  onChange={(e) => setContextArticle(e.target.value)}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Used only for AI context, not stored. Keep it concise (2–5
                  paragraphs).
                </p>
              </div>

              {genError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                  {genError}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-black text-white text-sm font-medium shadow-sm hover:opacity-90 active:opacity-80 disabled:opacity-50 transition"
                  disabled={rows.length === 0 || genLoading}
                  onClick={async () => {
                    setGenError(null);
                    setGenLoading(true);
                    setSuggestions({});
                    try {
                      const imagesIn = rows
                        .filter((r) => r.publicUrl)
                        .map((r) => ({
                          id: r.id,
                          publicUrl: r.publicUrl as string,
                          filename:
                            r.storage_path.split("/").pop() || r.storage_path,
                          alt: r.alt_text || null,
                        }));
                      const res = await generateCaptionsAction({
                        contextArticle,
                        imagesIn,
                      });
                      const map: Record<string, string> = {};
                      for (const c of res) map[c.id] = c.caption;
                      setSuggestions(map);
                    } catch (e: any) {
                      setGenError(e?.message ?? "Failed to generate captions");
                    } finally {
                      setGenLoading(false);
                    }
                  }}
                >
                  {genLoading ? "Generating…" : "Generate captions"}
                </button>

                <button
                  type="button"
                  className="inline-flex items-center justify-center px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition"
                  disabled={Object.keys(suggestions).length === 0}
                  onClick={async () => {
                    for (const r of rows) {
                      const s = suggestions[r.id];
                      if (s && s.trim()) {
                        await updateRow(r.id, { caption: s.trim() });
                      }
                    }
                    setSuggestions({});
                  }}
                  title="Apply all suggested captions"
                >
                  Apply all
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition"
                  disabled={Object.keys(suggestions).length === 0}
                  onClick={() => setSuggestions({})}
                  title="Discard all suggested captions"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Photo grid (now always below the captions panel) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {rows.map((img) => {
          const meta = metaMap[img.id] || {};
          const hasUrl = !!img.publicUrl;
          return (
            <div
              key={img.id}
              className="border border-gray-200 rounded-lg overflow-hidden bg-white"
            >
              {/* Image + delete */}
              <div className="relative group">
                {hasUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      const visible = rows.filter((r) => !!r.publicUrl);
                      const visibleIndex = visible.findIndex(
                        (r) => r.id === img.id
                      );
                      setLbIndex(Math.max(0, visibleIndex));
                      setLbOpen(true);
                    }}
                    className="block w-full"
                    title="Open"
                  >
                    <div className="w-full aspect-square bg-gray-50 overflow-hidden">
                      <img
                        src={img.publicUrl!}
                        alt={img.alt_text || ""}
                        loading="lazy"
                        className="
                          w-full h-full object-contain
                          transition-transform duration-200 ease-out
                          transform-gpu will-change-transform
                          group-hover:scale-[1.02]
                          [backface-visibility:hidden]
                        "
                      />
                    </div>
                  </button>
                ) : (
                  <div className="w-full aspect-square bg-gray-100" />
                )}

                <button
                  onClick={() => removeRow(img.id, img.storage_path)}
                  className="absolute top-1 right-1 inline-flex items-center justify-center p-1.5 rounded-md bg-white/90 text-gray-600 hover:text-gray-900 hover:bg-white shadow"
                  title="Delete image"
                  aria-label="Delete image"
                >
                  <FaTrash className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Meta line + green tick */}
              <div className="px-2 pt-1 pb-0.5 text-[11px] text-gray-600 flex items-center gap-1">
                <span>
                  {meta.w && meta.h ? `${meta.w}×${meta.h}` : "—"}
                  {typeof meta.kb === "number" ? ` • ${meta.kb} KB` : ""}
                </span>
                <FaCheckCircle
                  className="w-3.5 h-3.5 text-green-600 ml-auto"
                  title="Uploaded on Database"
                  aria-label="Uploaded on Database"
                />
              </div>

              {/* Alt + Caption (compact) */}
              <div className="p-2 space-y-1.5">
                <label className="block">
                  <span className="sr-only">Alt text</span>
                  <input
                    className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Alt text"
                    value={img.alt_text || ""}
                    onChange={(e) =>
                      updateRow(img.id, { alt_text: e.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Caption</span>
                  <input
                    className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Caption"
                    value={img.caption || ""}
                    onChange={(e) =>
                      updateRow(img.id, { caption: e.target.value })
                    }
                  />
                </label>

                {/* Suggested caption (non-destructive, apply on click) */}
                {suggestions[img.id] && (
                  <div className="flex items-start gap-2 pt-1">
                    <div className="text-[11px] text-gray-600 flex-1 border border-dashed border-gray-300 rounded-md px-2 py-1 bg-gray-50">
                      <span className="font-medium">Suggested:</span>{" "}
                      {suggestions[img.id]}
                    </div>
                    <button
                      type="button"
                      className="text-[11px] px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-100 active:bg-gray-200 transition"
                      title="Apply suggested caption"
                      onClick={() =>
                        updateRow(img.id, { caption: suggestions[img.id] })
                      }
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="text-sm text-gray-500 mt-2">
          No images yet. Use the uploader above.
        </div>
      )}

      {/* Upload progress popup */}
      {showPopup && (
        <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[90vw] rounded-xl border border-emerald-200 bg-white shadow-lg">
          <div className="px-3 py-2 border-b border-emerald-100 bg-emerald-50 rounded-t-xl">
            <div className="text-sm font-semibold text-emerald-700">
              Uploading {uploadingCount} of {totalCount}
            </div>
          </div>
          <div className="max-h-56 overflow-auto p-3 space-y-2">
            {uploads.map((u) => (
              <div key={u.key} className="space-y-1">
                <div className="text-xs text-gray-700 truncate">{u.name}</div>
                <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-emerald-500"
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
                <div className="text-[10px] text-emerald-700 font-medium">
                  {u.progress}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete All confirmation modal (password re-auth) */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="text-lg font-semibold text-gray-900">
                Delete all images
              </div>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-700">
                You are about to{" "}
                <span className="font-semibold text-red-600">
                  permanently delete
                </span>{" "}
                <b>{rows.length}</b> image{rows.length === 1 ? "" : "s"} for
                this site. This is a <b>hard delete</b> from both the database
                and storage, and cannot be undone.
              </p>

              <div className="text-sm text-gray-600">
                Signed in as: <b>{currentEmail || "—"}</b>
              </div>

              <label className="block">
                <div className="text-sm font-medium text-gray-800 mb-1">
                  Email
                </div>
                <input
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium text-gray-800 mb-1">
                  Password
                </div>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Your password"
                  type="password"
                  autoComplete="current-password"
                />
              </label>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 hover:bg-gray-100 text-sm"
                onClick={closeDeleteAllModal}
                disabled={deletingAll}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-60 text-sm"
                onClick={deleteAllConfirmed}
                disabled={deletingAll}
                title="This will permanently delete all gallery images"
              >
                {deletingAll ? "Deleting…" : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox render */}
      {lbOpen && lightboxPhotos.length > 0 && (
        <Lightbox
          photos={lightboxPhotos}
          startIndex={lbIndex}
          onClose={() => setLbOpen(false)}
        />
      )}
    </div>
  );
}
