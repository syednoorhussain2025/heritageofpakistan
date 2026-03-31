// src/app/admin/listings/BulkGenerateModal.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import {
  generateAltAndCaptionsAction,
  generateTagsAction,
  type TagDimensionVocab,
} from "@/app/admin/listings/[id]/gallery-actions";
import { fetchSiteImagesAction, type SiteImageRow } from "./bulk-generate-actions";

/* ================================================================
   URL reachability helpers (copied from GalleryUploader — pure client logic)
   ================================================================ */

async function urlReachable(
  url: string,
  timeoutMs = 6500
): Promise<{ ok: boolean; status?: number; contentType?: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store", signal: ctl.signal });
    return { ok: res.ok, status: res.status, contentType: res.headers.get("content-type") || "" };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

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

/* ================================================================
   Tag API helpers (fetch-based — avoids server action nesting issue)
   ================================================================ */

type TagDimension = {
  id: string;
  name: string;
  slug: string;
  is_multi: boolean;
  ai_enabled: boolean;
  values: { id: string; value: string; is_active: boolean }[];
};

async function getTagVocabulary(): Promise<TagDimension[]> {
  const res = await fetch("/api/admin/photo-tags?action=vocabulary");
  if (!res.ok) throw new Error("Failed to fetch tag vocabulary");
  return res.json();
}

async function saveAiTags(
  suggestions: { imageId: string; tags: Record<string, string[]> }[]
): Promise<void> {
  const res = await fetch("/api/admin/photo-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save-ai-tags", suggestions }),
  });
  if (!res.ok) throw new Error("Failed to save tags");
}

/* ================================================================
   Types
   ================================================================ */

type ModalStep = "context" | "running" | "done";

type BatchStepStatus =
  | "pending"
  | "captions"
  | "captions_saved"
  | "tags"
  | "tags_saved"
  | "done"
  | "error";

type BatchEntry = {
  batchIndex: number;
  imageIds: string[];
  filenames: string[];
  captionStep: BatchStepStatus;
  tagStep: BatchStepStatus;
  error?: string;
};

type SiteProgress = {
  siteId: string;
  siteName: string;
  status:
    | "pending"
    | "loading_images"
    | "url_checking"
    | "running"
    | "done"
    | "error"
    | "skipped";
  totalImages: number;
  processedImages: number;
  skippedImages: number;
  batches: BatchEntry[];
  tokIn: number;
  tokOut: number;
  usdEstimate: number | null;
  errorMessage?: string;
};

/* ================================================================
   localStorage schema
   ================================================================ */

const SESSION_KEY = "bulk_gen_session_v1";

type BulkGenSession = {
  selectedSiteIds: string[];
  siteContexts: { siteId: string; siteName: string; context: string }[];
  completedSiteIds: string[];
  regenerate: boolean;
  startedAt: string;
  lastUpdatedAt: string;
};

function loadSession(selectedIds: string[]): BulkGenSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s: BulkGenSession = JSON.parse(raw);
    const sorted = (arr: string[]) => [...arr].sort();
    if (JSON.stringify(sorted(s.selectedSiteIds)) !== JSON.stringify(sorted(selectedIds))) return null;
    if (!s.completedSiteIds?.length) return null;
    return s;
  } catch {
    return null;
  }
}

function saveSession(s: BulkGenSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, lastUpdatedAt: new Date().toISOString() }));
  } catch {}
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

/* ================================================================
   Props
   ================================================================ */

export type SelectedSite = { id: string; title: string };

interface Props {
  open: boolean;
  onClose: () => void;
  selectedSites: SelectedSite[];
}

/* ================================================================
   Component
   ================================================================ */

export default function BulkGenerateModal({ open, onClose, selectedSites }: Props) {
  /* ── Step ── */
  const [step, setStep] = useState<ModalStep>("context");

  /* ── Context entry state ── */
  const [contexts, setContexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(selectedSites.map((s) => [s.id, ""]))
  );
  const [regenerate, setRegenerate] = useState(false);

  /* ── Resume offer ── */
  const [resumeSession, setResumeSession] = useState<BulkGenSession | null>(null);
  const [resumeOffered, setResumeOffered] = useState(false);

  /* ── Running state ── */
  const [siteProgresses, setSiteProgresses] = useState<SiteProgress[]>([]);
  const [currentSiteIndex, setCurrentSiteIndex] = useState(0);
  const [totalTokIn, setTotalTokIn] = useState(0);
  const [totalTokOut, setTotalTokOut] = useState(0);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);

  /* ── Stop ── */
  const stopRef = useRef(false);

  /* ── Session ref for checkpoints ── */
  const sessionRef = useRef<BulkGenSession | null>(null);

  /* ── On open: check for resume ── */
  useEffect(() => {
    if (!open) return;
    setStep("context");
    stopRef.current = false;
    // Reset contexts to empty for current sites
    setContexts(Object.fromEntries(selectedSites.map((s) => [s.id, ""])));
    setRegenerate(false);

    const saved = loadSession(selectedSites.map((s) => s.id));
    if (saved) {
      setResumeSession(saved);
      setResumeOffered(true);
    } else {
      setResumeSession(null);
      setResumeOffered(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyResume() {
    if (!resumeSession) return;
    const newCtx: Record<string, string> = { ...contexts };
    for (const sc of resumeSession.siteContexts) {
      newCtx[sc.siteId] = sc.context;
    }
    setContexts(newCtx);
    setRegenerate(resumeSession.regenerate);
    setResumeOffered(false);
  }

  function dismissResume() {
    setResumeOffered(false);
    setResumeSession(null);
    clearSession();
  }

  /* ── Context helpers ── */
  const allContextsFilled = selectedSites.every((s) => contexts[s.id]?.trim().length > 0);

  /* ── Update helpers ── */
  const updateSiteProgress = useCallback(
    (siteId: string, patch: Partial<SiteProgress>) => {
      setSiteProgresses((prev) =>
        prev.map((p) => (p.siteId === siteId ? { ...p, ...patch } : p))
      );
    },
    []
  );

  const updateBatch = useCallback(
    (siteId: string, batchIndex: number, patch: Partial<BatchEntry>) => {
      setSiteProgresses((prev) =>
        prev.map((p) => {
          if (p.siteId !== siteId) return p;
          return {
            ...p,
            batches: p.batches.map((b) =>
              b.batchIndex === batchIndex ? { ...b, ...patch } : b
            ),
          };
        })
      );
    },
    []
  );

  /* ================================================================
     Main generation orchestrator
     ================================================================ */

  async function runBulkGeneration(resuming: boolean) {
    setStep("running");
    stopRef.current = false;

    // Fetch vocabulary once
    let vocab: TagDimensionVocab[] = [];
    let vocabDims: TagDimension[] = [];
    try {
      vocabDims = await getTagVocabulary();
      vocab = vocabDims.map((d) => ({
        slug: d.slug,
        name: d.name,
        ai_enabled: d.ai_enabled,
        values: d.values.map((v) => v.value),
      }));
    } catch (e: any) {
      // Non-fatal — tags will fail gracefully per-batch
      console.warn("[bulk-gen] vocabulary fetch failed:", e?.message);
    }

    // Build session for checkpointing
    const now = new Date().toISOString();
    const session: BulkGenSession = {
      selectedSiteIds: selectedSites.map((s) => s.id),
      siteContexts: selectedSites.map((s) => ({
        siteId: s.id,
        siteName: s.title,
        context: contexts[s.id] ?? "",
      })),
      completedSiteIds: resuming && resumeSession ? [...resumeSession.completedSiteIds] : [],
      regenerate,
      startedAt: resuming && resumeSession ? resumeSession.startedAt : now,
      lastUpdatedAt: now,
    };
    sessionRef.current = session;
    saveSession(session);

    // Initialize progress for each site
    const initialProgresses: SiteProgress[] = selectedSites.map((s) => ({
      siteId: s.id,
      siteName: s.title,
      status: session.completedSiteIds.includes(s.id) ? "done" : "pending",
      totalImages: 0,
      processedImages: 0,
      skippedImages: 0,
      batches: [],
      tokIn: 0,
      tokOut: 0,
      usdEstimate: null,
    }));
    setSiteProgresses(initialProgresses);
    setCurrentSiteIndex(0);
    setTotalTokIn(0);
    setTotalTokOut(0);
    setTotalUsd(null);

    /* ── Per-site loop ── */
    for (let si = 0; si < selectedSites.length; si++) {
      const site = selectedSites[si];

      // Skip already-completed sites (resume)
      if (session.completedSiteIds.includes(site.id)) {
        setCurrentSiteIndex(si + 1);
        continue;
      }

      if (stopRef.current) break;

      setCurrentSiteIndex(si);
      const contextArticle = contexts[site.id] ?? "";

      /* ── Load images ── */
      updateSiteProgress(site.id, { status: "loading_images" });
      let images: SiteImageRow[] = [];
      try {
        images = await fetchSiteImagesAction(site.id);
      } catch (e: any) {
        updateSiteProgress(site.id, { status: "error", errorMessage: e?.message ?? "Failed to load images" });
        continue;
      }

      /* ── Filter images ── */
      const toProcess = regenerate
        ? images
        : images.filter((img) => !(img.alt_text && img.caption && img.scene_description));

      if (!toProcess.length) {
        updateSiteProgress(site.id, {
          status: "done",
          totalImages: images.length,
          processedImages: 0,
          skippedImages: images.length,
        });
        markSiteDone(site.id, session);
        setCurrentSiteIndex(si + 1);
        continue;
      }

      /* ── URL reachability check ── */
      updateSiteProgress(site.id, { status: "url_checking", totalImages: toProcess.length });

      const resolved = toProcess.map((img) => ({
        id: img.id,
        aiUrl: getVariantPublicUrl(img.storage_path, "lg"),
        filename: img.storage_path.split("/").pop() || img.storage_path,
      }));

      const checks = await checkUrlsBatched(resolved);
      const good = checks.filter(({ ch }) => ch.ok).map(({ x }) => x);
      const badCount = checks.length - good.length;

      if (!good.length) {
        updateSiteProgress(site.id, {
          status: "error",
          errorMessage: "All images failed URL check",
          skippedImages: badCount,
        });
        continue;
      }

      /* ── Setup batches ── */
      const CHUNK = 6;
      const totalChunks = Math.ceil(good.length / CHUNK);

      const initialBatches: BatchEntry[] = Array.from({ length: totalChunks }, (_, i) => {
        const chunk = good.slice(i * CHUNK, (i + 1) * CHUNK);
        return {
          batchIndex: i,
          imageIds: chunk.map((c) => c.id),
          filenames: chunk.map((c) => c.filename),
          captionStep: "pending",
          tagStep: "pending",
        };
      });

      updateSiteProgress(site.id, {
        status: "running",
        totalImages: good.length,
        skippedImages: badCount,
        batches: initialBatches,
      });

      let siteTokIn = 0;
      let siteTokOut = 0;
      let siteUsd: number | null = null;
      let siteDone = 0;

      /* ── Batch loop ── */
      for (let i = 0; i < good.length; i += CHUNK) {
        if (stopRef.current) break;

        const chunk = good.slice(i, i + CHUNK);
        const batchIndex = Math.floor(i / CHUNK);
        const imagesIn = chunk.map((c) => ({ id: c.id, publicUrl: c.aiUrl, filename: c.filename, alt: null }));

        /* Step 1: Captions */
        updateBatch(site.id, batchIndex, { captionStep: "captions" });
        try {
          const res = await generateAltAndCaptionsAction({
            contextArticle,
            imagesIn,
            siteId: site.id,
            siteName: site.title,
          });

          // Accumulate tokens
          const usageIn = res.meta?.usage?.prompt_tokens ?? 0;
          const usageOut = res.meta?.usage?.completion_tokens ?? 0;
          const usdEst = res.meta?.usdEstimate ?? null;
          siteTokIn += usageIn;
          siteTokOut += usageOut;
          if (usdEst !== null) siteUsd = (siteUsd ?? 0) + usdEst;
          setTotalTokIn((p) => p + usageIn);
          setTotalTokOut((p) => p + usageOut);
          if (usdEst !== null) setTotalUsd((p) => (p ?? 0) + usdEst);

          // Save captions
          const updates = res.items
            .map((c) => ({
              id: c.id,
              ...(c.alt?.trim() ? { alt_text: c.alt.trim() } : {}),
              ...(c.caption?.trim() ? { caption: c.caption.trim() } : {}),
              ...(c.sceneDescription?.trim() ? { scene_description: c.sceneDescription.trim() } : {}),
            }))
            .filter((u) => Object.keys(u).length > 1);

          // Retry caption save up to 3 times
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const { saveCaptionsBatchAction } = await import("./bulk-generate-actions");
              await saveCaptionsBatchAction(updates);
              break;
            } catch {
              if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
            }
          }

          updateBatch(site.id, batchIndex, { captionStep: "captions_saved" });
        } catch (e: any) {
          updateBatch(site.id, batchIndex, { captionStep: "error", error: e?.message ?? "Caption error" });
        }

        /* Step 2: Tags */
        if (vocab.length > 0) {
          updateBatch(site.id, batchIndex, { tagStep: "tags" });
          try {
            const res = await generateTagsAction({
              contextArticle,
              imagesIn,
              vocabulary: vocab,
              siteId: site.id,
              siteName: site.title,
            });

            const tagUsageIn = res.meta?.usage?.prompt_tokens ?? 0;
            const tagUsageOut = res.meta?.usage?.completion_tokens ?? 0;
            const tagUsd = res.meta?.usdEstimate ?? null;
            siteTokIn += tagUsageIn;
            siteTokOut += tagUsageOut;
            if (tagUsd !== null) siteUsd = (siteUsd ?? 0) + tagUsd;
            setTotalTokIn((p) => p + tagUsageIn);
            setTotalTokOut((p) => p + tagUsageOut);
            if (tagUsd !== null) setTotalUsd((p) => (p ?? 0) + tagUsd);

            if (res.items.length) {
              let tagSaved = false;
              for (let attempt = 1; attempt <= 3 && !tagSaved; attempt++) {
                try {
                  await saveAiTags(res.items);
                  tagSaved = true;
                } catch {
                  if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
                }
              }
            }

            updateBatch(site.id, batchIndex, { tagStep: "tags_saved" });
          } catch (e: any) {
            updateBatch(site.id, batchIndex, { tagStep: "error", error: e?.message ?? "Tag error" });
          }
        } else {
          updateBatch(site.id, batchIndex, { tagStep: "done" });
        }

        siteDone += chunk.length;
        updateSiteProgress(site.id, {
          processedImages: siteDone,
          tokIn: siteTokIn,
          tokOut: siteTokOut,
          usdEstimate: siteUsd,
        });
      } // end batch loop

      /* Mark site done */
      updateSiteProgress(site.id, {
        status: stopRef.current && siteDone < good.length ? "error" : "done",
        processedImages: siteDone,
        tokIn: siteTokIn,
        tokOut: siteTokOut,
        usdEstimate: siteUsd,
        errorMessage: stopRef.current && siteDone < good.length ? "Stopped by user" : undefined,
      });

      if (!stopRef.current) {
        markSiteDone(site.id, session);
      }

      setCurrentSiteIndex(si + 1);
    } // end site loop

    setStep("done");
  }

  function markSiteDone(siteId: string, session: BulkGenSession) {
    if (!session.completedSiteIds.includes(siteId)) {
      session.completedSiteIds.push(siteId);
    }
    saveSession(session);
  }

  function handleStop() {
    stopRef.current = true;
  }

  function handleClose() {
    clearSession();
    onClose();
  }

  /* ================================================================
     Don't render if closed
     ================================================================ */
  if (!open) return null;

  /* ================================================================
     Derived values for display
     ================================================================ */
  const totalSites = selectedSites.length;
  const completedCount = siteProgresses.filter((p) => p.status === "done").length;
  const overallProgress = totalSites > 0 ? completedCount / totalSites : 0;

  const totalImagesProcessed = siteProgresses.reduce((a, p) => a + p.processedImages, 0);
  const totalImagesCount = siteProgresses.reduce((a, p) => a + p.totalImages, 0);

  /* ================================================================
     Render helpers
     ================================================================ */

  function stepIcon(s: BatchStepStatus) {
    if (s === "pending") return <span className="text-slate-400">○</span>;
    if (s === "captions" || s === "tags") return <span className="text-blue-500 animate-pulse">⟳</span>;
    if (s === "captions_saved" || s === "tags_saved" || s === "done")
      return <span className="text-emerald-500">✓</span>;
    if (s === "error") return <span className="text-red-500">✕</span>;
    return null;
  }

  function siteStatusBadge(status: SiteProgress["status"]) {
    const map: Record<string, string> = {
      pending: "bg-slate-100 text-slate-500",
      loading_images: "bg-blue-100 text-blue-600",
      url_checking: "bg-blue-100 text-blue-600",
      running: "bg-amber-100 text-amber-700",
      done: "bg-emerald-100 text-emerald-700",
      error: "bg-red-100 text-red-700",
      skipped: "bg-slate-100 text-slate-500",
    };
    const labels: Record<string, string> = {
      pending: "Waiting",
      loading_images: "Loading images…",
      url_checking: "Checking URLs…",
      running: "Running",
      done: "Done",
      error: "Error",
      skipped: "Skipped",
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? ""}`}>
        {labels[status] ?? status}
      </span>
    );
  }

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {step === "context" && `Generate Image Data — ${totalSites} site${totalSites !== 1 ? "s" : ""}`}
            {step === "running" && "Generating…"}
            {step === "done" && "Generation Complete"}
          </h2>
          {step !== "running" && (
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            >
              ×
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── STEP 1: Context entry ── */}
          {step === "context" && (
            <>
              {/* Resume banner */}
              {resumeOffered && resumeSession && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                  <div className="flex-1">
                    <p className="font-medium text-amber-800">Resume previous session?</p>
                    <p className="text-amber-700 mt-0.5">
                      {resumeSession.completedSiteIds.length} of {totalSites} sites were completed
                      on {new Date(resumeSession.lastUpdatedAt).toLocaleString()}.
                      Contexts will be pre-filled.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={applyResume}
                      className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-md hover:bg-amber-700"
                    >
                      Resume
                    </button>
                    <button
                      onClick={dismissResume}
                      className="px-3 py-1.5 border border-amber-300 text-amber-700 text-xs font-medium rounded-md hover:bg-amber-100"
                    >
                      Start fresh
                    </button>
                  </div>
                </div>
              )}

              <p className="text-sm text-slate-500">
                Add a context article for each site. The AI uses this to generate accurate captions and alt text.
              </p>

              {selectedSites.map((site) => (
                <div key={site.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800 mb-2">{site.title}</p>
                  <textarea
                    rows={4}
                    placeholder={`Paste context article for ${site.title}…`}
                    value={contexts[site.id] ?? ""}
                    onChange={(e) =>
                      setContexts((prev) => ({ ...prev, [site.id]: e.target.value }))
                    }
                    className="w-full text-sm rounded-lg border border-slate-300 bg-white px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400"
                  />
                </div>
              ))}

              {/* Options */}
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={regenerate}
                  onChange={(e) => setRegenerate(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                />
                Regenerate images that already have captions/alt text
              </label>
            </>
          )}

          {/* ── STEP 2: Running ── */}
          {step === "running" && (
            <>
              {/* Overall progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">
                    Site {Math.min(currentSiteIndex + 1, totalSites)} of {totalSites}
                  </span>
                  <span className="text-slate-500">
                    {totalImagesProcessed} / {totalImagesCount} images
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.round(overallProgress * 100)}%` }}
                  />
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>Tokens in: {totalTokIn.toLocaleString()}</span>
                  <span>Tokens out: {totalTokOut.toLocaleString()}</span>
                  {totalUsd !== null && (
                    <span className="text-emerald-600 font-medium">~${totalUsd.toFixed(4)}</span>
                  )}
                </div>
              </div>

              {/* Per-site list */}
              <div className="space-y-3">
                {siteProgresses.map((sp, si) => {
                  const isCurrent = si === currentSiteIndex;
                  return (
                    <div
                      key={sp.siteId}
                      className={`rounded-xl border p-4 transition-all ${
                        isCurrent
                          ? "border-blue-300 bg-blue-50"
                          : sp.status === "done"
                          ? "border-emerald-200 bg-emerald-50/40"
                          : sp.status === "error"
                          ? "border-red-200 bg-red-50/40"
                          : "border-slate-200 bg-white opacity-60"
                      }`}
                    >
                      {/* Site header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-800">{sp.siteName}</span>
                        <div className="flex items-center gap-2">
                          {sp.usdEstimate !== null && (
                            <span className="text-xs text-emerald-600">~${sp.usdEstimate.toFixed(4)}</span>
                          )}
                          {siteStatusBadge(sp.status)}
                        </div>
                      </div>

                      {/* Stats */}
                      {(sp.status === "running" || sp.status === "done") && (
                        <div className="text-xs text-slate-500 mb-2 flex gap-3">
                          <span>{sp.processedImages}/{sp.totalImages} images</span>
                          {sp.skippedImages > 0 && <span>{sp.skippedImages} skipped</span>}
                          {sp.tokIn > 0 && <span>↑{sp.tokIn.toLocaleString()} ↓{sp.tokOut.toLocaleString()} tokens</span>}
                        </div>
                      )}

                      {/* Error */}
                      {sp.errorMessage && (
                        <p className="text-xs text-red-600 mb-2">{sp.errorMessage}</p>
                      )}

                      {/* Batch grid (only for current or recently active) */}
                      {sp.batches.length > 0 && (isCurrent || sp.status === "done" || sp.status === "error") && (
                        <div className="grid grid-cols-1 gap-1">
                          {sp.batches.map((b) => (
                            <div
                              key={b.batchIndex}
                              className="flex items-center gap-3 text-xs bg-white/70 rounded-lg px-3 py-1.5 border border-slate-100"
                            >
                              <span className="text-slate-400 w-16 shrink-0">
                                Batch {b.batchIndex + 1}
                              </span>
                              <span className="text-slate-400 truncate flex-1" title={b.filenames.join(", ")}>
                                {b.imageIds.length} img{b.imageIds.length !== 1 ? "s" : ""}
                              </span>
                              <span className="flex items-center gap-1 text-slate-600">
                                {stepIcon(b.captionStep)}
                                <span>
                                  {b.captionStep === "pending" && "Captions"}
                                  {b.captionStep === "captions" && "Captioning…"}
                                  {b.captionStep === "captions_saved" && "Captions saved"}
                                  {b.captionStep === "done" && "Captions done"}
                                  {b.captionStep === "error" && "Caption error"}
                                </span>
                              </span>
                              <span className="flex items-center gap-1 text-slate-600">
                                {stepIcon(b.tagStep)}
                                <span>
                                  {b.tagStep === "pending" && "Tags"}
                                  {b.tagStep === "tags" && "Tagging…"}
                                  {b.tagStep === "tags_saved" && "Tags saved"}
                                  {b.tagStep === "done" && "Tags done"}
                                  {b.tagStep === "error" && "Tag error"}
                                </span>
                              </span>
                              {b.error && (
                                <span className="text-red-500 truncate max-w-[160px]" title={b.error}>
                                  {b.error}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── STEP 3: Done report ── */}
          {step === "done" && (
            <>
              <div className="flex items-center gap-2 text-emerald-700 font-medium">
                <span className="text-xl">✓</span>
                <span>Generation finished for {completedCount} of {totalSites} sites</span>
              </div>

              <div className="overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-2 text-slate-600 font-medium">Site</th>
                      <th className="px-4 py-2 text-slate-600 font-medium text-center">Status</th>
                      <th className="px-4 py-2 text-slate-600 font-medium text-right">Images</th>
                      <th className="px-4 py-2 text-slate-600 font-medium text-right">Tokens</th>
                      <th className="px-4 py-2 text-slate-600 font-medium text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {siteProgresses.map((sp) => (
                      <tr key={sp.siteId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2 font-medium text-slate-800">{sp.siteName}</td>
                        <td className="px-4 py-2 text-center">{siteStatusBadge(sp.status)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">
                          {sp.processedImages}
                          {sp.skippedImages > 0 && (
                            <span className="text-slate-400"> (+{sp.skippedImages} skip)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">
                          {(sp.tokIn + sp.tokOut).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-emerald-700">
                          {sp.usdEstimate !== null ? `$${sp.usdEstimate.toFixed(4)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr>
                      <td className="px-4 py-2 font-semibold text-slate-800">Total</td>
                      <td />
                      <td className="px-4 py-2 text-right font-semibold text-slate-800">
                        {totalImagesProcessed}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-800">
                        {(totalTokIn + totalTokOut).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-700">
                        {totalUsd !== null ? `$${totalUsd.toFixed(4)}` : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          {step === "context" && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => runBulkGeneration(resumeSession !== null && !resumeOffered)}
                disabled={!allContextsFilled}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resumeSession && !resumeOffered
                  ? `Resume Generation (${resumeSession.completedSiteIds.length} done)`
                  : "Start Generation"}
              </button>
            </>
          )}

          {step === "running" && (
            <>
              <span className="text-xs text-slate-400">Generation in progress — do not close this tab</span>
              <button
                onClick={handleStop}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                Stop
              </button>
            </>
          )}

          {step === "done" && (
            <>
              <span className="text-xs text-slate-400">
                Progress saved. You can close this window.
              </span>
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
