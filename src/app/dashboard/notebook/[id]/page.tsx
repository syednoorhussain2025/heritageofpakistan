// src/app/dashboard/notebook/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { getNote, deleteNote } from "@/lib/notebook";
import type { TravelNote } from "@/lib/notebook";
import Icon from "@/components/Icon";
import { hapticHeavy, hapticLight } from "@/lib/haptics";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

function noteTypeLabel(type: string) {
  if (type === "checklist" || type === "todo") return "Checklist";
  return "Note";
}

export default function NoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [note, setNote] = useState<TravelNote | null>(null);
  const [researchNote, setResearchNote] = useState<any | null>(null);
  const [kind, setKind] = useState<"travel" | "research" | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        // Try travel note first
        const travel = await getNote(id);
        if (travel) {
          setNote(travel);
          setKind("travel");
          setLoading(false);
          return;
        }
        // Try research note
        const { data: rn } = await supabase
          .from("research_notes")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (rn) {
          setResearchNote(rn);
          setKind("research");
        }
      } catch (e) {
        // not found
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDelete() {
    if (!confirm("Delete this note permanently?")) return;
    void hapticHeavy();
    setDeleting(true);
    try {
      if (kind === "travel" && note) {
        await deleteNote(note.id);
      } else if (kind === "research" && researchNote) {
        await supabase.from("research_notes").delete().eq("id", researchNote.id);
      }
      router.push("/dashboard/notebook");
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 pb-24">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!note && !researchNote) {
    return (
      <div className="py-8 text-center text-gray-500 text-sm">
        Note not found.{" "}
        <button onClick={() => router.push("/dashboard/notebook")} className="text-[var(--brand-green)] font-medium">Go back</button>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-semibold ${kind === "travel" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
            {kind === "travel" ? noteTypeLabel(note?.type ?? "note") : "Research"}
          </span>
          <span className="text-xs text-gray-400">
            {note ? new Date(note.updated_at).toLocaleDateString() : researchNote ? new Date(researchNote.created_at).toLocaleDateString() : ""}
          </span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 leading-tight">
          {kind === "travel" ? (note?.title ?? "Untitled") : (researchNote?.site_title ?? "Research Note")}
        </h2>
        {kind === "research" && researchNote?.section_title && (
          <p className="text-xs text-gray-400 mt-0.5">Section: {researchNote.section_title}</p>
        )}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl p-4 mb-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        {kind === "travel" ? (
          <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
            {note?.content_text || "This note is empty."}
          </div>
        ) : (
          <div>
            <blockquote className="border-l-4 border-emerald-300 pl-4 text-gray-800 text-sm leading-relaxed">
              {researchNote?.quote_text ?? researchNote?.summary ?? "No content."}
            </blockquote>
            {researchNote?.site_slug && (
              <a
                href={`/heritage/${researchNote.site_slug}${researchNote.section_id ? `#${researchNote.section_id}` : ""}`}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium"
                onClick={() => void hapticLight()}
              >
                <Icon name="external-link-alt" size={14} />
                View in context
              </a>
            )}
          </div>
        )}
      </div>

      {/* Fixed delete button */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-[500] bg-white border-t border-gray-100 px-4 py-3"
        style={{ paddingBottom: "calc(52px + var(--safe-bottom, 0px) + 12px)" }}
      >
        <button
          type="button"
          onClick={() => { void hapticHeavy(); void handleDelete(); }}
          disabled={deleting}
          className="w-full rounded-full py-3.5 font-bold text-white active:opacity-80 transition disabled:opacity-50 bg-red-500"
        >
          {deleting ? "Deleting…" : "Delete Note"}
        </button>
      </div>

      {/* Desktop delete */}
      <div className="hidden lg:block pt-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-50"
        >
          <Icon name="trash" size={14} />
          {deleting ? "Deleting…" : "Delete Note"}
        </button>
      </div>
    </div>
  );
}
