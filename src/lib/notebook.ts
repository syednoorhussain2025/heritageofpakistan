// src/lib/notebook.ts
"use client";

import { createClient } from "@/lib/supabase/browser";

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

async function requireUserId() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Please sign in to use the Notebook.");
  }
  return data.user.id;
}

export async function listNotes(): Promise<TravelNote[]> {
  const supabase = createClient();
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("travel_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []) as TravelNote[];
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
      title: title,
      type,
      content: baseDoc,
      content_text: "",
    })
    .select("*")
    .single();

  if (error) throw error;
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
  if (error) throw error;
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
  if (error) throw error;
}

export async function deleteNote(id: string) {
  const supabase = createClient();
  const userId = await requireUserId();
  const { error } = await supabase
    .from("travel_notes")
    .delete()
    .match({ id, user_id: userId });
  if (error) throw error;
}
