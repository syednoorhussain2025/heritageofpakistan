// src/app/heritage/[slug]/story/page.tsx
"use client";

// No changes needed to your imports or type definitions
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Site = {
  id: string;
  slug: string;
  title: string;
  tagline?: string | null;
};

type PhotoStory = {
  site_id: string;
  hero_photo_url?: string | null;
  subtitle?: string | null;
};

type PhotoStoryItem = {
  id: string;
  site_id: string;
  image_url?: string | null;
  text_block?: string | null;
  sort_order: number;
};

/* ───────────── Skeletons (No Changes Needed) ───────────── */
// ... (Your skeleton components remain the same) ...

function SkBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-white/10 ${className}`}
      aria-hidden
    />
  );
}

function TopBarSkeleton() {
  return (
    <div className="w-full px-6 py-2 bg-black">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <SkBar className="h-6 w-56" />
          <SkBar className="h-4 w-48" />
        </div>
        <SkBar className="h-8 w-40 rounded" />
      </div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <section className="mb-12">
      <SkBar className="w-full h-screen" />
    </section>
  );
}

function ItemImageSkeleton() {
  return (
    <section className="mb-12">
      <SkBar className="w-full h-screen" />
      <SkBar className="h-4 w-64 mx-auto mt-3 rounded" />
    </section>
  );
}

function ItemTextSkeleton() {
  return (
    <section className="mb-12">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-3">
        <SkBar className="h-4 w-full rounded" />
        <SkBar className="h-4 w-5/6 rounded" />
        <SkBar className="h-4 w-2/3 rounded" />
      </div>
    </section>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-black text-white">
      <TopBarSkeleton />
      <HeroSkeleton />
      <div className="w-full">
        <ItemImageSkeleton />
        <ItemTextSkeleton />
        <ItemImageSkeleton />
      </div>
    </div>
  );
}

// NEW: A simple, reusable Camera Icon component
const CameraIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-5 h-5 inline-block mx-1.5"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M1 8a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 018.07 3h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0016.07 6H17a2 2 0 012 2v7a2 2 0 01-2 2H3a2 2 0 01-2-2V8zm13.5 3a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM10 14a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
      clipRule="evenodd"
    />
  </svg>
);

/* ───────────── Page Component ───────────── */

export default function SitePhotoStoryPage() {
  const params = useParams();
  const slug = (params?.slug as string) ?? "";

  const [site, setSite] = useState<Site | null>(null);
  const [story, setStory] = useState<PhotoStory | null>(null);
  const [items, setItems] = useState<PhotoStoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const heroImgRef = useRef<HTMLImageElement | null>(null);

  // NEW: State to track scroll position for header background
  const [isScrolled, setIsScrolled] = useState(false);

  // NEW: Effect to handle header background visibility on scroll
  useEffect(() => {
    const handleScroll = () => {
      // Set state to true if user has scrolled more than 10px, otherwise false
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    // Clean up the event listener on component unmount
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // ... (All your other useEffect hooks for data fetching, parallax, etc. remain the same) ...

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: s, error: siteErr } = await supabase
        .from("sites")
        .select("id, slug, title, tagline")
        .eq("slug", slug)
        .single();
      if (!s || siteErr) {
        setLoading(false);
        return;
      }
      setSite(s as Site);
      const { data: st } = await supabase
        .from("photo_stories")
        .select("site_id, hero_photo_url, subtitle")
        .eq("site_id", s.id)
        .maybeSingle();
      setStory((st as PhotoStory) || null);
      const { data: itms } = await supabase
        .from("photo_story_items")
        .select("id, site_id, image_url, text_block, sort_order")
        .eq("site_id", s.id)
        .order("sort_order", { ascending: true });
      setItems((itms as PhotoStoryItem[]) || []);
      setLoading(false);
    })();
  }, [slug]);

  /* ===== Stronger Parallax + entrance ===== */
  useEffect(() => {
    document.documentElement.classList.add("story-mounted");
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const img = heroImgRef.current;
        if (!img) return;
        const parentRect = img.parentElement?.getBoundingClientRect();
        if (!parentRect) return;
        const viewportH = window.innerHeight;
        const centerOffset =
          parentRect.top + parentRect.height / 2 - viewportH / 2;
        const translateY = -centerOffset * 0.32; // stronger parallax
        img.style.transform = `translateY(${translateY}px) scale(1.14)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.classList.remove("story-mounted");
    };
  }, [story?.hero_photo_url]);

  /* ===== IntersectionObserver for initial fade-ins ===== */
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach(
          (e) => e.isIntersecting && e.target.classList.add("in-view")
        ),
      { root: null, threshold: 0.25 }
    );
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(".js-animate")
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length, story?.hero_photo_url]);

  /* ===== Predictable auto-snap: IO with 10% rule, direction-aware, no self, hero excluded ===== */
  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(".story-snap")
    );
    if (!sections.length) return;
    const vh = () => window.innerHeight;
    const markCentered = () => {
      let idx = -1;
      let bestD = Infinity;
      sections.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - vh() / 2);
        if (d < bestD) {
          bestD = d;
          idx = i;
        }
      });
      const tol = Math.max(24, vh() * 0.06);
      sections.forEach((el, i) => {
        if (i === idx && bestD <= tol) el.classList.add("centered");
        else el.classList.remove("centered");
      });
    };
    const scrollToCenter = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const target = window.scrollY + rect.top + rect.height / 2 - vh() / 2;
      autoScrolling = true;
      window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      window.setTimeout(() => {
        autoScrolling = false;
        markCentered();
      }, 520);
    };
    let autoScrolling = false;
    let lastY = window.scrollY;
    let lastDir: "down" | "up" = "down";
    let lastSnapIdx = -1;
    let lastSnapAt = 0;
    const cooldownMs = 650;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY) lastDir = "down";
      else if (y < lastY) lastDir = "up";
      lastY = y;
      requestAnimationFrame(markCentered);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => {
        if (autoScrolling) return;
        const now = performance.now();
        let currentIdx = -1;
        const viewportCenter = window.innerHeight / 2;
        if (lastDir === "down") {
          let lastFoundIdx = -1;
          for (let i = 0; i < sections.length; i++) {
            const rect = sections[i].getBoundingClientRect();
            const elCenter = rect.top + rect.height / 2;
            if (elCenter < viewportCenter) {
              lastFoundIdx = i;
            } else {
              break;
            }
          }
          currentIdx = lastFoundIdx;
        } else {
          let firstFoundIdx = -1;
          for (let i = 0; i < sections.length; i++) {
            const rect = sections[i].getBoundingClientRect();
            const elCenter = rect.top + rect.height / 2;
            if (elCenter > viewportCenter) {
              firstFoundIdx = i;
              break;
            }
          }
          currentIdx = firstFoundIdx;
        }
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.1) continue;
          const idx = sections.indexOf(e.target as HTMLElement);
          const expectedIdx =
            lastDir === "down" ? currentIdx + 1 : currentIdx - 1;
          if (
            idx === expectedIdx &&
            idx !== currentIdx &&
            (idx !== lastSnapIdx || now - lastSnapAt > cooldownMs)
          ) {
            lastSnapIdx = idx;
            lastSnapAt = now;
            scrollToCenter(sections[idx]);
            break;
          }
        }
      },
      { threshold: [0.1] }
    );
    sections.forEach((el) => io.observe(el));
    markCentered();
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [items.length]);

  if (loading) return <PageSkeleton />;
  if (!site)
    return (
      <div className="min-h-screen bg-black text-white p-6">Not found.</div>
    );

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Page-scoped styles (no changes needed) */}
      <style jsx global>{`
        /* Hide global site header */
        body > header,
        header.site-header,
        #__next > header,
        [data-global-header] {
          display: none !important;
        }
        html {
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }
        .will-fade {
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 700ms ease, transform 700ms ease;
        }
        .in-view .will-fade {
          opacity: 1;
          transform: translateY(0);
        }
        .caption-fade {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 500ms ease, transform 500ms ease;
        }
        .centered .caption-fade {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 160ms; /* after image is centered */
        }
        .hero-wrap .hero-title,
        .hero-wrap .hero-gradient {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 800ms ease 80ms, transform 800ms ease 80ms;
        }
        .story-mounted .hero-wrap .hero-title,
        .story-mounted .hero-wrap .hero-gradient {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>

      {/* ===== UPDATED HEADER ===== */}
      <header
        className={`
          fixed top-0 z-50 w-full px-6 py-3
          transition-colors duration-500 ease-in-out
          ${isScrolled ? "bg-transparent" : "bg-black/80 backdrop-blur-sm"}
        `}
      >
        <div className="flex items-center justify-between gap-4 max-w-screen-2xl mx-auto">
          {/* Left Side: Title: Subtitle */}
          <div className="flex-shrink-0 min-w-0">
            <h1 className="text-base md:text-lg font-semibold truncate">
              {site.title}
              {story?.subtitle && (
                <span className="ml-2 font-normal opacity-80 hidden md:inline">
                  : {story.subtitle}
                </span>
              )}
            </h1>
          </div>

          {/* Right Side: Branding */}
          <div className="hidden sm:flex items-center gap-1 text-xs md:text-sm font-medium whitespace-nowrap opacity-90">
            <span>HERITAGE OF PAKISTAN</span>
            <CameraIcon />
            <span>Photo Story</span>
          </div>
        </div>
      </header>

      {/* ... (The rest of your page content, Hero, Items, etc. remains the same) ... */}

      {/* Hero (excluded from auto-snap) */}
      {story?.hero_photo_url ? (
        <section className="relative mb-12 h-screen w-full overflow-hidden js-animate hero-wrap">
          <img
            ref={heroImgRef}
            src={story.hero_photo_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover will-change-transform"
            loading="eager"
            decoding="async"
            style={{ transform: "translateY(0px) scale(1.14)" }}
          />
          <div className="hero-gradient absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
          <div className="relative z-10 h-full w-full flex items-center justify-center px-6 text-center">
            <div className="max-w-5xl">
              <div className="hero-title">
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
                  {site.title}
                </h1>

                {story?.subtitle ? (
                  <p className="mt-2 text-xl md:text-2xl font-light opacity-90">
                    {story.subtitle}
                  </p>
                ) : null}

                {site?.tagline ? (
                  <p className="mt-6 text-lg md:text-xl font-medium italic opacity-80 max-w-2xl mx-auto">
                    "{site.tagline}"
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Items: image fades on view; caption waits until centered (with delay) */}
      <div className="w-full">
        {items.length === 0 ? (
          <p className="text-center py-20">No photo story items added yet.</p>
        ) : (
          items.map((it) => {
            const hasImg = !!it.image_url;
            const hasText = !!it.text_block;

            if (hasImg) {
              return (
                <section key={it.id} className="mb-12 story-snap js-animate">
                  <figure className="relative">
                    <div className="relative w-full h-screen">
                      <img
                        src={it.image_url as string}
                        alt={it.text_block || ""}
                        className="w-full h-full object-cover will-fade"
                        loading="lazy"
                      />
                      {/* Bottom gradient for readability */}
                      <div className="will-fade pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                      {hasText ? (
                        <figcaption className="caption-fade absolute inset-x-0 bottom-0 z-10 p-6 md:p-10">
                          <div className="max-w-5xl mx-auto text-center text-white text-2xl md:text-4xl font-semibold leading-tight">
                            {it.text_block}
                          </div>
                        </figcaption>
                      ) : null}
                    </div>
                  </figure>
                </section>
              );
            }

            // Text-only block: also wait for centering before showing
            return (
              <section key={it.id} className="mb-12 story-snap js-animate">
                <div className="caption-fade max-w-3xl mx-auto px-6 text-center text-white text-base md:text-lg leading-relaxed">
                  {it.text_block}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
