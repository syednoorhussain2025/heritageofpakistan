// src/app/dashboard/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image"; // ✅ alias to avoid clashing with DOM Image()
import { supabase } from "@/lib/supabaseClient";
import { useAuthUserId } from "@/hooks/useAuthUserId";

/** Resolve avatar src: absolute URL stays as-is; otherwise return public URL from "avatars" bucket */
function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  const { data } = supabase.storage.from("avatars").getPublicUrl(avatar_url);
  return data.publicUrl;
}

/** Compress to WEBP ≈300KB, max width 1600px */
async function compressToWebp(
  file: File,
  targetKB = 300,
  maxWidth = 1600
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image(); // ✅ use DOM constructor, not Next/Image
    i.onload = () => {
      // Revoke object URL once loaded (avoid memory leaks)
      try {
        URL.revokeObjectURL(i.src);
      } catch {}
      resolve(i);
    };
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });

  const scale = Math.min(1, maxWidth / Math.max(1, img.width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Binary search quality towards target size
  let qLow = 0.5;
  let qHigh = 0.95;
  let bestBlob: Blob | null = null;

  for (let step = 0; step < 6; step++) {
    const q = (qLow + qHigh) / 2;
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b as Blob), "image/webp", q)
    );
    if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;

    if (blob.size / 1024 > targetKB) {
      qHigh = q; // too big → reduce quality
    } else {
      qLow = q; // small enough → increase a bit
    }
  }

  if (bestBlob) return bestBlob;
  return await new Promise((res) =>
    canvas.toBlob((b) => res(b as Blob), "image/webp", 0.8)
  ).then((b) => b as Blob);
}

type ProfileRow = {
  id: string;
  email: string | null;
  is_admin: boolean | null;
  created_at: string | null;
  full_name: string | null;
  bio: string | null;
  city: string | null;
  country_code: string | null;
  travel_style: string | null;
  public_profile: boolean | null;
  avatar_url: string | null; // ✅ matches your schema
  updated_at: string | null;
};

export default function ProfilePage() {
  const { userId, authLoading, authError } = useAuthUserId();
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarSrc = resolveAvatarSrc(avatarUrl ?? undefined);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setPageError(null);

        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, email, is_admin, created_at, full_name, bio, city, country_code, travel_style, public_profile, avatar_url, updated_at"
          )
          .eq("id", userId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setPageError("Profile not found.");
          return;
        }

        const p = data as ProfileRow;
        setProfile(p);
        setFullName(p.full_name ?? "");
        setBio(p.bio ?? "");
        setCity(p.city ?? "");
        setCountry(p.country_code ?? "");
        setAvatarUrl(p.avatar_url ?? null);
      } catch (e: any) {
        console.error("Profile load error:", e);
        setPageError(e?.message ?? "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, userId]);

  async function handleSave() {
    if (!userId) return;
    try {
      setPageError(null);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName || null,
          bio: bio || null,
          city: city || null,
          country_code: country || null,
          avatar_url: avatarUrl || null,
        })
        .eq("id", userId);
      if (error) throw error;
      alert("Profile updated.");
    } catch (e: any) {
      console.error("Profile update error:", e);
      setPageError(e?.message ?? "Failed to update profile.");
    }
  }

  /** Select + validate + compress + upload avatar */
  async function handlePickAvatar(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      alert("Please upload a JPG, PNG, or WEBP image.");
      ev.target.value = "";
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert("Photo must be 3MB or smaller.");
      ev.target.value = "";
      return;
    }

    try {
      setPageError(null);

      // Compress to ~300KB WEBP
      const blob = await compressToWebp(file, 300, 1600);

      const path = `${userId}/${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/webp",
        });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", userId);
      if (updErr) throw updErr;

      setAvatarUrl(path);
      alert("Profile photo updated.");
    } catch (e: any) {
      console.error("Avatar upload error:", e);
      setPageError(e?.message ?? "Failed to upload photo.");
    } finally {
      // allow selecting the same file again if needed
      ev.target.value = "";
    }
  }

  if (authLoading || loading) return <div>Loading profile…</div>;
  if (authError)
    return <div className="text-red-600">Auth error: {authError}</div>;
  if (!userId) return <div>Please sign in to edit your profile.</div>;
  if (pageError) return <div className="text-red-600">Error: {pageError}</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>

      {/* Avatar + Upload */}
      <div className="flex items-center gap-6 mb-6">
        {avatarSrc ? (
          <NextImage
            src={avatarSrc}
            alt="profile photo"
            width={96}
            height={96}
            className="rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-300" />
        )}
        <div>
          <label className="block text-sm font-medium mb-1">
            Upload profile photo
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePickAvatar}
            className="block text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            JPG/PNG/WEBP, max 3&nbsp;MB. We compress to ~300&nbsp;KB
            automatically.
          </p>
        </div>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-1 gap-4">
        <label className="block">
          <span className="text-sm font-medium">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2"
            rows={4}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">City</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Country code</span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="PK"
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
        </div>

        <div className="flex items-center justify-end">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded bg-black text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
