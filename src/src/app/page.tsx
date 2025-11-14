// src/app/page.tsx
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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
        <div className="flex items-center justify-between rounded-md border border-[var(--taupe-grey)] bg-white px-3 py-2 transition focus-within:ring-2 focus-within:ring-[var(--mustard-accent)]">
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
        <div className="flex items-center justify-between rounded-md border border-[var(--taupe-grey)] bg-white px-3 py-2 transition focus-within:ring-2 focus-within:ring-[var(--mustard-accent)]">
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
export default function HomePage() {
  const router = useRouter();

  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [heroReady, setHeroReady] = useState<boolean>(false);

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

  useEffect(() => {
    (async () => {
      try {
        // Fetch (kept for parity with your flow), but we will use the fixed hero below.
        const { data: gs } = await supabase
          .from("global_settings")
          .select("hero_image_url")
          .limit(1)
          .maybeSingle();

        // Force the hero to your provided image URL (without removing any of your existing logic)
        const fixedHero =
          "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/Photos/mughalminiature.jfif";
        setHeroUrl(fixedHero);

        // Preload the fixed hero and then mark ready
        const img = new Image();
        img.src = fixedHero;
        if (img.complete) setHeroReady(true);
        else {
          img.onload = () => setHeroReady(true);
          img.onerror = () => setHeroReady(false);
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

  useEffect(() => {
    if (!heroReady) return;
    const t1 = setTimeout(() => setTextVisible(true), 150);
    const t2 = setTimeout(() => setSearchVisible(true), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [heroReady]);

  function onSearch() {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (categoryId) sp.set("cats", categoryId);
    if (regionId) sp.set("regs", regionId);
    router.push(`/explore?${sp.toString()}`);
  }

  return (
    <main className="w-full">
      {/* Global palette */}
      <style jsx global>{`
        :root {
          --navy-deep: #1c1f4c;
          --sand-gold: #c7a76b;
          --espresso-brown: #4b2e05;
          --ivory-cream: #faf7f2;
          --taupe-grey: #d8cfc4;
          --terracotta-red: #a9502a;
          --mustard-accent: #e2b65c;
          --olive-green: #7b6e3f;
          --dark-grey: #2b2b2b;
          --sticky-offset: 72px; /* used to pull the grid under your sticky header */
        }
        button,
        input {
          outline: none !important;
        }
      `}</style>

      {/* Split layout pulled up under sticky header to remove top gap */}
      <div
        className="grid min-h-screen w-full grid-cols-1 md:grid-cols-2"
        style={{ marginTop: "calc(var(--sticky-offset, 72px) * -1)" }}
      >
        {/* LEFT: Hero image (flush to top) */}
        <div className="relative hidden md:block">
          {heroUrl && (
            <img
              src={heroUrl}
              alt="Heritage of Pakistan"
              className={`absolute inset-0 h-full w-full object-cover object-[center_30%] transition-opacity duration-700 ease-out ${
                heroReady ? "opacity-100" : "opacity-0"
              }`}
              draggable={false}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(169,80,42,0.28) 0%, rgba(250,247,242,0) 55%)",
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
        </div>

        {/* RIGHT: Ivory panel */}
        <div className="relative flex h-full items-center justify-center overflow-hidden bg-[var(--ivory-cream)] px-6 py-10 md:px-10">
          {/* Optional decorative motifs */}
          <img
            src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif.png"
            alt=""
            className="pointer-events-none absolute -top-6 -left-4 w-40 select-none opacity-15 md:w-56"
            style={{ transform: "rotate(-6deg)" }}
          />
          <img
            src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif%20(2).png"
            alt=""
            className="pointer-events-none absolute -top-8 -right-4 w-40 select-none opacity-15 md:w-56"
            style={{ transform: "rotate(6deg)" }}
          />

          <div className="relative z-10 w-full max-w-3xl">
            {/* Title */}
            <header
              className={`mb-6 text-center md:text-left transition-all duration-700 ease-out ${
                textVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2"
              }`}
            >
              <h1 className="text-4xl font-black leading-tight text-[var(--dark-grey)] md:text-5xl">
                Heritage of Pakistan
              </h1>
              <p className="mt-1 text-base text-[var(--espresso-brown)]/85 md:text-lg">
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
              <div className="rounded-md bg-white p-4 shadow-2xl ring-1 ring-[var(--taupe-grey)]">
                {/* ROW 1: Search input + Button (inline) */}
                <div className="mb-4 grid grid-cols-1 items-center gap-3 md:grid-cols-12">
                  <div className="md:col-span-10">
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && onSearch()}
                      placeholder="Search Heritage"
                      className="w-full rounded-md border border-[var(--taupe-grey)] bg-white px-3 py-2 text-[var(--dark-grey)] outline-none placeholder-[var(--espresso-brown)]/60 transition focus:border-[var(--mustard-accent)] focus:ring-2 focus:ring-[var(--mustard-accent)]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      onClick={onSearch}
                      className="w-full transform rounded-lg bg-[var(--terracotta-red)] px-6 py-3 font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:opacity-95 focus:ring-2 focus:ring-[var(--mustard-accent)] active:opacity-90"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {/* ROW 2: Region, Category */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                Tip: Choose a region and heritage type, or search directly by
                name.
              </p>

              {/* Auth actions moved slightly down; Sign in as button */}
              <div className="mt-8 flex items-center gap-3 text-sm">
                <a
                  href="http://localhost:3000/auth/sign-in"
                  className="inline-flex items-center rounded-lg bg-[var(--terracotta-red)] px-5 py-2.5 font-semibold text-white shadow-lg transition hover:opacity-95 focus:ring-2 focus:ring-[var(--mustard-accent)] active:opacity-90"
                  aria-label="Sign in"
                >
                  Sign in
                </a>
                <span className="text-[var(--espresso-brown)]/60">or</span>
                <a
                  href="http://localhost:3000/auth/sign-up"
                  className="font-semibold text-[var(--terracotta-red)] underline decoration-[var(--sand-gold)] underline-offset-2 hover:opacity-90"
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
