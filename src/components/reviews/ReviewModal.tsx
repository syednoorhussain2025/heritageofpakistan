// src/components/reviews/ReviewModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useProfile } from "@/components/ProfileProvider";

/* ---------- constants ---------- */

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_FILE_MB = 3;
const TARGET_KB = 300;
const MAX_WIDTH = 1600;

/* ---------- storage + avatar helpers ---------- */

function storagePublicUrl(bucket: string, path?: string | null) {
  if (!path) return null;
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  return storagePublicUrl("avatars", avatar_url);
}

/* ---------- image compression ---------- */

async function compressToWebpWithDims(
  file: File,
  targetKB = TARGET_KB,
  maxWidth = MAX_WIDTH
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => {
      try { URL.revokeObjectURL(i.src); } catch {}
      resolve(i);
    };
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });

  const scale = Math.min(1, maxWidth / Math.max(1, img.width));
  const outW = Math.max(1, Math.round(img.width * scale));
  const outH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(img, 0, 0, outW, outH);

  let qLow = 0.5, qHigh = 0.95;
  let best: Blob | null = null;
  for (let step = 0; step < 6; step++) {
    const q = (qLow + qHigh) / 2;
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b as Blob), "image/webp", q)
    );
    if (!best || blob.size < best.size) best = blob;
    if (blob.size / 1024 > targetKB) qHigh = q;
    else qLow = q;
  }
  const blob =
    best ||
    (await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b as Blob), "image/webp", 0.82)
    ));
  return { blob, width: outW, height: outH };
}

/* ---------- types ---------- */

type Props = {
  open: boolean;
  onClose: () => void;
  siteId: string;
};

type LocalPhoto = {
  file: File;
  preview: string;
  caption: string;
  compressed?: Blob;
  width?: number;
  height?: number;
};

/* ---------- component ---------- */

export default function ReviewModal({ open, onClose, siteId }: Props) {
  const supabase = createClient();
  const { userId } = useAuthUserId();
  const { profile } = useProfile();

  // Mount/unmount for portal
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Sheet visibility for animation
  const [sheetVisible, setSheetVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setSheetVisible(false);
      setClosing(false);
      return;
    }
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    raf1Ref.current = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => {
        raf2Ref.current = null;
        setSheetVisible(true);
      });
    });
    return () => {
      if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current);
      if (raf2Ref.current) cancelAnimationFrame(raf2Ref.current);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const closeSheet = useCallback(() => {
    if (closeTimerRef.current != null) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  // Drag-to-close
  const sheetElRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (closeTimerRef.current) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartTime.current = Date.now();
    dragCurrentY.current = 0;
    isDragging.current = true;
    const el = sheetElRef.current;
    if (el) el.style.transition = "none";
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy < 0) {
      dragCurrentY.current = 0;
      const el = sheetElRef.current;
      if (el) el.style.transform = "translateY(0)";
      return;
    }
    dragCurrentY.current = dy;
    const el = sheetElRef.current;
    if (el) el.style.transform = `translateY(${dy}px)`;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dy = dragCurrentY.current;
    const elapsed = Date.now() - dragStartTime.current;
    const velocity = dy / elapsed;
    const el = sheetElRef.current;
    if (el) el.style.transition = "";
    if (dy >= 80 || velocity >= 0.4) {
      setClosing(true);
      if (el) el.style.transform = "translateY(100%)";
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setClosing(false);
        onClose();
        if (el) el.style.transform = "";
      }, 300);
    } else {
      if (el) el.style.transform = "translateY(0)";
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
  }, [onClose]);

  // Escape key on desktop
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSheet();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSheet]);

  // Data fetching
  const [siteTitle, setSiteTitle] = useState<string>("");
  const [userReviewTotal, setUserReviewTotal] = useState<number>(0);
  const [successToast, setSuccessToast] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sites")
        .select("title")
        .eq("id", siteId)
        .maybeSingle();
      setSiteTitle(data?.title ?? "");
    })();
  }, [siteId, supabase]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { count } = await supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("status", "deleted");
      setUserReviewTotal(count ?? 0);
    })();
  }, [userId, supabase]);

  const displayName = profile?.full_name || "Traveler";
  const avatarUrl = resolveAvatarSrc(profile?.avatar_url);
  const badge = profile?.badge || "Beginner";

  // Form state
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [visitedYear, setVisitedYear] = useState<number | "">("");
  const [visitedMonth, setVisitedMonth] = useState<number | "">("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = now; y >= 1970; y--) arr.push(y);
    return arr;
  }, []);
  const months = useMemo(
    () => [
      { v: 1, n: "Jan" }, { v: 2, n: "Feb" }, { v: 3, n: "Mar" },
      { v: 4, n: "Apr" }, { v: 5, n: "May" }, { v: 6, n: "Jun" },
      { v: 7, n: "Jul" }, { v: 8, n: "Aug" }, { v: 9, n: "Sep" },
      { v: 10, n: "Oct" }, { v: 11, n: "Nov" }, { v: 12, n: "Dec" },
    ],
    []
  );

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const next: LocalPhoto[] = [...photos];
    for (const f of files) {
      if (next.length >= 3) break;
      if (!ALLOWED_TYPES.includes(f.type)) { alert("Please choose JPG, PNG, WEBP, or HEIC/HEIF."); continue; }
      if (f.size > MAX_FILE_MB * 1024 * 1024) { alert("Each file must be 3MB or smaller."); continue; }
      next.push({ file: f, preview: URL.createObjectURL(f), caption: "" });
    }
    setPhotos(next.slice(0, 3));
    e.target.value = "";
  }

  function updateCaption(idx: number, value: string) {
    setPhotos((arr) => { const cp = [...arr]; cp[idx] = { ...cp[idx], caption: value }; return cp; });
  }

  function removePhoto(idx: number) {
    setPhotos((arr) => {
      const cp = [...arr];
      try { URL.revokeObjectURL(cp[idx].preview); } catch {}
      cp.splice(idx, 1);
      return cp;
    });
  }

  async function onSubmit() {
    if (!userId) { alert("Please sign in to write a review."); return; }
    if (!rating) { alert("Please select a rating."); return; }
    if (text.trim().length < 20) { alert("Please write at least 20 characters about your experience."); return; }
    try {
      setBusy(true);
      setError(null);
      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .eq("site_id", siteId)
        .eq("user_id", userId)
        .neq("status", "deleted")
        .maybeSingle();
      if (existing?.id) { alert("You have already submitted a review."); setBusy(false); return; }

      const { data: review, error: rErr } = await supabase
        .from("reviews")
        .insert({
          site_id: siteId, user_id: userId, rating,
          review_text: text.trim(),
          visited_year: visitedYear || null,
          visited_month: visitedMonth || null,
        })
        .select("id")
        .single();
      if (rErr) throw rErr;

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        const { blob, width, height } = await compressToWebpWithDims(p.file);
        const storagePath = `${userId}/reviews/${review.id}/${Date.now()}_${i + 1}.webp`;
        const { error: upErr } = await supabase.storage
          .from("user-photos")
          .upload(storagePath, blob, { contentType: "image/webp" });
        if (upErr) throw upErr;
        await supabase.from("review_photos").insert({
          review_id: review.id, user_id: userId,
          storage_path: storagePath, caption: p.caption || null,
          ordinal: i + 1, mime: "image/webp", size_bytes: blob.size, width, height,
        });
      }

      setSuccessToast(true);
      setTimeout(() => { setSuccessToast(false); closeSheet(); }, 1800);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to submit review.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || (!open && !closing)) return null;

  const visible = sheetVisible && !closing;

  const sheet = (
    <>
      {successToast && (
        <div className="pointer-events-none fixed left-1/2 top-5 -translate-x-1/2 z-[9999] rounded-lg bg-green-700/90 text-white text-sm px-4 py-2.5 shadow-lg">
          Review submitted!
        </div>
      )}
      <div className="fixed inset-0 z-[5500] touch-none">
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
          onClick={closeSheet}
          aria-hidden="true"
        />

        {/* Bottom sheet (mobile) / centered modal (sm+) */}
        <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:px-4 sm:py-8 pointer-events-none">
          <div
            ref={sheetElRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={[
              "pointer-events-auto w-full sm:max-w-2xl",
              "bg-white sm:rounded-2xl rounded-t-3xl",
              "flex flex-col",
              "max-h-[92dvh] sm:max-h-[88dvh]",
              "transition-transform duration-300 ease-out",
              visible ? "translate-y-0" : "translate-y-full sm:translate-y-4",
            ].join(" ")}
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            {/* Drag handle — mobile only */}
            <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0" aria-hidden="true">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="star" className="text-amber-500" />
                <h3 className="text-[17px] font-semibold text-gray-900 leading-snug">
                  {siteTitle ? `Rate ${siteTitle}` : "Write a Review"}
                </h3>
              </div>
              <button
                onClick={closeSheet}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 shrink-0"
                aria-label="Close"
              >
                <Icon name="times" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">

              {/* User info + rating row */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-amber-400/60 bg-gray-100 shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-gray-200" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[15px] text-gray-900 truncate">{displayName}</div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {badge && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[12px]">
                        {badge}
                      </span>
                    )}
                    <span className="text-[12px] text-gray-400">{userReviewTotal} reviews</span>
                  </div>
                </div>
              </div>

              {/* Star rating */}
              <div>
                <label className="block text-[13px] font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  Your Rating
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(n)}
                      className="p-1 transition-transform active:scale-90"
                      aria-label={`Rate ${n}`}
                    >
                      <Icon
                        name="star"
                        className={`text-[28px] ${(hoverRating || rating) >= n ? "text-amber-400" : "text-gray-200"}`}
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="ml-2 text-[14px] font-medium text-gray-600">{rating}/5</span>
                  )}
                </div>
              </div>

              {/* When did you visit */}
              <div>
                <label className="block text-[13px] font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  When did you visit?
                </label>
                <div className="flex gap-2">
                  <select
                    value={visitedYear}
                    onChange={(e) => setVisitedYear(e.target.value ? Number(e.target.value) : "")}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-[15px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="">Year</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select
                    value={visitedMonth}
                    onChange={(e) => setVisitedMonth(e.target.value ? Number(e.target.value) : "")}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-[15px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="">Month</option>
                    {months.map((m) => <option key={m.v} value={m.v}>{m.n}</option>)}
                  </select>
                </div>
              </div>

              {/* Review text */}
              <div>
                <label className="block text-[13px] font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  Your Experience
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  placeholder="Share road conditions, travel tips, what you loved…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-[15px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                />
                <div className="mt-1 text-[12px] text-gray-400 text-right">{text.length} chars (min 20)</div>
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-[13px] font-medium text-gray-500 mb-2 uppercase tracking-wide">
                  Add Photos (max 3)
                </label>
                {photos.length < 3 && (
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-[14px] font-medium cursor-pointer active:opacity-80">
                    <Icon name="camera" className="text-white" />
                    Choose Photos
                    <input
                      type="file"
                      accept={ALLOWED_TYPES.join(",")}
                      multiple
                      hidden
                      onChange={onPickFiles}
                    />
                  </label>
                )}
                {photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {photos.map((p, i) => (
                      <div key={i} className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
                        <img src={p.preview} alt="preview" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removePhoto(i)}
                          className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 active:opacity-80"
                          aria-label="Remove"
                        >
                          <Icon name="times" className="text-[12px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photos.length > 0 && (
                  <p className="mt-2 text-[12px] text-gray-400">Photos will be added to your photography portfolio.</p>
                )}
              </div>

              {error && <p className="text-[14px] text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            </div>

            {/* Footer actions */}
            <div className="shrink-0 px-4 pt-3 pb-3 border-t border-gray-100 flex gap-3">
              <button
                onClick={closeSheet}
                disabled={busy}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-[15px] font-medium text-gray-700 active:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={busy}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60"
              >
                {busy && (
                  <span className="inline-block h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                )}
                Submit Review
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
