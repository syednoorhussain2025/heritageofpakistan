// src/app/admin/writer/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  updateDocument,
  WriterDocument,
} from "@/lib/writer";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function DocCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
      <div className="h-4 w-3/4 bg-slate-200 rounded mb-3" />
      <div className="h-3 w-1/3 bg-slate-100 rounded" />
    </div>
  );
}

export default function WriterListPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<WriterDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameTimerRef = useRef<any>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.title.toLowerCase().includes(q));
  }, [docs, query]);

  async function handleCreate() {
    setCreating(true);
    try {
      const doc = await createDocument();
      router.push(`/admin/writer/${doc.id}`);
    } catch {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this document? This cannot be undone.")) return;
    await deleteDocument(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  function startRename(doc: WriterDocument, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRenamingId(doc.id);
    setRenameValue(doc.title);
    setTimeout(() => renameInputRef.current?.select(), 50);
  }

  function commitRename(id: string) {
    const title = renameValue.trim() || "Untitled Document";
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)));
    setRenamingId(null);
    if (renameTimerRef.current) clearTimeout(renameTimerRef.current);
    renameTimerRef.current = setTimeout(() => {
      updateDocument({ id, title });
    }, 400);
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100/70 text-slate-800">
        <main className="mx-auto max-w-5xl py-10 px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="text-slate-400 hover:text-slate-700 transition-colors"
                title="Back to Admin"
              >
                <Icon name="chevron-left" size={20} />
              </Link>
              <h1
                className="text-3xl font-bold"
                style={{ color: "var(--brand-blue)" }}
              >
                Writer
              </h1>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: "var(--brand-green)" }}
            >
              {creating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Icon name="plus" size={16} />
                  New Document
                </>
              )}
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="text"
              placeholder="Search documents…"
              className="w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
            />
          </div>

          {/* Document grid */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <DocCardSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 && docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4">
                <Icon name="file-alt" size={28} className="text-slate-400" />
              </div>
              <p className="text-xl font-semibold text-slate-700 mb-2">
                No documents yet
              </p>
              <p className="text-sm text-slate-500 mb-6">
                Create your first document to get started.
              </p>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold shadow transition hover:opacity-90"
                style={{ backgroundColor: "var(--brand-green)" }}
              >
                <Icon name="plus" size={16} /> New Document
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-16">
              No documents match your search.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/admin/writer/${doc.id}`}
                  className="group block bg-white rounded-xl border border-slate-200 p-5 transition-all hover:shadow-md hover:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    {renamingId === doc.id ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(doc.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(doc.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onClick={(e) => e.preventDefault()}
                        className="flex-1 text-sm font-semibold text-slate-900 bg-slate-100 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-emerald-400"
                        autoFocus
                      />
                    ) : (
                      <span className="flex-1 text-sm font-semibold text-slate-900 truncate leading-snug">
                        {doc.title}
                      </span>
                    )}

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => startRename(doc, e)}
                        title="Rename"
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      >
                        <Icon name="edit" size={13} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(doc.id, e)}
                        title="Delete"
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{timeAgo(doc.updated_at)}</span>
                    {doc.word_count > 0 && (
                      <span>{doc.word_count.toLocaleString()} words</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </AdminGuard>
  );
}
