// src/app/admin/listings/[id]/GalleryUploader.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TextareaHTMLAttributes } from "react";
import { supabase } from "@/lib/supabase/browser";
import {
  FaTrash,
  FaCheckCircle,
  FaRedoAlt,
  FaSearchPlus,
} from "react-icons/fa";
import { Lightbox } from "@/components/ui/Lightbox";
import {
  generateAltAndCaptionsAction,
  generateTagsAction,
  getCaptionEngineInfo,
} from "./gallery-actions";
import type { CaptionAltOut, TagDimensionVocab } from "./gallery-actions";
type TagDimension = { id: string; name: string; slug: string; is_multi: boolean; ai_enabled: boolean; values: { id: string; value: string; is_active: boolean }[] };
type ImageTag = { id: string; site_image_id: string; dimension_id: string; value: string; source: "ai" | "manual" };

/* ── Photo tag API helpers (fetch-based, avoids server action nesting issue) ── */
async function getTagVocabulary(): Promise<TagDimension[]> {
  const res = await fetch("/api/admin/photo-tags?action=vocabulary");
  if (!res.ok) throw new Error("Failed to fetch tag vocabulary");
  return res.json();
}
async function getTagsForImages(imageIds: string[]): Promise<ImageTag[]> {
  if (!imageIds.length) return [];
  // Use POST to avoid URL length limits with large image sets (250+ UUIDs breaks GET query string)
  const res = await fetch("/api/admin/photo-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get-tags-for-images", imageIds }),
  });
  if (!res.ok) throw new Error("Failed to fetch tags");
  return res.json();
}
async function getTagsForSite(siteId: string): Promise<ImageTag[]> {
  // Query by site_id directly — no ID list needed, avoids passing 250+ UUIDs on initial load
  const res = await fetch("/api/admin/photo-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get-tags-for-site", siteId }),
  });
  if (!res.ok) throw new Error("Failed to fetch tags");
  return res.json();
}
async function saveAiTags(suggestions: { imageId: string; tags: Record<string, string[]> }[]): Promise<void> {
  const res = await fetch("/api/admin/photo-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save-ai-tags", suggestions }),
  });
  if (!res.ok) throw new Error("Failed to save tags");
}
async function addManualTag(siteImageId: string, dimensionId: string, value: string): Promise<ImageTag> {
  const res = await fetch("/api/admin/photo-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add-manual-tag", siteImageId, dimensionId, value }),
  });
  if (!res.ok) throw new Error("Failed to add tag");
  return res.json();
}
async function deleteTag(tagId: string): Promise<void> {
  const res = await fetch("/api/admin/photo-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete-tag", tagId }),
  });
  if (!res.ok) throw new Error("Failed to delete tag");
}
async function deleteAllTagsForSite(siteId: string): Promise<void> {
  const res = await fetch("/api/admin/photo-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete-all-tags-for-site", siteId }),
  });
  if (!res.ok) throw new Error("Failed to delete all tags");
}
import { encode } from "blurhash";
import { getVariantPublicUrl } from "@/lib/imagevariants";

/* -------------------- URL + Reachability Helpers -------------------- */


async function urlReachable(
  url: string,
  timeoutMs = 6500
): Promise<{ ok: boolean; status?: number; contentType?: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: ctl.signal,
    });
    const ct = res.headers.get("content-type") || "";
    return {
      ok: res.ok, // trust HTTP 200 — Supabase sometimes returns octet-stream for valid images
      status: res.status,
      contentType: ct,
    };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Run urlReachable checks with limited concurrency to avoid storage 429s. */
async function checkUrlsBatched<T extends { aiUrl: string }>(
  items: T[],
  concurrency = 8
): Promise<{ x: T; ch: Awaited<ReturnType<typeof urlReachable>> }[]> {
  const results: { x: T; ch: Awaited<ReturnType<typeof urlReachable>> }[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const checked = await Promise.all(batch.map(async (x) => ({ x, ch: await urlReachable(x.aiUrl) })));
    results.push(...checked);
  }
  return results;
}


/* ------------------------- Types ------------------------- */
type Row = {
  id: string;
  site_id: string | number;
  storage_path: string;
  sort_order: number | null;
  alt_text: string | null;
  caption: string | null;
  scene_description: string | null;
  width?: number | null;
  height?: number | null;
  blur_hash?: string | null;
  blur_data_url?: string | null;
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

/* ---------------- Variant key helper ---------------- */

function allVariantKeys(originalPath: string): string[] {
  if (!originalPath) return [];

  const lastDot = originalPath.lastIndexOf(".");
  if (lastDot === -1) {
    // no extension, just append suffixes
    return [
      originalPath,              // original
      `${originalPath}_thumb`,
      `${originalPath}_sm`,
      `${originalPath}_md`,
      `${originalPath}_lg`,
      `${originalPath}_hero`,
    ];
  }

  const base = originalPath.slice(0, lastDot);
  const ext = originalPath.slice(lastDot);

  return [
    originalPath,               // original
    `${base}_thumb${ext}`,
    `${base}_sm${ext}`,
    `${base}_md${ext}`,
    `${base}_lg${ext}`,
    `${base}_hero${ext}`,
  ];
}

/* ---------------- Blur + Dimension helpers (client-side) ---------------- */

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

async function extractImageMetaFromFile(file: File): Promise<{
  width: number | null;
  height: number | null;
  blurHash: string | null;
  blurDataURL: string | null;
}> {
  try {
    const img = await loadImageFromFile(file);
    const width = img.naturalWidth || img.width || null;
    const height = img.naturalHeight || img.height || null;

    if (!width || !height) {
      return { width, height, blurHash: null, blurDataURL: null };
    }

    // Downscale for blurhash to keep it cheap
    const maxSize = 64;
    const scale = Math.min(maxSize / width, maxSize / height, 1);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { width, height, blurHash: null, blurDataURL: null };
    }

    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);

    const blurHash = encode(imageData.data, w, h, 4, 4);
    const blurDataURL = canvas.toDataURL("image/jpeg", 0.6);

    return { width, height, blurHash, blurDataURL };
  } catch {
    return { width: null, height: null, blurHash: null, blurDataURL: null };
  }
}

/* ---------------------- Auto-grow Textarea ---------------------- */
function AutoGrowTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }
) {
  const { className = "", onChange, minRows = 2, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    sync();
  }, [rest.value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={minRows}
      onInput={sync}
      onChange={(e) => {
        onChange?.(e);
        requestAnimationFrame(sync);
      }}
      className={[
        "w-full border border-gray-200 rounded-md px-2 py-1 pr-8",
        "text-[11px] text-gray-600 leading-snug",
        "overflow-hidden resize-none",
        className,
      ].join(" ")}
    />
  );
}

/* ---------------------- Component ---------------------- */
const GEN_CHUNK_SIZE = 6;

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
  const [sceneDescriptions, setSceneDescriptions] = useState<Record<string, string>>({});
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const stopRequestedRef = useRef(false);
  // Description popup
  const [descPopup, setDescPopup] = useState<{ imageId: string; text: string } | null>(null);
  // Tag popup (deferred rendering — tags already in imageTags state)
  const [tagPopupImageId, setTagPopupImageId] = useState<string | null>(null);

  // Tag state
  const [vocabulary, setVocabulary] = useState<TagDimension[]>([]);
  // imageId → array of saved tags
  const [imageTags, setImageTags] = useState<Record<string, ImageTag[]>>({});
  const [tagLoading, setTagLoading] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  // imageId → dimension_id → input value for manual tag entry
  const [manualTagInput, setManualTagInput] = useState<Record<string, Record<string, string>>>({});

  // progress
  const [genTotal, setGenTotal] = useState(0);
  const [genDone, setGenDone] = useState(0);

  // Generation popup visualizer
  type BatchStep = "pending" | "captions" | "captions_saved" | "tags" | "tags_saved" | "done" | "error";
  type BatchEntry = {
    batchIndex: number;
    imageIds: string[];
    filenames: string[];
    captionStep: BatchStep;
    tagStep: BatchStep;
    error?: string;
  };
  const [genPopupOpen, setGenPopupOpen] = useState(false);
  const [genBatches, setGenBatches] = useState<BatchEntry[]>([]);

  // diagnostics
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

  // live run details
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [tokIn, setTokIn] = useState(0);
  const [tokOut, setTokOut] = useState(0);
  const [tokTotal, setTokTotal] = useState(0);
  const [usd, setUsd] = useState<number | null>(null);
  const [chunksDone, setChunksDone] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);

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

  // Page load visualizer
  type LoadStep = { label: string; status: "pending" | "loading" | "done" | "error"; detail?: string };
  const [loadSteps, setLoadSteps] = useState<LoadStep[]>([]);
  const [loadPopupOpen, setLoadPopupOpen] = useState(false);

  function setLoadStep(label: string, status: LoadStep["status"], detail?: string) {
    setLoadSteps((prev) => {
      const idx = prev.findIndex((s) => s.label === label);
      const updated = { label, status, detail };
      if (idx === -1) return [...prev, updated];
      return prev.map((s, i) => (i === idx ? updated : s));
    });
  }

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);


  useEffect(() => {
    (async () => {
      const [{ data: userData }, { data: siteData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("sites").select("title").eq("id", siteId).maybeSingle(),
      ]);
      setCurrentEmail(userData?.user?.email ?? null);
      setCurrentUserId(userData?.user?.id ?? null);
      setSiteTitle(siteData?.title || "");
    })();
  }, [siteId]);

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
    setLoadSteps([]);
    setLoadPopupOpen(true);

    // Step 1: images
    setLoadStep("Images", "loading");
    const { data, error } = await supabase
      .from("site_images")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true });

    if (error) {
      setLoadStep("Images", "error", error.message);
      console.error("site_images load error:", error);
      alert(error.message);
      setLoading(false);
      setLoadPopupOpen(false);
      return;
    }

    const withUrls: Row[] = (data || []).map((r: any) => {
      const url = r.storage_path
        ? getVariantPublicUrl(r.storage_path, "md")
        : null;
      return { ...r, publicUrl: url };
    });
    setLoadStep("Images", "done", `${withUrls.length} photos`);

    setRows(withUrls);
    setLoading(false);

    // Step 2: tags (fast — single query)
    setLoadStep("Tags", "loading");
    try {
      const tags = await getTagsForSite(String(siteId));
      const byImage: Record<string, ImageTag[]> = {};
      for (const t of tags) {
        if (!byImage[t.site_image_id]) byImage[t.site_image_id] = [];
        byImage[t.site_image_id].push(t);
      }
      setImageTags(byImage);
      setLoadStep("Tags", "done", `${tags.length} tags loaded`);
    } catch (e: any) {
      console.log("[load] getTagsForSite error:", e?.message);
      setLoadStep("Tags", "error", e?.message ?? "Failed");
    }

    // Step 3: metadata — collect all first, then single setMetaMap to avoid 20+ re-renders
    setLoadStep("Metadata", "loading", `0 / ${withUrls.length}`);
    const BATCH = 12;
    const allMeta: Record<string, Meta> = {};
    let done = 0;
    for (let i = 0; i < withUrls.length; i += BATCH) {
      const batch = withUrls.slice(i, i + BATCH);
      const entries = await Promise.all(
        batch.map(async (r) => [r.id, await computeMetaForRow(r)] as const)
      );
      for (const [id, meta] of entries) allMeta[id] = meta;
      done += batch.length;
      setLoadStep("Metadata", "loading", `${done} / ${withUrls.length}`);
    }
    setMetaMap(allMeta); // single state update → single re-render
    setLoadStep("Metadata", "done", `${withUrls.length} images`);

    setLoadPopupOpen(false);
  }

  useEffect(() => {
    load();
    fetchActiveModelLabel();
    getTagVocabulary().then(setVocabulary).catch(console.error);
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
        // 1) Compute dimensions + blurhash + tiny blur data URL in the browser
        const {
          width,
          height,
          blurHash,
          blurDataURL,
        } = await extractImageMetaFromFile(file);

        // 2) Call API route that generates all variants with sharp
        const formData = new FormData();
        formData.append("file", file);
        formData.append("siteId", String(siteId));
        formData.append("key", thisKey);

        const res = await fetch("/api/gallery/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          let msg = "Upload failed";
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {
            // ignore JSON parse error
          }
          alert(msg);
          setUploads((prev) =>
            prev.map((u) =>
              u.key === thisKey ? { ...u, done: true } : u
            )
          );
          continue;
        }

        // 3) Insert DB row with dimensions + blur info
        const { error: dbErr } = await supabase.from("site_images").insert({
          site_id: siteId,
          storage_path: thisKey, // original path
          sort_order: order++,
          width: width ?? null,
          height: height ?? null,
          blur_hash: blurHash ?? null,
          blur_data_url: blurDataURL ?? null,
        });

        if (dbErr) {
          alert(dbErr.message);
        }

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

    const keys = allVariantKeys(storage_path);
    if (keys.length) {
      await supabase.storage.from("site-images").remove(keys);
    }

    setRows((prev) => prev.filter((r) => r.id !== id));
    setMetaMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function computeMetaForRow(r: Row): Promise<Meta> {
    const baseMeta: Meta = {};
    // Prefer DB width/height if already stored
    if (r.width && r.height) {
      baseMeta.w = r.width;
      baseMeta.h = r.height;
    }

    if (!r.publicUrl) return baseMeta;

    const meta: Meta = { ...baseMeta };

    // Only fetch dimensions from image if DB does not have them
    if (!meta.w || !meta.h) {
      try {
        const img = new Image();
        const dims = await new Promise<Meta>((resolve) => {
          img.onload = () =>
            resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({});
          img.src = r.publicUrl!;
        });
        Object.assign(meta, dims);
      } catch {
        // ignore
      }
    }

    // HEAD for KB — skip if we already have dimensions from DB to reduce load-time requests
    if (meta.w && meta.h) return meta;
    try {
      const resp = await fetch(r.publicUrl, {
        method: "HEAD",
        cache: "no-store",
      });
      const len = resp.headers.get("content-length");
      const kb = len ? Math.round(parseInt(len, 10) / 1024) : undefined;
      meta.kb = kb;
    } catch {
      // ignore
    }

    return meta;
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
        const { data: listedData } = await supabase.storage
          .from("site-images")
          .list(galleryFolder);

        const listedKeys =
          listedData?.map((x) => `${galleryFolder}/${x.name}`) ?? [];

        keys = [...new Set([...keys, ...listedKeys])];
      } catch {
        // ignore listing error and just delete from known keys
      }

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

  // -------- Lightbox helpers --------
  function openLightboxFor(id: string) {
    const visible = rows.filter((r) => !!r.publicUrl);
    const visibleIndex = visible.findIndex((r) => r.id === id);
    setLbIndex(Math.max(0, visibleIndex));
    setLbOpen(true);
  }

  // -------- Bulk select helpers --------
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    setBulkWorking(true);
    try {
      const ids = Array.from(selectedIds);
      const selectedRows = rows.filter((r) => ids.includes(r.id));

      const storageKeys = selectedRows
        .flatMap((r) => allVariantKeys(r.storage_path))
        .filter(Boolean);

      const { error: dbErr } = await supabase
        .from("site_images")
        .delete()
        .in("id", ids);
      if (dbErr) throw dbErr;

      if (storageKeys.length) {
        await supabase.storage.from("site-images").remove(storageKeys);
      }

      setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
    } catch (e: any) {
      alert(e?.message || "Failed to delete selected images.");
    } finally {
      setBulkWorking(false);
    }
  }

  // -------- Lightbox photos --------
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
  function isMissingAlt(r: Row) { return !(r.alt_text || "").trim(); }
  function isMissingCaption(r: Row) { return !(r.caption || "").trim(); }
  function isMissingDescription(r: Row) {
    return !(r.scene_description || sceneDescriptions[r.id] || "").trim();
  }
  function isMissingCaptions(r: Row) { return isMissingAlt(r) || isMissingCaption(r); }
  function isMissingTags(r: Row) { return !(imageTags[r.id]?.length); }

  function isMissing(r: Row) {
    return isMissingCaptions(r) || isMissingTags(r) || isMissingDescription(r);
  }

  type GenExtract = {
    items: CaptionAltOut[];
    modelId?: string | null;
    usageIn?: number;
    usageOut?: number;
    usageTotal?: number;
    usdEstimate?: number | null;
  };

  function extractActionPayload(res: ActionReturn): GenExtract {
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

  function bestUrlForAI(key: string): { url: string; variant: string } {
    // Prefer _lg variant; fall back to base. No HEAD probing — doing so for
    // hundreds of images in parallel causes Supabase storage 429s.
    // The urlReachable check after this call will catch any truly missing files.
    const lgUrl = getVariantPublicUrl(key, "lg");
    return { url: lgUrl, variant: "lg" };
  }

  function updateBatch(index: number, patch: Partial<BatchEntry>) {
    setGenBatches((prev) => prev.map((b) => b.batchIndex === index ? { ...b, ...patch } : b));
  }

  /**
   * Unified generator: processes each batch of images fully
   * (captions saved + tags saved) before moving to the next batch.
   */
  async function generateAllForList(
    list: Row[],
    mode: "captions_only" | "tags_only" | "all"
  ) {
    if (!list.length) return;

    setTokIn(0); setTokOut(0); setTokTotal(0); setUsd(null);
    setChunksDone(0); setSkipped([]);
    setGenBatches([]);
    setGenPopupOpen(true);

    await fetchActiveModelLabel();

    // Load vocab if needed (for tags)
    let vocab_dims = vocabulary;
    if (mode !== "captions_only" && !vocab_dims.length) {
      vocab_dims = await getTagVocabulary();
      setVocabulary(vocab_dims);
    }
    if (mode !== "captions_only" && !vocab_dims.length) {
      throw new Error("Tag vocabulary is empty — add dimensions in Image Tags admin.");
    }
    const vocab: TagDimensionVocab[] = vocab_dims.map((d) => ({
      slug: d.slug, name: d.name, ai_enabled: d.ai_enabled,
      values: d.values.map((v) => v.value),
    }));
    const slugToId = new Map(vocab_dims.map((d) => [d.slug, d.id]));

    // URL check
    const resolved = list.map((r) => {
      const best = bestUrlForAI(r.storage_path);
      return { id: r.id, aiUrl: best.url, variant: best.variant, filename: r.storage_path.split("/").pop() || r.storage_path };
    });
    const checks = await checkUrlsBatched(resolved);
    const bad = checks.filter(({ ch }) => !ch.ok).map(({ x, ch }) => ({
      id: x.id, url: x.aiUrl, filename: x.filename, variant: x.variant, status: ch.status, contentType: ch.contentType,
    }));
    if (bad.length) setSkipped(bad);
    const good = checks.filter(({ ch }) => ch.ok).map(({ x }) => x);
    if (!good.length) return;

    const CHUNK = 6;
    const totalChunks = Math.ceil(good.length / CHUNK);
    setGenTotal(good.length);
    setGenDone(0);
    setChunksTotal(totalChunks);

    // Pre-populate all batch entries as pending
    setGenBatches(
      Array.from({ length: totalChunks }, (_, i) => {
        const chunk = good.slice(i * CHUNK, (i + 1) * CHUNK);
        return {
          batchIndex: i,
          imageIds: chunk.map((c) => c.id),
          filenames: chunk.map((c) => c.filename),
          captionStep: mode === "tags_only" ? "done" : "pending",
          tagStep: mode === "captions_only" ? "done" : "pending",
        } as BatchEntry;
      })
    );

    for (let i = 0; i < good.length; i += CHUNK) {
      if (stopRequestedRef.current) break;
      const chunk = good.slice(i, i + CHUNK);
      const batchIndex = Math.floor(i / CHUNK);

      // ── Step 1: Captions ──
      if (mode !== "tags_only") {
        updateBatch(batchIndex, { captionStep: "captions" });
        try {
          const res = (await generateAltAndCaptionsAction({
            contextArticle,
            imagesIn: chunk.map((c) => ({ id: c.id, publicUrl: c.aiUrl, filename: c.filename, alt: null })),
            siteId: String(siteId),
            siteName: siteTitle,
          })) as ActionReturn;

          const { items, modelId, usageIn, usageOut, usageTotal, usdEstimate } = extractActionPayload(res);
          if (modelId && !activeModel) setActiveModel(modelId);
          if (typeof usageIn === "number") setTokIn((p) => p + usageIn);
          if (typeof usageOut === "number") setTokOut((p) => p + usageOut);
          if (typeof usageTotal === "number") setTokTotal((p) => p + usageTotal);
          if (typeof usdEstimate === "number") setUsd((p) => (p ?? 0) + usdEstimate);

          for (const c of items) {
            const patch: Partial<Row> = {};
            if (c.alt?.trim()) patch.alt_text = c.alt.trim();
            if (c.caption?.trim()) patch.caption = c.caption.trim();
            if (c.sceneDescription?.trim()) {
              patch.scene_description = c.sceneDescription.trim();
              setSceneDescriptions((prev) => ({ ...prev, [c.id]: c.sceneDescription! }));
            }
            if (Object.keys(patch).length) await updateRow(c.id, patch);
          }
          updateBatch(batchIndex, { captionStep: "captions_saved" });
        } catch (e: any) {
          updateBatch(batchIndex, { captionStep: "error", error: e?.message ?? "Caption error" });
          setGenError(e?.message ?? "Caption generation failed");
          break;
        }
      }

      // ── Step 2: Tags ──
      if (mode !== "captions_only") {
        updateBatch(batchIndex, { tagStep: "tags" });
        try {
          const res = await generateTagsAction({
            contextArticle: contextArticle ?? "",
            imagesIn: chunk.map((c) => ({ id: c.id, publicUrl: c.aiUrl, filename: c.filename })),
            vocabulary: vocab,
            siteId: String(siteId),
            siteName: siteTitle,
          });

          if (res.items.length) {
            // Optimistic UI
            setImageTags((prev) => {
              const next = { ...prev };
              for (const s of res.items) {
                const existing = (prev[s.imageId] ?? []).filter((t) => t.source === "manual");
                const aiTags: ImageTag[] = [];
                for (const [slug, values] of Object.entries(s.tags)) {
                  const dimensionId = slugToId.get(slug);
                  if (!dimensionId) continue;
                  for (const value of values) {
                    aiTags.push({ id: `tmp-${slug}-${value}`, site_image_id: s.imageId, dimension_id: dimensionId, value, source: "ai" });
                  }
                }
                next[s.imageId] = [...existing, ...aiTags];
              }
              return next;
            });

            // Save with retry
            let saved = false;
            for (let attempt = 1; attempt <= 3 && !saved; attempt++) {
              try {
                await saveAiTags(res.items);
                saved = true;
                console.log("[save] ok, items:", res.items.length, "first imageId:", res.items[0]?.imageId, "tags:", JSON.stringify(res.items[0]?.tags).slice(0, 200));
              } catch (err) {
                console.log("[save] attempt", attempt, "failed:", err);
                if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
              }
            }
            if (!saved) throw new Error("Failed to save tags after 3 attempts");

            // Replace tmp ids with real DB ids
            const chunkImageIds = res.items.map((s) => s.imageId);
            getTagsForImages(chunkImageIds).then((freshTags) => {
              console.log("[save] freshTags from DB:", freshTags.length, "for imageIds:", chunkImageIds);
              setImageTags((prev) => {
                const next = { ...prev };
                for (const id of chunkImageIds) next[id] = (prev[id] ?? []).filter((t) => t.source === "manual");
                for (const t of freshTags) {
                  if (!next[t.site_image_id]) next[t.site_image_id] = [];
                  next[t.site_image_id].push(t);
                }
                return next;
              });
            });
          }
          updateBatch(batchIndex, { tagStep: "tags_saved" });
        } catch (e: any) {
          updateBatch(batchIndex, { tagStep: "error", error: e?.message ?? "Tag error" });
          setTagError(e?.message ?? "Tag generation failed");
          break;
        }
      }

      updateBatch(batchIndex, {
        captionStep: mode === "tags_only" ? "done" : "captions_saved",
        tagStep: mode === "captions_only" ? "done" : "tags_saved",
      });
      setGenDone((prev) => prev + chunk.length);
      setChunksDone((prev) => prev + 1);
    }
  }

  // Keep these thin wrappers so existing callers still work
  async function generateFor(list: Row[]) { return generateAllForList(list, "captions_only"); }
  async function generateTagsFor(list: Row[]) { return generateAllForList(list, "tags_only"); }

  async function handleDeleteTag(tagId: string, imageId: string) {
    await deleteTag(tagId);
    setImageTags((prev) => ({
      ...prev,
      [imageId]: (prev[imageId] ?? []).filter((t) => t.id !== tagId),
    }));
  }

  async function handleAddManualTag(imageId: string, dimensionId: string, value: string) {
    if (!value.trim()) return;
    try {
      const newTag = await addManualTag(imageId, dimensionId, value.trim());
      setImageTags((prev) => ({
        ...prev,
        [imageId]: [...(prev[imageId] ?? []), newTag],
      }));
      setManualTagInput((prev) => ({
        ...prev,
        [imageId]: { ...(prev[imageId] ?? {}), [dimensionId]: "" },
      }));
    } catch (e: any) {
      alert(e?.message ?? "Failed to add tag");
    }
  }

  async function handleDeleteAllTags() {
    if (!confirm("Delete ALL tags for every photo on this site? This cannot be undone.")) return;
    try {
      await deleteAllTagsForSite(String(siteId));
      setImageTags({});
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete tags");
    }
  }

  function getTargetList(scope: "all" | "selected"): Row[] {
    const base = rows.filter((r) => !!r.storage_path);
    if (scope === "selected" && selectedIds.size > 0) return base.filter((r) => selectedIds.has(r.id));
    return base;
  }

  async function onGenerateCaptions(scope: "all" | "selected" = "all") {
    setGenError(null);
    setGenLoading(true);
    setSkipped([]);
    stopRequestedRef.current = false;
    try {
      await generateFor(getTargetList(scope));
    } catch (e: any) {
      setGenError(e?.message ?? "Caption generation failed");
    } finally {
      setGenLoading(false);
    }
  }

  async function onGenerateTags(scope: "all" | "selected" = "all") {
    setTagError(null);
    setTagLoading(true);
    setSkipped([]);
    stopRequestedRef.current = false;
    try {
      await generateTagsFor(getTargetList(scope));
    } catch (e: any) {
      setTagError(e?.message ?? "Tag generation failed");
    } finally {
      setTagLoading(false);
    }
  }

  async function runGeneration(list: Row[], mode: "captions_only" | "tags_only" | "all") {
    setGenError(null);
    setTagError(null);
    setGenLoading(true);
    setTagLoading(true);
    stopRequestedRef.current = false;
    try {
      await generateAllForList(list, mode);
    } catch (e: any) {
      setGenError(e?.message ?? "Generation failed");
    } finally {
      setGenLoading(false);
      setTagLoading(false);
    }
  }

  async function onGenerateAll(scope: "all" | "selected" = "all") {
    await runGeneration(getTargetList(scope), "all");
  }

  async function onGenerateRemaining() {
    // Build a unified list of all images missing anything, deduplicated
    const needsWork = rows.filter(
      (r) => !!r.storage_path && (isMissingCaptions(r) || isMissingDescription(r) || isMissingTags(r))
    );
    await runGeneration(needsWork, "all");
  }

  /* ---------------- Render ---------------- */
  const uploadingCount = uploads.filter((u) => !u.done).length;
  const showPopup = uploadingCount > 0;

  const missingCount = rows.reduce((acc, r) => acc + (isMissing(r) ? 1 : 0), 0);
  const missingAltCount = rows.filter((r) => !!r.storage_path && isMissingAlt(r)).length;
  const missingCaptionCount = rows.filter((r) => !!r.storage_path && isMissingCaption(r)).length;
  const missingDescCount = rows.filter((r) => !!r.storage_path && isMissingDescription(r)).length;
  const missingTagsCount = rows.filter((r) => !!r.storage_path && isMissingTags(r)).length;

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

      {/* Page load popup */}
      {loadPopupOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-80 rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <h3 className="text-sm font-semibold text-gray-900">Loading Gallery…</h3>
            </div>
            <div className="p-4 space-y-3">
              {loadSteps.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${
                    s.status === "done" ? "bg-emerald-100 text-emerald-600" :
                    s.status === "error" ? "bg-red-100 text-red-600" :
                    s.status === "loading" ? "bg-indigo-100 text-indigo-600 animate-pulse" :
                    "bg-gray-100 text-gray-400"
                  }`}>
                    {s.status === "done" ? "✓" : s.status === "error" ? "✕" : s.status === "loading" ? "…" : "○"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{s.label}</div>
                    {s.detail && <div className="text-xs text-gray-500">{s.detail}</div>}
                  </div>
                </div>
              ))}
              {loadSteps.length === 0 && (
                <div className="text-sm text-gray-500 animate-pulse">Connecting…</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generation progress popup */}
      {genPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
          <div className="pointer-events-auto w-[420px] max-h-[80vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">Generation Progress</span>
                {(genLoading || tagLoading) && (
                  <span className="text-xs text-indigo-600 animate-pulse">Running…</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(genLoading || tagLoading) && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => { stopRequestedRef.current = true; }}
                  >Stop</button>
                )}
                {!genLoading && !tagLoading && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                    onClick={() => setGenPopupOpen(false)}
                  >Close</button>
                )}
              </div>
            </div>
            {/* summary bar */}
            <div className="px-4 py-2 border-b border-gray-100 bg-white text-xs text-gray-600 flex items-center gap-4">
              <span>Batches: <b>{chunksDone}/{chunksTotal}</b></span>
              <span>Images: <b>{genDone}/{genTotal}</b></span>
              {usd != null && <span>~<b>${usd.toFixed(4)}</b></span>}
              {genTotal > 0 && (
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-1.5 bg-emerald-500 transition-all" style={{ width: `${Math.round((genDone / genTotal) * 100)}%` }} />
                </div>
              )}
            </div>
            {/* batch list */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {genBatches.map((b) => {
                const isActive = b.captionStep === "captions" || b.tagStep === "tags";
                const hasError = b.captionStep === "error" || b.tagStep === "error";
                const isDone = b.captionStep !== "pending" && b.captionStep !== "captions" &&
                               b.tagStep !== "pending" && b.tagStep !== "tags";
                return (
                  <div key={b.batchIndex} className={`px-4 py-2.5 text-xs ${isActive ? "bg-indigo-50/60" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-700">Batch {b.batchIndex + 1} <span className="font-normal text-gray-400">({b.imageIds.length} images)</span></span>
                      <span className={`font-semibold ${hasError ? "text-red-500" : isDone ? "text-emerald-600" : isActive ? "text-indigo-600" : "text-gray-400"}`}>
                        {hasError ? "Error" : isDone ? "✓ Done" : isActive ? "Processing…" : "Pending"}
                      </span>
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      <span className={
                        b.captionStep === "captions_saved" || b.captionStep === "done" ? "text-emerald-600" :
                        b.captionStep === "captions" ? "text-indigo-500 animate-pulse" :
                        b.captionStep === "error" ? "text-red-500" : "text-gray-300"
                      }>
                        {b.captionStep === "captions" ? "⟳ Captions…" :
                         b.captionStep === "captions_saved" || b.captionStep === "done" ? "✓ Captions saved" :
                         b.captionStep === "error" ? "✕ Captions failed" : "○ Captions"}
                      </span>
                      <span className={
                        b.tagStep === "tags_saved" || b.tagStep === "done" ? "text-emerald-600" :
                        b.tagStep === "tags" ? "text-indigo-500 animate-pulse" :
                        b.tagStep === "error" ? "text-red-500" : "text-gray-300"
                      }>
                        {b.tagStep === "tags" ? "⟳ Tags…" :
                         b.tagStep === "tags_saved" || b.tagStep === "done" ? "✓ Tags saved" :
                         b.tagStep === "error" ? "✕ Tags failed" : "○ Tags"}
                      </span>
                    </div>
                    {b.error && <div className="mt-1 text-red-500">{b.error}</div>}
                    <div className="mt-1 text-gray-400 truncate">{b.filenames.slice(0, 3).join(", ")}{b.filenames.length > 3 ? "…" : ""}</div>
                  </div>
                );
              })}
            </div>
            {genError && <div className="px-4 py-2 text-xs text-red-600 border-t border-red-100 bg-red-50">{genError}</div>}
            {tagError && <div className="px-4 py-2 text-xs text-red-600 border-t border-red-100 bg-red-50">{tagError}</div>}
          </div>
        </div>
      )}

      {/* right panel */}
      <div className="mb-4 grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-4 items-start">
        <div />
        <aside className="lg:sticky lg:top-4 space-y-3">

          {/* Summary table */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60">
              <h3 className="text-sm font-semibold text-gray-900">Gallery Summary</h3>
            </div>
            <div className="p-4 space-y-4">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    { label: "Total Images", value: rows.length, total: rows.length, warn: false },
                    { label: "Missing Alt", value: missingAltCount, total: rows.length, warn: missingAltCount > 0 },
                    { label: "Missing Captions", value: missingCaptionCount, total: rows.length, warn: missingCaptionCount > 0 },
                    { label: "Missing Descriptions", value: missingDescCount, total: rows.length, warn: missingDescCount > 0 },
                    { label: "Missing Tags", value: missingTagsCount, total: rows.length, warn: missingTagsCount > 0 },
                  ].map(({ label, value, total, warn }) => (
                    <tr key={label} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 text-gray-600">{label}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {label === "Total Images" ? (
                          <span>{value}</span>
                        ) : (
                          <span className={warn ? "text-amber-600" : "text-emerald-600"}>
                            {value} <span className="font-normal text-gray-400">/ {total}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-medium disabled:opacity-50"
                  disabled={rows.length === 0 || genLoading || tagLoading}
                  onClick={() => onGenerateAll("all")}
                >
                  Generate All
                </button>
                <button
                  type="button"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-medium disabled:opacity-50"
                  disabled={rows.length === 0 || genLoading || tagLoading || missingCount === 0}
                  onClick={onGenerateRemaining}
                >
                  {(genLoading || tagLoading) ? `…${genDone}/${genTotal}` : `Remaining (${missingCount})`}
                </button>
              </div>

              <div className="flex gap-2">
                {(genLoading || tagLoading) && (
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 rounded-xl border border-red-300 text-red-600 text-sm hover:bg-red-50"
                    onClick={() => { stopRequestedRef.current = true; }}
                  >Stop</button>
                )}
                {genBatches.length > 0 && !genPopupOpen && (
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-700 text-sm"
                    onClick={() => setGenPopupOpen(true)}
                  >View Progress</button>
                )}
              </div>

              {genError && <div className="text-xs text-red-600">{genError}</div>}
              {tagError && <div className="text-xs text-red-600">{tagError}</div>}
            </div>
          </div>

          {/* AI Generator controls */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60">
              <h3 className="text-sm font-semibold text-gray-900">Context</h3>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                className="w-full border border-gray-300 rounded-xl p-3 min-h-[100px] text-sm"
                placeholder="Paste site article / context for better captions…"
                value={contextArticle}
                onChange={(e) => setContextArticle(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs disabled:opacity-60"
                  disabled={rows.length === 0 || genLoading} onClick={() => onGenerateCaptions("all")}>Rerun Captions</button>
                <button type="button" className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs disabled:opacity-60"
                  disabled={rows.length === 0 || tagLoading} onClick={() => onGenerateTags("all")}>Rerun Tags</button>
                <button type="button" className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 text-xs disabled:opacity-60"
                  disabled={rows.length === 0} onClick={handleDeleteAllTags}>Delete All Tags</button>
              </div>

              {skipped.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-medium mb-1">Skipped {skipped.length} unreachable image{skipped.length > 1 ? "s" : ""}.</div>
                  <ul className="list-disc pl-4 space-y-0.5 max-h-24 overflow-auto">
                    {skipped.slice(0, 6).map((s) => (
                      <li key={s.id}>
                        <span className="font-mono">{s.filename}</span>{" "}
                        <span className="text-amber-700">
                          [{s.variant ?? "—"}]{s.status ? ` status ${s.status}` : ""}
                          {s.contentType && !s.contentType.startsWith("image/") ? `, ${s.contentType}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {skipped.length > 6 && <div className="mt-1">…and {skipped.length - 6} more.</div>}
                </div>
              )}
            </div>
          </div>

        </aside>
      </div>

      {/* Grid — content-visibility:auto skips layout/paint for off-screen cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {rows.map((img) => {
          const meta = metaMap[img.id] || {};
          const selected = selectedIds.has(img.id);
          return (
            <div
              key={img.id}
              style={{ contentVisibility: "auto", containIntrinsicSize: "0 520px" }}
              className={`border border-gray-200 rounded-lg overflow-hidden bg-white ${
                selected ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white" : ""
              }`}
            >
                    <div className="relative group">
                      {img.publicUrl && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleSelect(img.id)}
                          className="block w-full cursor-pointer"
                        >
                          <div className="w-full aspect-square bg-gray-50 overflow-hidden">
                            <img
                              src={img.publicUrl}
                              alt={img.alt_text || ""}
                              loading="lazy"
                              className="w-full h-full object-contain transform-gpu transition-transform duration-150 ease-out group-hover:scale-[1.03] select-none"
                              style={{ willChange: "transform" }}
                            />
                          </div>
                        </div>
                      )}

                      {img.publicUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openLightboxFor(img.id); }}
                          className="absolute top-1 left-1 p-1.5 bg-white/80 rounded-md shadow-sm text-gray-400 hover:text-gray-600"
                          title="Open preview"
                        >
                          <FaSearchPlus className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); removeRow(img.id, img.storage_path); }}
                        className="absolute top-1 right-1 p-1.5 bg-white/80 rounded-md text-gray-400 hover:text-gray-600"
                        title="Delete"
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
                      <div className="relative group/tbx">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5 px-0.5">Alt text</p>
                        <AutoGrowTextarea
                          minRows={2}
                          placeholder="Alt text"
                          value={img.alt_text || ""}
                          onChange={(e) => updateRow(img.id, { alt_text: e.target.value })}
                        />
                        <button
                          type="button"
                          className="absolute top-1 right-1 p-1 rounded-md bg-white/80 text-gray-500 hover:text-gray-700 transition-opacity opacity-0 group-hover/tbx:opacity-100"
                          title="copy from caption"
                          onClick={() => updateRow(img.id, { alt_text: (img.caption || "").trim() })}
                        >
                          <FaRedoAlt className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="relative group/tbx">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5 px-0.5">Caption</p>
                        <AutoGrowTextarea
                          minRows={2}
                          placeholder="Caption"
                          value={img.caption || ""}
                          onChange={(e) => updateRow(img.id, { caption: e.target.value })}
                        />
                        <button
                          type="button"
                          className="absolute top-1 right-1 p-1 rounded-md bg-white/80 text-gray-500 hover:text-gray-700 transition-opacity opacity-0 group-hover/tbx:opacity-100"
                          title="copy from alt text"
                          onClick={() => updateRow(img.id, { caption: (img.alt_text || "").trim() })}
                        >
                          <FaRedoAlt className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Scene Description button */}
                      {(img.scene_description || sceneDescriptions[img.id]) && (
                        <button
                          type="button"
                          onClick={() => setDescPopup({ imageId: img.id, text: (img.scene_description || sceneDescriptions[img.id])! })}
                          className="w-full text-left px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium hover:bg-amber-100 transition-colors"
                        >
                          📄 Description
                        </button>
                      )}

                      {/* Tags badge */}
                      {(() => {
                        const tagCount = (imageTags[img.id] ?? []).length;
                        const hasTags = tagCount > 0;
                        return (
                          <button
                            type="button"
                            onClick={() => setTagPopupImageId(img.id)}
                            className={`w-full mt-1 flex items-center justify-between px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                              hasTags
                                ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                                : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                            }`}
                          >
                            <span>{hasTags ? `${tagCount} tag${tagCount !== 1 ? "s" : ""}` : "No tags"}</span>
                            {tagLoading && <span className="text-[10px] animate-pulse opacity-70">…</span>}
                            <span className="opacity-50 text-[10px]">edit →</span>
                          </button>
                        );
                      })()}
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
            <div className="p-4 space-y-3">
              <p>
                Permanently delete <b>{rows.length}</b> images for this site.
              </p>
              <div className="space-y-2">
                <label className="block text-sm text-gray-700">Email</label>
                <input
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm text-gray-700">Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDeleteAllModal}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm"
                  disabled={deletingAll}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteAllConfirmed}
                  className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-60"
                  disabled={deletingAll}
                >
                  {deletingAll ? "Deleting…" : "Delete All"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bulk toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-gray-200 shadow-lg">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="text-sm font-medium text-gray-700">
              <b>{selectedIds.size}</b> selected
            </div>
            <button
              type="button"
              onClick={() => onGenerateAll("selected")}
              disabled={genLoading || tagLoading || bulkWorking}
              className="px-3.5 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-60"
            >
              Generate Selected
            </button>
            <button
              type="button"
              onClick={() => onGenerateCaptions("selected")}
              disabled={genLoading || bulkWorking}
              className="px-3.5 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm disabled:opacity-60"
            >
              Captions
            </button>
            <button
              type="button"
              onClick={() => onGenerateTags("selected")}
              disabled={tagLoading || bulkWorking}
              className="px-3.5 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm disabled:opacity-60"
            >
              Tags
            </button>
            {(genLoading || tagLoading) && (
              <span className="text-xs text-indigo-600 animate-pulse">{genDone}/{genTotal} processing…</span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={deleteSelected}
                disabled={bulkWorking}
                className="px-3.5 py-2 rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50 text-sm disabled:opacity-60"
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear selection
              </button>
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

      {/* Scene description popup */}
      {descPopup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setDescPopup(null)}>
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">Scene Description</h3>
              <button onClick={() => setDescPopup(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{descPopup.text}</p>
            <button
              className="mt-4 w-full px-3 py-2 rounded-xl bg-gray-900 text-white text-sm"
              onClick={() => setDescPopup(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tag editor popup */}
      {tagPopupImageId && (() => {
        const imageId = tagPopupImageId;
        const tags = imageTags[imageId] ?? [];
        const byDim: Record<string, ImageTag[]> = {};
        for (const t of tags) {
          if (!byDim[t.dimension_id]) byDim[t.dimension_id] = [];
          byDim[t.dimension_id].push(t);
        }
        const img = rows.find((r) => r.id === imageId);
        return (
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0"
            onClick={() => setTagPopupImageId(null)}
          >
            <div
              className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Tags</div>
                  {img && (
                    <div className="text-xs text-gray-400 truncate">{img.storage_path.split("/").pop()}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setTagPopupImageId(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4 flex-shrink-0"
                >×</button>
              </div>

              {/* tag dimensions */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {vocabulary.map((dim) => {
                  const dimTags = byDim[dim.id] ?? [];
                  const input = manualTagInput[imageId]?.[dim.id] ?? "";
                  return (
                    <div key={dim.id}>
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{dim.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {dimTags.map((t) => (
                          <span
                            key={t.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              t.source === "manual"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {t.value}
                            <button
                              type="button"
                              onClick={() => handleDeleteTag(t.id, imageId)}
                              className="hover:text-red-500 leading-none"
                            >×</button>
                          </span>
                        ))}
                        {dim.values.length > 0 ? (
                          <select
                            className="text-xs border border-dashed border-gray-300 rounded-full px-2 py-0.5 bg-white text-gray-500"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) void handleAddManualTag(imageId, dim.id, e.target.value);
                            }}
                          >
                            <option value="">+ add</option>
                            {dim.values
                              .filter((v) => !dimTags.find((t) => t.value === v.value))
                              .map((v) => (
                                <option key={v.id} value={v.value}>{v.value}</option>
                              ))}
                          </select>
                        ) : (
                          <form
                            className="flex gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void handleAddManualTag(imageId, dim.id, input);
                            }}
                          >
                            <input
                              className="text-xs border border-dashed border-gray-300 rounded-full px-2 py-0.5 w-24 bg-white"
                              placeholder="+ add…"
                              value={input}
                              onChange={(ev) =>
                                setManualTagInput((prev) => ({
                                  ...prev,
                                  [imageId]: { ...(prev[imageId] ?? {}), [dim.id]: ev.target.value },
                                }))
                              }
                            />
                            {input.trim() && (
                              <button type="submit" className="text-xs text-blue-600 underline">ok</button>
                            )}
                          </form>
                        )}
                      </div>
                    </div>
                  );
                })}
                {vocabulary.length === 0 && (
                  <div className="text-sm text-gray-400">No tag vocabulary loaded.</div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-gray-100">
                <button
                  type="button"
                  className="w-full px-3 py-2 rounded-xl bg-gray-900 text-white text-sm"
                  onClick={() => setTagPopupImageId(null)}
                >Done</button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
