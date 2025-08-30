// src/components/reviews/ReviewModal.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabaseClient";
import { useAuthUserId } from "@/hooks/useAuthUserId";

/* ---------- constants ---------- */

// Align accepted types with DB check constraint (jpeg, png, webp, heic, heif)
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

/* ---------- storage + avatar helpers (same as ReviewsTab) ---------- */

function storagePublicUrl(bucket: string, path?: string | null) {
  if (!path) return null;
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Absolute URL stays; otherwise treat as path under `avatars` bucket */
function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  return storagePublicUrl("avatars", avatar_url);
}

/* ---------- image compression (returns blob + dimensions) ---------- */

async function compressToWebpWithDims(
  file: File,
  targetKB = TARGET_KB,
  maxWidth = MAX_WIDTH
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => {
      try {
        URL.revokeObjectURL(i.src);
      } catch {}
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

  let qLow = 0.5,
    qHigh = 0.95;
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

  // animation state (slow & smooth)
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    if (open) setVisible(true);
    else {
      const t = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  // close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const cardRef = useRef<HTMLDivElement>(null);
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cardRef.current && !cardRef.current.contains(e.target as Node))
      onClose();
  };

  // site + user display
  const [siteTitle, setSiteTitle] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("Traveler");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [badge, setBadge] = useState<string>("Beginner");
  const [userReviewTotal, setUserReviewTotal] = useState<number>(0);

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
      // Match ReviewsTab fields & logic
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, username, avatar_url, badge")
        .eq("id", userId)
        .maybeSingle();

      const name = prof?.full_name || prof?.username || "Traveler";
      setDisplayName(name);

      const resolved = resolveAvatarSrc(prof?.avatar_url || null);
      setAvatarUrl(resolved || null);

      // Count user's total *active* reviews
      const { count: totalReviews } = await supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("status", "deleted"); // <-- This ensures consistency
      setUserReviewTotal(totalReviews ?? 0);

      // The badge is now read directly from the profile.
      setBadge(prof?.badge || "Beginner");
    })();
  }, [userId, supabase]);

  // form state
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const ratingDisplay = hoverRating || rating;
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
  const months = [
    { v: 1, n: "Jan" },
    { v: 2, n: "Feb" },
    { v: 3, n: "Mar" },
    { v: 4, n: "Apr" },
    { v: 5, n: "May" },
    { v: 6, n: "Jun" },
    { v: 7, n: "Jul" },
    { v: 8, n: "Aug" },
    { v: 9, n: "Sep" },
    { v: 10, n: "Oct" },
    { v: 11, n: "Nov" },
    { v: 12, n: "Dec" },
  ];

  /* ---------- file handling ---------- */

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const next: LocalPhoto[] = [...photos];
    for (const f of files) {
      if (next.length >= 3) break;
      if (!ALLOWED_TYPES.includes(f.type)) {
        alert("Please choose JPG, PNG, WEBP, or HEIC/HEIF.");
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        alert("Each file must be 3MB or smaller.");
        continue;
      }
      next.push({
        file: f,
        preview: URL.createObjectURL(f),
        caption: "",
      });
    }
    setPhotos(next.slice(0, 3));
    e.target.value = "";
  }

  function updateCaption(idx: number, value: string) {
    setPhotos((arr) => {
      const cp = [...arr];
      cp[idx] = { ...cp[idx], caption: value };
      return cp;
    });
  }

  function removePhoto(idx: number) {
    setPhotos((arr) => {
      const cp = [...arr];
      try {
        URL.revokeObjectURL(cp[idx].preview);
      } catch {}
      cp.splice(idx, 1);
      return cp;
    });
  }

  /* ---------- submit ---------- */

  async function onSubmit() {
    if (!userId) {
      alert("Please sign in to write a review.");
      return;
    }
    if (!rating) {
      alert("Please select a rating.");
      return;
    }
    if (text.trim().length < 20) {
      alert("Please write at least 20 characters about your experience.");
      return;
    }

    try {
      setBusy(true);
      setError(null);

      // prevent duplicate review (pre-check)
      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .eq("site_id", siteId)
        .eq("user_id", userId)
        .neq("status", "deleted")
        .maybeSingle();
      if (existing?.id) {
        alert("You have already submitted a review.");
        return;
      }

      // insert review
      const { data: review, error: rErr } = await supabase
        .from("reviews")
        .insert({
          site_id: siteId,
          user_id: userId,
          rating,
          review_text: text.trim(),
          visited_year: visitedYear || null,
          visited_month: visitedMonth || null,
        })
        .select("id")
        .single();

      if (rErr) {
        const msg = (rErr.message || "") + " " + (rErr.details || "");
        if (rErr.code === "23505" || /duplicate key/i.test(msg)) {
          alert("You have already submitted a review.");
          return;
        }
        throw rErr;
      }

      // upload photos with sequential ordinals and full metadata
      let anyPhotos = false;

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];

        // compress (get blob + dimensions)
        const { blob, width, height } = await compressToWebpWithDims(p.file);
        const ext = "webp";
        // unified storage path convention
        const storagePath = `${userId}/reviews/${review.id}/${Date.now()}_${
          i + 1
        }.${ext}`;

        // upload
        const { error: upErr } = await supabase.storage
          .from("user-photos")
          .upload(storagePath, blob, {
            cacheControl: "3600",
            upsert: false,
            contentType: "image/webp",
          });
        if (upErr) throw upErr;

        // link row (matches your schema; no original_name)
        const { error: linkErr } = await supabase.from("review_photos").insert({
          review_id: review.id,
          user_id: userId, // OK even if trigger sets it
          storage_path: storagePath,
          caption: p.caption || null,
          ordinal: i + 1,
          mime: "image/webp",
          size_bytes: blob.size,
          width,
          height,
        });

        if (linkErr) {
          console.error("Link insert error:", linkErr);
          alert(
            `Link insert error: ${JSON.stringify(
              {
                code: linkErr.code,
                message: linkErr.message,
                details: linkErr.details,
              },
              null,
              2
            )}`
          );
          continue; // proceed with remaining photos
        }

        anyPhotos = true;
      }

      // success message
      alert(
        `Review submitted!${
          anyPhotos ? "\n\nPhotos added to your Portfolio." : ""
        }`
      );
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to submit review.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- render ---------- */

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 ${
        open ? "opacity-100" : "opacity-0"
      } transition-opacity duration-300`}
      onMouseDown={onBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal card */}
      <div className="absolute inset-0 flex items-center justify-center px-3 py-6">
        <div
          ref={cardRef}
          onMouseDown={(e) => e.stopPropagation()}
          className={`relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-gray-200 ${
            open ? "scale-100 opacity-100" : "scale-95 opacity-0"
          } transition-all duration-300`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b">
            <div className="flex items-center gap-2">
              <Icon name="star" className="text-amber-500" />
              <h3 className="text-xl font-semibold">
                {siteTitle ? `${siteTitle}: ` : ""}Share Your Experience
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition"
              aria-label="Close"
            >
              <Icon name="times" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Rating + user block row */}
            <section>
              <div className="flex items-start justify-between gap-6">
                {/* left: rating */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rate your Experience
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onMouseEnter={() => setHoverRating(n)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(n)}
                          className="p-1 transition-transform hover:-translate-y-0.5"
                          aria-label={`Rate ${n}`}
                        >
                          <Icon
                            name="star"
                            className={`${
                              (hoverRating || rating) >= n
                                ? "text-amber-500"
                                : "text-gray-300"
                            } text-2xl`}
                          />
                        </button>
                      ))}
                    </div>
                    {rating > 0 && (
                      <div className="text-sm text-gray-700">{rating}/5</div>
                    )}
                  </div>
                </div>

                {/* right: avatar + name + badge + totals */}
                <div className="flex items-center gap-3 mr-24">
                  <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-amber-400/70 bg-gray-100 flex-shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="avatar"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{displayName}</div>
                    {badge && (
                      <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-sm">
                        {badge}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-gray-500">
                      Reviews: {userReviewTotal}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* When visited */}
            <section>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When did you visit this place?
              </label>
              <div className="flex gap-3">
                <select
                  value={visitedYear}
                  onChange={(e) =>
                    setVisitedYear(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-40 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="">Year</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  value={visitedMonth}
                  onChange={(e) =>
                    setVisitedMonth(
                      e.target.value ? Number(e.target.value) : ""
                    )
                  }
                  className="w-40 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="">Month</option>
                  {months.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.n}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* Text */}
            <section>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Share your Experience. Do include any Guidelines, Road
                Conditions or other Travel Advice
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Tell other travelers about your visit…"
                className="w-full border rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </section>

            {/* Upload */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Icon name="camera" />
                <label className="text-sm font-medium text-gray-700">
                  Upload High Quality Photo of the Site (Max 3)
                </label>
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white cursor-pointer hover:opacity-90">
                  <Icon name="upload" />
                  Choose Files
                  <input
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    multiple
                    hidden
                    onChange={onPickFiles}
                  />
                </label>
                <span className="text-sm text-gray-600">
                  Choose your best 3 High Quality Photos of the Site. These will
                  be used in your Photography portfolio.
                </span>
              </div>

              {!!photos.length && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {photos.map((p, i) => (
                    <div
                      key={i}
                      className="border rounded-xl overflow-hidden shadow-sm"
                    >
                      <div className="relative w-full aspect-[4/3] bg-gray-100">
                        <img
                          src={p.preview}
                          alt="preview"
                          className="h-full w-full object-cover"
                        />
                        <button
                          onClick={() => removePhoto(i)}
                          className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-700 rounded-full p-2 shadow"
                          aria-label="Remove"
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                      <div className="p-2">
                        <input
                          value={p.caption}
                          onChange={(e) => updateCaption(i, e.target.value)}
                          placeholder="Add caption (optional)"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Footer */}
          <div className="p-5 border-t flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
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
  );
}
