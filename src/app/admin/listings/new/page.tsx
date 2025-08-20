// src/app/admin/listings/new/page.tsx
"use client";

import AdminGuard from "@/components/AdminGuard";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function NewListing() {
  return (
    <AdminGuard>
      <NewListingContent />
    </AdminGuard>
  );
}

function NewListingContent() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!title || !slug) {
      alert("Enter Title and Slug");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("sites")
      .insert({ title, slug, is_published: false })
      .select()
      .single();
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    window.location.href = `/admin/listings/${data!.id}`;
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Add New Listing</h1>
      <label className="block mb-3">
        <div className="text-sm font-medium mb-1">Title</div>
        <input
          className="w-full border rounded px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block mb-6">
        <div className="text-sm font-medium mb-1">Slug (URL part)</div>
        <input
          className="w-full border rounded px-3 py-2"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="lahore-fort"
        />
      </label>
      <button
        onClick={create}
        disabled={saving}
        className="px-4 py-2 rounded bg-black text-white"
      >
        {saving ? "Creating…" : "Create Listing"}
      </button>
    </div>
  );
}
