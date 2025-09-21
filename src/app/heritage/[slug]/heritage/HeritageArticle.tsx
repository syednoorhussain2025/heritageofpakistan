"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { createPortal } from "react-dom";
import CollectHeart from "@/components/CollectHeart";

export default function HeritageArticle({
  html,
  site,
  section,
  highlightQuote,
}: {
  html: string;
  site: { id: string; slug: string; title: string };
  section: { id: string; title: string };
  highlightQuote?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const clean = useMemo(() => {
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
      ],
      ALLOWED_ATTR: [
        "src",
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
      ],
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    const div = document.createElement("div");
    div.innerHTML = allowed;

    // Strip editor/bubble UI and any fixed elements
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

  const [overlay, setOverlay] = useState<{
    img: HTMLImageElement | null;
    rect: DOMRect | null;
    meta: {
      imageUrl: string;
      altText: string | null;
      caption: string | null;
    } | null;
    visible: boolean;
  }>({ img: null, rect: null, meta: null, visible: false });

  /* ---------------- Image/figcaption fade-in on scroll ---------------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const imgs = Array.from(host.querySelectorAll<HTMLImageElement>("img"));
    const caps = Array.from(host.querySelectorAll<HTMLElement>("figcaption"));

    // Prepare initial state (no flash)
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

    // Arm transitions on next frame (prevents initial transition on mount)
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
  }, [clean]);

  // Wire image hover listeners
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      img.setAttribute("draggable", "false");
      (img.style as any).WebkitUserDrag = "none";
    });

    const wired = new Set<HTMLImageElement>();

    const onEnter = (e: Event) => {
      const img = e.currentTarget as HTMLImageElement;
      const rect = img.getBoundingClientRect();

      const container =
        (img.closest("figure") as HTMLElement | null) ||
        (img.parentElement as HTMLElement | null);
      const capNode = container?.querySelector("figcaption");
      const caption = capNode
        ? (capNode.textContent || "").trim() || null
        : null;

      setOverlay({
        img,
        rect,
        meta: {
          imageUrl: img.getAttribute("src") || "",
          altText: img.getAttribute("alt") || null,
          caption,
        },
        visible: true,
      });
    };

    const onLeave = () =>
      setOverlay({ img: null, rect: null, meta: null, visible: false });

    const wire = (img: HTMLImageElement) => {
      if (wired.has(img)) return;
      wired.add(img);
      img.addEventListener("mouseenter", onEnter);
      img.addEventListener("mouseleave", onLeave);
    };

    host.querySelectorAll<HTMLImageElement>("img").forEach(wire);

    const mo = new MutationObserver(() => {
      host.querySelectorAll<HTMLImageElement>("img").forEach(wire);
    });
    mo.observe(host, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      wired.forEach((img) => {
        img.removeEventListener("mouseenter", onEnter);
        img.removeEventListener("mouseleave", onLeave);
      });
    };
  }, [clean]);

  // Keep overlay aligned to image while scrolling/resizing
  useEffect(() => {
    if (!overlay.visible || !overlay.img) return;

    const update = () => {
      if (!overlay.img) return;
      const rect = overlay.img.getBoundingClientRect();
      const offscreen = rect.bottom < 0 || rect.top > window.innerHeight;
      if (offscreen) {
        setOverlay({ img: null, rect: null, meta: null, visible: false });
      } else {
        setOverlay((o) => ({ ...o, rect }));
      }
    };

    const onScroll = () => requestAnimationFrame(update);
    const onResize = () => requestAnimationFrame(update);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [overlay.visible, overlay.img]);

  // Hide overlay when pointer leaves both host and overlay
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handleMove = (e: MouseEvent) => {
      const t = e.target as Node | null;
      const insideOverlay =
        overlayRef.current && t ? overlayRef.current.contains(t) : false;
      const insideHost = t ? host.contains(t) : false;
      if (!insideOverlay && !insideHost) {
        setOverlay({ img: null, rect: null, meta: null, visible: false });
      }
    };
    document.addEventListener("mousemove", handleMove);
    return () => document.removeEventListener("mousemove", handleMove);
  }, []);

  // Deep-link text highlight
  useEffect(() => {
    if (!highlightQuote || !hostRef.current) return;

    const root = hostRef.current;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const target = highlightQuote.trim();
    if (!target) return;

    const findInNode = (node: Text, needle: string) => {
      const hay = node.nodeValue || "";
      const idx = hay.indexOf(needle);
      if (idx >= 0) return { idx, node };
      const idx2 = hay.toLowerCase().indexOf(needle.toLowerCase());
      if (idx2 >= 0) return { idx: idx2, node };
      return null;
    };

    let found: { node: Text; idx: number } | null = null;
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      found = findInNode(n, target);
      if (found) break;
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
    } catch {
      // noop
    }
  }, [highlightQuote]);

  return (
    <>
      <div
        ref={hostRef}
        className="prose max-w-none reading-article"
        data-section-id={section.id}
        data-section-title={section.title}
        data-site-id={site.id}
        data-site-title={site.title}
        style={{ background: "transparent" }}
        dangerouslySetInnerHTML={{ __html: clean }}
      />

      {overlay.visible && overlay.rect && overlay.meta
        ? createPortal(
            <div
              ref={overlayRef}
              style={{
                position: "fixed",
                top: Math.max(8, overlay.rect.top + 8),
                left: overlay.rect.right - 8,
                transform: "translateX(-100%)",
                zIndex: 1000,
                pointerEvents: "auto",
              }}
            >
              <CollectHeart
                variant="icon"
                size={22}
                siteId={site.id}
                imageUrl={overlay.meta.imageUrl}
                altText={overlay.meta.altText}
                caption={overlay.meta.caption}
              />
            </div>,
            document.body
          )
        : null}

      <style jsx global>{`
        .reading-article {
          user-select: text !important;
          -webkit-user-select: text !important;
          cursor: text;
          min-height: 0;
          background: transparent !important;
        }
        .reading-article .hop-article,
        .reading-article .hop-section,
        .reading-article .hop-text,
        .reading-article figure,
        .reading-article .flx-img {
          background: transparent !important;
        }
        .reading-article img,
        .hop-article img {
          -webkit-user-drag: none;
          user-select: none;
        }
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

        /* --------- Fade-in rules --------- */
        .reading-article.reveal-ready .reveal-img,
        .reading-article.reveal-ready .reveal-cap {
          opacity: 0;
          transform: translateY(8px);
          will-change: opacity, transform;
          transition: none;
        }
        .reading-article.reveal-ready.reveal-armed .reveal-img:not(.in-done),
        .reading-article.reveal-ready.reveal-armed .reveal-cap:not(.in-done) {
          transition: opacity 600ms ease, transform 600ms ease;
        }
        .reading-article .reveal-img.in,
        .reading-article .reveal-cap.in {
          opacity: 1;
          transform: translateY(0);
        }
        .reading-article .in.in-done {
          will-change: auto;
        }
      `}</style>
    </>
  );
}
