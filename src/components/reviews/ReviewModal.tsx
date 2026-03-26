// src/components/reviews/ReviewModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBottomSheetParallax } from "@/hooks/useBottomSheetParallax";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { hapticLight, hapticMedium } from "@/lib/haptics";
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
  onSuccess?: () => void;
  onBadgeEarned?: (badge: string, reviewCount: number) => void;
  siteId: string;
  rating: number;
  onRatingChange: (n: number) => void;
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

export default function ReviewModal({ open, onClose, onSuccess, onBadgeEarned, siteId, rating, onRatingChange }: Props) {
  const supabase = createClient();
  const { userId } = useAuthUserId();
  const { profile, updateBadge } = useProfile();
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // Mount/unmount for portal
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // NOTE: scroll lock intentionally omitted — SiteActionsSheet parent already
  // locks scroll. A second competing lock on iOS causes viewport jump on keyboard open.

  // Sheet visibility for animation
  const [sheetVisible, setSheetVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  useBottomSheetParallax(sheetVisible && !closing);
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
    void hapticLight();
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      onClose();
    }, 500);
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
  const [siteCoverUrl, setSiteCoverUrl] = useState<string | null>(null);
  const [siteLocation, setSiteLocation] = useState<string | null>(null);
  const [siteLoaded, setSiteLoaded] = useState(false);
  const [userReviewTotal, setUserReviewTotal] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("sites")
        .select("title, cover_photo_url, location_free")
        .eq("id", siteId)
        .maybeSingle();
      setSiteTitle(data?.title ?? "");
      setSiteCoverUrl(data?.cover_photo_url ?? null);
      setSiteLocation(data?.location_free ?? null);
      setSiteLoaded(true);
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

  // Form state — rating is lifted to parent so it survives re-renders/remounts
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [visitedYear, setVisitedYear] = useState<number | "">("");
  const [visitedMonth, setVisitedMonth] = useState<number | "">("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
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
    setPhotoError(null);
    for (const f of files) {
      if (next.length >= 3) break;
      if (!ALLOWED_TYPES.includes(f.type)) {
        setPhotoError("Only JPG, PNG, WEBP, or HEIC/HEIF photos are allowed.");
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setPhotoError(`"${f.name}" is too large. Max size per photo is ${MAX_FILE_MB}MB.`);
        continue;
      }
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

      // Check for badge upgrade
      // The DB trigger (tg_profile_counters_after_change → refresh_profile_counters)
      // already updates profiles.badge via compute_badge() after every review insert.
      // We just need to read the badge BEFORE and AFTER the insert to detect a tier change.
      let earnedBadge: string | null = null;
      let newReviewCount = 0;
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        const freshUserId = freshUser?.id ?? userId;

        // Read badge BEFORE insert (already done above — captured from profileRef)
        const badgeBefore = profileRef.current?.badge ?? null;

        // Wait briefly for the DB trigger to finish updating the badge
        await new Promise(res => setTimeout(res, 600));

        // Read badge AFTER trigger has run
        const [{ count }, { data: profileAfter }] = await Promise.all([
          supabase.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", freshUserId).neq("status", "deleted"),
          supabase.from("profiles").select("badge").eq("id", freshUserId).single(),
        ]);
        newReviewCount = count ?? 0;
        const badgeAfter = profileAfter?.badge ?? null;

        console.log("[badge check] before:", badgeBefore, "after:", badgeAfter, "count:", newReviewCount);

        if (badgeAfter && badgeAfter !== badgeBefore) {
          updateBadge(badgeAfter);
          // Only show popup if there was a previous badge (not first-time init)
          if (badgeBefore !== null) earnedBadge = badgeAfter;
        }
      } catch (e) { console.error("[badge check]", e); }

      // Close sheet immediately, then fire onSuccess / onBadgeEarned
      closeSheet();
      setTimeout(() => {
        onSuccess?.();
        if (earnedBadge) onBadgeEarned?.(earnedBadge, newReviewCount);
      }, 400);
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
      <div
        className={`fixed inset-0 z-[5500] transition-all duration-500 ease-in-out ${visible ? "bg-black/0" : "bg-black/0"}`}
        onClick={closeSheet}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[5501] pointer-events-none flex items-end justify-center">
        <div
          ref={sheetElRef}
          className={`pointer-events-auto w-full bg-white rounded-t-3xl flex flex-col h-[92vh] max-h-[92vh] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
          }`}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle — only this triggers swipe-to-close */}
          <div
            className="w-full flex justify-center pt-3 pb-1 shrink-0 touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            aria-hidden="true"
          >
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Header — centered title, user preview left */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-200/60 shrink-0">
            <div className="flex items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center">
                <Icon name="star" size={15} className="text-amber-500" />
              </div>
              <span className="text-[17px] font-bold text-gray-900">Write a Review</span>
            </div>
            {/* Site preview row — always rendered to avoid layout shift */}
            <div className="flex items-center gap-3 mt-3">
              <div className="w-12 h-12 rounded-xl shrink-0 bg-gray-100 overflow-hidden">
                {siteLoaded && siteCoverUrl && (
                  <img src={siteCoverUrl} alt={siteTitle} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {siteLoaded ? (
                  <>
                    <p className="text-[15px] font-semibold text-gray-900 leading-snug truncate">{siteTitle}</p>
                    {siteLocation && <p className="text-[12px] text-gray-500 truncate mt-0.5">{siteLocation}</p>}
                  </>
                ) : (
                  <>
                    <div className="h-3.5 bg-gray-100 rounded-full w-2/3 animate-pulse" />
                    <div className="h-2.5 bg-gray-100 rounded-full w-1/3 mt-1.5 animate-pulse" />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">

            {/* Star rating */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider ml-1">
                Your Rating
              </label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => { void hapticLight(); onRatingChange(n); }}
                    onTouchEnd={(e) => { e.preventDefault(); void hapticLight(); onRatingChange(n); }}
                    className="p-1.5 transition-transform active:scale-90"
                    aria-label={`Rate ${n}`}
                  >
                    <Icon
                      name="star"
                      size={36}
                      className={(hoverRating || rating) >= n ? "text-amber-400" : "text-gray-200"}
                    />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="ml-2 text-[14px] font-semibold text-gray-600">{rating}/5</span>
                )}
              </div>
            </div>

            {/* When did you visit */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider ml-1">
                When did you visit?
              </label>
              <div className="flex gap-2">
                <select
                  value={visitedYear}
                  onChange={(e) => setVisitedYear(e.target.value ? Number(e.target.value) : "")}
                  className="flex-1 border border-gray-200 rounded-full px-4 py-3 text-[15px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-200 appearance-none"
                >
                  <option value="">Year</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                  value={visitedMonth}
                  onChange={(e) => setVisitedMonth(e.target.value ? Number(e.target.value) : "")}
                  className="flex-1 border border-gray-200 rounded-full px-4 py-3 text-[15px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-200 appearance-none"
                >
                  <option value="">Month</option>
                  {months.map((m) => <option key={m.v} value={m.v}>{m.n}</option>)}
                </select>
              </div>
            </div>

            {/* Review text */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider ml-1">
                Your Experience
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Share road conditions, travel tips, what you loved…"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[15px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
              />
              <div className="mt-1 text-[12px] text-gray-400 text-right">{text.length} chars (min 20)</div>
            </div>

            {/* Photo upload */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                {photos.length < 3 && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 text-white text-[13px] font-medium cursor-pointer active:opacity-80 shrink-0">
                    <Icon name="camera" size={13} className="text-white" />
                    Choose Photos
                    <input type="file" accept={ALLOWED_TYPES.join(",")} multiple hidden onChange={onPickFiles} />
                  </label>
                )}
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Add photos ({photos.length}/3)
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">JPG, PNG, WEBP or HEIC · Max {MAX_FILE_MB}MB each</p>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => {
                  const photo = photos[i];
                  return photo ? (
                    <div key={i} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100">
                      <img src={photo.preview} alt="preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => { void hapticLight(); removePhoto(i); }}
                        className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 active:opacity-80"
                        aria-label="Remove"
                      >
                        <Icon name="times" size={12} />
                      </button>
                    </div>
                  ) : (
                    <div key={i} className="aspect-[4/3] rounded-2xl bg-gray-100 flex items-center justify-center">
                      <Icon name="images" size={22} className="text-gray-300" />
                    </div>
                  );
                })}
              </div>
              {photos.length > 0 && (
                <p className="mt-2 text-[12px] text-gray-400">Photos will be added to your photography portfolio.</p>
              )}
              {photoError && (
                <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-3 py-2.5">
                  <Icon name="triangle-exclamation" size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-red-600 leading-snug">{photoError}</p>
                </div>
              )}
            </div>

            {error && <p className="text-[14px] text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-gray-100 bg-white">
            {/* User band */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gray-200" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{displayName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {badge && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium">
                      {badge}
                    </span>
                  )}
                  <span className="text-[12px] text-gray-400">{userReviewTotal} reviews</span>
                </div>
              </div>
            </div>
            {/* Submit button */}
            <div className="px-4 pt-3 pb-8">
              <button
                onClick={() => { void hapticMedium(); void onSubmit(); }}
                disabled={busy}
                className="w-full py-3 rounded-full bg-amber-500 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60 shadow-sm"
              >
                {busy && <span className="inline-block h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />}
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
