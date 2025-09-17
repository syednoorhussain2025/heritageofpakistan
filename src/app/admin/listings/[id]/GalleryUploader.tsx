// src/app/admin/listings/[id]/GalleryUploader.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { FaTrash, FaCheckCircle } from "react-icons/fa";
import { Lightbox } from "@/components/ui/Lightbox";
import {
  generateAltAndCaptionsAction,
  getCaptionEngineInfo, // ⬅️ fetch active model from the server (respects RLS)
} from "./gallery-actions";
import type { CaptionAltOut } from "./gallery-actions";

/* -------------------- URL Helpers -------------------- */
async function publicUrl(
  bucket: string,
  key: string,
  opts?: { width?: number; quality?: number; resize?: "contain" | "cover" }
) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(key, {
    transform: opts?.width
      ? {
          width: opts.width,
          quality: opts.quality ?? 75,
          resize: opts.resize ?? "contain",
        }
      : undefined,
  });
  const url = new URL(data.publicUrl);
  url.searchParams.set("t", String(Date.now()));
  return url.toString();
}

function encodeRFC3986(seg: string) {
  return encodeURIComponent(seg).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function rawUrlFromStoragePath(key: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const encodedKey = key
    .split("/")
    .map((seg) => encodeRFC3986(seg.trim()))
    .join("/");
  const url = new URL(
    `${base}/storage/v1/object/public/site-images/${encodedKey}`
  );
  url.searchParams.set("t", String(Date.now()));
  return url.toString();
}

async function signedUrlForAI(
  key: string,
  expiresInSec = 900
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from("site-images")
      .createSignedUrl(key, expiresInSec, {
        transform: { width: 1600, quality: 72, resize: "contain" },
      });
    if (error || !data?.signedUrl) return null;
    const url = new URL(data.signedUrl);
    url.searchParams.set("ai", "1");
    url.searchParams.set("t", String(Date.now()));
    return url.toString();
  } catch {
    return null;
  }
}

async function urlReachable(
  url: string,
  timeoutMs = 6500
): Promise<{ ok: boolean; status?: number; contentType?: string }> {
  const attempt = async (method: "HEAD" | "GET") => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const init: RequestInit = {
        method,
        cache: "no-store",
        signal: ctl.signal,
        headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      };
      const res = await fetch(url, init);
      const ct = res.headers.get("content-type") || "";
      return {
        ok: res.ok && ct.startsWith("image/"),
        status: res.status,
        contentType: ct,
      };
    } finally {
      clearTimeout(timer);
    }
  };
  const head = await attempt("HEAD");
  if (head.ok) return head;
  return attempt("GET");
}

async function bestUrlForAI(
  key: string
): Promise<{ url: string; variant: "signed" | "public+transform" | "raw" }> {
  const signed = await signedUrlForAI(key);
  if (signed) {
    const chk = await urlReachable(signed);
    if (chk.ok) return { url: signed, variant: "signed" };
  }
  const pubTrans = await publicUrl("site-images", key, {
    width: 1600,
    quality: 72,
    resize: "contain",
  });
  const chk2 = await urlReachable(pubTrans);
  if (chk2.ok) return { url: pubTrans, variant: "public+transform" };
  const raw = rawUrlFromStoragePath(key);
  const chk3 = await urlReachable(raw);
  if (chk3.ok) return { url: raw, variant: "raw" };
  return { url: raw, variant: "raw" };
}

/* ------------------------- Types ------------------------- */
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
  progress: number;
  done: boolean;
};

type UsageShape =
  | {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    }
  | undefined;

type ActionReturn =
  | CaptionAltOut[]
  | {
      items?: CaptionAltOut[];
      data?: CaptionAltOut[];
      meta?: {
        modelId?: string;
        usage?: UsageShape;
        usdEstimate?: number | null;
      };
      usage?: UsageShape;
      modelId?: string;
      usdEstimate?: number | null;
    };

/* ---------------------- Component ---------------------- */
const GEN_CHUNK_SIZE = 12;

export default function GalleryUploader({
  siteId,
}: {
  siteId: string | number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaMap, setMetaMap] = useState<Record<string, Meta>>({});
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // AI state
  const [contextArticle, setContextArticle] = useState<string>("");
  const [suggestions, setSuggestions] = useState<
    Record<string, { alt: string; caption: string }>
  >({});
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // progress
  const [genTotal, setGenTotal] = useState(0);
  const [genDone, setGenDone] = useState(0);

  // diagnostics: unreachable/skipped images
  const [skipped, setSkipped] = useState<
    {
      id: string;
      url: string;
      filename: string;
      status?: number;
      contentType?: string;
      variant?: string;
    }[]
  >([]);

  // live run details (model + tokens + cost)
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [tokIn, setTokIn] = useState(0);
  const [tokOut, setTokOut] = useState(0);
  const [tokTotal, setTokTotal] = useState(0);
  const [usd, setUsd] = useState<number | null>(null);
  const [chunksDone, setChunksDone] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);

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

  /** Fetch active model from the server (respects RLS) */
  async function fetchActiveModelLabel() {
    try {
      const info = await getCaptionEngineInfo();
      setActiveModel(info?.modelId ?? null);
    } catch {
      setActiveModel((prev) => prev ?? null);
    }
  }

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
          ? await publicUrl("site-images", r.storage_path, {
              width: 800,
              quality: 72,
            })
          : null,
      }))
    );

    setRows(withUrls);
    setLoading(false);
    computeAllMeta(withUrls);
  }

  useEffect(() => {
    load();
    fetchActiveModelLabel();
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
    setTimeout(() => setUploads((prev) => prev.filter((u) => !u.done)), 800);
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
      const resp = await fetch(r.publicUrl, {
        method: "HEAD",
        cache: "no-store",
      });
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
        keys = [
          ...new Set([
            ...keys,
            ...(listed?.map((x) => `${galleryFolder}/${x.name}`) || []),
          ]),
        ];
      } catch {}

      if (keys.length) await supabase.storage.from("site-images").remove(keys);

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

  /* ---------------------- Generate helpers ---------------------- */
  function isMissing(r: Row) {
    const a = (r.alt_text || "").trim();
    const c = (r.caption || "").trim();
    return a.length === 0 || c.length === 0;
  }

  function extractActionPayload(res: ActionReturn): {
    items: CaptionAltOut[];
    modelId?: string | null;
    usageIn?: number;
    usageOut?: number;
    usageTotal?: number;
    usdEstimate?: number | null;
  } {
    if (Array.isArray(res)) return { items: res };
    const items = (res.items ?? res.data) as CaptionAltOut[] | undefined;
    const usage = (res.meta?.usage ?? res.usage) as UsageShape | undefined;
    const modelId = (res.meta?.modelId ?? res.modelId) as string | undefined;
    const usdEstimate = (res.meta?.usdEstimate ?? res.usdEstimate) as
      | number
      | undefined;
    return {
      items: items ?? [],
      modelId: modelId ?? undefined,
      usageIn: usage?.prompt_tokens,
      usageOut: usage?.completion_tokens,
      usageTotal: usage?.total_tokens,
      usdEstimate,
    };
  }

  async function generateFor(list: Row[]) {
    // Reset live counters
    setTokIn(0);
    setTokOut(0);
    setTokTotal(0);
    setUsd(null);
    setChunksDone(0);

    // Display the model that the server will actually use
    await fetchActiveModelLabel();

    // Resolve AI-ready URLs
    const resolved = await Promise.all(
      list.map(async (r) => {
        const best = await bestUrlForAI(r.storage_path);
        return {
          id: r.id,
          aiUrl: best.url,
          variant: best.variant,
          filename: r.storage_path.split("/").pop() || r.storage_path,
          alt: r.alt_text || null,
        };
      })
    );

    // Preflight and diagnostics
    const checks = await Promise.all(
      resolved.map(async (x) => {
        const ch = await urlReachable(x.aiUrl);
        return { x, ch };
      })
    );
    const good = checks.filter(({ ch }) => ch.ok).map(({ x }) => x);
    const bad = checks
      .filter(({ ch }) => !ch.ok)
      .map(({ x, ch }) => ({
        id: x.id,
        url: x.aiUrl,
        filename: x.filename || "",
        status: ch.status,
        contentType: ch.contentType,
        variant: x.variant,
      }));

    setSkipped(bad);
    setGenTotal(good.length);
    setGenDone(0);

    const totalChunks = Math.ceil(good.length / GEN_CHUNK_SIZE);
    setChunksTotal(totalChunks);

    for (let i = 0; i < good.length; i += GEN_CHUNK_SIZE) {
      const chunk = good.slice(i, i + GEN_CHUNK_SIZE);

      const res = (await generateAltAndCaptionsAction({
        contextArticle,
        imagesIn: chunk.map((c) => ({
          id: c.id,
          publicUrl: c.aiUrl,
          filename: c.filename,
          alt: null,
        })),
        siteId,
        siteName: siteTitle,
      })) as ActionReturn;

      // Extract items + usage and merge
      const { items, modelId, usageIn, usageOut, usageTotal, usdEstimate } =
        extractActionPayload(res);

      if (modelId && !activeModel) setActiveModel(modelId);
      if (typeof usageIn === "number") setTokIn((p) => p + usageIn);
      if (typeof usageOut === "number") setTokOut((p) => p + usageOut);
      if (typeof usageTotal === "number") setTokTotal((p) => p + usageTotal);
      if (typeof usdEstimate === "number")
        setUsd((p) => (p ?? 0) + usdEstimate);

      // Merge suggestions
      setSuggestions((prev) => {
        const next = { ...prev };
        for (const c of items) next[c.id] = { alt: c.alt, caption: c.caption };
        return next;
      });

      setGenDone((prev) => prev + chunk.length);
      setChunksDone((prev) => prev + 1);
    }
  }

  async function onGenerateAll() {
    try {
      setGenError(null);
      setGenLoading(true);
      setSuggestions({});
      setSkipped([]);
      await generateFor(rows.filter((r) => !!r.storage_path));
    } catch (e: any) {
      setGenError(e?.message ?? "Failed to generate");
    } finally {
      setGenLoading(false);
    }
  }

  async function onGenerateRemaining() {
    try {
      setGenError(null);
      setGenLoading(true);
      setSuggestions({});
      setSkipped([]);
      const remaining = rows.filter((r) => !!r.storage_path && isMissing(r));
      await generateFor(remaining);
    } catch (e: any) {
      setGenError(e?.message ?? "Failed to generate");
    } finally {
      setGenLoading(false);
    }
  }

  /* ---------------- Render ---------------- */
  if (loading) return <div className="text-gray-500">Loading Gallery…</div>;

  const uploadingCount = uploads.filter((u) => !u.done).length;
  const showPopup = uploadingCount > 0;

  const hasGenProgress = genLoading && genTotal > 0;
  const genRemaining = Math.max(0, genTotal - genDone);
  const genPct =
    genTotal > 0 ? Math.min(100, Math.round((genDone / genTotal) * 100)) : 0;

  const missingCount = rows.reduce((acc, r) => acc + (isMissing(r) ? 1 : 0), 0);

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
      <div className="mb-4 grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-4 items-start">
        <div />
        <aside className="lg:sticky lg:top-4">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60">
              <h3 className="text-sm font-semibold text-gray-900">
                Alt + Caption Generator
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <textarea
                className="mt-1 w-full border border-gray-300 rounded-xl p-3 min-h-[120px] text-sm"
                placeholder="Paste site article/context..."
                value={contextArticle}
                onChange={(e) => setContextArticle(e.target.value)}
              />

              {/* quick stats */}
              <div className="text-xs text-gray-600">
                Missing items: <b>{missingCount}</b> / {rows.length}
              </div>

              {/* live run details */}
              {(genLoading || tokTotal > 0 || activeModel) && (
                <div className="rounded-xl border border-gray-200 p-3 bg-white/60">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <div>
                        <span className="text-gray-600">Model:&nbsp;</span>
                        <span className="font-medium">
                          {activeModel ?? "—"}
                        </span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-gray-700">
                        <div>
                          Prompt tokens: <b>{tokIn}</b>
                        </div>
                        <div>
                          Completion tokens: <b>{tokOut}</b>
                        </div>
                        <div>
                          Total tokens: <b>{tokTotal}</b>
                        </div>
                        <div>
                          Estimated USD:{" "}
                          <b>{usd != null ? `$${usd.toFixed(4)}` : "—"}</b>
                        </div>
                      </div>
                    </div>
                    {chunksTotal > 0 && (
                      <div className="text-[12px] text-gray-600">
                        Chunks: <b>{chunksDone}</b>/<b>{chunksTotal}</b>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* diagnostics for skipped images */}
              {skipped.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-medium mb-1">
                    Skipped {skipped.length} unreachable image
                    {skipped.length > 1 ? "s" : ""}.
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 max-h-28 overflow-auto">
                    {skipped.slice(0, 6).map((s) => (
                      <li key={s.id}>
                        <span className="font-mono">{s.filename}</span>{" "}
                        <span className="text-amber-700">
                          [{s.variant ?? "—"}]
                          {s.status ? ` status ${s.status}` : ""}
                          {s.contentType && !s.contentType.startsWith("image/")
                            ? `, content-type: ${s.contentType}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {skipped.length > 6 && (
                    <div className="mt-1">…and {skipped.length - 6} more.</div>
                  )}
                  <div className="mt-2 text-[11px] text-amber-800">
                    Tip: we prefer <b>signed + transformed</b> URLs to reduce
                    timeouts. If you still see skips, try again.
                  </div>
                </div>
              )}

              {/* progress panel */}
              {(genLoading || genTotal > 0) && (
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <div className="font-medium">
                      Generating… {genDone}/{genTotal}
                    </div>
                    <div className="text-gray-600">
                      Remaining: {Math.max(0, genTotal - genDone)}
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-2 bg-emerald-500 transition-all"
                      style={{ width: `${genPct}%` }}
                    />
                  </div>
                </div>
              )}

              {genError && (
                <div className="text-xs text-red-600">{genError}</div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-black text-white text-sm disabled:opacity-60"
                  disabled={rows.length === 0 || genLoading}
                  onClick={onGenerateAll}
                >
                  {genLoading && genTotal > 0
                    ? `Generating… ${genDone}/${genTotal}`
                    : "Generate All"}
                </button>

                <button
                  type="button"
                  className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-sm disabled:opacity-60"
                  disabled={
                    rows.length === 0 || genLoading || missingCount === 0
                  }
                  onClick={onGenerateRemaining}
                  title={
                    missingCount === 0
                      ? "No photos with missing alt/caption"
                      : "Generate for missing only"
                  }
                >
                  Generate Remaining
                </button>

                <button
                  type="button"
                  className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-sm disabled:opacity-60"
                  disabled={Object.keys(suggestions).length === 0 || genLoading}
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
                  className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-sm disabled:opacity-60"
                  disabled={Object.keys(suggestions).length === 0 || genLoading}
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

              <div className="px-2 pt-1 pb-0.5 text-[11px] flex items-center">
                <span>
                  {meta.w && meta.h ? `${meta.w}×${meta.h}` : "—"}
                  {typeof meta.kb === "number" ? ` • ${meta.kb} KB` : ""}
                </span>
                <FaCheckCircle className="w-3.5 h-3.5 text-green-600 ml-auto" />
              </div>

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

      {/* upload popup */}
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
