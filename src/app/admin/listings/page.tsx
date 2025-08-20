// src/app/admin/listings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";

type SiteRow = {
  id: string;
  title: string | null;
  slug: string | null;
  is_published: boolean | null;
  updated_at: string | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminListingsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("sites")
      .select("id, title, slug, is_published, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }
    setRows((data as SiteRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.title ?? "", r.slug ?? ""].some((x) =>
        x.toLowerCase().includes(needle)
      )
    );
  }, [rows, q]);

  async function createNew() {
    const base = "Untitled Heritage";
    const slug = slugify(base) + "-" + String(Date.now()).slice(-5);
    setBusy("create");
    const { data, error } = await supabase
      .from("sites")
      .insert({ title: base, slug, is_published: false })
      .select("id")
      .single();
    setBusy(null);
    if (error) return alert(error.message);
    router.push(`/admin/listings/${data!.id}`);
  }

  async function duplicate(id: string) {
    setBusy(id);
    // fetch original
    const { data: orig, error: e1 } = await supabase
      .from("sites")
      .select("*")
      .eq("id", id)
      .single();
    if (e1) {
      setBusy(null);
      return alert(e1.message);
    }
    const copy = { ...orig };
    delete copy.id;
    copy.title = (orig.title || "Copy") + " (Copy)";
    copy.slug = slugify(
      (orig.slug || "copy") + "-" + String(Date.now()).slice(-4)
    );
    copy.is_published = false;
    copy.updated_at = new Date().toISOString();

    const { data: inserted, error: e2 } = await supabase
      .from("sites")
      .insert(copy)
      .select("id")
      .single();
    if (e2) {
      setBusy(null);
      return alert(e2.message);
    }

    // copy joins (categories, regions)
    await supabase
      .rpc("clone_site_taxonomies", {
        p_from_site: id,
        p_to_site: inserted!.id,
      })
      .catch(() => {});
    // NOTE: gallery/story not auto-copied (assets) — we keep it simple here.

    setBusy(null);
    router.push(`/admin/listings/${inserted!.id}`);
  }

  async function remove(id: string) {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    setBusy(id);
    const { error } = await supabase.from("sites").delete().eq("id", id);
    setBusy(null);
    if (error) return alert(error.message);
    await load();
  }

  return (
    <AdminGuard>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Listings</h1>
          <div className="flex gap-2">
            <input
              placeholder="Search by title or slug…"
              className="border rounded px-3 py-2 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="px-3 py-2 rounded bg-black text-white text-sm"
              onClick={createNew}
              disabled={busy === "create"}
            >
              {busy === "create" ? "Creating…" : "+ New Listing"}
            </button>
          </div>
        </div>

        {loading ? (
          <div>Loading…</div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Published</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/listings/${r.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {r.title || "Untitled"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.slug}</td>
                    <td className="px-3 py-2">
                      {r.is_published ? "Yes" : "No"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {r.updated_at
                        ? new Date(r.updated_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/heritage/${r.slug}`}
                          className="px-2 py-1 border rounded hover:bg-gray-50"
                          target="_blank"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => duplicate(r.id)}
                          className="px-2 py-1 border rounded hover:bg-gray-50"
                          disabled={busy === r.id}
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => remove(r.id)}
                          className="px-2 py-1 border rounded text-red-600 hover:bg-red-50"
                          disabled={busy === r.id}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-gray-600"
                      colSpan={5}
                    >
                      No listings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
