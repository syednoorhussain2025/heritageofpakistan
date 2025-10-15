// src/modules/heritage/HeritageArticle.tsx
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
        "style", // keep inline style from FlowComposer
        "href",
        "target",
        "rel",
        "class", // keep classes from FlowComposer
        "width",
        "height",
        "loading",
        "id",
        "draggable",
        "data-text-lock",
        "data-src",
        "data-original",
        "data-lazy-src",
        // inline-figure hints
        "data-width",
        "data-align",
        "data-caption",
        "data-gallery-caption",
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

  /* ---------------- parse → React ---------------- */
  const content = useMemo(() => {
    return parse(safe, {
      replace: (node: any) => {
        if (node.type !== "tag") return;

        // Pass-through quotation containers; ensure sec-quotation hook exists.
        if (node.name === "section" || node.name === "div") {
          const cls = String(node.attribs?.class || "");
          if (/\b(quotation|sec-quotation)\b/.test(cls)) {
            const attribs = mapAttribs(node.attribs);
            return (
              <section
                {...attribs}
                className={[attribs.className, "sec-quotation"]
                  .filter(Boolean)
                  .join(" ")}
              >
                {domToReact((node.children || []) as any)}
              </section>
            );
          }
        }

        // FIGURE (with or without caption)
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
                <div className="hop-capwrap">
                  {src && (
                    <div className="hop-heart">
                      <CollectHeart
                        variant="icon"
                        size={22}
                        siteId={String(site.id)}
                        imageUrl={src}
                        altText={alt}
                        caption={captionText}
                      />
                    </div>
                  )}
                  {captionText && (
                    <figcaption className="hop-caption">
                      {captionText}
                    </figcaption>
                  )}
                </div>
              )}
            </figure>
          );
        }

        // Lone <img> → wrap in figure + heart (no caption)
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
              <div className="hop-capwrap">
                {src && (
                  <div className="hop-heart">
                    <CollectHeart
                      variant="icon"
                      size={22}
                      siteId={String(site.id)}
                      imageUrl={src}
                      altText={alt}
                      caption={null}
                    />
                  </div>
                )}
              </div>
            </figure>
          );
        }
        return;
      },
    });
  }, [safe, site.id]);

  /* ---------------- scroll reveal (images, captions, quotes, text) ---------------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Targets
    const imgs = Array.from(host.querySelectorAll<HTMLImageElement>("img"));
    const caps = Array.from(host.querySelectorAll<HTMLElement>("figcaption"));
    const quotes = Array.from(
      host.querySelectorAll<HTMLElement>(".sec-quotation, blockquote")
    );
    // Typical text blocks (composer & prose)
    const texts = Array.from(
      host.querySelectorAll<HTMLElement>(
        "p, li, h1, h2, h3, h4, h5, h6, .hop-text, .flx-text"
      )
    );

    // Tag classes for initial state
    host.classList.add("reveal-ready");
    imgs.forEach((el) => el.classList.add("reveal-img"));
    caps.forEach((el) => el.classList.add("reveal-cap"));
    quotes.forEach((el) => el.classList.add("reveal-quote"));
    texts.forEach((el) => el.classList.add("reveal-text"));

    // Apply small per-element delays for richness (without JS reflow storms)
    // Images/quotes get a tad more delay than text.
    const setDelay = (el: HTMLElement, baseMs: number) =>
      el.style.setProperty("--reveal-delay", `${baseMs}ms`);
    imgs.forEach((el) => setDelay(el, 140));
    caps.forEach((el) => setDelay(el, 160));
    quotes.forEach((el) => setDelay(el, 160));
    texts.forEach((el) => setDelay(el, 90));

    // Observer fires when ~20% visible; elements must enter a bit before triggering.
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
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 }
    );

    [...imgs, ...caps, ...quotes, ...texts].forEach((el) => io.observe(el));

    // Arm after paint to avoid initial flash
    const arm = requestAnimationFrame(() =>
      requestAnimationFrame(() => host.classList.add("reveal-armed"))
    );

    return () => {
      io.disconnect();
      cancelAnimationFrame(arm);
      host.classList.remove("reveal-ready", "reveal-armed");
      const all = [...imgs, ...caps, ...quotes, ...texts];
      all.forEach((el) => {
        el.classList.remove(
          "reveal-img",
          "reveal-cap",
          "reveal-quote",
          "reveal-text",
          "in",
          "in-done"
        );
        el.style.removeProperty("--reveal-delay");
      });
    };
  }, [content]);

  /* ---------------- enhance carousels (pronounced sequential entrance) ---------------- */
  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;

    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>(".sec-carousel")
    );

    const cleanups: Array<() => void> = [];

    blocks.forEach((block) => {
      if ((block as any).__hopCarouselInit) return;
      (block as any).__hopCarouselInit = true;

      const rel =
        (block.querySelector<HTMLElement>(".group") as HTMLElement) || block;
      if (getComputedStyle(rel).position === "static") {
        rel.style.position = "relative";
      }

      const strip =
        (block.querySelector<HTMLElement>(".snap-x") as HTMLElement) ||
        (block.querySelector<HTMLElement>(".overflow-x-auto") as HTMLElement) ||
        null;
      if (!strip) return;

      strip.classList.add("hop-carousel-strip");

      // --- PRONOUNCED SEQUENTIAL ENTRANCE ---
      const items = Array.from(strip.children).filter(
        (n): n is HTMLElement => n instanceof HTMLElement
      );
      const baseStart = 160; // ms (noticeable initial pause)
      const perItemStep = 300; // ms (clear stagger, great for 2–3 items)
      const maxDelay = 1100; // cap to avoid excessive totals

      items.forEach((el, i) => {
        el.classList.add("hop-seq-item");
        const delay = Math.min(baseStart + i * perItemStep, maxDelay);
        el.style.setProperty("--seq-delay", `${delay}ms`);
        const micro = i % 2 === 0 ? 0 : 20; // tiny irregularity
        el.style.setProperty("--seq-micro", `${micro}ms`);
      });

      // Observe carousel visibility; then arm the sequence exactly once
      const seqIO = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              // Defer one frame so initial styles apply before toggling class
              requestAnimationFrame(() => {
                strip.classList.add("hop-seq-in");
              });
              seqIO.unobserve(strip);
              break;
            }
          }
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.25 }
      );

      // Prepare initial state before observing
      strip.classList.add("hop-seq-ready");
      seqIO.observe(strip);

      // --- NAV ---
      const calcStep = () => {
        const children = Array.from(strip.children).filter(
          (n): n is HTMLElement => n instanceof HTMLElement
        );
        const item =
          children.find((c) => c.offsetWidth > 0) || (children[0] as any);
        if (!item) return 0;
        const gapPx = parseFloat(getComputedStyle(strip).columnGap || "0") || 0;
        return item.offsetWidth + gapPx;
      };
      const step = () => Math.max(1, Math.round(calcStep()));
      const scrollByOne = (dir: "left" | "right") => {
        const delta = dir === "left" ? -step() : step();
        strip.scrollBy({ left: delta, behavior: "smooth" });
      };

      const makeBtn = (dir: "left" | "right") => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `hop-cnav ${
          dir === "left" ? "hop-cnav-left" : "hop-cnav-right"
        }`;
        btn.setAttribute("aria-label", dir === "left" ? "Previous" : "Next");
        btn.innerHTML =
          dir === "left"
            ? `<svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z"/></svg>`
            : `<svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z"/></svg>`;
        btn.addEventListener("click", () => scrollByOne(dir));
        return btn;
      };

      const left = makeBtn("left");
      const right = makeBtn("right");
      rel.appendChild(left);
      rel.appendChild(right);

      cleanups.push(() => {
        left.remove();
        right.remove();
        items.forEach((el) => {
          el.classList.remove("hop-seq-item");
          el.style.removeProperty("--seq-delay");
          el.style.removeProperty("--seq-micro");
        });
        strip.classList.remove(
          "hop-carousel-strip",
          "hop-seq-ready",
          "hop-seq-in"
        );
        (block as any).__hopCarouselInit = undefined;
        seqIO.disconnect();
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
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
        /* ------- Figure / caption ------- */
        .reading-article figure .hop-caption {
          display: block;
          text-align: center !important;
          font-size: 0.875rem;
          line-height: 1.25rem;
          color: #6b7280;
          margin: 0;
          padding: 0 32px;
          word-break: break-word;
          overflow-wrap: anywhere;
        }
        .reading-article figure .hop-capwrap {
          position: relative;
          margin-top: 0.5rem;
          min-height: 1.25rem;
        }
        .reading-article figure .hop-heart {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 24px;
          height: 24px;
        }
        @media (max-width: 420px) {
          .reading-article figure .hop-caption {
            padding: 0 28px;
          }
        }

        /* Keep a light layout hook only; no typography overrides */
        .reading-article .sec-quotation {
          display: grid;
          grid-template-columns: 1fr;
        }

        /* -------- Carousel (public page) -------- */
        .hop-carousel-strip::-webkit-scrollbar {
          display: none;
        }
        .hop-carousel-strip {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hop-cnav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border-radius: 9999px;
          border: 1px solid rgba(107, 114, 128, 0.25);
          background: rgba(229, 231, 235, 0.75);
          color: #374151;
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.08);
          cursor: pointer;
          transition: background 120ms ease, transform 120ms ease;
          z-index: 5;
        }
        .hop-cnav:hover {
          background: rgba(229, 231, 235, 0.9);
          transform: translateY(-50%) scale(1.02);
        }
        .hop-cnav:active {
          transform: translateY(-50%) scale(0.98);
        }
        .hop-cnav-left {
          left: -14px;
        }
        .hop-cnav-right {
          right: -14px;
        }

        /* -------- Note highlight -------- */
        .note-highlight {
          --note-highlight-bg: #fff1d6;
          --note-highlight-fg: #7a4b00;
          background: var(--note-highlight-bg);
          color: var(--note-highlight-fg);
          padding: 0 2px;
          border-radius: 2px;
          box-shadow: inset 0 -0.1em 0 rgba(122, 75, 0, 0.15);
        }

        /* -------- Selection colors -------- */
        .reading-article ::selection,
        .hop-article ::selection {
          background: #f7e0ac;
          color: #5a3e1b;
        }
        .reading-article ::-moz-selection,
        .hop-article ::-moz-selection {
          background: #f7e0ac;
          color: #5a3e1b;
        }

        /* -------- Make text selectable & images non-draggable -------- */
        .reading-article {
          user-select: text !important;
          -webkit-user-select: text !important;
          cursor: text;
          min-height: 0;
          background: transparent !important;
        }
        .reading-article img,
        .hop-article img {
          -webkit-user-drag: none;
          user-select: none;
        }
        .reading-article .hop-article,
        .reading-article .hop-section,
        .reading-article .hop-text,
        .reading-article figure,
        .reading-article .flx-img {
          background: transparent !important;
        }

        /* -------- Note popup styles -------- */
        .note-callout {
          position: relative;
          padding: 8px 10px;
          background: var(--amber-100, #fff7e6);
          border: 1px solid var(--amber-border, #f1d39c);
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
          background: var(--amber-100, #fff7e6);
          border-right: 1px solid var(--amber-border, #f1d39c);
          border-bottom: 1px solid var(--amber-border, #f1d39c);
        }
        .note-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 2px 4px;
          border: 0;
          background: transparent;
          color: var(--amber-ink, #7a4b00);
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

        /* ========= Scroll reveal (images, captions, quotes, text) ========= */
        @media (prefers-reduced-motion: no-preference) {
          .reading-article.reveal-ready .reveal-img,
          .reading-article.reveal-ready .reveal-cap,
          .reading-article.reveal-ready .reveal-quote,
          .reading-article.reveal-ready .reveal-text {
            opacity: 0;
            transform: translateY(12px);
          }

          /* Quotes and photos lift slightly more for emphasis */
          .reading-article.reveal-ready .reveal-quote,
          .reading-article.reveal-ready .reveal-img {
            transform: translateY(14px);
          }

          .reading-article.reveal-armed .reveal-img,
          .reading-article.reveal-armed .reveal-cap,
          .reading-article.reveal-armed .reveal-quote,
          .reading-article.reveal-armed .reveal-text {
            will-change: opacity, transform;
            transition: opacity 460ms cubic-bezier(0.2, 0.7, 0.2, 1)
                var(--reveal-delay, 60ms),
              transform 560ms cubic-bezier(0.2, 0.7, 0.2, 1)
                var(--reveal-delay, 60ms);
          }

          .reading-article .reveal-img.in,
          .reading-article .reveal-cap.in,
          .reading-article .reveal-quote.in,
          .reading-article .reveal-text.in {
            opacity: 1;
            transform: none;
          }

          .reading-article .reveal-img.in-done,
          .reading-article .reveal-cap.in-done,
          .reading-article .reveal-quote.in-done,
          .reading-article .reveal-text.in-done {
            will-change: auto;
          }
        }

        /* ========= Carousel pronounced sequential entrance ========= */
        @media (prefers-reduced-motion: no-preference) {
          .hop-seq-ready .hop-seq-item {
            opacity: 0;
            transform: translateY(24px) scale(0.985);
            /* Uncomment for a soft-focus arrival:
               filter: blur(2px); */
          }
          .hop-seq-in .hop-seq-item {
            will-change: opacity, transform, filter;
            transition: opacity 560ms cubic-bezier(0.22, 1, 0.36, 1)
                calc(var(--seq-delay, 120ms) + var(--seq-micro, 0ms)),
              transform 640ms cubic-bezier(0.22, 1, 0.36, 1)
                calc(var(--seq-delay, 120ms) + var(--seq-micro, 0ms)),
              filter 640ms cubic-bezier(0.22, 1, 0.36, 1)
                calc(var(--seq-delay, 120ms) + var(--seq-micro, 0ms));
            opacity: 1;
            transform: none;
            /* filter: none; */
          }
        }
      `}</style>
    </>
  );
}
