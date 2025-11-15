import { NextResponse } from "next/server";

/** ------------------------------------------------------------------------
 * Minimal CSL-JSON shape we target internally.
 * ---------------------------------------------------------------------- */
type CSLName = { given?: string; family?: string; literal?: string };
type CSL = {
  id?: string;
  type: string; // book | article-journal | chapter | report | webpage | etc.
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
  score: number; // 0..1 heuristic confidence
  source:
    | "crossref"
    | "openlibrary"
    | "openlibrary-search"
    | "googlebooks"
    | "citoid"
    | "openalex"
    | "html-meta";
};

/** ------------------------------------------------------------------------
 * Config / helpers
 * ---------------------------------------------------------------------- */
const USER_AGENT =
  "HeritageSite/1.2 (+https://example.com; contact@heritage.local)"; // customize
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";

function abortableFetch(url: string, init?: RequestInit, ms = 9000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

function isURL(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
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
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
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

function yearToIssued(y?: number | null): CSL["issued"] | undefined {
  if (!y) return undefined;
  if (y < 1 || y > 3000) return undefined;
  return { "date-parts": [[y]] };
}

// Parse ISO-ish dates to full date-parts when available (YYYY, YYYY-MM, YYYY-MM-DD)
function dateStringToIssued(s?: string): CSL["issued"] | undefined {
  if (!s) return undefined;
  const str = String(s).trim();
  let y: number | undefined, m: number | undefined, d: number | undefined;

  let m1 = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    y = Number(m1[1]);
    m = Number(m1[2]);
    d = Number(m1[3]);
    return { "date-parts": [[y, m, d]] };
  }
  m1 = str.match(/(\d{4})[\/.-](\d{1,2})/);
  if (m1) {
    y = Number(m1[1]);
    m = Number(m1[2]);
    return { "date-parts": [[y, m]] };
  }
  m1 = str.match(/(1[5-9]\d{2}|20\d{2}|2100)/);
  if (m1) {
    y = Number(m1[1]);
    return { "date-parts": [[y]] };
  }
  return undefined;
}

function parseYearLoose(s?: string): number | undefined {
  const m = s ? String(s).match(/(1[5-9]\d{2}|20\d{2}|2100)/) : null;
  return m ? Number(m[1]) : undefined;
}

function basicScoreTitleMatch(query: string, title: string): number {
  const q = query.toLowerCase();
  const t = title.toLowerCase();
  if (!q || !t) return 0.0;
  if (q === t) return 1.0;
  if (t.startsWith(q)) return 0.85;
  if (t.includes(q)) return 0.7;
  const qt = new Set(q.split(/\s+/).filter(Boolean));
  const tt = new Set(t.split(/\s+/).filter(Boolean));
  const inter = [...qt].filter((w) => tt.has(w)).length;
  const score = inter / Math.max(3, qt.size);
  return Math.min(0.65, score);
}

/** ------------------------------------------------------------------------
 * Providers
 * ---------------------------------------------------------------------- */

/* ======================= Crossref (DOI + Search) ======================= */

async function crossrefByDOI(doi: string): Promise<Candidate | null> {
  try {
    const r = await abortableFetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const m = data?.message;
    if (!m) return null;
    const csl = crossrefToCSL(m);
    return { csl, score: 0.96, source: "crossref" };
  } catch {
    return null;
  }
}

async function crossrefByTitle(query: string): Promise<Candidate[]> {
  try {
    const r = await abortableFetch(
      `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(
        query
      )}&rows=6`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    const items = (data?.message?.items ?? []) as any[];

    // ⬇️ Explicitly type each mapped item as Candidate to fix TS narrowing
    return items
      .map((m): Candidate => {
        const csl = crossrefToCSL(m);
        const score = basicScoreTitleMatch(query, csl.title || "");
        return { csl, score: Math.max(score, 0.55), source: "crossref" };
      })
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

function crossrefToCSL(m: any): CSL {
  const authors: CSLName[] = Array.isArray(m.author)
    ? m.author.map((a: any) =>
        a?.family || a?.given
          ? { family: a.family, given: a.given }
          : a?.name
          ? { literal: a.name }
          : {}
      )
    : [];
  const editors: CSLName[] = Array.isArray(m.editor)
    ? m.editor.map((a: any) =>
        a?.family || a?.given
          ? { family: a.family, given: a.given }
          : a?.name
          ? { literal: a.name }
          : {}
      )
    : [];

  const issued =
    m.issued ||
    m["published-print"] ||
    m["published-online"] ||
    (m.created && m.created["date-parts"] ? m.created : undefined);

  const type = crossrefTypeToCSLType(m.type);

  return {
    type,
    title: (Array.isArray(m.title) && m.title[0]) || m.title || "",
    author: authors.length ? authors : undefined,
    editor: editors.length ? editors : undefined,
    ["container-title"]:
      (Array.isArray(m["container-title"]) && m["container-title"][0]) ||
      m["container-title"] ||
      undefined,
    publisher: m.publisher || undefined,
    issued: issued?.["date-parts"] ? issued : undefined,
    DOI: m.DOI || undefined,
    ISSN: m.ISSN || undefined,
    URL: m.URL || undefined,
  };
}

function crossrefTypeToCSLType(t: string): string {
  switch (t) {
    case "journal-article":
      return "article-journal";
    case "book-chapter":
      return "chapter";
    case "proceedings-article":
      return "paper-conference";
    case "book":
      return "book";
    case "dataset":
      return "dataset";
    case "report":
      return "report";
    case "reference-entry":
      return "entry-encyclopedia";
    default:
      return "article-journal";
  }
}

/* ====================== Open Library (ISBN + Search) ====================== */

async function openLibraryByISBN(isbn13: string): Promise<Candidate | null> {
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`;
    const r = await abortableFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const obj = data?.[`ISBN:${isbn13}`];
    if (!obj) return null;

    const authors: CSLName[] = Array.isArray(obj.authors)
      ? obj.authors
          .map((a: any) => a?.name?.trim())
          .filter(Boolean)
          .map((name: string) => ({ literal: name }))
      : [];
    const publisher =
      Array.isArray(obj.publishers) && obj.publishers.length
        ? obj.publishers[0]?.name
        : undefined;

    const y = parseYearLoose(obj.publish_date);

    const csl: CSL = {
      type: "book",
      title: obj.title || "",
      author: authors.length ? authors : undefined,
      publisher,
      issued: yearToIssued(y),
      ISBN: [isbn13],
      URL: obj.url || undefined,
    };

    return { csl, score: 0.9, source: "openlibrary" };
  } catch {
    return null;
  }
}

async function openLibrarySearch(query: string): Promise<Candidate[]> {
  try {
    const r = await abortableFetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(
        query
      )}&limit=6`
    );
    if (!r.ok) return [];
    const data = await r.json();
    const docs: any[] = data?.docs || [];
    const out: Candidate[] = [];
    for (const d of docs) {
      const title = d.title || "";
      const authors: CSLName[] = Array.isArray(d.author_name)
        ? d.author_name.map((n: string) => ({ literal: n }))
        : [];
      const y = d.first_publish_year || parseYearLoose(d.publish_date?.[0]);
      const isbn13 =
        Array.isArray(d.isbn) && d.isbn.length
          ? normalizeISBN13(d.isbn[0])
          : null;

      const cslBase: CSL = {
        type: "book",
        title,
        author: authors.length ? authors : undefined,
        publisher:
          Array.isArray(d.publisher) && d.publisher.length
            ? d.publisher[0]
            : undefined,
        issued: yearToIssued(y),
        ISBN: isbn13 ? [isbn13] : undefined,
        URL: d.key ? `https://openlibrary.org${d.key}` : undefined,
      };
      const score = Math.max(0.62, basicScoreTitleMatch(query, title));
      out.push({ csl: cslBase, score, source: "openlibrary-search" });

      if (isbn13) {
        const enriched = await openLibraryByISBN(isbn13);
        if (enriched) {
          enriched.score = Math.max(enriched.score, score + 0.05);
          out.push(enriched);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/* ============================= Google Books ============================= */

function gbAuthorsToNames(arr?: string[]): CSLName[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => String(s).trim())
    .filter(Boolean)
    .map((s) => ({ literal: s }));
}

function gbFirstISBN(info: any): string | undefined {
  const ids: any[] = info?.industryIdentifiers || [];
  const isbn13 =
    ids.find((x) => String(x?.type).toUpperCase() === "ISBN_13")?.identifier ||
    ids.find((x) => String(x?.type).toUpperCase() === "ISBN_10")?.identifier;
  if (!isbn13) return undefined;
  const norm =
    String(isbn13).length === 13
      ? isbn13
      : normalizeISBN13(String(isbn13)) || undefined;
  return norm;
}

async function googleBooksSearch(query: string): Promise<Candidate[]> {
  try {
    const keyParam = GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : "";
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
      query
    )}&maxResults=6${keyParam}`;
    const r = await abortableFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!r.ok) return [];
    const data = await r.json();
    const items: any[] = data?.items || [];
    return items.map((it: any) => {
      const v = it?.volumeInfo || {};
      const title = v.title || "";
      const authors = gbAuthorsToNames(v.authors);
      const publisher = v.publisher || undefined;
      const y = parseYearLoose(v.publishedDate);
      const isbn = gbFirstISBN(v);
      const csl: CSL = {
        type: "book",
        title,
        author: authors.length ? authors : undefined,
        publisher,
        issued: yearToIssued(y),
        ISBN: isbn ? [isbn] : undefined,
        URL: v.infoLink || v.canonicalVolumeLink || undefined,
      };
      const score = Math.max(0.7, basicScoreTitleMatch(query, title));
      return { csl, score, source: "googlebooks" } as Candidate;
    });
  } catch {
    return [];
  }
}

/* ================================ OpenAlex =============================== */

async function openAlexByTitle(query: string): Promise<Candidate[]> {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(
      query
    )}&per_page=6`;
    const r = await abortableFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!r.ok) return [];
    const data = await r.json();
    const items: any[] = data?.results || data?.data || [];
    return items.map((w: any) => {
      const title = w?.display_name || w?.title || "";
      const auths: CSLName[] = Array.isArray(w?.authorships)
        ? w.authorships
            .map((a: any) => a?.author?.display_name || a?.author?.name)
            .filter(Boolean)
            .map((n: string) => ({ literal: n }))
        : [];
      const hv = w?.host_venue || w?.primary_location?.source || {};
      const container =
        hv?.display_name ||
        hv?.name ||
        w?.venue?.display_name ||
        w?.journal?.display_name;
      const publisher = hv?.publisher || undefined;
      const year =
        w?.publication_year ||
        w?.from_year ||
        parseYearLoose(w?.publication_date);
      const doi =
        (typeof w?.doi === "string" &&
          w.doi.replace(/^https?:\/\/doi.org\//i, "")) ||
        (w?.ids?.doi &&
          String(w.ids.doi).replace(/^https?:\/\/doi.org\//i, ""));
      const issn =
        hv?.issn_l ||
        (Array.isArray(hv?.issn) ? hv.issn[0] : undefined) ||
        undefined;
      const type = openAlexTypeToCSLType(w?.type) || "article-journal";

      const csl: CSL = {
        type,
        title,
        author: auths.length ? auths : undefined,
        ["container-title"]: container || undefined,
        publisher,
        issued: yearToIssued(year),
        DOI: doi || undefined,
        ISSN: issn || undefined,
        URL:
          w?.primary_location?.landing_page_url ||
          w?.open_access?.oa_url ||
          w?.id,
      };
      const score = Math.max(0.78, basicScoreTitleMatch(query, title));
      return { csl, score, source: "openalex" } as Candidate;
    });
  } catch {
    return [];
  }
}

function openAlexTypeToCSLType(t?: string): string {
  switch ((t || "").toLowerCase()) {
    case "journal-article":
    case "article-journal":
      return "article-journal";
    case "proceedings-article":
    case "conference-paper":
      return "paper-conference";
    case "book-chapter":
      return "chapter";
    case "dataset":
      return "dataset";
    case "report":
      return "report";
    case "book":
      return "book";
    default:
      return "article-journal";
  }
}

/* ============================ Citoid (URL) ============================ */

async function citoidByURL(url: string): Promise<Candidate | null> {
  try {
    const r = await abortableFetch(
      `https://en.wikipedia.org/api/rest_v1/data/citation/zotero?url=${encodeURIComponent(
        url
      )}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }
    );
    if (!r.ok) return null;
    const arr = (await r.json()) as any[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const it = arr[0];

    const authors: CSLName[] = Array.isArray(it.author)
      ? (it.author
          .map((a: any) =>
            a?.family || a?.given
              ? { family: a.family, given: a.given }
              : a?.name
              ? { literal: a.name }
              : null
          )
          .filter(Boolean) as CSLName[])
      : [];

    let issued: CSL["issued"] | undefined = undefined;
    const year =
      (it?.issued && Number(String(it.issued).slice(0, 4))) ||
      (it?.date && Number(String(it.date).slice(0, 4)));
    if (!Number.isNaN(year)) issued = yearToIssued(year);

    const csl: CSL = {
      type: zoteroItemTypeToCSLType(it.itemType || it.type),
      title: it.title || it.websiteTitle || it.publicationTitle || url,
      author: authors.length ? authors : undefined,
      ["container-title"]:
        it.publicationTitle ||
        it.websiteTitle ||
        it.journalAbbreviation ||
        undefined,
      publisher: it.publisher || undefined,
      issued,
      DOI: it.DOI || undefined,
      ISBN: it.ISBN || undefined,
      ISSN: it.ISSN || undefined,
      URL: it.url || url,
    };

    return { csl, score: 0.8, source: "citoid" };
  } catch {
    return null;
  }
}

function zoteroItemTypeToCSLType(t?: string): string {
  switch ((t || "").toLowerCase()) {
    case "journalarticle":
    case "article-journal":
    case "newspaperarticle":
    case "magazinearticle":
      return "article-journal";
    case "book":
      return "book";
    case "booksection":
      return "chapter";
    case "thesis":
      return "thesis";
    case "conferencepaper":
      return "paper-conference";
    case "report":
      return "report";
    case "webpage":
    default:
      return "webpage";
  }
}

/* ======================= HTML metadata fallback (URL) ======================= */

function getAttr(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return m ? m[1] : null;
}

function extractMetaMaps(html: string) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const nameMap: Record<string, string[]> = {};
  const propMap: Record<string, string[]> = {};
  for (const t of metaTags) {
    const name = getAttr(t, "name");
    const prop = getAttr(t, "property");
    const content = getAttr(t, "content");
    if (!content) continue;
    if (name) {
      (nameMap[name.toLowerCase()] ||= []).push(content);
    }
    if (prop) {
      (propMap[prop.toLowerCase()] ||= []).push(content);
    }
  }
  return { nameMap, propMap };
}

function pick<T>(...vals: (T | undefined | null | "")[]): T | undefined {
  for (const v of vals)
    if (v !== undefined && v !== null && v !== "") return v as T;
  return undefined;
}

function parseJSONLD(html: string): any[] {
  const out: any[] = [];
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!scripts) return out;
  for (const s of scripts) {
    const m = s.match(/>([\s\S]*?)<\/script>/i);
    if (!m) continue;
    let txt = m[1].trim();
    // Some sites HTML-escape; do a light unescape of &quot; &amp; etc.
    txt = txt.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore bad blocks
    }
  }
  return out;
}

function schemaTypeToCSLType(t?: string): string {
  switch ((t || "").toLowerCase()) {
    case "newsarticle":
      return "article-newspaper";
    case "scholarlyarticle":
      return "article-journal";
    case "blogposting":
      return "webpage";
    case "article":
      return "article-magazine";
    default:
      return "webpage";
  }
}

function collectAuthorsFromJSONLD(a: any): CSLName[] {
  if (!a) return [];
  const list = Array.isArray(a) ? a : [a];
  const names: CSLName[] = [];
  for (const it of list) {
    const n =
      (typeof it === "string" ? it : it?.name) ||
      (it?.author &&
        (typeof it.author === "string" ? it.author : it.author?.name));
    if (n) names.push({ literal: String(n) });
  }
  return names;
}

async function htmlMetaFallback(url: string): Promise<Candidate | null> {
  try {
    const r = await abortableFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
    });
    if (!r.ok) return null;
    const html = await r.text();

    const { nameMap, propMap } = extractMetaMaps(html);
    const jsonld = parseJSONLD(html).flat();

    // Prefer Article-like JSON-LD node if available
    const articleNode =
      jsonld.find((n: any) =>
        Array.isArray(n?.["@type"])
          ? n["@type"].some((t: string) =>
              [
                "Article",
                "NewsArticle",
                "BlogPosting",
                "ScholarlyArticle",
              ].includes(t)
            )
          : [
              "Article",
              "NewsArticle",
              "BlogPosting",
              "ScholarlyArticle",
            ].includes(String(n?.["@type"]))
      ) || null;

    // Title
    const titleFromJSONLD =
      articleNode?.headline || articleNode?.name || undefined;
    const titleFromOG = propMap["og:title"]?.[0];
    const titleFromTwitter = nameMap["twitter:title"]?.[0];
    const titleFromTag = (
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""
    ).trim();
    const title =
      pick<string>(
        titleFromJSONLD,
        titleFromOG,
        titleFromTwitter,
        titleFromTag
      ) || url;

    // Authors
    const authorsFromJSONLD = collectAuthorsFromJSONLD(articleNode?.author);
    const authorsFromCitation = (nameMap["citation_author"] || []).map((n) => ({
      literal: n,
    }));
    const authorsFromMetaAuthor = (nameMap["author"] || []).map((n) => ({
      literal: n,
    }));
    const authorsFromArticleAuthor =
      (propMap["article:author"] || []).map((n) => ({ literal: n })) || [];
    const authors = authorsFromJSONLD.length
      ? authorsFromJSONLD
      : authorsFromCitation.length
      ? authorsFromCitation
      : authorsFromMetaAuthor.length
      ? authorsFromMetaAuthor
      : authorsFromArticleAuthor;

    // Dates
    const dateJSONLD =
      articleNode?.datePublished ||
      articleNode?.dateCreated ||
      articleNode?.dateModified;
    const dateCitation =
      nameMap["citation_publication_date"]?.[0] ||
      nameMap["citation_date"]?.[0] ||
      nameMap["citation_online_date"]?.[0];
    const dateArticle = propMap["article:published_time"]?.[0];
    const issued =
      dateStringToIssued(dateJSONLD) ||
      dateStringToIssued(dateCitation) ||
      dateStringToIssued(dateArticle);

    // Publisher / Container / Identifiers
    const publisher =
      (typeof articleNode?.publisher === "object" &&
        articleNode.publisher?.name) ||
      nameMap["publisher"]?.[0] ||
      propMap["og:site_name"]?.[0] ||
      undefined;

    const containerTitle =
      nameMap["citation_journal_title"]?.[0] ||
      (articleNode?.isPartOf &&
        (typeof articleNode.isPartOf === "object"
          ? articleNode.isPartOf?.name
          : undefined)) ||
      propMap["og:site_name"]?.[0] ||
      undefined;

    const doi =
      nameMap["citation_doi"]?.[0] ||
      (typeof articleNode?.identifier === "string" &&
        normalizeDOI(articleNode.identifier)) ||
      undefined;

    const issn = nameMap["citation_issn"]?.[0] || undefined;

    // Canonical URL if present
    const canonical =
      html.match(
        /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
      )?.[1] || undefined;

    // Type
    const type =
      schemaTypeToCSLType(
        Array.isArray(articleNode?.["@type"])
          ? articleNode?.["@type"][0]
          : articleNode?.["@type"]
      ) || "webpage";

    const csl: CSL = {
      type,
      title,
      author: authors.length ? authors : undefined,
      ["container-title"]: containerTitle,
      publisher,
      issued,
      DOI: doi,
      ISSN: issn,
      URL: canonical || url,
    };

    // Score: conservative but decent if we found title + any of (author/date)
    let score = 0.72;
    if (authors.length) score += 0.05;
    if (issued) score += 0.05;
    if (containerTitle || publisher) score += 0.03;

    return { csl, score: Math.min(score, 0.88), source: "html-meta" };
  } catch {
    return null;
  }
}

/** ------------------------------------------------------------------------
 * Route handler
 * ---------------------------------------------------------------------- */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawInput = (body?.input ?? "").trim();
    if (!rawInput) {
      return NextResponse.json(
        { ok: false, error: "Missing 'input'." },
        { status: 400 }
      );
    }

    // Detect kind
    const url = isURL(rawInput);
    const doi = normalizeDOI(rawInput);
    const isbn13 = normalizeISBN13(rawInput);

    const candidates: Candidate[] = [];

    // DOI
    if (doi) {
      const c = await crossrefByDOI(doi);
      if (c) candidates.push(c);
    }

    // URL
    if (url) {
      const c = await citoidByURL(url);
      if (c) candidates.push(c);

      // HTML metadata fallback (Schema.org, Highwire, OG/Twitter)
      if (!c || !c.csl?.title || c.csl.title === url) {
        const h = await htmlMetaFallback(url);
        if (h) candidates.push(h);
      }

      // Try DOI in URL path
      if (!doi) {
        const m = url.match(/10\.\d{4,9}\/\S+/);
        if (m) {
          const d2 = normalizeDOI(m[0]);
          if (d2) {
            const c2 = await crossrefByDOI(d2);
            if (c2) candidates.push({ ...c2, score: Math.max(c2.score, 0.88) });
          }
        }
      }
    }

    // ISBN
    if (isbn13) {
      const c = await openLibraryByISBN(isbn13);
      if (c) candidates.push(c);
      const gb = await googleBooksSearch(`isbn:${isbn13}`);
      candidates.push(
        ...gb.map((x) => ({ ...x, score: Math.max(0.82, x.score) }))
      );
    }

    // Title-like input or to augment current candidates
    const runTitleSearch =
      !candidates.length || (!doi && !url && !isbn13) || rawInput.length > 6;

    if (runTitleSearch) {
      const [cx, oa, gb, ol] = await Promise.all([
        crossrefByTitle(rawInput),
        openAlexByTitle(rawInput),
        googleBooksSearch(rawInput),
        openLibrarySearch(rawInput),
      ]);
      candidates.push(...cx, ...oa, ...gb, ...ol);
    }

    // Deduplicate by (DOI || ISBN || title+year)
    const unique: Candidate[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      const sig =
        (c.csl.DOI && `doi:${String(c.csl.DOI).toLowerCase()}`) ||
        (Array.isArray(c.csl.ISBN) && c.csl.ISBN[0]
          ? `isbn:${c.csl.ISBN[0]}`
          : typeof c.csl.ISBN === "string" && c.csl.ISBN
          ? `isbn:${c.csl.ISBN}`
          : `t:${(c.csl.title || "").toLowerCase()}|y:${
              c.csl.issued?.["date-parts"]?.[0]?.[0] ?? ""
            }`);
      if (!seen.has(sig)) {
        seen.add(sig);
        unique.push(c);
      }
    }

    // Rank: score + metadata richness
    const richness = (c: Candidate) => {
      let r = 0;
      if (c.csl.author?.length) r += 0.05;
      if (c.csl["container-title"]) r += 0.03;
      if (c.csl.publisher) r += 0.02;
      if (c.csl.DOI || c.csl.ISBN || c.csl.ISSN) r += 0.06;
      if (c.csl.issued?.["date-parts"]?.[0]?.length! >= 2) r += 0.02; // month/day present
      return r;
    };
    unique.sort((a, b) => b.score + richness(b) - (a.score + richness(a)));

    const best = unique[0]?.csl || null;

    return NextResponse.json(
      {
        ok: true,
        input: rawInput,
        detected: {
          url: !!url,
          doi: !!doi,
          isbn13: !!isbn13,
        },
        best,
        candidates: unique.slice(0, 8),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Resolver failed." },
      { status: 500 }
    );
  }
}
