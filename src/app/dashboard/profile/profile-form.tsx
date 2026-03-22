// src/app/dashboard/profile/profile-form.tsx
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/browser";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import Icon from "@/components/Icon";
import { pickPhotoFromGallery, dataUrlToFile, isCapacitorNative } from "@/lib/nativeCamera";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const avatarSrc = resolveAvatarSrc(form.avatar_url);

  async function saveProfile() {
    if (!userId) { setErr("Not signed in"); return; }
    setSaving(true);
    setMsg(null);
    setErr(null);

    const { error: profileError } = await supabase
      .from("profiles")
      .update(form)
      .eq("id", userId);
    if (profileError) { setErr(profileError.message); setSaving(false); return; }

    const { error: interestError } = await supabase.rpc("set_user_interests", {
      in_category_ids: selectedCats,
    });
    if (interestError) { setErr(interestError.message); setSaving(false); return; }

    setSaving(false);
    setMsg("Profile saved successfully!");
    void hapticSuccess();
  }

  async function uploadFile(file: File) {
    if (!userId) return;
    try {
      setSaving(true);
      setErr(null);
      setMsg(null);
      const path = `${userId}/${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", userId);
      if (updateError) throw updateError;
      setForm((prev) => ({ ...prev, avatar_url: path }));
      setMsg("Profile photo updated.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to upload photo.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePickAvatar(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    ev.target.value = "";
    await uploadFile(file);
  }

  async function handleNativePick() {
    void hapticLight();
    const photo = await pickPhotoFromGallery();
    if (!photo) return;
    const file = dataUrlToFile(photo.dataUrl, `avatar.${photo.format}`);
    await uploadFile(file);
  }

  async function handleRemoveAvatar() {
    if (!userId) return;
    void hapticMedium();
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);
      if (error) throw error;
      setForm((prev) => ({ ...prev, avatar_url: "" }));
      setMsg("Profile photo removed.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to remove photo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Scrollable content area */}
      <div className="space-y-5 px-4 pb-6">

        {/* Avatar row: photo left, controls right */}
        <div className="flex items-center gap-4 pt-2">
          {/* Circular avatar — larger */}
          <div className="relative w-28 h-28 shrink-0">
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gray-200 ring-2 ring-gray-100 relative">
              {avatarSrc ? (
                <Image
                  src={avatarSrc}
                  alt="Profile photo"
                  fill
                  className="object-cover rounded-full"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <Icon name="user-round" size={40} />
                </div>
              )}
            </div>
            {/* Remove button */}
            {avatarSrc && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={saving}
                aria-label="Remove photo"
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md active:bg-red-600 disabled:opacity-50"
              >
                <Icon name="times" size={11} />
              </button>
            )}
          </div>

          {/* Upload controls on the right */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (isCapacitorNative()) {
                  void handleNativePick();
                } else {
                  void hapticLight();
                  fileInputRef.current?.click();
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium active:bg-gray-50 disabled:opacity-50 transition"
            >
              <Icon name="camera" size={14} />
              {saving ? "Uploading…" : "Change Photo"}
            </button>
            <p className="text-xs text-gray-400 pl-1">JPG, PNG, or WEBP</p>
          </div>

          {/* Hidden file input — accept="image/*" opens camera+gallery on iOS/Android */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickAvatar}
            className="sr-only"
          />
        </div>

        {/* Full name — font-size 16px prevents iOS zoom */}
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Full name</span>
          <input
            className="mt-1.5 block w-full rounded-full border border-gray-300 px-4 py-3 bg-gray-50 text-sm focus:border-[var(--brand-green)] outline-none"
            style={{ fontSize: "16px" }}
            placeholder="Your name"
            value={form.full_name ?? ""}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </label>

        {/* Bio */}
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Bio</span>
          <textarea
            className="mt-1.5 block w-full rounded-2xl border border-gray-300 px-4 py-3 bg-gray-50 text-sm focus:border-[var(--brand-green)] outline-none"
            style={{ fontSize: "16px" }}
            rows={3}
            placeholder="Tell us a bit about yourself"
            value={form.bio ?? ""}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>

        {/* Public profile */}
        <label className="flex items-center gap-3 py-1">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-[var(--brand-green)] focus:ring-[var(--brand-green)]"
            checked={!!form.public_profile}
            onChange={(e) => {
              void hapticLight();
              setForm({ ...form, public_profile: e.target.checked });
            }}
          />
          <span className="text-sm font-medium text-gray-700">Make my profile public</span>
        </label>

        {/* Interests */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Interests (categories)</div>
          <div className="grid grid-cols-2 gap-2 max-h-52 overflow-auto border border-gray-200 p-3 rounded-2xl bg-gray-50">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-gray-300 text-[var(--brand-green)] focus:ring-[var(--brand-green)]"
                  checked={selectedCats.includes(c.id)}
                  onChange={(e) => {
                    void hapticLight();
                    setSelectedCats((s) =>
                      e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id)
                    );
                  }}
                />
                <span className="text-sm">{c.name}</span>
              </label>
            ))}
          </div>
        </div>

        {msg && <p className="text-sm text-emerald-600 font-medium">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>

      {/* Fixed save button — sticks to bottom of the dashboard shell's main area */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-[500] bg-white border-t border-gray-100 px-4 py-3"
        style={{ paddingBottom: "calc(52px + var(--safe-bottom, 0px) + 12px)" }}>
        <button
          type="button"
          onClick={() => { void hapticMedium(); void saveProfile(); }}
          disabled={saving}
          className="w-full rounded-full py-3.5 font-bold text-white active:opacity-80 transition disabled:opacity-50"
          style={{ backgroundColor: "var(--brand-green)" }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
      {/* Desktop save button */}
      <div className="hidden lg:block px-4 pb-4">
        <button
          type="button"
          onClick={() => { void hapticMedium(); void saveProfile(); }}
          disabled={saving}
          className="rounded-full px-8 py-3.5 font-bold text-white active:opacity-80 transition disabled:opacity-50"
          style={{ backgroundColor: "var(--brand-green)" }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </>
  );
}
