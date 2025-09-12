"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CitationWizard from "@/components/biblio/CitationWizard";

/* ------------------------------------------------------------------ */
/* Small UI bits                                                       */
/* ------------------------------------------------------------------ */
function Btn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-emerald-500 disabled:opacity-50 ${
        props.className ??
        "bg-slate-200 text-slate-800 hover:bg-slate-300 border border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold mb-1.5 text-slate-800">{label}</div>
      {children}
      {hint ? <div className="text-xs text-slate-500 mt-1">{hint}</div> : null}
    </label>
  );
}
const inputStyles =
  "w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 focus:ring-emerald-500 focus:border-emerald-500";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type Person = {
  role: "author" | "editor" | "translator";
  kind: "person" | "org";
  given?: string;
  family?: string;
  literal?: string;
};
type BiblioRow = {
  id: string;
  title: string;
  type: string | null;
  container_title: string | null;
  publisher: string | null;
  year_int: number | null;
  doi: string | null;
  isbn: string | null;
  issn: string | null;
  url: string | null;
  notes: string | null;
  csl: any | null;
};
type AttachRow = {
  listing_id: string;
  biblio_id: string;
  sort_order: number | null;
};

/* ------------------------------------------------------------------ */
/* Helper: CSL build + author formatting                               */
/* ------------------------------------------------------------------ */
const TYPES = [
  "book",
  "chapter",
  "article-journal",
  "paper-conference",
  "thesis",
  "report",
  "webpage",
  "article-magazine",
  "dataset",
] as const;

function buildCSL(payload: {
  id?: string;
  type: string;
  title: string;
  authors: Person[];
  editors: Person[];
  translators: Person[];
  container_title?: string | null;
  publisher?: string | null;
  year_int?: number | null;
  doi?: string | null;
  isbn?: string | null;
  issn?: string | null;
  url?: string | null;
}) {
  const toName = (p: Person) =>
    p.kind === "person"
      ? { given: p.given || undefined, family: p.family || undefined }
      : { literal: p.literal || undefined };

  const csl: any = {
    id: payload.id,
    type: payload.type,
    title: payload.title,
  };
  const author = payload.authors.map(toName);
  const editor = payload.editors.map(toName);
  const translator = payload.translators.map(toName);

  if (author.length) csl.author = author;
  if (editor.length) csl.editor = editor;
  if (translator.length) csl.translator = translator;
  if (payload.container_title) csl["container-title"] = payload.container_title;
  if (payload.publisher) csl.publisher = payload.publisher;
  if (payload.url) csl.URL = payload.url;
  if (payload.doi) csl.DOI = payload.doi;
  if (payload.isbn) csl.ISBN = payload.isbn;
  if (payload.issn) csl.ISSN = payload.issn;
  if (payload.year_int) csl.issued = { "date-parts": [[payload.year_int]] };
  return csl;
}
function authorsToInline(csl: any, max = 3) {
  const arr: any[] = Array.isArray(csl?.author) ? csl.author : [];
  if (!arr.length) return "";
  const names = arr.map((a) =>
    a.family || a.given
      ? [a.family, a.given].filter(Boolean).join(", ")
      : a.literal || ""
  );
  const clipped = names.slice(0, max);
  const suffix = names.length > max ? " et al." : "";
  return clipped.filter(Boolean).join("; ") + suffix;
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */
type ToastT = { id: number; msg: string; tone: "success" | "error" | "info" };
function useToasts() {
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const notify = (msg: string, tone: ToastT["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };
  return {
    toasts,
    notify,
    dismiss: (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
  };
}
function Toasts({
  toasts,
  dismiss,
}: {
  toasts: ToastT[];
  dismiss: (id: number) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-[60] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`min-w-[240px] max-w-[420px] rounded-xl px-4 py-3 text-sm shadow-md border ${
            t.tone === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : t.tone === "error"
              ? "bg-red-50 border-red-200 text-red-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">{t.msg}</div>
            <button
              className="text-xs opacity-60 hover:opacity-90"
              onClick={() => dismiss(t.id)}
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Authors editor (for "Add New Source" modal)                         */
/* ------------------------------------------------------------------ */
function AuthorsEditor({
  value,
  onChange,
  role,
}: {
  value: Person[];
  onChange: (v: Person[]) => void;
  role: Person["role"];
}) {
  const list = value.filter((p) => p.role === role);

  const update = (idx: number, patch: Partial<Person>) => {
    const indices = value
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.role === role)
      .map((x) => x.i);
    const globalIndex = indices[idx];
    if (globalIndex == null) return;
    const next = value.slice();
    next[globalIndex] = { ...next[globalIndex], ...patch };
    onChange(next);
  };

  const add = (kind: "person" | "org") =>
    onChange([...value, { role, kind, given: "", family: "", literal: "" }]);

  const remove = (idx: number) => {
    const indices = value
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.role === role)
      .map((x) => x.i);
    const globalIndex = indices[idx];
    onChange(value.filter((_, i) => i !== globalIndex));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const indices = value
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.role === role)
      .map((x) => x.i);
    const currentGlobal = indices[idx];
    const swapGlobal = indices[idx + dir];
    if (currentGlobal == null || swapGlobal == null) return;
    const next = value.slice();
    const tmp = next[currentGlobal];
    next[currentGlobal] = next[swapGlobal];
    next[swapGlobal] = tmp;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <div className="text-xs text-slate-500">No {role}s yet.</div>
      ) : null}
      {list.map((p, idx) => (
        <div
          key={idx}
          className="border border-slate-200 rounded-xl p-3 bg-white"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-700">
              {role} #{idx + 1}
            </div>
            <div className="flex gap-2">
              <Btn onClick={() => move(idx, -1)} disabled={idx === 0}>
                ↑
              </Btn>
              <Btn
                onClick={() => move(idx, +1)}
                disabled={idx === list.length - 1}
              >
                ↓
              </Btn>
              <Btn
                className="bg-red-50 text-red-700 border border-red-200"
                onClick={() => remove(idx)}
              >
                Remove
              </Btn>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={p.kind === "person"}
                onChange={() => update(idx, { kind: "person", literal: "" })}
              />
              Person
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={p.kind === "org"}
                onChange={() =>
                  update(idx, { kind: "org", given: "", family: "" })
                }
              />
              Organization
            </label>
          </div>

          {p.kind === "person" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Given (first)">
                <input
                  className={inputStyles}
                  value={p.given ?? ""}
                  onChange={(e) => update(idx, { given: e.target.value })}
                  placeholder="Ayesha"
                />
              </Field>
              <Field label="Family (last)">
                <input
                  className={inputStyles}
                  value={p.family ?? ""}
                  onChange={(e) => update(idx, { family: e.target.value })}
                  placeholder="Malik"
                />
              </Field>
            </div>
          ) : (
            <Field label="Organization">
              <input
                className={inputStyles}
                value={p.literal ?? ""}
                onChange={(e) => update(idx, { literal: e.target.value })}
                placeholder="UNESCO World Heritage Centre"
              />
            </Field>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <Btn
          onClick={() => add("person")}
          className="bg-emerald-50 text-emerald-700 border border-emerald-200"
        >
          Add {role} (Person)
        </Btn>
        <Btn
          onClick={() => add("org")}
          className="bg-emerald-50 text-emerald-700 border border-emerald-200"
        >
          Add {role} (Organization)
        </Btn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */
function AttachedRowSkeleton() {
  return (
    <div className="flex items-start justify-between gap-3 border border-slate-200 rounded-md bg-white px-3 py-2 animate-pulse">
      <div className="flex items-start gap-3 min-w-0 w-full">
        <div className="w-6 text-right font-semibold text-slate-300">
          &nbsp;
        </div>
        <div className="min-w-0 w-full">
          <div className="h-4 w-3/4 bg-slate-200 rounded mb-1" />
          <div className="h-3 w-2/3 bg-slate-200 rounded mb-1" />
          <div className="h-3 w-1/3 bg-slate-200 rounded" />
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <div className="h-7 w-7 bg-slate-200 rounded" />
        <div className="h-7 w-7 bg-slate-200 rounded" />
        <div className="h-7 w-16 bg-slate-200 rounded" />
      </div>
    </div>
  );
}

function SearchSkeletonRow() {
  return (
    <div className="p-3">
      <div className="h-4 w-3/4 bg-slate-200 rounded mb-1 animate-pulse" />
      <div className="h-3 w-2/3 bg-slate-200 rounded mb-1 animate-pulse" />
      <div className="h-3 w-1/3 bg-slate-200 rounded animate-pulse" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */
export default function Bibliography({ siteId }: { siteId: string | number }) {
  const listingId = String(siteId);
  const { toasts, notify, dismiss } = useToasts();

  // Attached items (from join table) displayed with details from central table
  const [attached, setAttached] = useState<
    (BiblioRow & { sort_order: number })[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Search typeahead
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BiblioRow[]>([]);
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set()); // for quick “Added” badge

  // New Source modal
  const [newOpen, setNewOpen] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    type: string;
    container_title?: string | null;
    publisher?: string | null;
    year_int?: number | null;
    doi?: string | null;
    isbn?: string | null;
    issn?: string | null;
    url?: string | null;
    notes?: string | null;
    people: Person[];
  }>({
    title: "",
    type: "book",
    container_title: "",
    publisher: "",
    year_int: undefined,
    doi: "",
    isbn: "",
    issn: "",
    url: "",
    notes: "",
    people: [],
  });

  // Citation Wizard (listing mode)
  const [wizardOpen, setWizardOpen] = useState(false);

  /* --------------------------- Data loaders --------------------------- */
  async function loadAttached() {
    setLoading(true);
    // 1) read join rows for this listing
    const { data: links, error: e1 } = await supabase
      .from("listing_bibliography")
      .select("biblio_id, sort_order")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true });

    if (e1) {
      notify("Failed to load bibliography.", "error");
      setLoading(false);
      return;
    }
    const ids = (links ?? []).map((r: any) => r.biblio_id);
    if (ids.length === 0) {
      setAttached([]);
      setLoading(false);
      return;
    }

    // 2) fetch bibliography rows by IDs
    const { data: bibs, error: e2 } = await supabase
      .from("bibliography_sources")
      .select(
        "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,notes,csl"
      )
      .in("id", ids);

    if (e2) {
      notify("Failed to load sources.", "error");
      setLoading(false);
      return;
    }

    // merge sort_order & sort
    const orderMap = new Map<string, number>();
    (links as AttachRow[])?.forEach((l) =>
      orderMap.set(l.biblio_id, l.sort_order ?? 0)
    );
    const merged = (bibs as BiblioRow[]).map((b) => ({
      ...b,
      sort_order: orderMap.get(b.id) ?? 0,
    }));
    merged.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    setAttached(merged);
    setLoading(false);
  }

  useEffect(() => {
    loadAttached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  /* ------------------------------ Search ----------------------------- */
  async function searchLibrary(query: string) {
    // Stage 1: full-text on search_tsv
    let r1 = await supabase
      .from("bibliography_sources")
      .select(
        "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,notes,csl"
      )
      .textSearch("search_tsv", query, { type: "websearch" })
      .order("updated_at", { ascending: false })
      .limit(20);

    if (!r1.error && (r1.data?.length ?? 0) > 0) {
      return r1.data as BiblioRow[];
    }

    // Stage 2: ILIKE fallback
    const r2 = await supabase
      .from("bibliography_sources")
      .select(
        "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,notes,csl"
      )
      .or(
        `title.ilike.%${query}%,container_title.ilike.%${query}%,publisher.ilike.%${query}%,doi.ilike.%${query}%,url.ilike.%${query}%,isbn.ilike.%${query}%,issn.ilike.%${query}%`
      )
      .order("updated_at", { ascending: false })
      .limit(20);

    if (r2.error) throw r2.error;
    return (r2.data as BiblioRow[]) ?? [];
  }

  // Debounced typeahead
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        setOpenDropdown(false);
        return;
      }
      try {
        setSearching(true);
        const rows = await searchLibrary(q.trim());
        setResults(rows);
        setOpenDropdown(true);
      } catch {
        setResults([]);
        setOpenDropdown(false);
        notify("Search failed.", "error");
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node))
        setOpenDropdown(false);
    }
    if (openDropdown) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openDropdown]);

  /* ------------------------- Attach / Detach ------------------------- */
  async function attachOne(biblioId: string) {
    const start = attached.length;
    const { error } = await supabase
      .from("listing_bibliography")
      .upsert(
        [{ listing_id: listingId, biblio_id: biblioId, sort_order: start }],
        { onConflict: "listing_id,biblio_id" }
      );
    if (error) {
      notify("Failed to attach source.", "error");
      return;
    }
    notify("Source attached.", "success");
    setJustAdded((s) => new Set(s).add(biblioId));
    await loadAttached();
  }

  async function detach(biblioId: string) {
    const { error } = await supabase
      .from("listing_bibliography")
      .delete()
      .match({ listing_id: listingId, biblio_id: biblioId });
    if (error) {
      notify("Failed to remove.", "error");
      return;
    }
    notify("Source removed.", "success");
    await loadAttached();
  }

  async function move(biblioId: string, dir: -1 | 1) {
    const idx = attached.findIndex((r) => r.id === biblioId);
    const swap = attached[idx + dir];
    if (!swap) return;
    const a = attached[idx];
    const b = swap;
    await supabase
      .from("listing_bibliography")
      .update({ sort_order: b.sort_order })
      .match({ listing_id: listingId, biblio_id: a.id });
    await supabase
      .from("listing_bibliography")
      .update({ sort_order: a.sort_order })
      .match({ listing_id: listingId, biblio_id: b.id });
    await loadAttached();
  }

  /* ------------------------- Add New Source -------------------------- */
  function resetNewForm() {
    setForm({
      title: "",
      type: "book",
      container_title: "",
      publisher: "",
      year_int: undefined,
      doi: "",
      isbn: "",
      issn: "",
      url: "",
      notes: "",
      people: [],
    });
  }

  async function saveNewSource() {
    if (!form.title.trim()) {
      notify("Title is required.", "error");
      return;
    }
    setSavingNew(true);

    const authors = form.people.filter((p) => p.role === "author");
    const editors = form.people.filter((p) => p.role === "editor");
    const translators = form.people.filter((p) => p.role === "translator");

    const csl = buildCSL({
      type: form.type,
      title: form.title,
      authors,
      editors,
      translators,
      container_title: form.container_title || undefined,
      publisher: form.publisher || undefined,
      year_int: form.year_int || undefined,
      doi: form.doi || undefined,
      isbn: form.isbn || undefined,
      issn: form.issn || undefined,
      url: form.url || undefined,
    });

    const payload = {
      title: form.title,
      type: form.type,
      container_title: form.container_title || null,
      publisher: form.publisher || null,
      year_int: form.year_int ?? null,
      doi: form.doi?.trim() ? form.doi.trim() : null,
      isbn: form.isbn?.trim() ? form.isbn.trim() : null,
      issn: form.issn?.trim() ? form.issn.trim() : null,
      url: form.url?.trim() ? form.url.trim() : null,
      notes: form.notes || null,
      csl,
    };

    const { data, error } = await supabase
      .from("bibliography_sources")
      .insert(payload)
      .select("id")
      .single();

    setSavingNew(false);

    if (error) {
      notify(`Save failed: ${error.message}`, "error");
      return;
    }
    const newId = (data as any).id as string;
    notify("Source created.", "success");

    const ok =
      typeof window !== "undefined"
        ? window.confirm("Add to the current listing?")
        : false;
    if (ok) {
      const { error: e2 } = await supabase.from("listing_bibliography").upsert(
        [
          {
            listing_id: listingId,
            biblio_id: newId,
            sort_order: attached.length,
          },
        ],
        { onConflict: "listing_id,biblio_id" }
      );
      if (e2) {
        notify("Failed to attach new source.", "error");
      } else {
        notify("Source attached.", "success");
        await loadAttached();
      }
    }
    setNewOpen(false);
    resetNewForm();
  }

  /* -------------------------------- UI -------------------------------- */

  const attachedIds = new Set(attached.map((a) => a.id));

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80">
      <Toasts toasts={toasts} dismiss={dismiss} />

      {/* Header + search */}
      <div className="border-b border-slate-200 p-4 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-t-xl">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div className="text-lg font-bold text-slate-800">Bibliography</div>
          <div className="flex-1" />
          <div className="relative" ref={dropdownRef}>
            <div className="flex items-center gap-2">
              <input
                className={inputStyles}
                style={{ width: 360 }}
                placeholder="Search library (title, author, DOI, URL)…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => q.trim() && setOpenDropdown(true)}
              />
              <Btn
                onClick={() => {
                  if (!q.trim()) return;
                  searchLibrary(q.trim()).then((rows) => {
                    setResults(rows);
                    setOpenDropdown(true);
                  });
                }}
                disabled={searching}
              >
                {searching ? "Searching…" : "Search"}
              </Btn>
              <Btn
                onClick={() => {
                  setResults([]);
                  setQ("");
                  setOpenDropdown(false);
                }}
              >
                Clear
              </Btn>
              <Btn
                className="bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={() => setWizardOpen(true)}
              >
                Citation Wizard
              </Btn>
              <Btn
                className="bg-emerald-600/90 text-white hover:bg-emerald-500"
                onClick={() => setNewOpen(true)}
              >
                Add New Source
              </Btn>
            </div>

            {/* Typeahead dropdown (click = attach) */}
            {openDropdown && (results.length > 0 || searching) && (
              <div className="absolute z-40 mt-2 w-[640px] max-w-[85vw] rounded-lg border border-slate-200 bg-white shadow-xl">
                <div className="p-2 text-xs text-slate-600 border-b flex items-center justify-between">
                  <span>Search Results</span>
                  <span className="text-slate-400">
                    {searching ? "Searching…" : `${results.length} found`}
                  </span>
                </div>

                <div className="max-h-[320px] overflow-auto divide-y">
                  {searching && results.length === 0 ? (
                    <>
                      <SearchSkeletonRow />
                      <SearchSkeletonRow />
                      <SearchSkeletonRow />
                      <SearchSkeletonRow />
                    </>
                  ) : (
                    results.map((r) => {
                      const isAlready =
                        attachedIds.has(r.id) || justAdded.has(r.id);
                      return (
                        <button
                          key={r.id}
                          className={`w-full text-left p-3 hover:bg-emerald-50/60 ${
                            isAlready
                              ? "opacity-60 cursor-not-allowed"
                              : "cursor-pointer"
                          }`}
                          onClick={() => !isAlready && attachOne(r.id)}
                          disabled={isAlready}
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate">
                                {r.title}
                              </div>
                              <div className="text-xs text-slate-600 truncate">
                                {authorsToInline(r.csl, 3) || "—"} • {r.type} •{" "}
                                {[r.container_title, r.publisher, r.year_int]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {r.doi || r.url || r.isbn || r.issn || ""}
                              </div>
                            </div>
                            {isAlready ? (
                              <span className="ml-auto text-[11px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
                                Added
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                  {!searching && results.length === 0 && (
                    <div className="p-3 text-sm text-slate-600">
                      No results.
                    </div>
                  )}
                </div>

                <div className="p-2 flex items-center justify-end">
                  <Btn onClick={() => setOpenDropdown(false)}>Close</Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Attached list (lean rows) */}
      <div className="p-3 space-y-2">
        {loading ? (
          <>
            <AttachedRowSkeleton />
            <AttachedRowSkeleton />
            <AttachedRowSkeleton />
          </>
        ) : attached.length === 0 ? (
          <div className="text-sm text-slate-500">No sources linked yet.</div>
        ) : (
          attached.map((s, i) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-3 border border-slate-200 rounded-md bg-white px-3 py-2"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-6 text-right font-semibold text-slate-700">
                  {i + 1}.
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {s.title}
                  </div>
                  <div className="text-xs text-slate-600 truncate">
                    {authorsToInline(s.csl, 4) || "—"} •{" "}
                    {[s.type, s.container_title, s.publisher, s.year_int]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                  <div className="text-[11px] text-slate-500 break-all">
                    {s.doi ? `https://doi.org/${s.doi}` : s.url || ""}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Btn className="px-2 py-1" onClick={() => move(s.id, -1)}>
                  ↑
                </Btn>
                <Btn className="px-2 py-1" onClick={() => move(s.id, 1)}>
                  ↓
                </Btn>
                <Btn
                  className="px-2 py-1 bg-red-600 text-white hover:bg-red-500"
                  onClick={() => detach(s.id)}
                >
                  Remove
                </Btn>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Source Modal */}
      {newOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setNewOpen(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
                <div className="font-semibold text-slate-800">
                  Add New Source
                </div>
                <button
                  className="text-slate-600 hover:text-slate-800"
                  onClick={() => setNewOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[80vh] overflow-auto">
                <div className="lg:col-span-2 space-y-4">
                  <div className="border border-slate-200 rounded-xl p-4 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Title">
                        <input
                          className={inputStyles}
                          value={form.title}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, title: e.target.value }))
                          }
                          placeholder="The Forts of Sindh"
                        />
                      </Field>
                      <Field label="Type">
                        <select
                          className={inputStyles}
                          value={form.type}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, type: e.target.value }))
                          }
                        >
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Container (Journal / Book / Site)">
                        <input
                          className={inputStyles}
                          value={form.container_title ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              container_title: e.target.value,
                            }))
                          }
                          placeholder="Journal of South Asian Studies"
                        />
                      </Field>
                      <Field label="Publisher / Institution">
                        <input
                          className={inputStyles}
                          value={form.publisher ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              publisher: e.target.value,
                            }))
                          }
                          placeholder="Oxford University Press"
                        />
                      </Field>

                      <Field label="Year">
                        <input
                          className={inputStyles}
                          value={form.year_int ? String(form.year_int) : ""}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              year_int: e.target.value
                                ? Number(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 4)
                                  )
                                : undefined,
                            }))
                          }
                          placeholder="2022"
                        />
                      </Field>
                      <Field label="DOI">
                        <input
                          className={inputStyles}
                          value={form.doi ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              doi: e.target.value.trim(),
                            }))
                          }
                          placeholder="10.1234/abcd.5678"
                        />
                      </Field>

                      <Field label="ISBN">
                        <input
                          className={inputStyles}
                          value={form.isbn ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              isbn: e.target.value.trim(),
                            }))
                          }
                          placeholder="978-0-123456-47-2"
                        />
                      </Field>
                      <Field label="ISSN">
                        <input
                          className={inputStyles}
                          value={form.issn ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              issn: e.target.value.trim(),
                            }))
                          }
                          placeholder="1234-5678"
                        />
                      </Field>

                      <Field label="URL">
                        <input
                          className={inputStyles}
                          value={form.url ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              url: e.target.value.trim(),
                            }))
                          }
                          placeholder="https://example.com/article"
                        />
                      </Field>
                      <Field label="Admin notes">
                        <textarea
                          className={inputStyles}
                          rows={3}
                          value={form.notes ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, notes: e.target.value }))
                          }
                          placeholder="Internal note about this source."
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4 bg-white">
                    <div className="text-sm font-semibold mb-3">Authors</div>
                    <AuthorsEditor
                      value={form.people}
                      onChange={(people) => setForm((s) => ({ ...s, people }))}
                      role="author"
                    />
                  </div>
                  <div className="border border-slate-200 rounded-xl p-4 bg-white">
                    <div className="text-sm font-semibold mb-3">Editors</div>
                    <AuthorsEditor
                      value={form.people}
                      onChange={(people) => setForm((s) => ({ ...s, people }))}
                      role="editor"
                    />
                  </div>
                  <div className="border border-slate-200 rounded-xl p-4 bg-white">
                    <div className="text-sm font-semibold mb-3">
                      Translators
                    </div>
                    <AuthorsEditor
                      value={form.people}
                      onChange={(people) => setForm((s) => ({ ...s, people }))}
                      role="translator"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Btn
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                      onClick={saveNewSource}
                      disabled={savingNew}
                    >
                      {savingNew ? "Saving…" : "Save Source"}
                    </Btn>
                    <Btn onClick={() => setNewOpen(false)}>Cancel</Btn>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="border border-slate-200 rounded-xl p-4 bg-white">
                    <div className="text-sm font-semibold mb-2">
                      Quick Preview
                    </div>
                    <div className="text-sm text-slate-700">
                      <PreviewFromForm form={form} />
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      Styling is approximate; the site renderer will use CSL.
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4 bg-white">
                    <div className="text-sm font-semibold mb-2">
                      CSL JSON (computed)
                    </div>
                    <pre className="text-xs bg-slate-50 p-3 rounded-md overflow-auto max-h-[360px]">
                      {JSON.stringify(
                        buildCSL({
                          type: form.type,
                          title: form.title,
                          authors: form.people.filter(
                            (p) => p.role === "author"
                          ),
                          editors: form.people.filter(
                            (p) => p.role === "editor"
                          ),
                          translators: form.people.filter(
                            (p) => p.role === "translator"
                          ),
                          container_title: form.container_title || undefined,
                          publisher: form.publisher || undefined,
                          year_int: form.year_int || undefined,
                          doi: form.doi || undefined,
                          isbn: form.isbn || undefined,
                          issn: form.issn || undefined,
                          url: form.url || undefined,
                        }),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 bg-slate-50 border-t text-right">
                <a
                  href="/admin/bibliography"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-emerald-700 hover:text-emerald-900"
                >
                  Open full Bibliography Manager in new tab
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Citation Wizard (listing mode) */}
      <CitationWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        listingId={listingId}
        onAttached={loadAttached}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lightweight preview (APA-ish)                                       */
/* ------------------------------------------------------------------ */
function PreviewFromForm({
  form,
}: {
  form: {
    title: string;
    type: string;
    container_title?: string | null;
    publisher?: string | null;
    year_int?: number | null;
    doi?: string | null;
    url?: string | null;
    people: Person[];
  };
}) {
  const authors = form.people.filter((p) => p.role === "author");
  const editors = form.people.filter((p) => p.role === "editor");

  const authorStr =
    authors.length === 0
      ? ""
      : authors
          .map((a) =>
            a.kind === "person"
              ? [a.family, a.given].filter(Boolean).join(", ")
              : a.literal || ""
          )
          .filter(Boolean)
          .join("; ");

  const editorStr =
    editors.length === 0
      ? ""
      : " (Ed. " +
        editors
          .map((a) =>
            a.kind === "person"
              ? [a.family, a.given].filter(Boolean).join(", ")
              : a.literal || ""
          )
          .filter(Boolean)
          .join("; ") +
        ")";

  const year = form.year_int ? ` (${form.year_int}).` : "";
  const cont = form.container_title ? ` ${form.container_title}.` : "";
  const publ = form.publisher ? ` ${form.publisher}.` : "";
  const idents = [
    form.doi ? ` https://doi.org/${form.doi}` : "",
    form.url ? ` ${form.url}` : "",
  ]
    .join("")
    .trim();

  return (
    <div className="text-slate-800">
      {authorStr ? authorStr + "." : ""}
      {year} <i>{form.title}</i>
      {editorStr}.{cont}
      {publ}
      {idents ? <span className="break-all">{idents}</span> : null}
    </div>
  );
}
