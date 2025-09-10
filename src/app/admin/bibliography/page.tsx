// src/app/admin/bibliography/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabaseClient";

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

// For resolver results (CSL-ish)
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
      className={`px-3 py-2 rounded-lg text-sm font-medium transition border bg-white hover:shadow-sm active:scale-[0.99] disabled:opacity-50 ${
        className ?? ""
      }`}
    />
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
    <label className="block">
      <div className="text-[13px] font-semibold text-slate-800 mb-1.5">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </div>
      {children}
      {hint ? <div className="text-xs text-slate-500 mt-1">{hint}</div> : null}
    </label>
  );
}

const inputStyle =
  "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";

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
          className={`min-w-[240px] max-w-[420px] rounded-xl px-4 py-3 text-sm shadow-md border ${
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
                size={16}
              />
            </span>
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

/* --------------------------- Author Editor --------------------------- */

function AuthorsEditor({
  value,
  onChange,
  role,
}: {
  value: Person[];
  onChange: (v: Person[]) => void;
  role: Person["role"]; // author | editor | translator
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
                  className={inputStyle}
                  value={p.given ?? ""}
                  onChange={(e) => update(idx, { given: e.target.value })}
                  placeholder="Ayesha"
                />
              </Field>
              <Field label="Family (last)">
                <input
                  className={inputStyle}
                  value={p.family ?? ""}
                  onChange={(e) => update(idx, { family: e.target.value })}
                  placeholder="Malik"
                />
              </Field>
            </div>
          ) : (
            <Field label="Organization">
              <input
                className={inputStyle}
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

/* ------------------------- CSL build / flatten ------------------------- */

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

/* ------------------------------ The Page ------------------------------ */

export default function BibliographyManagerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("");
  const [year, setYear] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null); // null => list mode

  const [toasts, setToasts] = useState<ToastT[]>([]);
  const notify = (msg: string, tone: ToastT["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  const [sitesModal, setSitesModal] = useState<{
    open: boolean;
    biblio?: Row | null;
    sites: SiteRow[];
    loading: boolean;
  }>({ open: false, biblio: null, sites: [], loading: false });

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

  // --- Lookup state (resolver wiring) ---
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

  const load = async () => {
    setBusy(true);
    // Base query
    let q = supabase
      .from("bibliography_sources")
      .select(
        "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,notes,csl,created_at,updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false })
      .limit(60);

    // Prefer full-text search on search_tsv (includes authors, title, container, publisher, identifiers)
    if (query.trim()) {
      q = q.textSearch("search_tsv", query.trim(), { type: "websearch" });
      // Fallback ilike across common columns as well (broad OR)
      q = q.or(
        `title.ilike.%${query}%,container_title.ilike.%${query}%,publisher.ilike.%${query}%,doi.ilike.%${query}%,url.ilike.%${query}%`
      );
    }
    if (type) q = q.eq("type", type);
    if (year) q = q.eq("year_int", Number(year));

    const { data, error } = await q;
    setBusy(false);
    if (error) {
      console.error(error);
      notify("Failed to load bibliography.", "error");
      return;
    }
    setRows((data as Row[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type, year]);

  const startNew = () => {
    setEditing(null);
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
    // clear lookup state as we enter create mode
    setLkInput("");
    setLkResults([]);
    setLkOpen(false);
    setEditing({} as any);
  };

  const startEdit = (r: Row) => {
    // map CSL -> people
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

    // reset lookup
    setLkInput("");
    setLkResults([]);
    setLkOpen(false);

    setEditing(r);
  };

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
    // 1) get listing ids from join table
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

    // 2) fetch site records
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
    // Map basic fields
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
      title,
      type,
      container_title: container,
      publisher,
      year_int: year,
      doi,
      isbn,
      issn,
      url,
      // Replace people array; keep notes as-is
      people: [...authors, ...editors, ...translators],
    }));

    notify(
      `Form prefilled from ${csl.DOI ? "Crossref" : "resolver"}.`,
      "success"
    );
  }

  /* ------------------------------ Render ------------------------------ */

  return (
    <AdminGuard>
      <div className="px-5 py-6">
        <Toasts
          toasts={toasts}
          dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
        />

        {/* Header */}
        <div className="rounded-2xl border bg-gradient-to-r from-emerald-50 to-blue-50 px-4 py-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="text-slate-600 hover:text-slate-800 inline-flex items-center gap-1"
                title="Back to Admin"
              >
                <Icon name="arrow-left" />
                <span className="sr-only">Back</span>
              </Link>
              <h1
                className="text-2xl font-bold"
                style={{ color: "var(--brand-blue)" }}
              >
                Bibliography Manager
              </h1>
              <span className="ml-2 inline-flex items-center rounded-full bg-white/80 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700">
                <Icon name="book" size={14} /> &nbsp;Central Library
              </span>
            </div>
            {!editing ? (
              <Btn
                className="border-emerald-300 text-emerald-700 bg-white"
                onClick={startNew}
              >
                <Icon name="plus" /> New Source
              </Btn>
            ) : null}
          </div>
        </div>

        {/* Filters / Search */}
        {!editing ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
            <input
              className={inputStyle}
              placeholder="Search title, author, container, publisher, DOI, URL…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className={inputStyle}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className={inputStyle}
              placeholder="Year"
              value={year}
              onChange={(e) =>
                setYear(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
            <div className="flex gap-2">
              <Btn onClick={load} disabled={busy} className="border-slate-300">
                {busy ? "Loading…" : "Refresh"}
              </Btn>
              <Btn
                className="border-slate-300"
                onClick={() => {
                  setQuery("");
                  setType("");
                  setYear("");
                }}
              >
                Clear
              </Btn>
            </div>
          </div>
        ) : null}

        {/* List */}
        {!editing ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Authors</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Container</th>
                  <th className="px-3 py-2">Publisher</th>
                  <th className="px-3 py-2">Year</th>
                  <th className="px-3 py-2">DOI</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-slate-500"
                      colSpan={8}
                    >
                      No results.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-t hover:bg-emerald-50/40 ${
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">
                          {r.title}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[520px]">
                          {r.url ||
                            r.doi ||
                            r.isbn ||
                            r.issn ||
                            r.container_title ||
                            ""}
                        </div>
                      </td>

                      {/* AUTHORS (from CSL) */}
                      <td className="px-3 py-2 max-w-[260px]">
                        <div className="truncate text-slate-700">
                          {authorsToInline(r.csl, 3) || (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-slate-700 bg-white border-slate-300">
                          {r.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.container_title}</td>
                      <td className="px-3 py-2">{r.publisher}</td>
                      <td className="px-3 py-2">{r.year_int ?? ""}</td>
                      <td className="px-3 py-2">{r.doi ?? ""}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2 justify-end">
                          <Btn
                            className="border-amber-300 text-amber-700"
                            onClick={() => openSites(r)}
                            title="Show linked listings"
                          >
                            Sites
                          </Btn>
                          <Btn
                            className="border-blue-300 text-blue-700"
                            onClick={() => startEdit(r)}
                          >
                            Edit
                          </Btn>
                          <Btn
                            className="border-red-300 text-red-600"
                            onClick={() => remove(r.id)}
                          >
                            Delete
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Editor */}
        {editing ? (
          <div className="mt-2 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {/* ---------- Lookup strip (resolver) ---------- */}
              <div className="border border-emerald-200 rounded-2xl p-4 bg-emerald-50/40">
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
                    className="border-emerald-400 text-emerald-700"
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
                          const authors =
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
                                  {authors} • {r.type || "—"} •{" "}
                                  {[r["container-title"], r.publisher, year]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {idPart}
                                </div>
                              </div>
                              <Btn
                                className="border-emerald-300 text-emerald-700"
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
              {/* ---------- /Lookup strip ---------- */}

              <div className="border border-slate-200 rounded-2xl p-4 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Title" required>
                    <input
                      className={inputStyle}
                      value={form.title}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, title: e.target.value }))
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
                          container_title: e.target.value,
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
                        setForm((s) => ({ ...s, publisher: e.target.value }))
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
                        setForm((s) => ({ ...s, notes: e.target.value }))
                      }
                      placeholder="Internal note about how this source is used."
                    />
                  </Field>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-white">
                <div className="text-sm font-semibold mb-3">Authors</div>
                <AuthorsEditor
                  value={form.people}
                  onChange={(people) => setForm((s) => ({ ...s, people }))}
                  role="author"
                />
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-white">
                <div className="text-sm font-semibold mb-3">Editors</div>
                <AuthorsEditor
                  value={form.people}
                  onChange={(people) => setForm((s) => ({ ...s, people }))}
                  role="editor"
                />
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-white">
                <div className="text-sm font-semibold mb-3">Translators</div>
                <AuthorsEditor
                  value={form.people}
                  onChange={(people) => setForm((s) => ({ ...s, people }))}
                  role="translator"
                />
              </div>

              <div className="flex gap-2">
                <Btn
                  className="border-emerald-300 text-emerald-700"
                  onClick={save}
                >
                  Save Source
                </Btn>
                <Btn
                  className="border-slate-300"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Btn>
              </div>
            </div>

            {/* Right column: lightweight preview & raw CSL */}
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-2xl p-4 bg-white">
                <div className="text-sm font-semibold mb-2">Quick Preview</div>
                <div className="text-sm text-slate-700">
                  <PreviewFromForm form={form} />
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Styling is approximate. We’ll plug in a CSL renderer in a
                  later step.
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-white">
                <div className="text-sm font-semibold mb-2">
                  CSL JSON (computed)
                </div>
                <pre className="text-xs bg-slate-50 p-3 rounded-md overflow-auto max-h-[360px]">
                  {JSON.stringify(
                    buildCSL({
                      id: form.id,
                      type: form.type,
                      title: form.title,
                      authors: form.people.filter((p) => p.role === "author"),
                      editors: form.people.filter((p) => p.role === "editor"),
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
                  <div className="font-semibold text-slate-800">
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
                    <div className="text-sm text-slate-600">Loading…</div>
                  ) : sitesModal.sites.length === 0 ? (
                    <div className="text-sm text-slate-600">
                      No listings are linked to this source.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {sitesModal.sites.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between border rounded-lg p-3"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {s.title}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {s.slug || s.id}
                            </div>
                          </div>
                          <Link
                            href={`/admin/listings/${s.id}`}
                            className="text-emerald-700 border border-emerald-300 rounded-md px-2 py-1 text-sm hover:bg-emerald-50"
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
                    className="text-sm text-slate-700 hover:text-slate-900"
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
    <div className="text-slate-800">
      {authorStr ? authorStr + "." : ""}
      {year} <i>{form.title}</i>
      {editorStr}.{cont}
      {publ}
      {idents ? <span className="break-all">{idents}</span> : null}
    </div>
  );
}
