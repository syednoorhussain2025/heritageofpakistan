// src/app/admin/listings/[id]/PhotoStory.tsx
"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

/* ------------------------------------------------------------------ */
/* Types (match DB schema)                                             */
/* ------------------------------------------------------------------ */

type UUID = string;

type PhotoStoryRow = {
  site_id: UUID;
  hero_photo_url: string | null;
  subtitle: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PhotoStoryItemRow = {
  id: UUID;
  site_id: UUID;
  image_url: string;
  text_block: string | null;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

type LibraryImage = {
  key: string; // storage key
  url: string; // public URL
  name: string;
  size?: number | null;
  created_at?: string | null;
};

type SiteCoverRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  credit: string | null;
  is_active: boolean;
};

type HeroCoverImage = {
  key: string;
  url: string;
  name: string;
  caption: string | null;
  credit: string | null;
  isActive: boolean;
};

/* ------------------------------------------------------------------ */
/* Small UI helpers                                                    */
/* ------------------------------------------------------------------ */

function Btn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-indigo-500 disabled:opacity-50 ${
        props.className ?? "bg-gray-200 text-gray-800 hover:bg-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

/** Circular icon button with tooltip; green hover (red for destructive) */
function CircleIconBtn({
  title,
  onClick,
  disabled,
  children,
  variant = "default",
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) {
  const hoverColor =
    variant === "danger"
      ? "hover:text-red-600 hover:border-red-400"
      : "hover:text-emerald-600 hover:border-emerald-400";
  return (
    <div className="relative group">
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={onClick}
        disabled={disabled}
        className={`h-10 w-10 rounded-full bg-white border border-gray-300 text-gray-700 shadow-sm flex items-center justify-center transition transform hover:scale-110 ${hoverColor} focus:outline-none ${
          disabled ? "opacity-40 cursor-not-allowed hover:scale-100" : ""
        }`}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 text-white text-xs px-2 py-1 opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition">
        {title}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-base font-semibold mb-1.5 text-gray-800">
        {label}
      </div>
      {children}
      {hint ? (
        <div className="mt-1 text-xs text-gray-500 leading-snug">{hint}</div>
      ) : null}
    </label>
  );
}

const inputStyles =
  "w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500";

/** Auto-growing textarea (used for block text only) */
function AutoGrowTextarea({
  value,
  onChange,
  minRows = 3,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number;
}) {
  const [rows, setRows] = useState(minRows);
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.rows = minRows;
    const lineHeight = 20;
    const nextRows = Math.max(
      minRows,
      Math.ceil((e.target.scrollHeight - 8) / lineHeight)
    );
    setRows(nextRows);
    onChange?.(e);
  };
  return (
    <textarea
      {...props}
      className={`${inputStyles} ${props.className ?? ""}`}
      rows={rows}
      value={value}
      onChange={handleChange}
      style={{ resize: "vertical" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Supabase helpers                                                    */
/* ------------------------------------------------------------------ */

async function publicUrl(bucket: string, key: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return data.publicUrl;
}

function makeUUID() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID() as string;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uniqueKey(prefix: string, siteId: UUID, filename: string) {
  const safe = filename.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
  return `${prefix}/${siteId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${safe}`;
}

/* ------------------------------------------------------------------ */
/* CSV helpers (client-only)                                          */
/* ------------------------------------------------------------------ */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") i++;
        i++;
        continue;
      }
      field += ch;
      i++;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function buildCsvTemplate(): string {
  const headers = Array.from({ length: 10 }, (_, i) => `Block ${i + 1}`);
  const empty = Array(10).fill("");
  const line = (arr: string[]) =>
    arr
      .map((s) => (/[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s))
      .join(",");
  return [line(headers), line(empty)].join("\r\n");
}

/* ------------------------------------------------------------------ */
/* Shared: staged progress helper                                      */
/* ------------------------------------------------------------------ */

function useRafProgress(active: boolean) {
  const [p, setP] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setP(0);
      return;
    }
    let val = 0;
    const tick = () => {
      val = Math.min(95, val + 0.8 + Math.random() * 0.6);
      setP(val);
      rafRef.current = requestAnimationFrame(tick as any);
    };
    rafRef.current = requestAnimationFrame(tick as any);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setP(0);
    };
  }, [active]);
  return [p, setP] as const;
}

/* ------------------------------------------------------------------ */
/* Photo Library (story/<site>)                                       */
/* ------------------------------------------------------------------ */

function PhotoLibraryModal({
  siteId,
  open,
  onClose,
  onPick,
  usedUrls,
}: {
  siteId: UUID;
  open: boolean;
  onClose: () => void;
  onPick: (img: LibraryImage) => void;
  usedUrls: string[];
}) {
  const PATH = `story/${siteId}`;
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useRafProgress(uploading);

  const usedSet = useMemo(() => new Set(usedUrls.filter(Boolean)), [usedUrls]);

  const refresh = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("photo-story")
        .list(PATH, { limit: 1000, offset: 0 });
      if (error) throw error;
      const rows = data ?? [];
      const mapped: LibraryImage[] = await Promise.all(
        rows
          .filter((r) => !r.name.endsWith("/"))
          .map(async (r) => {
            const key = `${PATH}/${r.name}`;
            const url = await publicUrl("photo-story", key);
            return {
              key,
              url,
              name: r.name,
              size: (r as any).metadata?.size ?? null,
              created_at: (r as any).created_at ?? null,
            };
          })
      );
      mapped.sort(
        (a, b) =>
          (b.created_at || "").localeCompare(a.created_at || "") ||
          b.name.localeCompare(a.name)
      );
      setImages(mapped);
    } catch (e) {
      console.error(e);
      alert("Failed to load photo library.");
    } finally {
      setLoading(false);
    }
  }, [PATH, open]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function onUpload(files?: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const queue = Array.from(files);
      const workers = 3;
      let idx = 0;

      async function work() {
        while (idx < queue.length) {
          const f = queue[idx++];
          if (!f.type.startsWith("image/")) continue;
          const key = uniqueKey("story", siteId, f.name);
          const { error } = await supabase.storage
            .from("photo-story")
            .upload(key, f, { upsert: false, cacheControl: "3600" });
          if (error) throw error;
        }
      }
      await Promise.all(Array.from({ length: workers }, work));
      setProgress(100);
      await new Promise((r) => setTimeout(r, 400));
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Upload failed.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function deleteOne(key: string) {
    if (!confirm("Delete this image permanently?")) return;
    try {
      const { error } = await supabase.storage
        .from("photo-story")
        .remove([key]);
      if (error) throw error;
      setImages((prev) => prev.filter((x) => x.key !== key));
    } catch (e) {
      console.error(e);
      alert("Delete failed.");
    }
  }

  async function deleteAll() {
    if (!images.length) return;
    if (
      !confirm(
        `Delete ALL ${images.length} images for this site permanently? This cannot be undone.`
      )
    )
      return;
    try {
      const { error } = await supabase.storage
        .from("photo-story")
        .remove(images.map((x) => x.key));
      if (error) throw error;
      setImages([]);
    } catch (e) {
      console.error(e);
      alert("Bulk delete failed.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white w-full max-w-6xl h-[90vh] max-h-[90vh] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="font-semibold text-gray-900">Photo Story Library</div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onUpload(e.currentTarget.files)}
                className="hidden"
                id="ps-upload-input"
              />
              <Btn
                className="bg-indigo-600 text-white hover:bg-indigo-500"
                onClick={() =>
                  document.getElementById("ps-upload-input")?.click()
                }
              >
                Upload images
              </Btn>
            </label>

            <Btn
              className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              onClick={deleteAll}
              disabled={!images.length}
            >
              Delete all
            </Btn>
            <Btn
              className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              onClick={onClose}
            >
              Close
            </Btn>
          </div>
        </div>

        {uploading ? (
          <div className="px-4 pt-3">
            <div className="h-2 w-full bg-gray-100 rounded">
              <div
                className="h-2 rounded bg-emerald-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="px-1 py-2 text-xs text-gray-500">
              Uploading images… {Math.round(progress)}%
            </div>
          </div>
        ) : null}

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-sm text-gray-600">Loading photos…</div>
          ) : images.length === 0 ? (
            <div className="text-sm text-gray-600">
              No photos yet. Use “Upload images” to add some.
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-3">
              {images.map((img) => {
                const isUsed = usedSet.has(img.url);
                return (
                  <div
                    key={img.key}
                    className={`relative rounded-lg border ${
                      isUsed ? "border-indigo-500" : "border-gray-200"
                    } bg-white overflow-hidden`}
                    onClick={() => {
                      if (!isUsed) onPick(img);
                    }}
                    role="button"
                    aria-disabled={isUsed}
                  >
                    <Image
                      src={img.url}
                      alt={img.name}
                      width={320}
                      height={176}
                      className={`h-44 w-auto object-cover block ${
                        isUsed
                          ? "opacity-90"
                          : "hover:ring-2 hover:ring-indigo-500 cursor-pointer transition"
                      }`}
                      draggable={false}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-white text-xs">
                      <div className="truncate">{img.name}</div>
                    </div>
                    {isUsed ? (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-600 text-white">
                        Already selected
                      </div>
                    ) : null}
                    <div className="absolute top-2 right-2">
                      <button
                        className="px-2 py-1 rounded bg-white text-red-600 text-xs border border-red-200 shadow-sm hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteOne(img.key);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero Cover Library (now from site_covers)                           */
/* ------------------------------------------------------------------ */

function HeroCoverLibraryModal({
  siteId,
  open,
  currentUrl,
  onClose,
  onPick,
  onClearedCurrent,
}: {
  siteId: UUID;
  open: boolean;
  currentUrl: string | null;
  onClose: () => void;
  onPick: (img: LibraryImage) => void;
  onClearedCurrent: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [covers, setCovers] = useState<HeroCoverImage[]>([]);

  const refresh = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("site_covers")
        .select(
          `
          id,
          storage_path,
          caption,
          credit,
          is_active
        `
        )
        .eq("site_id", siteId)
        .order("is_active", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as SiteCoverRow[];

      const mapped: HeroCoverImage[] = await Promise.all(
        rows.map(async (row) => {
          const url = await publicUrl("site-images", row.storage_path);
          const name = row.storage_path.split("/").slice(-1)[0] || row.id;
          return {
            key: row.id,
            url,
            name,
            caption: row.caption,
            credit: row.credit,
            isActive: row.is_active,
          };
        })
      );

      setCovers(mapped);
    } catch (e) {
      console.error(e);
      alert("Failed to load cover library.");
    } finally {
      setLoading(false);
    }
  }, [open, siteId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[101] bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white w-full max-w-5xl h-[90vh] max-h-[90vh] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="font-semibold text-gray-900">
            Hero Covers (from site_covers)
          </div>
          <div className="flex items-center gap-2">
            {currentUrl ? (
              <Btn
                className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                onClick={() => onClearedCurrent()}
              >
                Clear hero
              </Btn>
            ) : null}
            <Btn
              className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              onClick={onClose}
            >
              Close
            </Btn>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-sm text-gray-600">Loading covers…</div>
          ) : covers.length === 0 ? (
            <div className="text-sm text-gray-600">
              No cover photos yet for this site in{" "}
              <code className="font-mono text-xs">site_covers</code>. Use the
              main listing cover editor to add covers.
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-3">
              {covers.map((img) => {
                const isCurrent = currentUrl && img.url === currentUrl;
                return (
                  <div
                    key={img.key}
                    className={`relative rounded-lg border ${
                      isCurrent ? "border-indigo-500" : "border-gray-200"
                    } bg-white overflow-hidden`}
                    onClick={() => {
                      if (isCurrent) return;
                      onPick({
                        key: img.key,
                        url: img.url,
                        name: img.name,
                        size: null,
                        created_at: null,
                      });
                    }}
                    role="button"
                    aria-disabled={isCurrent}
                  >
                    <Image
                      src={img.url}
                      alt={img.name}
                      width={320}
                      height={176}
                      className={`h-44 w-auto object-cover block ${
                        isCurrent
                          ? "opacity-90"
                          : "hover:ring-2 hover:ring-indigo-500 cursor-pointer transition"
                      }`}
                      draggable={false}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-white text-xs">
                      <div className="truncate">
                        {img.name}
                        {img.isActive ? " · Active cover" : ""}
                      </div>
                      {img.caption ? (
                        <div className="truncate opacity-80">{img.caption}</div>
                      ) : null}
                    </div>
                    {isCurrent ? (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-600 text-white">
                        Current hero
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function PhotoStory({
  siteId,
  slug,
  title,
}: {
  siteId: string | number;
  slug: string;
  title: string;
}) {
  const siteUuid = useMemo(() => String(siteId ?? "").trim(), [siteId]);

  const [story, setStory] = useState<PhotoStoryRow>({
    site_id: siteUuid as UUID,
    hero_photo_url: null,
    subtitle: null,
  });
  const [items, setItems] = useState<PhotoStoryItemRow[]>([]);
  const [deletedIds, setDeletedIds] = useState<UUID[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [lastCsvRow, setLastCsvRow] = useState<string[] | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState(3);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryForIndex, setLibraryForIndex] = useState<number | null>(null);

  const [heroOpen, setHeroOpen] = useState(false);

  const textSaveTimers = useRef<Record<string, any>>({});

  /* ----------------------------- Load ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteUuid || !UUID_RX.test(siteUuid)) {
        setErrorMsg("Invalid or missing site id (UUID required).");
        setLoaded(true);
        return;
      }
      setErrorMsg(null);
      try {
        const { data: storyRow, error: selErr } = await supabase
          .from("photo_stories")
          .select("*")
          .eq("site_id", siteUuid)
          .maybeSingle();
        if (selErr) throw selErr;

        let ensured = storyRow as PhotoStoryRow | null;
        if (!ensured) {
          const { data: seeded, error: seedErr } = await supabase
            .from("photo_stories")
            .upsert(
              { site_id: siteUuid, hero_photo_url: null, subtitle: null },
              { onConflict: "site_id" }
            )
            .select()
            .single();
          if (seedErr) throw seedErr;
          ensured = seeded as PhotoStoryRow;
        }

        const { data: itemRows, error: itemsErr } = await supabase
          .from("photo_story_items")
          .select("*")
          .eq("site_id", siteUuid)
          .order("sort_order", { ascending: true });
        if (itemsErr) throw itemsErr;

        if (!cancelled) {
          setStory({
            site_id: siteUuid as UUID,
            hero_photo_url: ensured?.hero_photo_url ?? null,
            subtitle: ensured?.subtitle ?? null,
            created_at: ensured?.created_at ?? null,
            updated_at: ensured?.updated_at ?? null,
          });

          setItems(
            (itemRows ?? []).map((r: any) => ({
              id: r.id,
              site_id: r.site_id,
              image_url: r.image_url ?? "",
              text_block: r.text_block ?? "",
              sort_order: r.sort_order ?? 0,
              created_at: r.created_at,
              updated_at: r.updated_at,
            }))
          );

          setDeletedIds([]);
          setLoaded(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("PhotoStory load error:", err);
          setErrorMsg(err?.message || "Failed to load photo story.");
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      Object.values(textSaveTimers.current).forEach((t) => clearTimeout(t));
      textSaveTimers.current = {};
    };
  }, [siteUuid]);

  /* ----------------------- Persist helpers ------------------------- */

  async function upsertSingleItem(payload: PhotoStoryItemRow) {
    const { error } = await supabase
      .from("photo_story_items")
      .upsert(payload, { onConflict: "id" });
    if (error) throw error;
  }

  const scheduleItemAutosave = useCallback((draft: PhotoStoryItemRow) => {
    if (!draft.image_url || draft.image_url.trim().length === 0) return;
    const key = draft.id;
    if (textSaveTimers.current[key]) clearTimeout(textSaveTimers.current[key]);
    textSaveTimers.current[key] = setTimeout(async () => {
      try {
        await upsertSingleItem(draft);
      } catch (e) {
        console.error("Autosave (text) failed:", e);
      }
    }, 500);
  }, []);

  /* --------------------------- Handlers ---------------------------- */

  const addEmptyItem = useCallback(() => {
    const id = makeUUID();
    setItems((prev) => [
      ...prev,
      {
        id,
        site_id: siteUuid as UUID,
        image_url: "",
        text_block: "",
        sort_order: prev.length,
      },
    ]);
    return id;
  }, [siteUuid]);

  const addEmptyItemAfter = useCallback(
    (afterIndex: number) => {
      const id = makeUUID();
      setItems((prev) => {
        const next = [...prev];
        const newItem: PhotoStoryItemRow = {
          id,
          site_id: siteUuid as UUID,
          image_url: "",
          text_block: "",
          sort_order: afterIndex + 1,
        };
        next.splice(afterIndex + 1, 0, newItem);
        return next.map((x, i) => ({ ...x, sort_order: i }));
      });
      return id;
    },
    [siteUuid]
  );

  const removeItem = useCallback(async (id: UUID) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setDeletedIds((prev) => [...prev, id]);
    try {
      await supabase.from("photo_story_items").delete().eq("id", id);
    } catch (e) {
      console.error("Immediate delete failed; will retry on Save.", e);
    }
  }, []);

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      return next.map((x, i) => ({ ...x, sort_order: i }));
    });
  }, []);

  const openLibraryFor = useCallback((index: number) => {
    setLibraryForIndex(index);
    setLibraryOpen(true);
  }, []);

  const saveStory = useCallback(
    async (silent?: boolean) => {
      if (!siteUuid || !UUID_RX.test(siteUuid)) {
        if (!silent) alert("Invalid site id; cannot save.");
        return;
      }

      setSaving(true);
      setErrorMsg(null);
      try {
        const { error: sErr } = await supabase.from("photo_stories").upsert(
          {
            site_id: siteUuid as UUID,
            hero_photo_url: story.hero_photo_url ?? null,
            subtitle: (story.subtitle?.trim() || null) as string | null,
          },
          { onConflict: "site_id" }
        );
        if (sErr) throw sErr;

        const normalized: PhotoStoryItemRow[] = items
          .map((x, i) => ({
            id: x.id,
            site_id: siteUuid as UUID,
            image_url: (x.image_url || "").trim(),
            text_block: (x.text_block ?? "") || null,
            sort_order: i,
          }))
          .filter((x) => x.image_url.length > 0);

        if (normalized.length) {
          const { error: iErr } = await supabase
            .from("photo_story_items")
            .upsert(normalized, { onConflict: "id" });
          if (iErr) throw iErr;
        }

        const deletable = deletedIds.filter(Boolean);
        if (deletable.length) {
          const { error: dErr } = await supabase
            .from("photo_story_items")
            .delete()
            .in("id", deletable);
          if (dErr) throw dErr;
        }

        setItems((prev) => prev.map((x, i) => ({ ...x, sort_order: i })));
        setDeletedIds([]);

        if (!silent) alert("Photo Story saved");
      } catch (err: any) {
        console.error("Save error:", err);
        setErrorMsg(err?.message || "Failed to save.");
        if (!silent) alert(err?.message || "Failed to save.");
      } finally {
        setSaving(false);
      }
    },
    [siteUuid, story.hero_photo_url, story.subtitle, items, deletedIds]
  );

  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<{ silent?: boolean }>;
      void saveStory(!!ce.detail?.silent);
    };
    document.addEventListener("photostory:save", handler as EventListener);
    return () =>
      document.removeEventListener("photostory:save", handler as EventListener);
  }, [saveStory]);

  /* ----------------------- CSV: UI + logic ------------------------- */

  const onDownloadCsvTemplate = useCallback(() => {
    const csv = buildCsvTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "photo-story-captions-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const onCsvUpload = useCallback((file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const rows = parseCSV(text);

        if (!rows.length) {
          alert("CSV appears to be empty.");
          return;
        }

        let dataRow: string[] | undefined;
        if (rows.length === 1) {
          dataRow = rows[0];
        } else {
          dataRow = rows
            .slice(1)
            .find((r) => r.some((c) => c.trim().length > 0));
          if (!dataRow) dataRow = rows[0];
        }

        const limited = (dataRow ?? []).slice(0, 10);
        setLastCsvRow(limited);
      } catch (e) {
        console.error(e);
        alert("Failed to parse CSV.");
      }
    };
    reader.readAsText(file);
  }, []);

  const applyCsvToBlocks = useCallback(() => {
    if (!lastCsvRow) return;
    setItems((prev) =>
      prev.map((x, i) =>
        i < lastCsvRow.length
          ? { ...x, text_block: (lastCsvRow[i] ?? "").trim() }
          : x
      )
    );
  }, [lastCsvRow]);

  /* --------------------------- Rendering --------------------------- */

  if (!loaded) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-600">
        Loading Photo Story…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header line with action on the right */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          Title: <b className="text-gray-900">{title}</b> ·{" "}
          <a
            className="text-indigo-600 hover:underline"
            href={`/heritage/${slug}/story`}
            target="_blank"
          >
            Open Photo Story
          </a>
        </div>
        <Btn
          className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm"
          onClick={() => {
            setBulkCount(3);
            setBulkOpen(true);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm11 0h2v-2h2v2h2v2h-2v2h-2v-2h-2v-2z"
              fill="currentColor"
            />
          </svg>
          Add Bulk Blocks
        </Btn>
      </div>

      {errorMsg ? (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
          {errorMsg}
        </div>
      ) : null}

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* -------------------- MAIN CONTENT CARD -------------------- */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 relative">
          {items.length === 0 ? (
            <div className="py-10 grid place-items-center">
              <AddBlockButton onClick={() => addEmptyItem()} />
            </div>
          ) : null}

          {items.map((it, idx) => (
            <div key={it.id} className="relative mb-10">
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="relative w-full bg-gray-50 group">
                  {it.image_url ? (
                    <Image
                      src={it.image_url}
                      alt=""
                      width={1600}
                      height={900}
                      className="w-full object-cover aspect-[16/9]"
                    />
                  ) : (
                    <div className="aspect-[16/9] w-full grid place-items-center bg-white">
                      <button
                        className="inline-flex items-center justify-center rounded-full h-14 w-14 bg-white border border-gray-300 text-gray-400 hover:text-emerald-600 hover:border-emerald-400 shadow-sm transition transform hover:scale-110"
                        onClick={() => openLibraryFor(idx)}
                        title="Add photo to this block"
                        aria-label="Add photo to this block"
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  )}

                  <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition">
                    <CircleIconBtn
                      title={it.image_url ? "Change image" : "Add image"}
                      onClick={() => openLibraryFor(idx)}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <circle cx="9" cy="9" r="2" fill="currentColor" />
                        <path
                          d="M21 15l-4.5-4.5L9 18"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                    </CircleIconBtn>
                    <CircleIconBtn
                      title="Move up"
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path
                          d="M12 5l-6 6h4v8h4v-8h4l-6-6z"
                          fill="currentColor"
                        />
                      </svg>
                    </CircleIconBtn>
                    <CircleIconBtn
                      title="Move down"
                      onClick={() => moveItem(idx, +1)}
                      disabled={idx === items.length - 1}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path
                          d="M12 19l6-6h-4V5h-4v8H6l6 6z"
                          fill="currentColor"
                        />
                      </svg>
                    </CircleIconBtn>
                    <CircleIconBtn
                      title="Delete block"
                      onClick={() => removeItem(it.id)}
                      variant="danger"
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24">
                        <path
                          d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 7h2v8h-2v-8zm6 0h-2v8h2v-8zM8 10H6v8h2v-8z"
                          fill="currentColor"
                        />
                      </svg>
                    </CircleIconBtn>
                  </div>
                </div>

                <div className="p-4">
                  <AutoGrowTextarea
                    minRows={3}
                    value={it.text_block ?? ""}
                    placeholder="Write the story text for this photo…"
                    onChange={(e) => {
                      const val = e.target.value;
                      const { id, image_url } = items[idx];
                      setItems((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, text_block: val } : x
                        )
                      );
                      scheduleItemAutosave({
                        id,
                        site_id: siteUuid as UUID,
                        image_url,
                        text_block: val || null,
                        sort_order: idx,
                      });
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => addEmptyItemAfter(idx)}
                className="absolute -left-6 -bottom-6 h-14 w-14 grid place-items-center rounded-full bg-emerald-600 text-white shadow-md hover:scale-110 transition-transform"
                title="Add a new story block"
                aria-label="Add a new story block"
              >
                <PlusIcon />
              </button>
            </div>
          ))}
        </section>

        {/* -------------------- RIGHT SIDEBAR CARD -------------------- */}
        <aside className="lg:sticky lg:top-4 h-max bg-white border border-gray-200 rounded-xl shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Story Settings
          </div>

          {/* HERO */}
          <Field label="Photo Story Hero">
            {story.hero_photo_url ? (
              <Image
                src={story.hero_photo_url}
                alt="Photo Story hero"
                width={800}
                height={450}
                className="w-full rounded-lg border border-gray-200 object-cover aspect-[16/9] mb-2"
              />
            ) : (
              <div className="w-full rounded-lg border border-dashed border-gray-300 grid place-items-center aspect-[16/9] text-sm text-gray-500 mb-2">
                No hero image
              </div>
            )}

            <div className="flex items-center gap-2">
              <Btn
                className="bg-indigo-600 text-white hover:bg-indigo-500"
                onClick={() => setHeroOpen(true)}
              >
                Choose image
              </Btn>
              {story.hero_photo_url ? (
                <Btn
                  className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  onClick={async () => {
                    setStory((s) => ({ ...s, hero_photo_url: null }));
                    await saveStory(true);
                  }}
                >
                  Clear
                </Btn>
              ) : null}
            </div>
          </Field>

          {/* Subtitle */}
          <Field label="Subtitle (optional)">
            <textarea
              rows={2}
              className={`${inputStyles} resize-none`}
              value={story.subtitle ?? ""}
              onChange={(e) =>
                setStory((prev) => ({ ...prev, subtitle: e.target.value }))
              }
              placeholder="A brief subheading for the story…"
            />
          </Field>

          {/* CSV CAPTIONS IMPORTER */}
          <div className="mt-4 border-t border-gray-200 pt-4">
            <Field
              label="Import captions (CSV)"
              hint="Template has 10 columns (Block 1 → Block 10). We use the first non-empty data row. Applying does not save to the database."
            >
              <div className="flex flex-wrap items-center gap-2">
                <Btn
                  onClick={onDownloadCsvTemplate}
                  className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                >
                  Download template
                </Btn>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      onCsvUpload(e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                    className="file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                  />
                </label>

                <Btn
                  onClick={applyCsvToBlocks}
                  disabled={!lastCsvRow}
                  className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-emerald-400"
                >
                  Apply to blocks
                </Btn>
              </div>
            </Field>
          </div>
        </aside>
      </div>

      {/* Bulk add modal */}
      {bulkOpen ? (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="text-base font-semibold mb-1.5">
              Add Bulk Blocks
            </div>
            <div className="text-sm text-gray-600 mb-3">
              How many placeholder blocks would you like to add? (1–10)
            </div>
            <input
              type="number"
              min={1}
              max={10}
              value={bulkCount}
              onChange={(e) =>
                setBulkCount(
                  Math.max(1, Math.min(10, Number(e.target.value) || 1))
                )
              }
              className={inputStyles}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Btn
                onClick={() => setBulkOpen(false)}
                className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </Btn>
              <Btn
                onClick={() => {
                  const count = Math.max(1, Math.min(10, bulkCount));
                  setItems((prev) => {
                    const base = [...prev];
                    for (let i = 0; i < count; i++) {
                      base.push({
                        id: makeUUID(),
                        site_id: siteUuid as UUID,
                        image_url: "",
                        text_block: "",
                        sort_order: base.length,
                      });
                    }
                    return base.map((x, i) => ({ ...x, sort_order: i }));
                  });
                  setBulkOpen(false);
                }}
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                Add
              </Btn>
            </div>
          </div>
        </div>
      ) : null}

      {/* Photo Story Library Modal */}
      <PhotoLibraryModal
        siteId={siteUuid as UUID}
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        usedUrls={items.map((i) => i.image_url)}
        onPick={async (img) => {
          if (libraryForIndex == null) return;
          const idx = libraryForIndex;
          const current = items[idx];
          if (!current) return;

          setItems((prev) =>
            prev.map((x, i) => (i === idx ? { ...x, image_url: img.url } : x))
          );

          try {
            await upsertSingleItem({
              id: current.id,
              site_id: siteUuid as UUID,
              image_url: img.url,
              text_block: current.text_block ?? null,
              sort_order: idx,
            });
          } catch (e) {
            console.error(e);
            alert("Failed to save selected image.");
          } finally {
            setLibraryForIndex(null);
            setLibraryOpen(false);
          }
        }}
      />

      {/* Hero Cover Library Modal */}
      <HeroCoverLibraryModal
        siteId={siteUuid as UUID}
        open={heroOpen}
        currentUrl={story.hero_photo_url}
        onClose={() => setHeroOpen(false)}
        onPick={async (img) => {
          try {
            setStory((s) => ({ ...s, hero_photo_url: img.url }));
            await supabase.from("photo_stories").upsert(
              {
                site_id: siteUuid as UUID,
                hero_photo_url: img.url,
                subtitle: story.subtitle ?? null,
              },
              { onConflict: "site_id" }
            );
          } catch (e) {
            console.error(e);
            alert("Failed to set cover.");
          } finally {
            setHeroOpen(false);
          }
        }}
        onClearedCurrent={async () => {
          try {
            setStory((s) => ({ ...s, hero_photo_url: null }));
            await supabase.from("photo_stories").upsert(
              {
                site_id: siteUuid as UUID,
                hero_photo_url: null,
                subtitle: story.subtitle ?? null,
              },
              { onConflict: "site_id" }
            );
          } catch {
            /* noop */
          }
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add Block Button                                                    */
/* ------------------------------------------------------------------ */

function AddBlockButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center justify-center rounded-full h-16 w-16 bg-emerald-600 hover:bg-emerald-700 hover:scale-105 transition-transform text-white shadow-md"
      title="Add a new story block"
      aria-label="Add a new story block"
    >
      <PlusIcon />
    </button>
  );
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
