// src/app/dashboard/profile/profile-form.tsx
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

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

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not signed in");
      setSaving(false);
      return;
    }

    // 1) UPDATED: Update the new 'profiles' table
    const { error: e1 } = await supabase
      .from("profiles")
      .update(form)
      .eq("id", user.id);
    if (e1) {
      setErr(e1.message);
      setSaving(false);
      return;
    }

    // 2) Save interests via RPC (this part remains the same)
    const { error: e2 } = await supabase.rpc("set_user_interests", {
      in_category_ids: selectedCats,
    });
    if (e2) {
      setErr(e2.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMsg("Saved!");
  }

  return (
    <form onSubmit={saveProfile} className="space-y-6 max-w-2xl">
      {/* The rest of the form JSX remains exactly the same... */}
      <h1 className="text-xl font-semibold">Profile</h1>
      <div className="grid grid-cols-2 gap-4">
        <input
          className="border p-2 rounded"
          placeholder="Full name"
          value={form.full_name ?? ""}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
        {/* ... other inputs ... */}
      </div>
      <textarea
        className="border p-2 rounded w-full"
        rows={3}
        placeholder="Bio"
        value={form.bio ?? ""}
        onChange={(e) => setForm({ ...form, bio: e.target.value })}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!form.public_profile}
          onChange={(e) =>
            setForm({ ...form, public_profile: e.target.checked })
          }
        />
        Make my profile public
      </label>
      <div>
        <div className="font-medium mb-2">Interests (categories)</div>
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto border p-2 rounded">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input
                type="checkbox"
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
        className="rounded bg-black text-white px-4 py-2"
        disabled={saving}
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
      {msg && <p className="text-green-600">{msg}</p>}
      {err && <p className="text-red-600">{err}</p>}
    </form>
  );
}
