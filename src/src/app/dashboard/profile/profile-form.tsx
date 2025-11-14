// src/app/dashboard/profile/profile-form.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/browser";
import { useAuthUserId } from "@/hooks/useAuthUserId";

// Helper function to resolve avatar src
function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  const supabase = createClient();
  const { data } = supabase.storage.from("avatars").getPublicUrl(avatar_url);
  return data.publicUrl;
}

type Account = {
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  country_code: string | null;
  travel_style: string | null;
  public_profile: boolean | null;
};
type Props = {
  account: Account | null;
  categories: { id: string; name: string; parent_id: string | null }[];
  interests: { category_id: string; weight: number }[];
};

export default function ProfileForm({ account, categories, interests }: Props) {
  const supabase = createClient();
  const { userId } = useAuthUserId();
  const [form, setForm] = useState<Account>({
    full_name: account?.full_name || "",
    avatar_url: account?.avatar_url || "",
    bio: account?.bio || "",
    city: account?.city || "",
    country_code: account?.country_code || "PK",
    travel_style: account?.travel_style || "history_culture",
    public_profile: account?.public_profile ?? false,
  });
  const [selectedCats, setSelectedCats] = useState<string[]>(
    interests?.map((i) => i.category_id) || []
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Get the displayable avatar source
  const avatarSrc = resolveAvatarSrc(form.avatar_url);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      setErr("Not signed in");
      return;
    }
    setSaving(true);
    setMsg(null);
    setErr(null);

    const { error: profileError } = await supabase
      .from("profiles")
      .update(form)
      .eq("id", userId);

    if (profileError) {
      setErr(profileError.message);
      setSaving(false);
      return;
    }

    const { error: interestError } = await supabase.rpc("set_user_interests", {
      in_category_ids: selectedCats,
    });

    if (interestError) {
      setErr(interestError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMsg("Profile saved successfully!");
  }

  async function handlePickAvatar(ev: React.ChangeEvent<HTMLInputElement>) {
    if (!userId) return;
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
      setSaving(true);
      setErr(null);
      setMsg(null);

      // Simple compression logic (can be expanded later)
      const path = `${userId}/${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type, // Use original file type for simplicity here
        });
      if (uploadError) throw uploadError;

      // Update the avatar_url in the profiles table
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", userId);
      if (updateError) throw updateError;

      // Update the form state to show the new avatar
      setForm((prev) => ({ ...prev, avatar_url: path }));
      setMsg("Profile photo updated.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to upload photo.");
    } finally {
      setSaving(false);
      ev.target.value = ""; // Allow re-uploading the same file
    }
  }

  return (
    <form onSubmit={saveProfile} className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Edit Your Profile</h1>

      {/* Avatar + Upload UI */}
      <div className="flex items-center gap-6">
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt="Profile photo"
            width={96}
            height={96}
            className="rounded-full object-cover"
            unoptimized // Good for Supabase URLs that aren't in next.config.js
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-300" />
        )}
        <div>
          <label
            htmlFor="avatar-upload"
            className="cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Upload Photo
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePickAvatar}
            className="sr-only" // Hide the default ugly input
          />
          <p className="text-xs text-gray-500 mt-2">
            JPG, PNG, or WEBP. Max 5MB.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Full name</span>
          <input
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500"
            placeholder="Your name"
            value={form.full_name ?? ""}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-gray-700">Bio</span>
        <textarea
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500"
          rows={3}
          placeholder="Tell us a bit about yourself"
          value={form.bio ?? ""}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          checked={!!form.public_profile}
          onChange={(e) =>
            setForm({ ...form, public_profile: e.target.checked })
          }
        />
        Make my profile public
      </label>

      <div>
        <div className="font-medium mb-2">Interests (categories)</div>
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto border p-2 rounded-md">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                checked={selectedCats.includes(c.id)}
                onChange={(e) => {
                  setSelectedCats((s) =>
                    e.target.checked
                      ? [...s, c.id]
                      : s.filter((id) => id !== c.id)
                  );
                }}
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        className="rounded-md bg-black text-white px-4 py-2 font-semibold hover:bg-gray-800 disabled:opacity-50"
        disabled={saving}
      >
        {saving ? "Saving..." : "Save changes"}
      </button>

      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </form>
  );
}
