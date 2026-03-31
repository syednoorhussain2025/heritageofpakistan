// src/lib/writer.ts
"use client";

import { createClient } from "@/lib/supabase/browser";

function msg(error: any, fallback = "Operation failed") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  try { return JSON.stringify(error); } catch { return fallback; }
}

async function requireUserId() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated.");
  return data.user.id;
}

export type WriterDocument = {
  id: string;
  user_id: string;
  title: string;
  content: any; // Tiptap JSON
  word_count: number;
  created_at: string;
  updated_at: string;
};

export async function listDocuments(): Promise<WriterDocument[]> {
  const supabase = createClient();
  await requireUserId();

  const { data, error } = await supabase
    .from("writer_documents")
    .select("id, user_id, title, word_count, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(msg(error));
  return (data || []) as WriterDocument[];
}

export async function createDocument(): Promise<WriterDocument> {
  const supabase = createClient();
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("writer_documents")
    .insert({
      user_id: userId,
      title: "Untitled Document",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      word_count: 0,
    })
    .select("*")
    .single();

  if (error) throw new Error(msg(error));
  return data as WriterDocument;
}

export async function getDocument(id: string): Promise<WriterDocument | null> {
  const supabase = createClient();
  await requireUserId();

  const { data, error } = await supabase
    .from("writer_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(msg(error));
  return data as WriterDocument | null;
}

export async function updateDocument(
  partial: Partial<WriterDocument> & { id: string }
) {
  const supabase = createClient();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("writer_documents")
    .update({ ...partial, updated_at: new Date().toISOString() })
    .match({ id: partial.id, user_id: userId });

  if (error) throw new Error(msg(error));
}

export async function deleteDocument(id: string) {
  const supabase = createClient();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("writer_documents")
    .delete()
    .match({ id, user_id: userId });

  if (error) throw new Error(msg(error));
}
