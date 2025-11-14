// src/lib/notebook.ts
"use client";

import { createClient } from "@/lib/supabase/browser";

/* ───────────── Small util to surface real errors ───────────── */
function msg(error: any, fallback = "Operation failed") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
}

/* ───────────────────────── Travel notes ───────────────────────── */

export type NoteType = "note" | "checklist" | "todo";

export type TravelNote = {
  id: string;
  user_id: string;
  title: string;
  type: NoteType;
  content: any; // TipTap JSON
  content_text: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

/* ───────────────────────── Research notes ─────────────────────── */

export type ResearchNoteInsert = {
  site_id: string;
  site_slug: string;
  site_title: string;
  section_id: string;
  section_title: string;
  quote_text: string;
  context_before?: string | null;
  context_after?: string | null;
};

export type ResearchNote = ResearchNoteInsert & {
  id: string;
  user_id: string;
  url: string | null;
  created_at: string;
  updated_at: string;
};

/* ─────────────────────── Unified list (view) ──────────────────── */

export type NoteKind = "travel" | "research";

export type UnifiedNoteListItem = {
  id: string;
  kind: NoteKind;
  title: string; // For list display
  summary: string | null;
  created_at: string; // ISO
  updated_at: string; // ISO
  // Present only for research notes; null for travel notes
  site_id: string | null;
  site_slug: string | null;
  site_title: string | null;
  section_id: string | null;
  section_title: string | null;
};

/* ────────────────────────── Auth helper ───────────────────────── */

async function requireUserId() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Please sign in to use the Notebook.");
  }
  return data.user.id;
}

/* ───────────────────── Travel notes CRUD ──────────────────────── */

export async function listNotes(): Promise<TravelNote[]> {
  const supabase = createClient();
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("travel_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(msg(error));
  return (data || []) as TravelNote[];
}

/**
 * List both Travel & Research notes from the unified view.
 * The view enforces RLS via underlying tables; we still ensure the user is signed in.
 */
export async function listAllNotes(): Promise<UnifiedNoteListItem[]> {
  const supabase = createClient();
  await requireUserId();

  const { data, error } = await supabase
    .from("v_user_notes_all")
    .select(
      `
      id,
      kind,
      title,
      summary,
      created_at,
      updated_at,
      site_id,
      site_slug,
      site_title,
      section_id,
      section_title
      `
    )
    .order("updated_at", { ascending: false });

  if (error) throw new Error(msg(error));
  return (data ?? []) as UnifiedNoteListItem[];
}

export async function createNote(type: NoteType): Promise<TravelNote> {
  const supabase = createClient();
  const userId = await requireUserId();

  const title = type === "note" ? "New Note" : "New To-Do";

  const baseDoc = {
    type: "doc",
    content: [{ type: "paragraph" }],
  };

  const { data, error } = await supabase
    .from("travel_notes")
    .insert({
      user_id: userId,
      title,
      type,
      content: baseDoc,
      content_text: "",
    })
    .select("*")
    .single();

  if (error) throw new Error(msg(error));
  return data as TravelNote;
}

export async function getNote(id: string): Promise<TravelNote | null> {
  const supabase = createClient();
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("travel_notes")
    .select("*")
    .match({ id, user_id: userId })
    .maybeSingle();

  if (error) throw new Error(msg(error));
  return data as TravelNote | null;
}

export async function updateNote(
  partial: Partial<TravelNote> & { id: string }
) {
  const supabase = createClient();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("travel_notes")
    .update({ ...partial, updated_at: new Date().toISOString() })
    .match({ id: partial.id, user_id: userId });

  if (error) throw new Error(msg(error));
}

export async function deleteNote(id: string) {
  const supabase = createClient();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("travel_notes")
    .delete()
    .match({ id, user_id: userId });

  if (error) throw new Error(msg(error));
}

/* ─────────────────── Research notes helpers ───────────────────── */

/**
 * Save a selected quote (with light context) from a heritage article section.
 * Inserts, then (if we can) updates the note URL to a deep link of the form:
 *   /heritage/:slug?note=:id
 */
export async function saveResearchNote(
  input: ResearchNoteInsert
): Promise<ResearchNote> {
  const supabase = createClient();
  const userId = await requireUserId();

  // 1) Insert the note and return the row (including generated id)
  const { data, error } = await supabase
    .from("research_notes")
    .insert({
      user_id: userId,
      site_id: input.site_id,
      site_slug: input.site_slug,
      site_title: input.site_title,
      section_id: input.section_id,
      section_title: input.section_title,
      quote_text: input.quote_text,
      context_before: input.context_before ?? null,
      context_after: input.context_after ?? null,
    })
    .select(
      `
      id,
      user_id,
      site_id,
      site_slug,
      site_title,
      section_id,
      section_title,
      quote_text,
      context_before,
      context_after,
      url,
      created_at,
      updated_at
    `
    )
    .single();

  if (error) throw new Error(msg(error, "Insert failed"));

  // 2) Best-effort set the deep-link URL using window.location.origin
  let updated = data as ResearchNote;
  try {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    if (origin && updated?.id) {
      const url = `${origin}/heritage/${input.site_slug}?note=${updated.id}`;
      if (updated.url !== url) {
        const { error: upErr } = await supabase
          .from("research_notes")
          .update({ url })
          .match({ id: updated.id, user_id: userId });
        if (!upErr) updated = { ...updated, url };
      }
    }
  } catch {
    // non-fatal; leave url as-is if we can't set it
  }

  return updated;
}

/** Get one research note (optional helper) */
export async function getResearchNote(
  id: string
): Promise<ResearchNote | null> {
  const supabase = createClient();
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("research_notes")
    .select(
      `
      id,
      user_id,
      site_id,
      site_slug,
      site_title,
      section_id,
      section_title,
      quote_text,
      context_before,
      context_after,
      url,
      created_at,
      updated_at
    `
    )
    .match({ id, user_id: userId })
    .maybeSingle();

  if (error) throw new Error(msg(error));
  return (data ?? null) as ResearchNote | null;
}

export async function deleteResearchNote(id: string) {
  const supabase = createClient();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("research_notes")
    .delete()
    .match({ id, user_id: userId });

  if (error) throw new Error(msg(error));
}
