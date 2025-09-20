// src/app/admin/listings/[id]/PhotoStory.tsx
"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
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
    site_id: siteUuid,
    hero_photo_url: null,
    subtitle: null,
  });
  const [items, setItems] = useState<PhotoStoryItemRow[]>([]);
  const [deletedIds, setDeletedIds] = useState<UUID[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // CSV: cache last uploaded row
  const [lastCsvRow, setLastCsvRow] = useState<string[] | null>(null);

  // Bulk add modal
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState(3);

  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
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
            site_id: siteUuid,
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
        site_id: siteUuid,
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
          site_id: siteUuid,
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

  const onUploadItem = useCallback(
    async (idx: number, file: File) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
      }
      try {
        const current = items[idx];
        if (!current) return;

        const key = uniqueKey("story", siteUuid, file.name);
        const { error } = await supabase.storage
          .from("photo-story")
          .upload(key, file, { upsert: false, cacheControl: "3600" });
        if (error) throw error;

        const url = await publicUrl("photo-story", key);

        setItems((prev) =>
          prev.map((x, i) => (i === idx ? { ...x, image_url: url } : x))
        );

        await upsertSingleItem({
          id: current.id,
          site_id: siteUuid,
          image_url: url,
          text_block: current.text_block ?? null,
          sort_order: idx,
        });
      } catch (e: any) {
        console.error(e);
        alert(e?.message || "Upload failed.");
      }
    },
    [items, siteUuid]
  );

  const addBlockWithFile = useCallback(
    async (file: File) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
      }
      const newId = addEmptyItem();
      const newIndex = items.length;

      try {
        const key = uniqueKey("story", siteUuid, file.name);
        const { error } = await supabase.storage
          .from("photo-story")
          .upload(key, file, { upsert: false, cacheControl: "3600" });
        if (error) throw error;

        const url = await publicUrl("photo-story", key);

        setItems((prev) =>
          prev.map((x, i) => (i === newIndex ? { ...x, image_url: url } : x))
        );

        await upsertSingleItem({
          id: newId,
          site_id: siteUuid,
          image_url: url,
          text_block: null,
          sort_order: newIndex,
        });
      } catch (e: any) {
        setItems((prev) => prev.filter((x) => x.id !== newId));
        console.error(e);
        alert(e?.message || "Upload failed.");
      }
    },
    [addEmptyItem, items.length, siteUuid]
  );

  const onUploadHero = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
      }
      try {
        const key = uniqueKey("story-hero", siteUuid, file.name);
        const { error } = await supabase.storage
          .from("photo-story")
          .upload(key, file, { upsert: false, cacheControl: "3600" });
        if (error) throw error;
        const url = await publicUrl("photo-story", key);
        setStory((prev) => ({ ...prev, hero_photo_url: url }));

        await supabase.from("photo_stories").upsert(
          {
            site_id: siteUuid,
            hero_photo_url: url,
            subtitle: story.subtitle ?? null,
          },
          { onConflict: "site_id" }
        );
      } catch (e: any) {
        console.error(e);
        alert(e?.message || "Upload failed.");
      }
    },
    [siteUuid, story.subtitle]
  );

  // Accept "photostory:save" events from the main page save/autosave
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
            site_id: siteUuid,
            hero_photo_url: story.hero_photo_url ?? null,
            subtitle: (story.subtitle?.trim() || null) as string | null,
          },
          { onConflict: "site_id" }
        );
        if (sErr) throw sErr;

        const normalized: PhotoStoryItemRow[] = items
          .map((x, i) => ({
            id: x.id,
            site_id: siteUuid,
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
          {/* grid/plus icon */}
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
          {/* Empty state: add placeholder (no file dialog) */}
          {items.length === 0 ? (
            <div className="py-10 grid place-items-center">
              <AddBlockButton onClick={() => addEmptyItem()} />
            </div>
          ) : null}

          {items.map((it, idx) => (
            <div key={it.id} className="relative mb-10">
              {/* Block card */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Image area with hover group */}
                <div className="relative w-full bg-gray-50 group">
                  {it.image_url ? (
                    <img
                      src={it.image_url}
                      alt=""
                      className="w-full object-cover aspect-[16/9]"
                    />
                  ) : (
                    <div className="aspect-[16/9] w-full grid place-items-center bg-white">
                      <button
                        className="inline-flex items-center justify-center rounded-full h-14 w-14 bg-white border border-gray-300 text-gray-400 hover:text-emerald-600 hover:border-emerald-400 shadow-sm transition transform hover:scale-110"
                        onClick={() => fileInputs.current[it.id!]?.click()}
                        title="Add photo to this block"
                        aria-label="Add photo to this block"
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  )}

                  {/* Hidden input exists for EVERY block (fixes Change Image) */}
                  <input
                    ref={(el) => (fileInputs.current[it.id] = el)}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadItem(idx, f);
                      e.currentTarget.value = "";
                    }}
                  />

                  {/* HOVER CONTROLS (top-right) */}
                  <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition">
                    {/* Change image */}
                    <CircleIconBtn
                      title={it.image_url ? "Change image" : "Add image"}
                      onClick={() => fileInputs.current[it.id!]?.click()}
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
                    {/* Move up */}
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
                    {/* Move down */}
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
                    {/* Delete */}
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
                        site_id: siteUuid,
                        image_url,
                        text_block: val || null,
                        sort_order: idx,
                      });
                    }}
                  />
                </div>
              </div>

              {/* Seam-left add button → inserts placeholder after this block */}
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
              <img
                src={story.hero_photo_url}
                alt="Photo Story hero"
                className="w-full rounded-lg border border-gray-200 object-cover aspect-[16/9] mb-2"
              />
            ) : (
              <div className="w-full rounded-lg border border-dashed border-gray-300 grid place-items-center aspect-[16/9] text-sm text-gray-500 mb-2">
                No hero image
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              onChange={(e) => onUploadHero(e.target.files?.[0])}
              className="text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
            />
          </Field>

          {/* Subtitle (2 lines max) */}
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

              {lastCsvRow ? (
                <div className="mt-2 text-xs text-gray-500">
                  Loaded {Math.min(lastCsvRow.length, 10)} column
                  {Math.min(lastCsvRow.length, 10) === 1 ? "" : "s"} from CSV.
                  Mapping: C1→Block 1, C2→Block 2, etc. Columns beyond 10 are
                  ignored.
                </div>
              ) : null}
            </Field>
          </div>

          {/* Save button removed; saves happen from main page or autosave */}
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
                        site_id: siteUuid,
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add Block Button (empty state primary action)                       */
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
