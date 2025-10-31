"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import CitationWizard from "@/components/biblio/CitationWizard";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-csl";

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

function IconBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`p-2 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-red-500 ${
        props.className ?? "border-slate-200 text-slate-400 hover:text-red-600"
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
    <label className="block min-w-0">
      <div className="text-xs font-semibold mb-1 text-slate-700">{label}</div>
      {children}
      {hint ? (
        <div className="text-[11px] text-slate-500 mt-1">{hint}</div>
      ) : null}
    </label>
  );
}

/* Compact inputs */
const inputStyles =
  "w-full bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-[13px] text-slate-900 placeholder-slate-400 focus:ring-emerald-500 focus:border-emerald-500";

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

/* -------------------- Normalizers + duplicate finder ---------------- */
function normalizeDoi(s?: string | null) {
  if (!s) return "";
  return s
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .toLowerCase();
}
function normalizeIsbn(s?: string | null) {
  if (!s) return "";
  return s.replace(/[-\s]/g, "").toUpperCase();
}
function normalizeUrl(s?: string | null) {
  if (!s) return "";
  try {
    const u = new URL(s.trim());
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return s.trim();
  }
}
async function findExistingByIds({
  doi,
  isbn,
  url,
}: {
  doi?: string;
  isbn?: string;
  url?: string;
}): Promise<string | null> {
  try {
    if (doi) {
      const r = await supabase
        .from("bibliography_sources")
        .select("id")
        .eq("doi", doi)
        .maybeSingle();
      if (!r.error && r.data?.id) return r.data.id as string;
    }
    if (isbn) {
      const r = await supabase
        .from("bibliography_sources")
        .select("id")
        .eq("isbn", isbn)
        .maybeSingle();
      if (!r.error && r.data?.id) return r.data.id as string;
    }
    if (url) {
      const r = await supabase
        .from("bibliography_sources")
        .select("id")
        .eq("url", url)
        .maybeSingle();
      if (!r.error && r.data?.id) return r.data.id as string;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/* ---------------- Title-Case (on paste) helper ---------------------- */
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);
function toTitleCase(text: string) {
  const words = text.toLowerCase().split(/(\s+|-)/);
  let index = 0;
  return words
    .map((w) => {
      if (/^\s+$/.test(w) || w === "-") return w;
      const isFirst = index === 0;
      const isSmall = SMALL_WORDS.has(w);
      index++;
      if (!isSmall || isFirst) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      return w;
    })
    .join("");
}
function pasteToTitleCase(
  e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  setter: (val: string) => void
) {
  e.preventDefault();
  const txt = e.clipboardData.getData("text");
  setter(toTitleCase(txt));
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
/* Citation styles (global selector)                                   */
/* ------------------------------------------------------------------ */
const STYLE_OPTIONS = [
  { id: "apa", label: "APA" },
  { id: "mla", label: "MLA" },
  { id: "chicago-author-date", label: "Chicago (Author–Date)" },
  { id: "chicago-note-bibliography", label: "Chicago (Notes/Bibliography)" },
  { id: "ieee", label: "IEEE" },
  { id: "harvard1", label: "Harvard" },
  { id: "vancouver", label: "Vancouver" },
];

/** Numeric bibliography styles that print their own list numbers */
const NUMERIC_BIB_STYLES = new Set<string>(["vancouver"]);

/* Sample CSL-JSON for preview */
const SAMPLE_CSL: any = {
  type: "article-journal",
  title: "Fort Architecture and Urban Memory in Sindh",
  author: [
    { family: "Malik", given: "Ayesha" },
    { family: "Khan", given: "Usman" },
  ],
  "container-title": "Journal of South Asian Studies",
  issued: { "date-parts": [[2021]] },
  volume: "18",
  issue: "2",
  page: "145-168",
  DOI: "10.5555/abcd.2021.145",
  URL: "https://example.org/article/fort-architecture",
  publisher: "Oxford University Press",
};

/* ---------- Helpers to render CSL HTML (batch & single) ------------- */
function toCSLFromRow(row: BiblioRow): any {
  if (row.csl) return row.csl;
  return buildCSL({
    id: row.id,
    type: row.type ?? "book",
    title: row.title,
    authors: [],
    editors: [],
    translators: [],
    container_title: row.container_title ?? undefined,
    publisher: row.publisher ?? undefined,
    year_int: row.year_int ?? undefined,
    doi: row.doi ?? undefined,
    isbn: row.isbn ?? undefined,
    issn: row.issn ?? undefined,
    url: row.url ?? undefined,
  });
}

/** Batch render all entries with a single Cite call (preserves exact style). */
function batchFormatEntriesHtml(items: any[], style: string): string[] {
  try {
    if (!items.length) return [];
    const cite = new Cite(items);
    const html = cite.format("bibliography", {
      format: "html",
      template: style,
      lang: "en-US",
    });
    const div =
      typeof document !== "undefined" ? document.createElement("div") : null;
    if (!div) return [];
    div.innerHTML = html;
    const entries = Array.from(div.querySelectorAll(".csl-entry"));
    return entries.map((el) => el.innerHTML || "");
  } catch (err) {
    console.warn(`[CSL] Batch render failed for style "${style}"`, err);
    return [];
  }
}

/** Imperative HTML injector — guarantees immediate repaint */
function Html({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = html || "";
  }, [html]);
  return <div ref={ref} className={className} />;
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */
export default function Bibliography({ siteId }: { siteId: string | number }) {
  const listingId = String(siteId);
  const { toasts, notify, dismiss } = useToasts();

  // Attached items
  const [attached, setAttached] = useState<
    (BiblioRow & { sort_order: number })[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Citation style
  const [styleId, setStyleId] = useState<string>("apa");
  const [savingStyle, setSavingStyle] = useState(false);

  // Search typeahead
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BiblioRow[]>([]);
  const [openDropdown, setOpenDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  // New Source modal
  const [newOpen, setNewOpen] = useState(false);
  const [savingNew, setSavingNew] = useState(false);

  const INITIAL_FORM = {
    title: "",
    type: "book",
    container_title: "",
    publisher: "",
    year_int: undefined as number | undefined,
    doi: "",
    isbn: "",
    issn: "",
    url: "",
    notes: "",
    people: [] as Person[],
  };
  const [form, setForm] = useState<typeof INITIAL_FORM>({ ...INITIAL_FORM });

  // Citation Wizard
  const [wizardOpen, setWizardOpen] = useState(false);

  /* --------------------------- Auto-Lookup state ---------------------- */
  const [lkInput, setLkInput] = useState("");
  const [lkBusy, setLkBusy] = useState(false);
  const [lkResults, setLkResults] = useState<Candidate[]>([]);
  const [lkOpen, setLkOpen] = useState(false);

  /* --------------------------- Data loaders --------------------------- */
  async function loadAttached() {
    setLoading(true);
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

  async function loadCitationStyle() {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "citation")
      .maybeSingle();
    if (!error && data?.value?.style) {
      setStyleId(data.value.style);
    } else {
      setStyleId("apa");
    }
  }

  useEffect(() => {
    loadAttached();
    loadCitationStyle();
  }, [listingId]);

  /* ------------------------------ Search ----------------------------- */
  async function searchLibrary(query: string) {
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
  }, [q]);

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

  /* -------------------- Global Citation Style Save -------------------- */
  async function saveCitationStyle(next: string) {
    try {
      setSavingStyle(true);
      setStyleId(next); // instant UI update
      const { error } = await supabase
        .from("app_settings")
        .upsert([{ key: "citation", value: { style: next } }], {
          onConflict: "key",
        });
      if (error) throw error;
      notify(
        `Citation style set to ${
          STYLE_OPTIONS.find((s) => s.id === next)?.label ?? next
        }.`,
        "success"
      );
    } catch (e: any) {
      notify(`Could not save citation style. ${e?.message ?? ""}`, "error");
    } finally {
      setSavingStyle(false);
    }
  }

  /* ---------------------- Live Style Preview (imperative) ------------- */
  const samplePreviewHtml = useMemo(() => {
    try {
      const cite = new Cite([SAMPLE_CSL]);
      const html = cite.format("bibliography", {
        format: "html",
        template: styleId,
        lang: "en-US",
      });
      const div =
        typeof document !== "undefined" ? document.createElement("div") : null;
      if (!div) return "—";
      div.innerHTML = html;
      const entry = div.querySelector(".csl-entry");
      return entry ? entry.innerHTML : html;
    } catch {
      return "— Preview unavailable for this style —";
    }
  }, [styleId]);

  /* ---------- Batch-render all attached entries for the current style */
  const batchRendered = useMemo(() => {
    const items = attached.map((r) => toCSLFromRow(r));
    return batchFormatEntriesHtml(items, styleId);
  }, [attached, styleId]);

  /* --------------------- Auto-Lookup functions ----------------------- */
  async function runLookup() {
    const input = lkInput.trim();
    if (!input) return;
    try {
      setLkBusy(true);
      setLkResults([]);
      setLkOpen(true);

      const preDoi = normalizeDoi(input);
      const preIsbn = normalizeIsbn(input);
      const preUrl = normalizeUrl(input);
      const existing = await findExistingByIds({
        doi: preDoi || undefined,
        isbn: preIsbn || undefined,
        url: preUrl || undefined,
      });
      if (existing) {
        await attachOne(existing);
        notify("Source already exists; attached to this listing.", "success");
        closeNewModal();
        return;
      }

      const r = await fetch("/api/cite/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) throw new Error(json?.error || "Resolver failed");
      const candidates: Candidate[] = Array.isArray(json.candidates)
        ? json.candidates
        : [];
      setLkResults(candidates);
      notify(
        candidates.length ? "Found citation candidates." : "No matches found.",
        candidates.length ? "success" : "info"
      );
    } catch (e: any) {
      notify(e?.message || "Lookup failed.", "error");
      setLkResults([]);
      setLkOpen(false);
    } finally {
      setLkBusy(false);
    }
  }

  function cslNameToPerson(
    arr: CSLName[] | undefined,
    role: Person["role"]
  ): Person[] {
    if (!Array.isArray(arr)) return [];
    return arr.map((a) =>
      a && (a.family || a.given)
        ? { role, kind: "person", given: a.given || "", family: a.family || "" }
        : { role, kind: "org", literal: a?.literal || "" }
    );
  }

  function prefillFromCSL(csl: CSL) {
    const supported = new Set<string>(TYPES as readonly string[]);
    const type = csl.type && supported.has(csl.type) ? csl.type : "book";
    const title = csl.title || "";
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
      people: [...authors, ...editors, ...translators],
    }));

    notify(`Form prefilled from lookup.`, "success");
  }

  /* -------------------- Clear + Close helpers ------------------------ */
  function resetNewSource() {
    setForm({ ...INITIAL_FORM });
    setLkInput("");
    setLkResults([]);
    setLkOpen(false);
    setSavingNew(false);
  }
  function closeNewModal() {
    resetNewSource();
    setNewOpen(false);
  }

  /* -------------------------------- UI -------------------------------- */
  const attachedIds = useMemo(
    () => new Set(attached.map((a) => a.id)),
    [attached]
  );
  const isNumericStyle = NUMERIC_BIB_STYLES.has(styleId);

  return (
    <div className="w-full max-w-full overflow-x-hidden rounded-xl border border-slate-200 bg-white/80">
      <Toasts toasts={toasts} dismiss={dismiss} />

      {/* Header + search */}
      <div className="border-b border-slate-200 p-4 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-t-xl">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 min-w-0">
            <div className="text-lg font-bold text-slate-800">Bibliography</div>

            {/* Global Citation Style selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">
                Citation Style:
              </span>
              <select
                className="px-2 py-1 rounded-md border border-slate-300 bg-white text-sm"
                value={styleId}
                onChange={(e) => {
                  const next = e.target.value;
                  setStyleId(next); // instant
                  saveCitationStyle(next); // persist
                }}
                disabled={savingStyle}
                title="Applies globally to all public listing pages"
              >
                {STYLE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {savingStyle && (
                <span className="text-xs text-emerald-700">Saving…</span>
              )}
            </div>

            <div className="flex-1" />
            <div
              className="relative w-full md:w-auto min-w-0"
              ref={dropdownRef}
            >
              <div className="flex items-center gap-2 min-w-0">
                <input
                  className={`${inputStyles} w-full md:w-96`}
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

              {/* Typeahead dropdown */}
              {openDropdown && (results.length > 0 || searching) && (
                <div className="absolute z-40 mt-2 left-0 right-0 md:right-auto md:w-[640px] max-w-[92vw] rounded-lg border border-slate-200 bg-white shadow-xl">
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
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 truncate">
                                  {r.title}
                                </div>
                                <div className="text-xs text-slate-600 truncate">
                                  {authorsToInline(r.csl, 3) || "—"} • {r.type}{" "}
                                  •{" "}
                                  {[r.container_title, r.publisher, r.year_int]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                                <div className="text-[11px] text-slate-500 break-all">
                                  {r.doi || r.url || r.isbn || r.issn || ""}
                                </div>
                              </div>
                              {isAlready ? (
                                <span className="ml-auto text-[11px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 shrink-0">
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

          {/* Live style preview (imperative) */}
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
            key={`preview-wrap-${styleId}`}
          >
            <div className="text-xs font-semibold text-amber-900 mb-1">
              Sample Preview (
              {STYLE_OPTIONS.find((s) => s.id === styleId)?.label || styleId})
            </div>

            {isNumericStyle ? (
              // Numeric styles (e.g., Vancouver) print their own numbers → no outer <ol>
              <div className="text-sm text-amber-900 break-words break-all">
                <Html html={samplePreviewHtml} />
              </div>
            ) : (
              <ol className="list-decimal list-inside">
                <li className="text-sm text-amber-900 break-words break-all">
                  <Html html={samplePreviewHtml} />
                </li>
              </ol>
            )}

            <div className="text-[11px] text-amber-800 mt-1">
              This is a sample rendering. Actual listings use each item’s stored
              CSL data.
            </div>
          </div>

          <div className="text-xs text-slate-600">
            The selected citation style applies <b>globally</b> on public
            listing pages that render bibliography via CSL.
          </div>
        </div>
      </div>

      {/* Attached list — forces remount on style change */}
      <div className="p-3 space-y-2" key={`list-${styleId}`}>
        {loading ? (
          <>
            <AttachedRowSkeleton />
            <AttachedRowSkeleton />
            <AttachedRowSkeleton />
          </>
        ) : attached.length === 0 ? (
          <div className="text-sm text-slate-500">No sources linked yet.</div>
        ) : (
          attached.map((s, i) => {
            const html = batchRendered[i];
            const showFallback = !html || html.trim() === "";
            return (
              <div
                key={s.id}
                className="flex items-start justify-between gap-3 border border-slate-200 rounded-md bg-white px-3 py-2"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {!isNumericStyle && (
                    <div className="w-6 text-right font-semibold text-slate-700 shrink-0">
                      {i + 1}.
                    </div>
                  )}
                  <div className="min-w-0">
                    {!showFallback ? (
                      <Html
                        html={html!}
                        className="text-[13px] leading-relaxed text-slate-900 csl-render break-words"
                      />
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Btn className="px-2 py-1" onClick={() => move(s.id, -1)}>
                    ↑
                  </Btn>
                  <Btn className="px-2 py-1" onClick={() => move(s.id, 1)}>
                    ↓
                  </Btn>
                  <IconBtn
                    aria-label="Remove"
                    title="Remove"
                    onClick={() => detach(s.id)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-5 w-5"
                    >
                      <path d="M9 3a1 1 0 0 0-1 1v1H5.5a1 1 0 1 0 0 2H6v12a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9zm2 2h2V5h-2v0zM8 7h8v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7z" />
                    </svg>
                  </IconBtn>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Source Modal */}
      {newOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeNewModal}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
                <div className="font-semibold text-slate-800">
                  Add New Source
                </div>
                <button
                  className="text-slate-600 hover:text-slate-800"
                  onClick={closeNewModal}
                >
                  Close
                </button>
              </div>

              {/* Scrollable content */}
              <div className="p-5 space-y-6 max-h-[80vh] overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Lookup */}
                  <div className="border border-amber-300 rounded-2xl p-4 bg-amber-50">
                    <div className="font-semibold text-amber-900 mb-2">
                      Lookup (URL / DOI / ISBN / Title)
                    </div>
                    <div className="flex flex-col md:flex-row gap-2">
                      <input
                        className={inputStyles}
                        placeholder="Paste a URL (publisher/news/blog), DOI, ISBN, or a title…"
                        value={lkInput}
                        onChange={(e) => setLkInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") runLookup();
                        }}
                        onPaste={(e) =>
                          pasteToTitleCase(e, (txt) => setLkInput(txt))
                        }
                      />
                      <Btn
                        className="border-amber-300 text-amber-800 bg-amber-100 hover:bg-amber-200"
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
                              const year = (r as any)?.issued?.[
                                "date-parts"
                              ]?.[0]?.[0];
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
                                    <div className="text-[11px] text-slate-500 truncate break-all">
                                      {idPart}
                                    </div>
                                  </div>
                                  <Btn
                                    className="border-amber-300 text-amber-800 bg-amber-100 hover:bg-amber-200"
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

                  {/* Quick Preview */}
                  <div className="border border-sky-300 rounded-xl p-4 bg-sky-50">
                    <div className="text-sm font-semibold mb-2 text-sky-900">
                      Quick Preview
                    </div>
                    <div className="text-sm text-sky-900">
                      <PreviewFromForm form={form} />
                    </div>
                    <div className="text-xs text-sky-800 mt-2">
                      Styling is approximate; the site renderer will use CSL.
                    </div>
                  </div>
                </div>

                {/* Bottom row: metadata (left) + contributors (right) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Metadata */}
                  <div className="lg:col-span-2 space-y-4 min-w-0">
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Title">
                          <input
                            className={inputStyles}
                            value={form.title}
                            onChange={(e) =>
                              setForm((s) => ({ ...s, title: e.target.value }))
                            }
                            onPaste={(e) =>
                              pasteToTitleCase(e, (txt) =>
                                setForm((s) => ({ ...s, title: txt }))
                              )
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
                            onPaste={(e) =>
                              pasteToTitleCase(e, (txt) =>
                                setForm((s) => ({
                                  ...s,
                                  container_title: txt,
                                }))
                              )
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
                            onPaste={(e) =>
                              pasteToTitleCase(e, (txt) =>
                                setForm((s) => ({ ...s, publisher: txt }))
                              )
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
                            onBlur={(e) =>
                              setForm((s) => ({
                                ...s,
                                doi: normalizeDoi(e.target.value),
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
                            onBlur={(e) =>
                              setForm((s) => ({
                                ...s,
                                isbn: normalizeIsbn(e.target.value),
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
                            onBlur={(e) =>
                              setForm((s) => ({
                                ...s,
                                url: normalizeUrl(e.target.value),
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
                            onPaste={(e) =>
                              pasteToTitleCase(e, (txt) =>
                                setForm((s) => ({ ...s, notes: txt }))
                              )
                            }
                            placeholder="Internal note about this source."
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  {/* Contributors */}
                  <div className="space-y-4 min-w-0">
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <div className="text-sm font-semibold mb-3">Authors</div>
                      <AuthorsEditor
                        value={form.people}
                        onChange={(people) =>
                          setForm((s) => ({ ...s, people }))
                        }
                        role="author"
                      />
                    </div>
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <div className="text-sm font-semibold mb-3">Editors</div>
                      <AuthorsEditor
                        value={form.people}
                        onChange={(people) =>
                          setForm((s) => ({ ...s, people }))
                        }
                        role="editor"
                      />
                    </div>
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <div className="text-sm font-semibold mb-3">
                        Translators
                      </div>
                      <AuthorsEditor
                        value={form.people}
                        onChange={(people) =>
                          setForm((s) => ({ ...s, people }))
                        }
                        role="translator"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom fixed bar */}
              <div className="px-4 py-3 bg-white border-t flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  <Btn
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={saveNewSource}
                    disabled={savingNew}
                  >
                    {savingNew ? "Saving…" : "Save Source"}
                  </Btn>
                  <Btn
                    className="bg-amber-100 text-amber-900 border border-amber-200 hover:bg-amber-200"
                    onClick={resetNewSource}
                  >
                    Clear All
                  </Btn>
                  <Btn onClick={closeNewModal}>Cancel</Btn>
                </div>
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

  /* -------------------- internal helpers for modal -------------------- */
  async function saveNewSource() {
    try {
      setSavingNew(true);

      // Normalize identifiers
      const doi = normalizeDoi(form.doi);
      const isbn = normalizeIsbn(form.isbn);
      const url = normalizeUrl(form.url);

      // If it already exists, just attach
      const existing = await findExistingByIds({
        doi: doi || undefined,
        isbn: isbn || undefined,
        url: url || undefined,
      });
      if (existing) {
        await attachOne(existing);
        notify("Source already exists; attached to this listing.", "success");
        closeNewModal();
        return;
      }

      // Build CSL with normalized values
      const csl = buildCSL({
        type: form.type,
        title: form.title,
        authors: form.people.filter((p) => p.role === "author"),
        editors: form.people.filter((p) => p.role === "editor"),
        translators: form.people.filter((p) => p.role === "translator"),
        container_title: form.container_title || undefined,
        publisher: form.publisher || undefined,
        year_int: form.year_int || undefined,
        doi: doi || undefined,
        isbn: isbn || undefined,
        issn: form.issn || undefined,
        url: url || undefined,
      });

      const { data, error } = await supabase
        .from("bibliography_sources")
        .insert([
          {
            title: form.title,
            type: form.type,
            container_title: form.container_title,
            publisher: form.publisher,
            year_int: form.year_int ?? null,
            doi: doi || null,
            isbn: isbn || null,
            issn: form.issn,
            url: url || null,
            notes: form.notes,
            csl,
          },
        ])
        .select("id")
        .single();

      if (error) {
        if (
          (error as any).code === "23505" ||
          /duplicate key value/i.test(String(error?.message))
        ) {
          const recovered = await findExistingByIds({
            doi: doi || undefined,
            isbn: isbn || undefined,
            url: url || undefined,
          });
          if (recovered) {
            await attachOne(recovered);
            notify(
              "Source already existed; attached to this listing.",
              "success"
            );
            closeNewModal();
            return;
          }
        }
        throw error;
      }

      notify("Source saved.", "success");
      closeNewModal();

      if (data?.id) {
        await attachOne(data.id);
      }
    } catch (e: any) {
      notify(`Could not save source. ${e?.message ?? ""}`, "error");
    } finally {
      setSavingNew(false);
    }
  }
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
    <div className="text-slate-800 break-words break-all">
      {authorStr ? authorStr + "." : ""}
      {year} <i>{form.title}</i>
      {editorStr}.{cont}
      {publ}
      {idents ? <span className="break-all">{idents}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* People editor (author/editor/translator)                            */
/* ------------------------------------------------------------------ */
function AuthorsEditor({
  value,
  onChange,
  role,
}: {
  value: Person[];
  onChange: (p: Person[]) => void;
  role: Person["role"];
}) {
  const rows = value.filter((p) => p.role === role);
  function updateAt(i: number, patch: Partial<Person>) {
    const all = [...value];
    const idx = all.findIndex((p) => p.role === role && i-- === 0);
    if (idx >= 0) all[idx] = { ...all[idx], ...patch };
    onChange(all);
  }
  function add(kind: Person["kind"]) {
    onChange([...value, { role, kind }]);
  }
  function remove(i: number) {
    let seen = -1;
    onChange(value.filter((p) => !(p.role === role && ++seen === i)));
  }

  return (
    <div className="space-y-3">
      {rows.map((p, i) => (
        <div
          key={i}
          className="rounded-md border border-slate-200 bg-white p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-600">
              {role.charAt(0).toUpperCase() + role.slice(1)} {i + 1}
            </span>
            <IconBtn
              aria-label="Remove"
              title="Remove"
              onClick={() => remove(i)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M9 3a1 1 0 0 0-1 1v1H5.5a1 1 0 1 0 0 2H6v12a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9zm2 2h2V5h-2v0zM8 7h8v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7z" />
              </svg>
            </IconBtn>
          </div>

          <div className="space-y-2">
            <select
              className={inputStyles}
              value={p.kind}
              onChange={(e) => updateAt(i, { kind: e.target.value as any })}
            >
              <option value="person">Person</option>
              <option value="org">Organization</option>
            </select>

            {p.kind === "person" ? (
              <>
                <input
                  className={inputStyles}
                  placeholder="Family (Last)"
                  value={p.family ?? ""}
                  onChange={(e) => updateAt(i, { family: e.target.value })}
                  onPaste={(e) =>
                    pasteToTitleCase(e, (txt) => updateAt(i, { family: txt }))
                  }
                />
                <input
                  className={inputStyles}
                  placeholder="Given (First)"
                  value={p.given ?? ""}
                  onChange={(e) => updateAt(i, { given: e.target.value })}
                  onPaste={(e) =>
                    pasteToTitleCase(e, (txt) => updateAt(i, { given: txt }))
                  }
                />
              </>
            ) : (
              <input
                className={inputStyles}
                placeholder="Organization name"
                value={p.literal ?? ""}
                onChange={(e) => updateAt(i, { literal: e.target.value })}
                onPaste={(e) =>
                  pasteToTitleCase(e, (txt) => updateAt(i, { literal: txt }))
                }
              />
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => add("person")}>Add Person</Btn>
        <Btn onClick={() => add("org")}>Add Organization</Btn>
      </div>
    </div>
  );
}
