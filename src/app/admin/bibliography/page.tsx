// src/app/admin/bibliography/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabaseClient";
import CitationWizard from "@/components/biblio/CitationWizard";

/* ----------------------------- Helpers ----------------------------- */

function toTitleCase(str: string): string {
  if (!str) return "";
  const minorWords = new Set([
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "for",
    "nor",
    "on",
    "at",
    "to",
    "from",
    "by",
    "of",
    "in",
    "with",
  ]);

  return str
    .split(" ")
    .map((word, index) => {
      if (word === "") return "";

      if (word.length > 1 && word === word.toUpperCase()) {
        return word; // Preserve acronyms
      }

      const lowerWord = word.toLowerCase();
      if (index > 0 && minorWords.has(lowerWord)) {
        return lowerWord;
      }
      return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
    })
    .join(" ");
}

function toNameCase(str: string): string {
  if (!str) return "";
  return str
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

/* ----------------------------- Types ----------------------------- */

type Person = {
  role: "author" | "editor" | "translator";
  kind: "person" | "org";
  given?: string;
  family?: string;
  literal?: string; // org name
};

type Row = {
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
  created_at: string | null;
  updated_at: string | null;
};

type SiteRow = {
  id: string;
  title: string;
  slug: string | null;
};

type CSLName = { given?: string; family?: string; literal?: string };
type CSL = {
  id?: string;
  type?: string;
  title?: string;
  author?: CSLName[];
  editor?: CSLName[];
  translator?: CSLName[];
  ["container-title"]?: string;
  publisher?: string;
  issued?: { "date-parts": number[][] };
  DOI?: string;
  ISBN?: string | string[];
  ISSN?: string | string[];
  URL?: string;
};
type Candidate = { csl: CSL; score: number; source: string };

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

/* --------------------------- Small UI bits --------------------------- */

function Btn({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition border bg-white hover:shadow-sm active:scale-[0.99] disabled:opacity-50 ${
        className ?? ""
      }`}
    />
  );
}

function IconBtn({
  title,
  onClick,
  children,
  className,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`inline-flex items-center justify-center h-7 w-7 rounded-md border bg-white hover:shadow-sm active:scale-[0.98] ${
        className ?? ""
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
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <div className="text-xs font-semibold text-slate-800 mb-1.5">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </div>
      {children}
      {hint ? <div className="text-xs text-slate-500 mt-1">{hint}</div> : null}
    </label>
  );
}

const inputStyle =
  "w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";

/* ------------------------------ Toasts ------------------------------ */

type ToastT = { id: number; msg: string; tone: "success" | "error" | "info" };
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
          className={`min-w-[240px] max-w-[420px] rounded-xl px-4 py-3 text-xs shadow-md border ${
            t.tone === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : t.tone === "error"
              ? "bg-red-50 border-red-200 text-red-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5">
              <Icon
                name={
                  t.tone === "success"
                    ? "check"
                    : t.tone === "error"
                    ? "x"
                    : "info"
                }
                size={15}
              />
            </span>
            <div className="flex-1 min-w-0 break-words">{t.msg}</div>
            <button
              className="text-[11px] opacity-60 hover:opacity-90"
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

/* ------------------------- CSL build / helpers ------------------------- */

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
  const author = payload.authors.map((p) =>
    p.kind === "person"
      ? { given: p.given || undefined, family: p.family || undefined }
      : { literal: p.literal || undefined }
  );
  const editor = payload.editors.map((p) =>
    p.kind === "person"
      ? { given: p.given || undefined, family: p.family || undefined }
      : { literal: p.literal || undefined }
  );
  const translator = payload.translators.map((p) =>
    p.kind === "person"
      ? { given: p.given || undefined, family: p.family || undefined }
      : { literal: p.literal || undefined }
  );

  const csl: any = {
    id: payload.id,
    type: payload.type,
    title: payload.title,
  };

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
  const names = arr.map((a) => {
    if (a.family || a.given) {
      return [a.family, a.given].filter(Boolean).join(", ");
    }
    return a.literal || "";
  });
  const clipped = names.slice(0, max);
  const suffix = names.length > max ? " et al." : "";
  return clipped.filter(Boolean).join("; ") + suffix;
}

/* --------------------------- Person Editor --------------------------- */

type PersonEditorProps = {
  value: Person[];
  onChange: (v: Person[]) => void;
  role: Person["role"];
};

function AuthorsEditor({ value, onChange, role }: PersonEditorProps) {
  const list = value.filter((p) => p.role === role);

  const indicesForRole = () =>
    value
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.role === role)
      .map((x) => x.i);

  const update = (idx: number, patch: Partial<Person>) => {
    const indices = indicesForRole();
    const globalIndex = indices[idx];
    if (globalIndex == null) return;
    const next = value.slice();
    next[globalIndex] = { ...next[globalIndex], ...patch };
    onChange(next);
  };

  const add = (kind: "person" | "org") =>
    onChange([...value, { role, kind, given: "", family: "", literal: "" }]);

  const remove = (idx: number) => {
    const indices = indicesForRole();
    const globalIndex = indices[idx];
    onChange(value.filter((_, i) => i !== globalIndex));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const indices = indicesForRole();
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
              <Btn
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="border-slate-300"
              >
                ↑
              </Btn>
              <Btn
                onClick={() => move(idx, +1)}
                disabled={idx === list.length - 1}
                className="border-slate-300"
              >
                ↓
              </Btn>
              <Btn
                className="border-red-300 text-red-600"
                onClick={() => remove(idx)}
                title="Remove"
              >
                Remove
              </Btn>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                checked={p.kind === "person"}
                onChange={() => update(idx, { kind: "person", literal: "" })}
              />
              Person
            </label>
            <label className="flex items-center gap-2 text-xs">
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
                  className={inputStyle}
                  value={p.given ?? ""}
                  onChange={(e) =>
                    update(idx, { given: toNameCase(e.target.value) })
                  }
                  placeholder="Ayesha"
                />
              </Field>
              <Field label="Family (last)">
                <input
                  className={inputStyle}
                  value={p.family ?? ""}
                  onChange={(e) =>
                    update(idx, { family: toNameCase(e.target.value) })
                  }
                  placeholder="Malik"
                />
              </Field>
            </div>
          ) : (
            <Field label="Organization">
              <input
                className={inputStyle}
                value={p.literal ?? ""}
                onChange={(e) =>
                  update(idx, { literal: toTitleCase(e.target.value) })
                }
                placeholder="UNESCO World Heritage Centre"
              />
            </Field>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <Btn
          onClick={() => add("person")}
          className="border-emerald-300 text-emerald-700"
        >
          Add {role} (Person)
        </Btn>
        <Btn
          onClick={() => add("org")}
          className="border-emerald-300 text-emerald-700"
        >
          Add {role} (Organization)
        </Btn>
      </div>
    </div>
  );
}

/* ------------------------------ The Page ------------------------------ */

export default function BibliographyManagerPage() {
  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  // list filters
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [authorFilter, setAuthorFilter] = useState<string>(""); // selected author literal

  // title suggestions (robust search box)
  const [titleSuggestions, setTitleSuggestions] = useState<
    { id: string; title: string }[]
  >([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestRef = useRef<HTMLDivElement | null>(null);

  // author dropdown search
  const [authorQuery, setAuthorQuery] = useState("");
  const [authorOpen, setAuthorOpen] = useState(false);
  const authorRef = useRef<HTMLDivElement | null>(null);

  // editor / wizard
  const [editing, setEditing] = useState<Row | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  // toasts
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const notify = (msg: string, tone: ToastT["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  // sites modal
  const [sitesModal, setSitesModal] = useState<{
    open: boolean;
    biblio?: Row | null;
    sites: SiteRow[];
    loading: boolean;
  }>({ open: false, biblio: null, sites: [], loading: false });

  // form (editor)
  const [form, setForm] = useState<{
    id?: string;
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

  // lookup
  const [lkInput, setLkInput] = useState("");
  const [lkBusy, setLkBusy] = useState(false);
  const [lkResults, setLkResults] = useState<Candidate[]>([]);
  const [lkOpen, setLkOpen] = useState(false);

  const authors = useMemo(
    () => form.people.filter((p) => p.role === "author"),
    [form.people]
  );
  const editors = useMemo(
    () => form.people.filter((p) => p.role === "editor"),
    [form.people]
  );
  const translators = useMemo(
    () => form.people.filter((p) => p.role === "translator"),
    [form.people]
  );

  // distinct authors for filter from the current rows
  const allAuthors = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const arr = Array.isArray(r?.csl?.author) ? r.csl.author : [];
      for (const a of arr) {
        if (a?.family || a?.given) {
          s.add([a.family, a.given].filter(Boolean).join(", "));
        } else if (a?.literal) {
          s.add(a.literal);
        }
      }
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!authorFilter) return rows;
    return rows.filter((r) => {
      const arr = Array.isArray(r?.csl?.author) ? r.csl.author : [];
      return arr.some((a: any) => {
        const name =
          a?.family || a?.given
            ? [a.family, a.given].filter(Boolean).join(", ")
            : a?.literal || "";
        return name.toLowerCase() === authorFilter.toLowerCase();
      });
    });
  }, [rows, authorFilter]);

  /* ------------------------------ Load -------------------------------- */

  const load = async () => {
    setBusy(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("bibliography_sources")
      .select(
        "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,notes,csl,created_at,updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false })
      .range(from, to);

    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      q = q.textSearch("search_tsv", trimmedQuery, { type: "websearch" });
      q = q.or(
        `title.ilike.%${trimmedQuery}%,container_title.ilike.%${trimmedQuery}%,publisher.ilike.%${trimmedQuery}%,doi.ilike.%${trimmedQuery}%,url.ilike.%${trimmedQuery}%,csl::text.ilike.%${trimmedQuery}%`
      );
    }
    if (type) q = q.eq("type", type);
    if (year) q = q.eq("year_int", Number(year));

    const { data, error, count } = await q;
    setBusy(false);
    if (error) {
      console.error(error);
      notify("Failed to load bibliography.", "error");
      return;
    }
    setRows((data as Row[]) ?? []);
    setTotal(count ?? 0);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type, year, page]);

  /* ----------------------- Title suggestions (typeahead) ----------------------- */

  // click outside to close suggestion popover
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!suggestRef.current) return;
      if (!suggestRef.current.contains(e.target as any)) setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function fetchTitleSuggestions(q: string) {
    if (!q || q.trim().length < 2) {
      setTitleSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    const { data, error } = await supabase
      .from("bibliography_sources")
      .select("id,title")
      .ilike("title", `%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(8);
    if (!error) {
      setTitleSuggestions((data as any[]) ?? []);
      setSuggestOpen(true);
    }
  }

  /* --------------------------- Editor wiring --------------------------- */

  const startNew = () => {
    setEditing({} as any);
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
    setLkInput("");
    setLkResults([]);
    setLkOpen(false);
  };

  const startEdit = (r: Row) => {
    const people: Person[] = [];
    const csl = r.csl || {};
    const pushRole = (arr: any[], role: Person["role"]) => {
      if (!Array.isArray(arr)) return;
      for (const a of arr) {
        if (a && (a.given || a.family)) {
          people.push({
            role,
            kind: "person",
            given: a.given || "",
            family: a.family || "",
          });
        } else if (a && a.literal) {
          people.push({ role, kind: "org", literal: a.literal || "" });
        }
      }
    };
    pushRole(csl?.author || [], "author");
    pushRole(csl?.editor || [], "editor");
    pushRole(csl?.translator || [], "translator");

    setForm({
      id: r.id,
      title: r.title || "",
      type: r.type || "book",
      container_title: r.container_title || "",
      publisher: r.publisher || "",
      year_int: r.year_int || undefined,
      doi: r.doi || "",
      isbn: r.isbn || "",
      issn: r.issn || "",
      url: r.url || "",
      notes: r.notes || "",
      people,
    });

    setLkInput("");
    setLkResults([]);
    setLkOpen(false);
    setEditing(r);
  };

  async function findDuplicateByIdentifiers(): Promise<Row | null> {
    if (form.doi?.trim()) {
      const { data } = await supabase
        .from("bibliography_sources")
        .select(
          "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,notes,csl,created_at,updated_at"
        )
        .eq("doi", form.doi.trim())
        .limit(1)
        .maybeSingle();
      if (data) return data as Row;
    }

    if (form.url?.trim()) {
      const url = form.url.trim();
      const { data } = await supabase
        .from("bibliography_sources")
        .select(
          "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,notes,csl,created_at,updated_at"
        )
        .or(`url.eq.${url},url.ilike.%${url}%`)
        .limit(1);
      if (data && data[0]) return data[0] as Row;
    }

    if (form.isbn?.trim()) {
      const isbn = form.isbn.trim();
      const { data } = await supabase
        .from("bibliography_sources")
        .select(
          "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,notes,csl,created_at,updated_at"
        )
        .or(`isbn.eq.${isbn},isbn.ilike.%${isbn}%`)
        .limit(1);
      if (data && data[0]) return data[0] as Row;
    }

    return null;
  }

  const save = async () => {
    if (!form.title.trim()) {
      notify("Title is required.", "error");
      return;
    }
    if (!form.type) {
      notify("Type is required.", "error");
      return;
    }

    const csl = buildCSL({
      id: form.id,
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

    let res;
    if (form.id) {
      res = await supabase
        .from("bibliography_sources")
        .update(payload)
        .eq("id", form.id)
        .select("id")
        .single();
    } else {
      const dup = await findDuplicateByIdentifiers();
      if (dup) {
        notify(
          "Matched an existing item by identifiers. Switched to editing that record.",
          "info"
        );
        startEdit(dup);
        return;
      }
      res = await supabase
        .from("bibliography_sources")
        .insert(payload)
        .select("id")
        .single();
    }
    if (res.error) {
      notify(`Save failed: ${res.error.message}`, "error");
      return;
    }
    notify("Source saved.", "success");
    setEditing(null);
    await load();
  };

  const remove = async (id: string) => {
    if (
      !confirm("Delete this source? This will also remove its listing links.")
    )
      return;
    const { error } = await supabase
      .from("bibliography_sources")
      .delete()
      .eq("id", id);
    if (error) {
      notify(`Delete failed: ${error.message}`, "error");
      return;
    }
    notify("Source deleted.", "success");
    await load();
  };

  const openSites = async (row: Row) => {
    setSitesModal({ open: true, biblio: row, sites: [], loading: true });
    const { data: links, error: e1 } = await supabase
      .from("listing_bibliography")
      .select("listing_id")
      .eq("biblio_id", row.id);

    if (e1) {
      notify("Failed to load linked sites.", "error");
      setSitesModal((s) => ({ ...s, loading: false }));
      return;
    }

    const ids = (links ?? []).map((x: any) => x.listing_id).filter(Boolean);
    if (ids.length === 0) {
      setSitesModal({ open: true, biblio: row, sites: [], loading: false });
      return;
    }

    const { data: sites, error: e2 } = await supabase
      .from("sites")
      .select("id,title,slug")
      .in("id", ids);

    if (e2) {
      notify("Failed to load site details.", "error");
      setSitesModal((s) => ({ ...s, loading: false }));
      return;
    }
    setSitesModal({
      open: true,
      biblio: row,
      sites: (sites as SiteRow[]) ?? [],
      loading: false,
    });
  };

  /* --------------------- Lookup: call & prefill ---------------------- */

  async function runLookup() {
    const input = lkInput.trim();
    if (!input) return;
    try {
      setLkBusy(true);
      setLkResults([]);
      setLkOpen(true);
      const r = await fetch("/api/cite/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        throw new Error(json?.error || "Resolver failed");
      }
      const candidates: Candidate[] = Array.isArray(json.candidates)
        ? json.candidates
        : [];
      setLkResults(candidates);
      if (candidates.length === 0) {
        notify("No matches found.", "info");
      } else {
        notify("Found citation candidates.", "success");
      }
    } catch (e: any) {
      notify(e?.message || "Lookup failed.", "error");
      setLkResults([]);
    } finally {
      setLkBusy(false);
    }
  }

  function cslNameToPerson(
    arr: CSLName[] | undefined,
    role: Person["role"]
  ): Person[] {
    if (!Array.isArray(arr)) return [];
    return arr.map((a) => {
      if (a && (a.family || a.given)) {
        return {
          role,
          kind: "person",
          given: a.given || "",
          family: a.family || "",
        };
      }
      return { role, kind: "org", literal: a?.literal || "" };
    });
  }

  function prefillFromCSL(csl: CSL) {
    const title = csl.title || "";
    const type = (csl.type as string) || "book";
    const container = (csl["container-title"] as string) || "";
    const publisher = csl.publisher || "";
    const year =
      (Array.isArray(csl.issued?.["date-parts"]) &&
        csl.issued?.["date-parts"]?.[0]?.[0]) ||
      undefined;
    const doi = csl.DOI || "";
    const url = csl.URL || "";

    const isbn = Array.isArray(csl.ISBN) ? csl.ISBN[0] || "" : csl.ISBN || "";
    const issn = Array.isArray(csl.ISSN) ? csl.ISSN[0] || "" : csl.ISSN || "";

    const authors = cslNameToPerson(csl.author, "author");
    const editors = cslNameToPerson(csl.editor, "editor");
    const translators = cslNameToPerson(csl.translator, "translator");

    setForm((s) => ({
      ...s,
      title: toTitleCase(title),
      type,
      container_title: toTitleCase(container),
      publisher: toTitleCase(publisher),
      year_int: year,
      doi,
      isbn,
      issn,
      url,
      people: [...authors, ...editors, ...translators],
    }));

    notify(`Form prefilled.`, "success");
  }

  /* ------------------------------ Render ------------------------------ */

  // derived UI
  const list = filteredRows;

  // close author dropdown on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!authorRef.current) return;
      if (!authorRef.current.contains(e.target as any)) setAuthorOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <AdminGuard>
      <div className="px-8 py-6 max-w-screen-xl mx-auto bg-white">
        <Toasts
          toasts={toasts}
          dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
        />

        {/* Header (Amber style) */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm px-4 py-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              {/* Back behavior: if editing, go back to list; else go to admin */}
              {editing ? (
                <button
                  onClick={() => setEditing(null)}
                  className="text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
                  title="Back to list"
                >
                  <Icon name="arrow-left" />
                  <span className="sr-only">Back</span>
                </button>
              ) : (
                <Link
                  href="/admin"
                  className="text-slate-700 hover:text-slate-900 inline-flex items-center gap-1"
                  title="Back to Admin"
                >
                  <Icon name="arrow-left" />
                  <span className="sr-only">Back</span>
                </Link>
              )}

              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center">
                  <Icon name="book" size={20} className="text-amber-700" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 whitespace-nowrap">
                  Bibliography Manager
                </h1>
              </div>
            </div>

            {!editing ? (
              <div className="flex gap-2 shrink-0">
                <Btn
                  className="border-amber-300 text-amber-800 bg-white"
                  onClick={() => setWizardOpen(true)}
                >
                  <Icon name="magic" /> &nbsp;Citation Wizard
                </Btn>
                <Btn
                  className="border-amber-300 text-amber-800 bg-white"
                  onClick={startNew}
                >
                  <Icon name="plus" /> New Source
                </Btn>
              </div>
            ) : null}
          </div>
        </div>

        {/* Filters / Search */}
        {!editing ? (
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 mb-5">
            {/* Title search with suggestions & "Clear" arrow above when searching */}
            <div className="relative lg:col-span-3" ref={suggestRef}>
              {query.trim() ? (
                <button
                  className="absolute -top-5 right-0 text-slate-600 hover:text-slate-900 inline-flex items-center justify-center text-xs"
                  title="Clear search"
                  onClick={() => {
                    setQuery("");
                    if (page !== 0) setPage(0);
                    setTitleSuggestions([]);
                    setSuggestOpen(false);
                  }}
                >
                  <Icon name="arrow-up" /> Clear
                </button>
              ) : null}

              <input
                className={inputStyle}
                placeholder="Search title, author, publisher, DOI, URL, etc…"
                value={query}
                onChange={async (e) => {
                  const v = e.target.value;
                  setQuery(v);
                  if (page !== 0) setPage(0);
                  await fetchTitleSuggestions(v);
                }}
                onFocus={() => {
                  if (titleSuggestions.length) setSuggestOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSuggestOpen(false);
                }}
              />
              {suggestOpen && titleSuggestions.length > 0 ? (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
                  <div className="max-h-64 overflow-auto divide-y">
                    {titleSuggestions.map((s) => (
                      <button
                        key={s.id}
                        className="block w-full text-left px-3 py-2 hover:bg-amber-50"
                        onClick={() => {
                          setQuery(s.title);
                          if (page !== 0) setPage(0);
                          setSuggestOpen(false);
                        }}
                      >
                        <div className="text-xs text-slate-800">{s.title}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Type */}
            <select
              className={inputStyle + " lg:col-span-1"}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                if (page !== 0) setPage(0);
              }}
            >
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Year */}
            <input
              className={inputStyle + " lg:col-span-1"}
              placeholder="Year"
              value={year}
              onChange={(e) => {
                setYear(e.target.value.replace(/\D/g, "").slice(0, 4));
                if (page !== 0) setPage(0);
              }}
            />

            {/* Author filter (closed by default; opens when typing) */}
            <div className="relative lg:col-span-1" ref={authorRef}>
              <input
                className={inputStyle}
                placeholder="Filter by author…"
                value={authorQuery || authorFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  setAuthorQuery(v);
                  setAuthorOpen(v.trim().length > 0);
                }}
                onFocus={() => {
                  if ((authorQuery || "").trim().length > 0)
                    setAuthorOpen(true);
                }}
              />
              {authorOpen ? (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-64 overflow-auto">
                  {(allAuthors || [])
                    .filter((a) =>
                      authorQuery
                        ? a.toLowerCase().includes(authorQuery.toLowerCase())
                        : a
                    )
                    .slice(0, 30)
                    .map((a) => (
                      <button
                        key={a}
                        className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 ${
                          a === authorFilter ? "bg-amber-50" : ""
                        }`}
                        onClick={() => {
                          setAuthorFilter(a === authorFilter ? "" : a);
                          setAuthorQuery("");
                          setAuthorOpen(false);
                          if (page !== 0) setPage(0);
                        }}
                      >
                        {a}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* List */}
        {!editing ? (
          <>
            <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
              <table className="w-full text-xs table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 w-[56px]">#</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2 w-[8rem]">Type</th>
                    <th className="px-3 py-2 w-[22%]">Author(s)</th>
                    <th className="px-3 py-2 w-[6rem]">Year</th>
                    <th className="px-3 py-2 w-[22%]">Publisher</th>
                    <th className="px-3 py-2 w-[110px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-6 text-center text-slate-500"
                        colSpan={7}
                      >
                        {busy ? "Loading..." : "No results."}
                      </td>
                    </tr>
                  ) : (
                    list.map((r, i) => {
                      const idx = page * PAGE_SIZE + i + 1;
                      return (
                        <tr
                          key={r.id}
                          className="border-t border-slate-200 cursor-pointer hover:bg-amber-50"
                          onClick={() => startEdit(r)}
                          role="button"
                        >
                          {/* Serial */}
                          <td className="px-3 py-2 align-top text-slate-500">
                            {idx}
                          </td>

                          {/* Title */}
                          <td className="px-3 py-2 align-top">
                            <div className="font-medium text-slate-900 whitespace-normal break-words">
                              {r.title || (
                                <span className="text-slate-400">Untitled</span>
                              )}
                            </div>
                          </td>

                          {/* Type column */}
                          <td className="px-3 py-2 align-top">
                            {r.type ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[11px] font-medium">
                                {r.type}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Authors */}
                          <td className="px-3 py-2 align-top">
                            <div className="text-slate-700 whitespace-normal break-words">
                              {authorsToInline(r.csl, 5) || (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                          </td>

                          {/* Year */}
                          <td className="px-3 py-2 align-top">
                            {r.year_int ?? ""}
                          </td>

                          {/* Publisher */}
                          <td className="px-3 py-2 align-top">
                            <div className="whitespace-normal break-words">
                              {r.publisher}
                            </div>
                          </td>

                          {/* Actions */}
                          <td
                            className="px-3 py-2 align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex gap-1.5 justify-end">
                              <IconBtn
                                title="Linked sites"
                                onClick={() => openSites(r)}
                                className="border-slate-300"
                              >
                                <Icon
                                  name="list-ol"
                                  size={15}
                                  className="text-amber-700"
                                />
                              </IconBtn>
                              <IconBtn
                                title="Edit details"
                                onClick={() => startEdit(r)}
                                className="border-slate-300"
                              >
                                <Icon
                                  name="info"
                                  size={15}
                                  className="text-blue-700"
                                />
                              </IconBtn>
                              <IconBtn
                                title="Delete"
                                onClick={() => remove(r.id)}
                                className="border-slate-300"
                              >
                                <Icon
                                  name="trash"
                                  size={15}
                                  className="text-red-600"
                                />
                              </IconBtn>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {total > PAGE_SIZE ? (
              <div className="mt-4 flex items-center justify-between text-xs">
                <div>
                  Showing {page * PAGE_SIZE + 1} -{" "}
                  {Math.min((page + 1) * PAGE_SIZE, total)} of {total} results
                </div>
                <div className="flex gap-2">
                  <Btn
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="border-slate-300"
                  >
                    Previous
                  </Btn>
                  <Btn
                    onClick={() => setPage((p) => p + 1)}
                    disabled={(page + 1) * PAGE_SIZE >= total}
                    className="border-slate-300"
                  >
                    Next
                  </Btn>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {/* Editor (detail) */}
        {editing ? (
          <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Lookup + core fields */}
            <div className="lg:col-span-2 space-y-4 min-w-0">
              {/* Lookup strip (section = light grey) */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="search" />
                  <div className="font-semibold text-slate-800">
                    Lookup (URL / DOI / ISBN / Title)
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    className={inputStyle}
                    placeholder="Paste a URL (publisher/news/blog), DOI, ISBN, or a title…"
                    value={lkInput}
                    onChange={(e) => setLkInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") runLookup();
                    }}
                  />
                  <Btn
                    className="border-amber-300 text-amber-800"
                    onClick={runLookup}
                    disabled={lkBusy || !lkInput.trim()}
                  >
                    {lkBusy ? "Fetching…" : "Fetch"}
                  </Btn>
                  <Btn
                    className="border-slate-300"
                    onClick={() => {
                      setLkInput("");
                      setLkResults([]);
                      setLkOpen(false);
                    }}
                  >
                    Clear
                  </Btn>
                </div>

                {lkOpen ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="text-xs text-slate-600 px-3 py-2 border-b bg-slate-50">
                      {lkBusy
                        ? "Looking up…"
                        : lkResults.length
                        ? `Candidates (${lkResults.length})`
                        : "No candidates yet"}
                    </div>
                    <div className="max-h-[280px] overflow-auto divide-y">
                      {lkBusy && lkResults.length === 0 ? (
                        <>
                          <div className="p-3 animate-pulse">
                            <div className="h-4 w-3/4 bg-slate-200 rounded mb-1" />
                            <div className="h-3 w-2/3 bg-slate-200 rounded mb-1" />
                            <div className="h-3 w-1/3 bg-slate-200 rounded" />
                          </div>
                          <div className="p-3 animate-pulse">
                            <div className="h-4 w-2/3 bg-slate-200 rounded mb-1" />
                            <div className="h-3 w-1/2 bg-slate-200 rounded mb-1" />
                            <div className="h-3 w-1/4 bg-slate-200 rounded" />
                          </div>
                        </>
                      ) : (
                        lkResults.map((c, idx) => {
                          const r = c.csl || {};
                          const auth =
                            Array.isArray(r.author) && r.author.length
                              ? authorsToInline({ author: r.author }, 3)
                              : "—";
                          const year =
                            r.issued?.["date-parts"]?.[0]?.[0] ?? undefined;
                          const idPart =
                            r.DOI ||
                            (Array.isArray(r.ISBN) ? r.ISBN[0] : r.ISBN) ||
                            r.URL ||
                            "";
                          return (
                            <div
                              key={idx}
                              className="p-3 flex items-start gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-900 truncate">
                                  {r.title || (
                                    <span className="text-slate-400">
                                      Untitled
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-600 truncate">
                                  {auth} • {r.type || "—"} •{" "}
                                  {[r["container-title"], r.publisher, year]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                                <div className="text-[11px] text-slate-500 break-all">
                                  {idPart}
                                </div>
                              </div>
                              <Btn
                                className="border-amber-300 text-amber-800"
                                onClick={() => prefillFromCSL(r)}
                              >
                                Use
                              </Btn>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Core fields (section = light grey; inputs stay white) */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Title" required>
                    <input
                      className={inputStyle}
                      value={form.title}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          title: toTitleCase(e.target.value),
                        }))
                      }
                      placeholder="The Forts of Sindh"
                    />
                  </Field>
                  <Field label="Type" required>
                    <select
                      className={inputStyle}
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
                      className={inputStyle}
                      value={form.container_title ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          container_title: toTitleCase(e.target.value),
                        }))
                      }
                      placeholder="Journal of South Asian Studies"
                    />
                  </Field>
                  <Field label="Publisher / Institution">
                    <input
                      className={inputStyle}
                      value={form.publisher ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          publisher: toTitleCase(e.target.value),
                        }))
                      }
                      placeholder="Oxford University Press"
                    />
                  </Field>

                  <Field label="Year">
                    <input
                      className={inputStyle}
                      value={form.year_int ? String(form.year_int) : ""}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          year_int: e.target.value
                            ? Number(
                                e.target.value.replace(/\D/g, "").slice(0, 4)
                              )
                            : undefined,
                        }))
                      }
                      placeholder="2022"
                    />
                  </Field>
                  <Field label="DOI">
                    <input
                      className={inputStyle}
                      value={form.doi ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, doi: e.target.value.trim() }))
                      }
                      placeholder="10.1234/abcd.5678"
                    />
                  </Field>

                  <Field label="ISBN">
                    <input
                      className={inputStyle}
                      value={form.isbn ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, isbn: e.target.value.trim() }))
                      }
                      placeholder="978-0-123456-47-2"
                    />
                  </Field>
                  <Field label="ISSN">
                    <input
                      className={inputStyle}
                      value={form.issn ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, issn: e.target.value.trim() }))
                      }
                      placeholder="1234-5678"
                    />
                  </Field>

                  <Field label="URL">
                    <input
                      className={inputStyle}
                      value={form.url ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, url: e.target.value.trim() }))
                      }
                      placeholder="https://example.com/article"
                    />
                  </Field>
                  <Field label="Admin notes">
                    <textarea
                      className={inputStyle}
                      rows={3}
                      value={form.notes ?? ""}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          notes: toTitleCase(e.target.value),
                        }))
                      }
                      placeholder="Internal note about how this source is used."
                    />
                  </Field>
                </div>
              </div>

              {/* Quick Preview (section = light grey) */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="text-sm font-semibold mb-2">Quick Preview</div>
                <div className="text-xs text-slate-700">
                  <PreviewFromForm form={form} />
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Styling is approximate. We’ll plug in a CSL renderer later.
                </div>
              </div>
            </div>

            {/* Right: People editors (section = light grey) */}
            <div className="space-y-4 min-w-0">
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="text-sm font-semibold mb-3">Authors</div>
                <AuthorsEditor
                  value={form.people}
                  onChange={(people) => setForm((s) => ({ ...s, people }))}
                  role="author"
                />
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="text-sm font-semibold mb-3">Editors</div>
                <AuthorsEditor
                  value={form.people}
                  onChange={(people) => setForm((s) => ({ ...s, people }))}
                  role="editor"
                />
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="text-sm font-semibold mb-3">Translators</div>
                <AuthorsEditor
                  value={form.people}
                  onChange={(people) => setForm((s) => ({ ...s, people }))}
                  role="translator"
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Fixed bottom action bar */}
        {editing ? (
          <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
            <div className="mx-auto max-w-screen-xl px-8 pb-4 flex justify-end">
              <div className="rounded-t-2xl border border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-lg px-4 py-3 flex items-center gap-2 pointer-events-auto">
                <Btn
                  className="border-slate-300"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Btn>
                <Btn className="border-amber-300 text-amber-800" onClick={save}>
                  Save Source
                </Btn>
              </div>
            </div>
          </div>
        ) : null}

        {/* Sites Modal */}
        {sitesModal.open ? (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() =>
                setSitesModal({ open: false, sites: [], loading: false })
              }
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
                  <div className="font-semibold text-slate-800 text-sm">
                    Linked Sites —{" "}
                    <span className="text-slate-600">
                      {sitesModal.biblio?.title}
                    </span>
                  </div>
                  <button
                    className="text-slate-500 hover:text-slate-700"
                    onClick={() =>
                      setSitesModal({ open: false, sites: [], loading: false })
                    }
                  >
                    <Icon name="x" />
                  </button>
                </div>

                <div className="p-4 max-h-[60vh] overflow-auto">
                  {sitesModal.loading ? (
                    <div className="text-xs text-slate-600">Loading…</div>
                  ) : sitesModal.sites.length === 0 ? (
                    <div className="text-xs text-slate-600">
                      No listings are linked to this source.
                    </div>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {sitesModal.sites.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between border rounded-lg p-3"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {s.title}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {s.slug || s.id}
                            </div>
                          </div>
                          <Link
                            href={`/admin/listings/${s.id}`}
                            className="text-amber-800 border border-amber-300 rounded-md px-2 py-1 text-xs hover:bg-amber-50"
                          >
                            Open
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="px-4 py-3 bg-slate-50 border-t text-right">
                  <button
                    className="text-xs text-slate-700 hover:text-slate-900"
                    onClick={() =>
                      setSitesModal({ open: false, sites: [], loading: false })
                    }
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Citation Wizard */}
        <CitationWizard
          open={wizardOpen}
          onClose={() => {
            setWizardOpen(false);
            load();
          }}
        />
      </div>
    </AdminGuard>
  );
}

/* --------------------------- Lightweight preview --------------------------- */

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
    isbn?: string | null;
    issn?: string | null;
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
    <div className="text-slate-800 break-words">
      {authorStr ? authorStr + "." : ""}
      {year} <i>{form.title}</i>
      {editorStr}.{cont}
      {publ}
      {idents ? <span className="break-all">{idents}</span> : null}
    </div>
  );
}
