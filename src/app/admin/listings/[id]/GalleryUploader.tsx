// src/app/admin/listings/[id]/GalleryUploader.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { FaTrash, FaCheckCircle } from "react-icons/fa";
import { Lightbox } from "@/components/ui/Lightbox";
import { generateAltAndCaptionsAction } from "./gallery-actions"; // ✅ updated import
import type { CaptionAltOut } from "./gallery-actions";

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

  // 🔹 AI caption+alt generator state
  const [contextArticle, setContextArticle] = useState<string>("");
  const [suggestions, setSuggestions] = useState<
    Record<string, { alt: string; caption: string }>
  >({});
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // file input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete-all modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Lightbox
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

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

    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => !u.done));
    }, 800);

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

  // -------- Delete All --------
  const galleryFolder = useMemo(() => `gallery/${siteId}`, [siteId]);

  function openDeleteAllModal() {
    setConfirmEmail(currentEmail ?? "");
    setConfirmPassword("");
    setShowConfirm(true);
  }

  function closeDeleteAllModal() {
    if (!deletingAll) setShowConfirm(false);
  }

  async function deleteAllConfirmed() {
    if (!currentUserId) {
      alert("No authenticated user found.");
      return;
    }
    if (!confirmEmail || !confirmPassword) {
      alert("Please enter your email and password.");
      return;
    }

    setDeletingAll(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: confirmEmail.trim(),
        password: confirmPassword,
      });
      if (error || !data.user) throw new Error(error?.message || "Auth failed");
      if (data.user.id !== currentUserId) {
        await supabase.auth.signOut();
        throw new Error("Wrong account. Use the same account.");
      }

      const { error: dbErr } = await supabase
        .from("site_images")
        .delete()
        .eq("site_id", siteId);
      if (dbErr) throw dbErr;

      let keys = rows.map((r) => r.storage_path).filter(Boolean);
      try {
        const listed = await supabase.storage
          .from("site-images")
          .list(galleryFolder);
        keys = [...new Set([...keys, ...(listed?.map((x) => x.name) || [])])];
      } catch {}

      if (keys.length) {
        await supabase.storage.from("site-images").remove(keys);
      }

      await load();
      setShowConfirm(false);
    } catch (err: any) {
      alert(err?.message || "Failed to delete all images.");
    } finally {
      setDeletingAll(false);
    }
  }

  // -------- Lightbox --------
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
            id: String(siteId),
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
  const showPopup = uploadingCount > 0;

  return (
    <div className="relative">
      {/* uploader */}
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
          >
            Delete All
          </button>
        )}
      </div>

      {/* right panel */}
      <div className="mb-4 grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-4 items-start">
        <div />
        <aside className="lg:sticky lg:top-4">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60">
              <h3 className="text-sm font-semibold text-gray-900">
                Alt + Caption Generator
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                className="mt-1 w-full border border-gray-300 rounded-xl p-3 min-h-[120px] text-sm"
                placeholder="Paste site article/context..."
                value={contextArticle}
                onChange={(e) => setContextArticle(e.target.value)}
              />
              {genError && (
                <div className="text-xs text-red-600">{genError}</div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-black text-white text-sm"
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
                      const res: CaptionAltOut[] =
                        await generateAltAndCaptionsAction({
                          contextArticle,
                          imagesIn,
                        });
                      const map: Record<
                        string,
                        { alt: string; caption: string }
                      > = {};
                      for (const c of res)
                        map[c.id] = { alt: c.alt, caption: c.caption };
                      setSuggestions(map);
                    } catch (e: any) {
                      setGenError(e?.message ?? "Failed to generate");
                    } finally {
                      setGenLoading(false);
                    }
                  }}
                >
                  {genLoading ? "Generating…" : "Generate"}
                </button>
                <button
                  type="button"
                  className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-sm"
                  disabled={Object.keys(suggestions).length === 0}
                  onClick={async () => {
                    for (const r of rows) {
                      const s = suggestions[r.id];
                      if (s) {
                        await updateRow(r.id, {
                          alt_text: s.alt.trim(),
                          caption: s.caption.trim(),
                        });
                      }
                    }
                    setSuggestions({});
                  }}
                >
                  Apply all
                </button>
                <button
                  type="button"
                  className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-sm"
                  disabled={Object.keys(suggestions).length === 0}
                  onClick={() => setSuggestions({})}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {rows.map((img) => {
          const meta = metaMap[img.id] || {};
          const s = suggestions[img.id];
          return (
            <div
              key={img.id}
              className="border border-gray-200 rounded-lg overflow-hidden bg-white"
            >
              {/* image */}
              <div className="relative group">
                {img.publicUrl && (
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
                  >
                    <div className="w-full aspect-square bg-gray-50 overflow-hidden">
                      <img
                        src={img.publicUrl}
                        alt={img.alt_text || ""}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </button>
                )}
                <button
                  onClick={() => removeRow(img.id, img.storage_path)}
                  className="absolute top-1 right-1 p-1.5 bg-white/90 rounded-md"
                >
                  <FaTrash className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* meta */}
              <div className="px-2 pt-1 pb-0.5 text-[11px] flex items-center">
                <span>
                  {meta.w && meta.h ? `${meta.w}×${meta.h}` : "—"}
                  {typeof meta.kb === "number" ? ` • ${meta.kb} KB` : ""}
                </span>
                <FaCheckCircle className="w-3.5 h-3.5 text-green-600 ml-auto" />
              </div>
              {/* fields */}
              <div className="p-2 space-y-1.5">
                <input
                  className="w-full border rounded-md px-2 py-1 text-xs"
                  placeholder="Alt text"
                  value={img.alt_text || ""}
                  onChange={(e) =>
                    updateRow(img.id, { alt_text: e.target.value })
                  }
                />
                <input
                  className="w-full border rounded-md px-2 py-1 text-xs"
                  placeholder="Caption"
                  value={img.caption || ""}
                  onChange={(e) =>
                    updateRow(img.id, { caption: e.target.value })
                  }
                />
                {s && (
                  <div className="space-y-1 border-t pt-1">
                    <div className="text-[11px]">
                      <b>Suggested Alt:</b> {s.alt}
                      <button
                        className="ml-2 text-[11px] underline"
                        onClick={() => updateRow(img.id, { alt_text: s.alt })}
                      >
                        Apply
                      </button>
                    </div>
                    <div className="text-[11px]">
                      <b>Suggested Caption:</b> {s.caption}
                      <button
                        className="ml-2 text-[11px] underline"
                        onClick={() =>
                          updateRow(img.id, { caption: s.caption })
                        }
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* popup */}
      {showPopup && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border bg-white shadow-lg">
          <div className="px-3 py-2 border-b bg-emerald-50">
            <div className="text-sm font-semibold text-emerald-700">
              Uploading {uploadingCount}
            </div>
          </div>
        </div>
      )}

      {/* delete modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-lg border">
            <div className="px-4 py-3 border-b">
              <div className="text-lg font-semibold">Delete all images</div>
            </div>
            <div className="p-4">
              <p>
                Permanently delete <b>{rows.length}</b> images for this site.
              </p>
              <label>Email</label>
              <input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
              />
              <label>Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={closeDeleteAllModal}>Cancel</button>
                <button
                  onClick={deleteAllConfirmed}
                  className="bg-red-600 text-white px-3 py-2 rounded"
                >
                  {deletingAll ? "Deleting…" : "Delete All"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
