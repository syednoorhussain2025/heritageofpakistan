"use client";
import React, { useEffect, useMemo, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";
import parse, { domToReact } from "html-react-parser";
import CollectHeart from "@/components/CollectHeart";

/* ---------- helpers ---------- */
function styleStringToObject(s: string): React.CSSProperties {
  const out: Record<string, string> = {};
  s.split(";")
    .map((r) => r.trim())
    .filter(Boolean)
    .forEach((rule) => {
      const idx = rule.indexOf(":");
      if (idx === -1) return;
      const rawKey = rule.slice(0, idx).trim();
      const val = rule.slice(idx + 1).trim();
      // kebab-case → camelCase
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (key) out[key] = val;
    });
  return out as React.CSSProperties;
}

function mapAttribs(attribs: Record<string, any> | undefined) {
  if (!attribs) return {};
  const { class: classAttr, style, ...rest } = attribs as any;
  const styleObj =
    typeof style === "string" ? styleStringToObject(style) : style ?? undefined;
  return {
    ...rest,
    className: classAttr,
    ...(styleObj ? { style: styleObj } : {}),
  };
}

function pickFromSrcset(srcset?: string | null): string | null {
  if (!srcset) return null;
  const parts = srcset
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return parts[parts.length - 1].split(/\s+/)[0] || null;
}
function pickFromStyleBg(style?: string | null): string | null {
  if (!style) return null;
  const m = /background-image\s*:\s*url\((['"]?)(.*?)\1\)/i.exec(style);
  return m?.[2] || null;
}
function getAttr(a: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = a?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}
function findChildByName(node: any, tag: string): any | null {
  if (!node?.children) return null;
  return (
    node.children.find((c: any) => c.type === "tag" && c.name === tag) ?? null
  );
}
function findImgDeep(node: any): any | null {
  if (!node) return null;
  if (node.type === "tag" && node.name === "img") return node;
  if (!node.children) return null;
  for (const c of node.children) {
    const hit = findImgDeep(c);
    if (hit) return hit;
  }
  return null;
}
function extractImageMetaFromFigure(node: any): {
  src: string | null;
  alt: string | null;
} {
  // <img>
  const img = findImgDeep(node);
  if (img?.attribs) {
    const a = img.attribs;
    const src =
      getAttr(a, ["src", "data-src", "data-original", "data-lazy-src"]) ||
      pickFromSrcset(a.srcset) ||
      null;
    const alt = getAttr(a, ["alt"]);
    if (src) return { src, alt: alt ?? null };
  }
  // <picture><source>
  const picture = findChildByName(node, "picture");
  if (picture?.children) {
    const sources = picture.children.filter(
      (c: any) => c.type === "tag" && c.name === "source"
    );
    if (sources.length) {
      const last = sources[sources.length - 1];
      const src = pickFromSrcset(last.attribs?.srcset);
      if (src) return { src, alt: null };
    }
  }
  // CSS background-image
  const stack: any[] = (node.children || []).slice();
  while (stack.length) {
    const cur = stack.shift();
    if (cur?.type === "tag" && cur.attribs?.style) {
      const bg = pickFromStyleBg(cur.attribs.style);
      if (bg) return { src: bg, alt: null };
    }
    if (cur?.children) stack.push(...cur.children);
  }
  return { src: null, alt: null };
}
function textFromNode(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.data || "";
  if (!node.children) return "";
  return node.children.map(textFromNode).join("");
}

export default function HeritageArticle({
  html,
  site,
  section,
  highlightQuote,
}: {
  html: string;
  site: { id: string | number; slug: string; title: string };
  section: { id: string; title: string };
  highlightQuote?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  /* ---------------- sanitize once ---------------- */
  const safe = useMemo(() => {
    const allowed = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p",
        "img",
        "hr",
        "strong",
        "em",
        "u",
        "ul",
        "ol",
        "li",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "br",
        "span",
        "a",
        "figure",
        "figcaption",
        "div",
        "section",
        "mark",
        "picture",
        "source",
      ],
      ALLOWED_ATTR: [
        "src",
        "srcset",
        "alt",
        "title",
        "style",
        "href",
        "target",
        "rel",
        "class",
        "width",
        "height",
        "loading",
        "id",
        "draggable",
        "data-text-lock",
        "data-src",
        "data-original",
        "data-lazy-src",
      ],
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    const div = document.createElement("div");
    div.innerHTML = allowed;

    const KILL = [
      ".tiptap-bubble-menu",
      ".tiptap-floating-menu",
      ".ProseMirror-menubar",
      ".ProseMirror-menu",
      ".ProseMirror-tooltip",
      ".ProseMirror-prompt",
      "[data-bubble-menu]",
      "[data-floating-menu]",
      "[role='toolbar']",
    ];
    KILL.forEach((sel) => div.querySelectorAll(sel).forEach((n) => n.remove()));
    div.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const st = (el.getAttribute("style") || "").toLowerCase();
      if (st.includes("position:fixed")) el.remove();
    });

    return div.innerHTML;
  }, [html]);

  /* ---------------- parse → React (figure-level) ---------------- */
  const content = useMemo(() => {
    return parse(safe, {
      replace: (node: any) => {
        if (node.type !== "tag") return;

        if (node.name === "figure") {
          const attribs = mapAttribs(node.attribs);
          const children = node.children || [];
          const capNode = findChildByName(node, "figcaption");

          const childrenWithoutCaption = children.filter(
            (c: any) => !(c.type === "tag" && c.name === "figcaption")
          );

          const { src, alt } = extractImageMetaFromFigure(node);
          const captionText = capNode
            ? textFromNode(capNode).trim() || null
            : null;

          return (
            <figure {...attribs}>
              {domToReact(childrenWithoutCaption as any)}
              {(src || captionText) && (
                <figcaption className="positioned-caption-container">
                  {src && (
                    <CollectHeart
                      variant="icon"
                      size={22}
                      siteId={String(site.id)}
                      imageUrl={src}
                      altText={alt}
                      caption={captionText}
                    />
                  )}
                  {captionText && <span>{captionText}</span>}
                </figcaption>
              )}
            </figure>
          );
        }

        if (node.name === "img" && node.parent?.name !== "figure") {
          const a = node.attribs || {};
          const src =
            getAttr(a, ["src", "data-src", "data-original", "data-lazy-src"]) ||
            pickFromSrcset(a.srcset) ||
            null;
          const alt = getAttr(a, ["alt"]);
          const imgProps = mapAttribs(a);
          return (
            <figure>
              <img {...imgProps} />
              {src && (
                <figcaption className="positioned-caption-container">
                  <CollectHeart
                    variant="icon"
                    size={22}
                    siteId={String(site.id)}
                    imageUrl={src}
                    altText={alt}
                    caption={null}
                  />
                </figcaption>
              )}
            </figure>
          );
        }
        return;
      },
    });
  }, [safe, site.id]);

  /* ---------------- fade-in on scroll (unchanged) ---------------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const imgs = Array.from(host.querySelectorAll<HTMLImageElement>("img"));
    const caps = Array.from(host.querySelectorAll<HTMLElement>("figcaption"));

    host.classList.add("reveal-ready");
    imgs.forEach((el) => el.classList.add("reveal-img"));
    caps.forEach((el) => el.classList.add("reveal-cap"));

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.classList.add("in");
            el.addEventListener(
              "transitionend",
              () => el.classList.add("in-done"),
              { once: true }
            );
            io.unobserve(el);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 }
    );

    [...imgs, ...caps].forEach((el) => io.observe(el));

    const arm = requestAnimationFrame(() =>
      requestAnimationFrame(() => host.classList.add("reveal-armed"))
    );

    return () => {
      io.disconnect();
      cancelAnimationFrame(arm);
      host.classList.remove("reveal-ready", "reveal-armed");
      imgs.forEach((el) => el.classList.remove("reveal-img", "in", "in-done"));
      caps.forEach((el) => el.classList.remove("reveal-cap", "in", "in-done"));
    };
  }, [content]);

  /* ---------------- deep-link text highlight (unchanged) ---------------- */
  useEffect(() => {
    if (!highlightQuote || !hostRef.current) return;

    const root = hostRef.current;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const target = highlightQuote.trim();
    if (!target) return;

    let found: { node: Text; idx: number } | null = null;
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      const hay = (n.nodeValue || "").toString();
      const idx =
        hay.indexOf(target) >= 0
          ? hay.indexOf(target)
          : hay.toLowerCase().indexOf(target.toLowerCase());
      if (idx >= 0) {
        found = { node: n, idx };
        break;
      }
    }
    if (!found) return;

    try {
      const range = document.createRange();
      range.setStart(found.node, found.idx);
      range.setEnd(found.node, found.idx + target.length);
      const mark = document.createElement("mark");
      mark.className = "note-highlight";
      range.surroundContents(mark);
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {}
  }, [highlightQuote]);

  return (
    <>
      <div
        ref={hostRef}
        className="prose max-w-none reading-article"
        data-section-id={section.id}
        data-section-title={section.title}
        data-site-id={String(site.id)}
        data-site-title={site.title}
        style={{ background: "transparent" }}
      >
        {content}
      </div>

      <style jsx global>{`
        /* --- FINAL STRATEGY: ABSOLUTE POSITIONING --- */

        .reading-article figure > figcaption.positioned-caption-container {
          position: relative !important;
          padding-left: 40px !important;
          text-align: left !important;
          margin-top: 0.5rem;
        }

        .reading-article
          figure
          > figcaption.positioned-caption-container
          > button {
          position: absolute !important;
          left: 0 !important;
          top: 50% !important;
          transform: translateY(-110%) !important;
          margin: 0 !important;
        }

        /* -------- Note popup + highlight (copied exactly) -------- */
        .note-callout {
          position: relative;
          padding: 8px 10px;
          background: var(--amber-100);
          border: 1px solid var(--amber-border);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(90, 62, 27, 0.12),
            0 2px 6px rgba(0, 0, 0, 0.06);
          animation: note-fade 140ms ease-out;
        }
        .note-callout::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -6px;
          width: 12px;
          height: 12px;
          transform: translateX(-50%) rotate(45deg);
          background: var(--amber-100);
          border-right: 1px solid var(--amber-border);
          border-bottom: 1px solid var(--amber-border);
        }
        .note-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 2px 4px;
          border: 0;
          background: transparent;
          color: var(--amber-ink);
          font-size: 13px;
          font-weight: 600;
          line-height: 1.2;
          border-radius: 8px;
          transition: transform 140ms ease, opacity 140ms ease;
        }
        .note-btn:hover {
          transform: translateY(-0.5px);
          opacity: 0.92;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .note-btn:active {
          transform: translateY(0);
          opacity: 0.88;
        }
        .note-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(226, 181, 108, 0.6);
        }
        .note-btn.saving {
          cursor: default;
          opacity: 0.85;
        }
        .note-highlight {
          --note-highlight-bg: #fff1d6;
          --note-highlight-fg: #7a4b00;
          background: var(--note-highlight-bg);
          color: var(--note-highlight-fg);
          padding: 0 2px;
          border-radius: 2px;
          box-shadow: inset 0 -0.1em 0 rgba(122, 75, 0, 0.15);
        }
        .sticky-sel-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1000;
        }
        .sticky-sel-box {
          position: fixed;
          background: rgba(247, 224, 172, 0.35);
          box-shadow: inset 0 0 0 1px rgba(90, 62, 27, 0.32);
          border-radius: 2px;
        }
        @keyframes note-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        /* -------- Text selection color (updated) -------- */
        .reading-article ::selection,
        .hop-article ::selection {
          background: #f7e0ac; /* requested background */
          color: #5a3e1b; /* requested text color */
        }
        .reading-article ::-moz-selection,
        .hop-article ::-moz-selection {
          background: #f7e0ac;
          color: #5a3e1b;
        }
      `}</style>
    </>
  );
}
