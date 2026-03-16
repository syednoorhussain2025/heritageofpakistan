// src/app/page.tsx
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";

/* =========================
   Types
========================= */
type Option = { id: string; name: string };
type Region = { id: string; name: string; parent_id: string | null };
type SubRegionsMap = Record<string, Region[]>;

/* =========================
   Click Outside Hook
========================= */
const useClickOutside = (ref: any, handler: () => void) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
};

/* =========================
   SearchableSelect (Categories)
========================= */
const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const ref = useRef(null);
  useClickOutside(ref, () => setIsOpen(false));

  const filteredOptions = useMemo(
    () =>
      options.filter((opt) =>
        opt.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [options, searchTerm]
  );

  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === value),
    [options, value]
  );

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-full cursor-pointer group"
      >
        <div className="flex items-center justify-between rounded-xl border border-[var(--taupe-grey)] bg-white px-3 py-2 transition focus-within:ring-2 focus-within:ring-[var(--mustard-accent)]">
          <span
            className={`truncate ${
              selectedOption
                ? "text-[var(--dark-grey)]"
                : "text-[var(--espresso-brown)]/70"
            }`}
          >
            {selectedOption?.name || placeholder}
          </span>
          <div className="flex items-center">
            {selectedOption && (
              <svg
                onClick={handleReset}
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2 h-4 w-4 text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            <svg
              className={`h-4 w-4 transition-transform text-[var(--taupe-grey)] ${
                isOpen ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              ></path>
            </svg>
          </div>
        </div>

        <div
          className={`absolute left-0 top-[calc(100%+2px)] w-full rounded-lg bg-white shadow-2xl ring-1 ring-[var(--taupe-grey)] transition-all duration-200 ease-out ${
            isOpen
              ? "opacity-100 translate-y-0"
              : "pointer-events-none opacity-0 -translate-y-1"
          }`}
        >
          <div className="p-2">
            <input
              type="text"
              placeholder="Search…"
              className="w-full rounded-md bg-[var(--ivory-cream)] px-3 py-2 text-[var(--dark-grey)] outline-none focus:ring-2 focus:ring-[var(--mustard-accent)]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {filteredOptions.map((opt) => (
              <li
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                className="cursor-pointer px-4 py-2 text-[var(--dark-grey)] hover:bg-[var(--ivory-cream)]"
              >
                {opt.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

/* =========================
   Cascading RegionSelect
========================= */
const RegionSelect = ({
  parentRegions,
  subRegions,
  value,
  onChange,
  activeParent,
  setActiveParent,
}: {
  parentRegions: Region[];
  subRegions: SubRegionsMap;
  value: string;
  onChange: (value: string) => void;
  activeParent: Region | null;
  setActiveParent: (parent: Region | null) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setIsOpen(false));

  const allRegions = useMemo(
    () => [...parentRegions, ...Object.values(subRegions).flat()],
    [parentRegions, subRegions]
  );
  const selectedRegion = useMemo(
    () => allRegions.find((r) => r.id === value),
    [allRegions, value]
  );

  const handleParentSelect = (parent: Region) => {
    setActiveParent(parent);
    onChange(parent.id);
    setIsOpen(false);
  };

  const handleSubRegionSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setActiveParent(null);
  };

  const getDisplayText = () => {
    if (!selectedRegion) return "Regions";
    if (activeParent && activeParent.id === selectedRegion.id) {
      return `All in "${activeParent.name}"`;
    }
    return selectedRegion.name;
  };

  const currentOptions = activeParent
    ? subRegions[activeParent.id] || []
    : parentRegions;

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-full cursor-pointer group"
      >
        <div className="flex items-center justify-between rounded-xl border border-[var(--taupe-grey)] bg-white px-3 py-2 transition focus-within:ring-2 focus-within:ring-[var(--mustard-accent)]">
          <span
            className={`truncate ${
              selectedRegion
                ? "text-[var(--dark-grey)]"
                : "text-[var(--espresso-brown)]/70"
            }`}
          >
            {getDisplayText()}
          </span>
          <div className="flex items-center">
            {selectedRegion && (
              <svg
                onClick={handleReset}
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2 h-4 w-4 text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            <svg
              className={`h-4 w-4 transition-transform text-[var(--taupe-grey)] ${
                isOpen ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              ></path>
            </svg>
          </div>
        </div>

        <div
          className={`absolute left-0 top-[calc(100%+2px)] w-full rounded-lg bg-white shadow-2xl ring-1 ring-[var(--taupe-grey)] transition-all duration-200 ease-out ${
            isOpen
              ? "opacity-100 translate-y-0"
              : "pointer-events-none opacity-0 -translate-y-1"
          }`}
        >
          {activeParent && (
            <li
              onClick={() => handleSubRegionSelect(activeParent.id)}
              className="list-none cursor-pointer px-4 py-2 font-semibold text-[var(--navy-deep)] hover:bg-[var(--ivory-cream)]"
            >
              All in "{activeParent.name}"
            </li>
          )}
          <ul className="max-h-60 overflow-y-auto">
            {currentOptions.map((opt) => (
              <li
                key={opt.id}
                onClick={() =>
                  activeParent
                    ? handleSubRegionSelect(opt.id)
                    : handleParentSelect(opt)
                }
                className="cursor-pointer px-4 py-2 text-[var(--dark-grey)] hover:bg-[var(--ivory-cream)]"
              >
                {opt.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

/* =========================
   Main Page (split layout)
========================= */
const heroImages = [
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/d4fe2137-78ff-4e17-b7c6-f4b41cad31a8/1771660133978-Islamia%20College%20Peshawar-34.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/04da125d-4c2b-4be6-a112-e52b87f1629a/1771569291072-birds-flying-badshahi-mosque.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/da973cff-1bff-45f8-a13d-38e2af239691/1771663260542-Khaplu%20Palace-20.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/3567294c-1090-43e7-8c2d-6676e5b9ea54/1771680261029-Malam%20Jabba-103.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/c7ffcc06-e765-4e4e-a6ad-cffc2fc1b441/1771690397771-Royal%20Garden%20Altit-8.jpg",
];

export default function HomeClient() {
  const router = useRouter();

  const [heroReady, setHeroReady] = useState<boolean>(false);
  const [heroIndex, setHeroIndex] = useState(0);

  const [parentRegions, setParentRegions] = useState<Region[]>([]);
  const [subRegions, setSubRegions] = useState<SubRegionsMap>({});
  const [categories, setCategories] = useState<Option[]>([]);

  const [regionId, setRegionId] = useState<string>("");
  const [activeParentRegion, setActiveParentRegion] = useState<Region | null>(
    null
  );
  const [categoryId, setCategoryId] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const [textVisible, setTextVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Preload the first hero image
        const img = new Image();
        img.src = heroImages[0];
        if (img.complete) setHeroReady(true);
        else {
          img.onload = () => setHeroReady(true);
          img.onerror = () => setHeroReady(true);
        }

        const [{ data: regData }, { data: catData }] = await Promise.all([
          supabase
            .from("regions")
            .select("id,name,parent_id")
            .order("name", { ascending: true }),
          supabase
            .from("categories")
            .select("id,name")
            .order("name", { ascending: true }),
        ]);

        const allRegions = (regData as Region[]) || [];
        setParentRegions(allRegions.filter((r) => r.parent_id === null));
        setSubRegions(
          allRegions.reduce<SubRegionsMap>((acc, r) => {
            if (r.parent_id) {
              if (!acc[r.parent_id]) acc[r.parent_id] = [];
              acc[r.parent_id].push(r);
            }
            return acc;
          }, {})
        );
        setCategories((catData as Option[]) || []);
      } catch (e) {
        console.error("Error fetching initial data:", e);
      }
    })();
  }, []);

  // Mark body so CSS can strip header items on mobile homepage only
  useEffect(() => {
    document.body.dataset.page = "home";
    return () => { delete document.body.dataset.page; };
  }, []);

  useEffect(() => {
    if (!heroReady) return;
    const t1 = setTimeout(() => setTextVisible(true), 150);
    const t2 = setTimeout(() => setSearchVisible(true), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [heroReady]);

  // Crossfade slideshow
  useEffect(() => {
    if (!heroReady) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroReady]);

  function onSearch() {
    setSearching(true);
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (categoryId) sp.set("cats", categoryId);
    if (regionId) sp.set("regs", regionId);
    const href = `/explore?${sp.toString()}`;
    try { router.push(href); } catch { window.location.href = href; }
  }

  return (
    <main className="w-full">
      {/* Global palette */}
      <style jsx global>{`
        :root {
          --navy-deep: var(--brand-blue);
          --sand-gold: var(--brand-orange);
          --espresso-brown: #4b2e05;
          --ivory-cream: #ffffff;
          --taupe-grey: #d4d4d4;
          --terracotta-red: var(--brand-orange);
          --mustard-accent: var(--brand-orange);
          --olive-green: #7b6e3f;
          --dark-grey: #2b2b2b;
        }
        button,
        input {
          outline: none !important;
        }
        /* ── Homepage mobile: keep only burger in header; hide bottom nav ── */
        @media (max-width: 767px) {
          body[data-page="home"],
          html:has(body[data-page="home"]) {
            overflow: hidden !important;
            position: fixed !important;
            width: 100% !important;
            height: 100% !important;
            background-color: black !important;
          }
          /* Make bounce overscroll areas black instead of white */
          html:has(body[data-page="home"])::before,
          html:has(body[data-page="home"])::after {
            content: '';
            display: block;
            position: fixed;
            left: 0;
            right: 0;
            height: 50vh;
            background: black;
            z-index: -1;
          }
          html:has(body[data-page="home"])::before { top: -50vh; }
          html:has(body[data-page="home"])::after  { bottom: -50vh; }
        }
      `}</style>

      {/* ── MOBILE LAYOUT ── */}
      <div
        className="md:hidden relative flex flex-col items-center justify-center"
        style={{
          height: "100dvh",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Black backdrop — prevents body/html background from showing during transitions */}
        <div className="fixed inset-0 bg-black z-[2999]" />

        {/* Hero slideshow — fixed above bottom nav (z-[3000]) */}
        {heroImages.map((src, i) => (
          <img
            key={src}
            src={src}
            alt="Heritage of Pakistan"
            className={`fixed inset-0 h-full w-full object-cover object-[center_30%] transition-opacity duration-1000 ease-in-out z-[3001] ${
              heroReady && i === heroIndex ? "opacity-100" : "opacity-0"
            }`}
            draggable={false}
          />
        ))}
        {/* Gradient overlay */}
        <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/40 pointer-events-none z-[3002]" />

        {/* Slide indicators — mobile */}
        <div
          className="fixed left-0 right-0 bottom-56 z-[3003] flex justify-center gap-2 px-4"
          aria-label="Slideshow"
        >
          {heroImages.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setHeroIndex(i)}
              aria-label={`Go to slide ${i + 1} of ${heroImages.length}`}
              aria-current={i === heroIndex ? "true" : undefined}
              className={`rounded-full transition-all duration-300 ${
                i === heroIndex
                  ? "h-2.5 w-2.5 bg-white shadow-md"
                  : "h-2 w-2 bg-white/50 hover:bg-white/70"
              }`}
            />
          ))}
        </div>

        {/* Centred content: title + search card */}
        <div className="relative z-[3003] w-full px-5 flex flex-col gap-4 mt-32">
          {/* Title */}
          <div
            className={`text-center transition-all duration-700 ease-out ${
              textVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <h1 className="text-[2.6rem] font-black leading-[1.1] text-white drop-shadow-lg">
              Heritage of<br />Pakistan
            </h1>
            <p className="mt-2 text-lg text-white/90 italic tracking-wide drop-shadow">
              Discover, Explore, Preserve
            </p>
          </div>

          {/* Search card */}
          <div
            className={`bg-white rounded-2xl px-4 pt-4 pb-4 shadow-2xl transition-all duration-700 ease-out ${
              searchVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                placeholder="Search Heritage"
                className="w-full rounded-xl border border-[var(--taupe-grey)] bg-white px-3 py-2 text-[var(--dark-grey)] placeholder-[var(--espresso-brown)]/60 transition focus:border-[var(--mustard-accent)] focus:ring-2 focus:ring-[var(--mustard-accent)]"
              />
              <RegionSelect
                parentRegions={parentRegions}
                subRegions={subRegions}
                value={regionId}
                onChange={setRegionId}
                activeParent={activeParentRegion}
                setActiveParent={setActiveParentRegion}
              />
              <SearchableSelect
                options={categories}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Heritage Type"
              />
              <button
                type="button"
                onClick={onSearch}
                disabled={searching}
                className="w-full rounded-xl bg-[var(--terracotta-red)] py-3 font-semibold text-white transition hover:opacity-95 active:opacity-90 disabled:opacity-80 disabled:cursor-not-allowed disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {searching ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
                    Searching…
                  </>
                ) : (
                  "Search"
                )}
              </button>
            </div>

          </div>

          {/* Auth actions — outside the card */}
          <div className="flex items-center justify-center gap-3">
            <a
              href="/auth/sign-in"
              className="rounded-lg bg-[var(--brand-orange)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 active:opacity-90"
            >
              Sign in
            </a>
            <span className="text-white/60 text-sm">or</span>
            <a
              href="/auth/sign-up"
              className="text-sm font-semibold text-white underline decoration-white/60 underline-offset-2 drop-shadow hover:opacity-80"
            >
              Create an account
            </a>
          </div>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div
        className="hidden md:grid min-h-screen w-full grid-cols-2"
        style={{ marginTop: "calc(var(--sticky-offset, 72px) * -1)" }}
      >
        {/* LEFT: Hero slideshow */}
        <div className="relative">
          {heroImages.map((src, i) => (
            <img
              key={src}
              src={src}
              alt="Heritage of Pakistan"
              className={`absolute inset-0 h-full w-full object-cover object-[center_30%] transition-opacity duration-1000 ease-in-out ${
                heroReady && i === heroIndex ? "opacity-100" : "opacity-0"
              }`}
              draggable={false}
            />
          ))}
          {/* Slide indicators — desktop */}
          <div
            className="absolute bottom-6 left-0 right-0 z-10 flex justify-center gap-2"
            aria-label="Slideshow"
          >
            {heroImages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHeroIndex(i)}
                aria-label={`Go to slide ${i + 1} of ${heroImages.length}`}
                aria-current={i === heroIndex ? "true" : undefined}
                className={`rounded-full transition-all duration-300 ${
                  i === heroIndex
                    ? "h-2.5 w-2.5 bg-white shadow-md"
                    : "h-2 w-2 bg-white/50 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        </div>

        {/* RIGHT: Ivory panel */}
        <div className="relative flex h-full items-center justify-center overflow-hidden bg-[var(--ivory-cream)] px-6 py-10 md:px-10">
          <div className="relative z-10 w-full max-w-3xl">
            {/* Title */}
            <header
              className={`mb-6 text-left transition-all duration-700 ease-out ${
                textVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2"
              }`}
            >
              <h1 className="text-4xl font-black leading-tight text-[var(--brand-blue)] md:text-5xl">
                Heritage of Pakistan
              </h1>
              <p className="mt-1 text-base text-[var(--brand-grey)] md:text-lg">
                Discover, Explore, Preserve
              </p>
              <div className="mt-3 h-[3px] w-16 rounded bg-[var(--sand-gold)]" />
            </header>

            {/* Search card */}
            <section
              className={`transition-all duration-700 ease-out ${
                searchVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-1"
              }`}
            >
              <div className="rounded-md bg-white p-4 border border-[var(--taupe-grey)] shadow-md">
                {/* ROW 1: Search input + Button */}
                <div className="mb-4 grid grid-cols-12 items-center gap-3">
                  <div className="col-span-10">
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && onSearch()}
                      placeholder="Search Heritage"
                      className="w-full rounded-md border border-[var(--taupe-grey)] bg-white px-3 py-2 text-[var(--dark-grey)] outline-none placeholder-[var(--espresso-brown)]/60 transition focus:border-[var(--mustard-accent)] focus:ring-2 focus:ring-[var(--mustard-accent)]"
                    />
                  </div>
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={onSearch}
                      disabled={searching}
                      className="w-full rounded-lg bg-[var(--terracotta-red)] px-6 py-3 font-semibold text-white transition hover:opacity-95 focus:ring-2 focus:ring-[var(--mustard-accent)] active:opacity-90 disabled:opacity-80 disabled:cursor-not-allowed disabled:pointer-events-none flex items-center justify-center gap-2"
                    >
                      {searching ? (
                        <>
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
                          Searching…
                        </>
                      ) : (
                        "Search"
                      )}
                    </button>
                  </div>
                </div>

                {/* ROW 2: Region, Category */}
                <div className="grid grid-cols-2 gap-3">
                  <RegionSelect
                    parentRegions={parentRegions}
                    subRegions={subRegions}
                    value={regionId}
                    onChange={setRegionId}
                    activeParent={activeParentRegion}
                    setActiveParent={setActiveParentRegion}
                  />
                  <SearchableSelect
                    options={categories}
                    value={categoryId}
                    onChange={setCategoryId}
                    placeholder="Heritage Type"
                  />
                </div>
              </div>

              <p className="mt-3 text-xs text-[var(--espresso-brown)]/70">
                Tip: Choose a region and heritage type, or search directly by name.
              </p>

              <div className="mt-8 flex items-center gap-3 text-sm">
                <a
                  href="/auth/sign-in"
                  className="inline-flex items-center rounded-lg bg-[var(--brand-orange)] px-5 py-2.5 font-semibold text-white shadow-lg transition hover:opacity-95 focus:ring-2 focus:ring-[var(--brand-orange)] active:opacity-90"
                  aria-label="Sign in"
                >
                  Sign in
                </a>
                <span className="text-[var(--brand-grey)]/60">or</span>
                <a
                  href="/auth/sign-up"
                  className="font-semibold text-[var(--brand-orange)] underline decoration-[var(--brand-orange)] underline-offset-2 hover:opacity-90"
                >
                  Create an account
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
