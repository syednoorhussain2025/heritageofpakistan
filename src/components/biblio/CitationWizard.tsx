"use client";

import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Icon from "@/components/Icon";

/* ----------------------------- Types ----------------------------- */

type CSLName = { given?: string; family?: string; literal?: string };
type CSL = {
  id?: string;
  type: string;
  title: string;
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

type Candidate = {
  csl: CSL;
  score: number;
  source: "library" | "crossref" | "openlibrary" | "citoid" | string;
  id?: string; // present when from library
};

type Person = {
  role: "author" | "editor" | "translator";
  kind: "person" | "org";
  given?: string;
  family?: string;
  literal?: string;
};

type WizardLine = {
  raw: string;
  status:
    | "pending"
    | "ready"
    | "review"
    | "nomatch"
    | "saved"
    | "skipped"
    | "error";
  suggestions: Candidate[];
  chosen: CSL | null;
  chosenId?: string | null;
  error?: string;
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
  csl: any | null;
};

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

/** Sea-green action button used for: Previous / Next / Skip / Close / Save & Next */
function ActionBtn({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition border bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700 active:scale-[0.99] disabled:opacity-50 disabled:bg-emerald-300 disabled:border-emerald-300 ${
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
    <div className="fixed top-4 right-4 z-[70] space-y-2">
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

/* --------------------------- Authors Editor --------------------------- */

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
  const indices = useMemo(
    () =>
      value
        .map((p, i) => ({ p, i }))
        .filter((x) => x.p.role === role)
        .map((x) => x.i),
    [value, role]
  );

  const update = (localIdx: number, patch: Partial<Person>) => {
    const globalIdx = indices[localIdx];
    if (globalIdx == null) return;
    const next = value.slice();
    next[globalIdx] = { ...next[globalIdx], ...patch };
    onChange(next);
  };

  const add = (kind: "person" | "org") =>
    onChange([...value, { role, kind, given: "", family: "", literal: "" }]);

  const remove = (localIdx: number) => {
    const globalIdx = indices[localIdx];
    onChange(value.filter((_, i) => i !== globalIdx));
  };

  const move = (localIdx: number, dir: -1 | 1) => {
    const currentGlobal = indices[localIdx];
    const swapGlobal = indices[localIdx + dir];
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
          className="border-emerald-300 text-emerald-700"
          onClick={() => add("person")}
        >
          Add {role} (Person)
        </Btn>
        <Btn
          className="border-emerald-300 text-emerald-700"
          onClick={() => add("org")}
        >
          Add {role} (Organization)
        </Btn>
      </div>
    </div>
  );
}

/* ------------------------- CSL helpers ------------------------- */

function issuedYear(csl?: CSL): number | undefined {
  const y = csl?.issued?.["date-parts"]?.[0]?.[0];
  return typeof y === "number" ? y : undefined;
}

function cslToPeople(csl?: CSL): Person[] {
  const out: Person[] = [];
  const push = (arr: CSLName[] | undefined, role: Person["role"]) => {
    if (!Array.isArray(arr)) return;
    for (const a of arr) {
      if (a?.given || a?.family) {
        out.push({
          role,
          kind: "person",
          given: a.given || "",
          family: a.family || "",
        });
      } else if (a?.literal) {
        out.push({ role, kind: "org", literal: a.literal || "" });
      }
    }
  };
  push(csl?.author, "author");
  push(csl?.editor, "editor");
  push(csl?.translator, "translator");
  return out;
}

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
}): CSL {
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

  const csl: CSL = { id: payload.id, type: payload.type, title: payload.title };
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

/* ---------------------- Simple normalizers/parsers ---------------------- */

function isURL(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol === "http:" || "https:" === u.protocol) return u.toString();
    return null;
  } catch {
    return null;
  }
}
function normalizeDOI(input: string): string | null {
  let s = input.trim();
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  s = s.replace(/^doi:/i, "");
  s = s.trim();
  if (!s) return null;
  if (!/^10\.\d{4,9}\/\S+$/i.test(s)) return null;
  return s.toLowerCase();
}
function onlyDigitsX(s: string) {
  return s.replace(/[^0-9Xx]/g, "").toUpperCase();
}
function isbn10to13(isbn10: string): string {
  const core10 = isbn10.slice(0, 9);
  const core13 = "978" + core10;
  const digits = core13.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < digits.length; i++)
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return core13 + String(check);
}
function normalizeISBN13(input: string): string | null {
  const s = onlyDigitsX(input);
  if (!s) return null;
  if (s.length === 13 && /^\d{13}$/.test(s)) return s;
  if (s.length === 10 && /^\d{9}[\dX]$/.test(s)) return isbn10to13(s);
  return null;
}
function titleScore(query: string, title: string) {
  const q = query.toLowerCase();
  const t = (title || "").toLowerCase();
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.startsWith(q)) return 0.85;
  if (t.includes(q)) return 0.7;
  const qt = new Set(q.split(/\s+/).filter(Boolean));
  const tt = new Set(t.split(/\s+/).filter(Boolean));
  const inter = [...qt].filter((w) => tt.has(w)).length;
  return Math.min(0.65, inter / Math.max(3, qt.size));
}

/* ----------------------- Library search (first) ----------------------- */

const LIB_COLS =
  "id,title,type,container_title,publisher,year_int,doi,isbn,issn,url,csl";

function rowToCSL(r: BiblioRow): CSL {
  if (r.csl) return r.csl as CSL;
  const csl: CSL = { type: (r.type as string) || "book", title: r.title || "" };
  if (r.container_title) csl["container-title"] = r.container_title;
  if (r.publisher) csl.publisher = r.publisher;
  if (r.year_int) csl.issued = { "date-parts": [[r.year_int]] };
  if (r.doi) csl.DOI = r.doi;
  if (r.isbn) csl.ISBN = r.isbn;
  if (r.issn) csl.ISSN = r.issn;
  if (r.url) csl.URL = r.url;
  return csl;
}

async function findInLibrary(raw: string): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const doi = normalizeDOI(raw);
  const url = isURL(raw);
  const isbn13 = normalizeISBN13(raw);

  if (doi) {
    const { data } = await supabase
      .from("bibliography_sources")
      .select(LIB_COLS)
      .eq("doi", doi)
      .limit(5);
    (data as BiblioRow[] | null)?.forEach((r) =>
      out.push({ csl: rowToCSL(r), score: 1.0, source: "library", id: r.id })
    );
  }
  if (isbn13) {
    const { data } = await supabase
      .from("bibliography_sources")
      .select(LIB_COLS)
      .or(`isbn.eq.${isbn13},isbn.ilike.%${isbn13}%`)
      .limit(5);
    (data as BiblioRow[] | null)?.forEach((r) =>
      out.push({ csl: rowToCSL(r), score: 0.95, source: "library", id: r.id })
    );
  }
  if (url) {
    const { data } = await supabase
      .from("bibliography_sources")
      .select(LIB_COLS)
      .or(`url.eq.${url},url.ilike.%${url}%`)
      .limit(5);
    (data as BiblioRow[] | null)?.forEach((r) =>
      out.push({ csl: rowToCSL(r), score: 0.9, source: "library", id: r.id })
    );
  }

  const t1 = await supabase
    .from("bibliography_sources")
    .select(LIB_COLS)
    .textSearch("search_tsv", raw, { type: "websearch" })
    .limit(10);
  if (!t1.error) {
    (t1.data as BiblioRow[] | null)?.forEach((r) => {
      const sc = titleScore(raw, r.title || "");
      if (sc >= 0.45)
        out.push({ csl: rowToCSL(r), score: sc, source: "library", id: r.id });
    });
  } else {
    const t2 = await supabase
      .from("bibliography_sources")
      .select(LIB_COLS)
      .or(
        `title.ilike.%${raw}%,container_title.ilike.%${raw}%,publisher.ilike.%${raw}%`
      )
      .limit(10);
    (t2.data as BiblioRow[] | null)?.forEach((r) => {
      const sc = titleScore(raw, r.title || "");
      if (sc >= 0.45)
        out.push({ csl: rowToCSL(r), score: sc, source: "library", id: r.id });
    });
  }

  const bestById = new Map<string, Candidate>();
  for (const c of out) {
    if (!c.id) continue;
    const prev = bestById.get(c.id);
    if (!prev || c.score > prev.score) bestById.set(c.id, c);
  }
  const merged = [...bestById.values(), ...out.filter((c) => !c.id)];
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, 5);
}

/* --------------------------- Wizard Component --------------------------- */

export default function CitationWizard({
  open,
  onClose,
  listingId,
  onAttached,
}: {
  open: boolean;
  onClose: () => void;
  listingId?: string | number;
  onAttached?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawInput, setRawInput] = useState("");
  const [lines, setLines] = useState<WizardLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const [attachToListing, setAttachToListing] = useState(!!listingId);
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const toast = (msg: string, tone: ToastT["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

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

  const loadFromCSL = (csl: CSL | null) => {
    if (!csl) {
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
      return;
    }
    setForm({
      title: csl.title || "",
      type: csl.type || "book",
      container_title: csl["container-title"] || "",
      publisher: csl.publisher || "",
      year_int: issuedYear(csl) || undefined,
      doi: typeof csl.DOI === "string" ? csl.DOI : "",
      isbn: Array.isArray(csl.ISBN)
        ? csl.ISBN[0] ?? ""
        : typeof csl.ISBN === "string"
        ? csl.ISBN
        : "",
      issn: Array.isArray(csl.ISSN)
        ? csl.ISSN[0] ?? ""
        : typeof csl.ISSN === "string"
        ? csl.ISSN
        : "",
      url: csl.URL || "",
      notes: "",
      people: cslToPeople(csl),
    });
  };

  async function attachExistingToListing(biblioId: string) {
    if (!listingId) return;
    const lid = String(listingId);
    const { data: cur } = await supabase
      .from("listing_bibliography")
      .select("biblio_id")
      .eq("listing_id", lid);
    const nextOrder = cur?.length ?? 0;
    const { error } = await supabase
      .from("listing_bibliography")
      .upsert(
        [{ listing_id: lid, biblio_id: biblioId, sort_order: nextOrder }],
        { onConflict: "listing_id,biblio_id" }
      );
    if (error) throw error;
    onAttached?.();
  }

  const onStartAnalyze = async () => {
    const rawLines = rawInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!rawLines.length) {
      toast("Please paste at least one line.", "error");
      return;
    }

    setBusy(true);
    setStep(2);
    setLines(
      rawLines.map((r) => ({
        raw: r,
        status: "pending",
        suggestions: [],
        chosen: null,
        chosenId: null,
      }))
    );

    try {
      const libLists = await Promise.all(rawLines.map((r) => findInLibrary(r)));
      const baseline: WizardLine[] = rawLines.map((raw, i) => {
        const libCands = libLists[i] || [];
        if (libCands.length > 0) {
          const best = libCands[0];
          return {
            raw,
            status: "ready",
            suggestions: libCands,
            chosen: best.csl,
            chosenId: best.id ?? null,
          };
        }
        return {
          raw,
          status: "pending",
          suggestions: [],
          chosen: null,
          chosenId: null,
        };
      });

      const unresolvedIdx = baseline
        .map((ln, i) => (ln.suggestions.length === 0 ? i : -1))
        .filter((i) => i >= 0);

      if (unresolvedIdx.length > 0) {
        const inputs = unresolvedIdx.map((i) => rawLines[i]);
        const r = await fetch("/api/cite/batch-resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs }),
        });
        const data = await r.json();
        if (!r.ok || !data?.ok)
          throw new Error(data?.error || "Batch resolve failed.");

        unresolvedIdx.forEach((lineIdx, j) => {
          const row = (data as any).results?.[j] || {};
          if (!row?.ok || (!row.best && !row.candidates?.length)) {
            baseline[lineIdx] = {
              ...baseline[lineIdx],
              status: "nomatch",
              suggestions: [],
              chosen: null,
              chosenId: null,
              error: row?.error || "No match",
            };
          } else {
            const candidates: Candidate[] = (row.candidates || []).map(
              (c: Candidate) => ({
                ...c,
                source: (c.source || "crossref") as Candidate["source"],
              })
            );
            const best: CSL | null = row.best || (candidates[0]?.csl ?? null);
            baseline[lineIdx] = {
              ...baseline[lineIdx],
              status: best ? "ready" : "review",
              suggestions: candidates,
              chosen: best,
              chosenId: null,
            };
          }
        });
      }

      setLines(baseline);
      const firstIdx = baseline.findIndex((x) => x.status !== "nomatch");
      if (firstIdx >= 0) {
        setIdx(firstIdx);
        loadFromCSL(baseline[firstIdx].chosen);
        setStep(3);
      } else {
        toast("No matches found. Try editing lines or add manually.", "info");
      }
    } catch (e: any) {
      toast(e?.message || "Resolve failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const current = lines[idx];

  const onPickCandidate = (cand: Candidate) => {
    const next = lines.slice();
    next[idx] = {
      ...next[idx],
      chosen: cand.csl,
      chosenId: cand.id ?? null,
      status: "ready",
    };
    setLines(next);
    loadFromCSL(cand.csl);
  };

  const onPrev = () => {
    const p = Math.max(0, idx - 1);
    setIdx(p);
    loadFromCSL(lines[p]?.chosen ?? null);
  };
  const onNext = () => {
    const n = Math.min(lines.length - 1, idx + 1);
    setIdx(n);
    loadFromCSL(lines[n]?.chosen ?? null);
  };

  async function findDuplicateByIdentifiers(): Promise<string | null> {
    if (form.doi?.trim()) {
      const { data } = await supabase
        .from("bibliography_sources")
        .select("id")
        .eq("doi", form.doi.trim())
        .limit(1);
      if (data && data[0]?.id) return data[0].id as string;
    }
    if (form.url?.trim()) {
      const { data } = await supabase
        .from("bibliography_sources")
        .select("id")
        .or(
          `url.eq.${form.url.trim()},url.ilike.%${form.url
            .trim()
            .replaceAll(/[%]/g, "")}%`
        )
        .limit(1);
      if (data && data[0]?.id) return data[0].id as string;
    }
    if (form.isbn?.trim()) {
      const { data } = await supabase
        .from("bibliography_sources")
        .select("id")
        .or(
          `isbn.eq.${form.isbn.trim()},isbn.ilike.%${form.isbn
            .trim()
            .replaceAll(/[%]/g, "")}%`
        )
        .limit(1);
      if (data && data[0]?.id) return data[0].id as string;
    }
    return null;
  }

  const markAndAdvance = (status: WizardLine["status"]) => {
    const next = lines.slice();
    next[idx] = { ...next[idx], status };
    setLines(next);
    let n = idx + 1;
    while (
      n < next.length &&
      (next[n].status === "saved" || next[n].status === "skipped")
    )
      n++;
    if (n < next.length) {
      setIdx(n);
      loadFromCSL(next[n]?.chosen ?? null);
    } else {
      toast("All done!", "success");
    }
  };

  const saveCurrent = async () => {
    if (!form.title.trim()) {
      toast("Title is required.", "error");
      return;
    }
    if (!form.type) {
      toast("Type is required.", "error");
      return;
    }

    try {
      if (current?.chosenId) {
        if (listingId && attachToListing) {
          await attachExistingToListing(current.chosenId);
          toast("Attached existing item.", "success");
        } else {
          toast("Already in library.", "success");
        }
        markAndAdvance("saved");
        return;
      }

      const dupId = await findDuplicateByIdentifiers();
      if (dupId) {
        if (listingId && attachToListing) {
          await attachExistingToListing(dupId);
          toast("Matched existing by identifiers & attached.", "success");
        } else {
          toast("Matched existing by identifiers.", "success");
        }
        const next = lines.slice();
        next[idx] = { ...next[idx], chosenId: dupId };
        setLines(next);
        markAndAdvance("saved");
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

      const ins = await supabase
        .from("bibliography_sources")
        .insert(payload)
        .select("id")
        .single();
      if (ins.error) throw new Error(ins.error.message);

      const newId = ins.data?.id as string;
      if (listingId && attachToListing) {
        await attachExistingToListing(newId);
        toast("Saved to library & attached.", "success");
      } else {
        toast("Saved to library.", "success");
      }

      const next = lines.slice();
      next[idx] = { ...next[idx], chosenId: newId };
      setLines(next);
      markAndAdvance("saved");
    } catch (e: any) {
      toast(e?.message || "Save failed.", "error");
    }
  };

  const skipCurrent = () => markAndAdvance("skipped");

  /* --------------------------- UI helpers --------------------------- */

  const authorsInline = (max = 3) => {
    const list = form.people.filter((p) => p.role === "author");
    if (!list.length) return "—";
    const names = list.map((a) =>
      a.kind === "person"
        ? [a.family, a.given].filter(Boolean).join(", ")
        : a.literal || ""
    );
    const clipped = names.slice(0, max);
    const suffix = names.length > max ? " et al." : "";
    return clipped.filter(Boolean).join("; ") + suffix;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <Toasts
        toasts={toasts}
        dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
      />

      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="book" />
              <div className="font-semibold text-slate-800">
                Citation Wizard
              </div>
              {listingId ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700">
                  For current listing
                </span>
              ) : null}
            </div>
            <button
              className="text-slate-500 hover:text-slate-700"
              onClick={onClose}
              title="Close"
            >
              <Icon name="x" />
            </button>
          </div>

          {/* Body */}
          {step !== 3 ? (
            <div className="p-4 max-h-[80vh] overflow-auto">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-sm text-slate-700">
                    Paste rough bibliography items below. Put each reference on
                    a <b>separate line</b>. We’ll check your library first and
                    then query external sources for the rest.
                  </div>
                  <textarea
                    className={inputStyle + " min-h-[240px]"}
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    placeholder={`Example:
The Forts of Sindh
https://example.com/article
Malik, Ayesha. Heritage of Sindh (OUP, 2019)
9780131103627`}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {listingId ? (
                        <>
                          <input
                            id="attach"
                            type="checkbox"
                            checked={attachToListing}
                            onChange={(e) =>
                              setAttachToListing(e.target.checked)
                            }
                          />
                          <label
                            htmlFor="attach"
                            className="text-sm text-slate-700"
                          >
                            Attach saved items to current listing
                          </label>
                        </>
                      ) : (
                        <div className="text-sm text-slate-500">
                          Saved items go to the central library.
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Btn className="border-slate-300" onClick={onClose}>
                        Cancel
                      </Btn>
                      <Btn
                        className="border-emerald-300 text-emerald-700"
                        onClick={onStartAnalyze}
                        disabled={busy}
                      >
                        {busy ? "Analyzing…" : "Next"}
                      </Btn>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="mb-3 text-sm text-slate-700">
                    Library matches are prioritized. Any remaining items were
                    resolved from external sources. Click <b>Start Reviewing</b>
                    .
                  </div>

                  <div className="space-y-2">
                    {lines.map((ln, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border p-3 bg-white"
                      >
                        <div className="text-xs w-6 text-slate-500">
                          {i + 1}.
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {ln.raw}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {ln.status === "pending" && "Processing…"}
                            {ln.status === "ready" &&
                              (ln.suggestions[0]?.source === "library"
                                ? "Ready (library)"
                                : `Ready (${ln.suggestions[0]?.source})`)}
                            {ln.status === "review" && "Needs review"}
                            {ln.status === "nomatch" && (
                              <span className="text-red-600">No match</span>
                            )}
                          </div>
                        </div>
                        <div>
                          {ln.status === "ready" ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs">
                              Ready
                            </span>
                          ) : ln.status === "nomatch" ? (
                            <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-xs">
                              No match
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <Btn
                      className="border-slate-300"
                      onClick={() => setStep(1)}
                    >
                      Back
                    </Btn>
                    <Btn
                      className="border-emerald-300 text-emerald-700"
                      onClick={() => {
                        const firstIdx = lines.findIndex(
                          (x) => x.status !== "nomatch"
                        );
                        if (firstIdx >= 0) {
                          setIdx(firstIdx);
                          loadFromCSL(lines[firstIdx].chosen);
                          setStep(3);
                        } else {
                          toast("No items to review.", "info");
                        }
                      }}
                    >
                      Start Reviewing
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ------------------ STEP 3: Two-pane, fixed sidebar ------------------ */
            <div
              className="grid grid-cols-[360px_minmax(0,1fr)]"
              style={{ height: "calc(100vh - 160px)" }}
            >
              {/* Sidebar (fixed) */}
              <aside className="min-h-0 h-full border-r border-emerald-200 bg-emerald-50/50">
                <div className="flex flex-col h-full">
                  {/* Raw + Candidates */}
                  <div className="p-3 pb-0">
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <div className="text-xs text-slate-500 mb-1">
                        Raw line
                      </div>
                      <div className="text-sm font-medium text-slate-800 break-words">
                        {current?.raw}
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pt-3 pb-2">
                    <div className="text-[13px] font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Icon name="list" size={14} />
                      Candidates ({current?.suggestions.length ?? 0})
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto px-3">
                    <div className="space-y-2">
                      {current?.suggestions.length ? (
                        current.suggestions.map((c, j) => {
                          const isActive = form.title === (c.csl.title || "");
                          return (
                            <button
                              key={j}
                              onClick={() => onPickCandidate(c)}
                              className={`w-full text-left rounded-lg border p-2 text-sm transition ${
                                isActive
                                  ? "border-emerald-300 bg-emerald-50/60"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="font-medium truncate">
                                  {c.csl.title || "(untitled)"}
                                </div>
                                {c.source ? (
                                  <span
                                    className={`text-[10px] rounded-full px-1.5 py-0.5 border ${
                                      c.source === "library"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : "bg-slate-50 text-slate-700 border-slate-200"
                                    }`}
                                  >
                                    {c.source}
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-slate-600 truncate">
                                {c.csl["container-title"] ||
                                  c.csl.publisher ||
                                  c.source}{" "}
                                · {issuedYear(c.csl) ?? "—"}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="text-xs text-slate-600">
                          No candidates. Fill the form on the right.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attach + Actions (ALL SEA GREEN) */}
                  <div className="p-3 border-top border-emerald-200 bg-emerald-50/60 sticky bottom-0">
                    {listingId ? (
                      <label className="flex items-center gap-2 mb-3">
                        <input
                          type="checkbox"
                          checked={attachToListing}
                          onChange={(e) => setAttachToListing(e.target.checked)}
                        />
                        <span className="text-sm text-slate-800">
                          Attach to current listing on save
                        </span>
                      </label>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2">
                      <ActionBtn onClick={onPrev} disabled={idx === 0}>
                        ← Previous
                      </ActionBtn>
                      <ActionBtn
                        onClick={onNext}
                        disabled={idx >= lines.length - 1}
                      >
                        Next →
                      </ActionBtn>
                      <ActionBtn onClick={skipCurrent}>Skip</ActionBtn>
                      <ActionBtn onClick={onClose}>Close</ActionBtn>
                      <ActionBtn className="col-span-2" onClick={saveCurrent}>
                        Save & Next
                      </ActionBtn>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-600 text-center">
                      Item {idx + 1} of {lines.length}
                    </div>
                  </div>
                </div>
              </aside>

              {/* Main (scrolls independently) */}
              <main className="min-h-0 h-full overflow-auto p-4">
                {/* Summary bar */}
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {form.title || "(Untitled)"}
                      </div>
                      <div className="text-xs text-slate-700 truncate">
                        {authorsInline(4)} • {form.type || "—"} •{" "}
                        {[form.container_title, form.publisher, form.year_int]
                          .filter(Boolean)
                          .join(" • ") || "—"}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {form.doi
                          ? `https://doi.org/${form.doi}`
                          : form.url || ""}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700">
                      Overview
                    </span>
                  </div>
                </div>

                {/* Editable form */}
                <div className="space-y-4">
                  <div className="border rounded-2xl p-4 bg-white shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Title" required>
                        <input
                          className={inputStyle}
                          value={form.title}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, title: e.target.value }))
                          }
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
                        />
                      </Field>
                      <Field label="Publisher / Institution">
                        <input
                          className={inputStyle}
                          value={form.publisher ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              publisher: e.target.value,
                            }))
                          }
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
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 4)
                                  )
                                : undefined,
                            }))
                          }
                        />
                      </Field>
                      <Field label="DOI">
                        <input
                          className={inputStyle}
                          value={form.doi ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, doi: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="ISBN">
                        <input
                          className={inputStyle}
                          value={form.isbn ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, isbn: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="ISSN">
                        <input
                          className={inputStyle}
                          value={form.issn ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, issn: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="URL">
                        <input
                          className={inputStyle}
                          value={form.url ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, url: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="Admin notes">
                        <textarea
                          className={inputStyle}
                          rows={2}
                          value={form.notes ?? ""}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, notes: e.target.value }))
                          }
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="border rounded-2xl p-4 bg-white">
                    <div className="text-sm font-semibold mb-3">Authors</div>
                    <AuthorsEditor
                      value={form.people}
                      onChange={(people) => setForm((s) => ({ ...s, people }))}
                      role="author"
                    />
                  </div>
                  <div className="border rounded-2xl p-4 bg-white">
                    <div className="text-sm font-semibold mb-3">Editors</div>
                    <AuthorsEditor
                      value={form.people}
                      onChange={(people) => setForm((s) => ({ ...s, people }))}
                      role="editor"
                    />
                  </div>
                  <div className="border rounded-2xl p-4 bg-white mb-4">
                    <div className="text-sm font-semibold mb-3">
                      Translators
                    </div>
                    <AuthorsEditor
                      value={form.people}
                      onChange={(people) => setForm((s) => ({ ...s, people }))}
                      role="translator"
                    />
                  </div>
                </div>
              </main>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
