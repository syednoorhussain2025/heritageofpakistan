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
        className="relative w-full py-2 bg-transparent cursor-pointer group"
      >
        <div className="flex justify-between items-center">
          <span
            className={`truncate ${
              selectedOption ? "text-gray-800" : "text-gray-700"
            }`}
          >
            {selectedOption?.name || placeholder}
          </span>
          <div className="flex items-center">
            {selectedOption && (
              <svg
                onClick={handleReset}
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-2 text-gray-500 hover:text-black"
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
              className={`w-4 h-4 transition-transform text-gray-500 ${
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
          className={`absolute bottom-0 left-0 w-full h-0.5 bg-gray-300 group-hover:bg-[#f78300] transition-all duration-300 ${
            isOpen ? "bg-[#f78300]" : ""
          }`}
        />
      </div>

      <div
        className={`absolute z-20 w-full mt-1 bg-white rounded-lg shadow-2xl max-h-60 overflow-y-auto transition-all duration-300 ease-in-out transform ${
          isOpen
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="p-2">
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-gray-100 rounded-md px-3 py-2 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ul>
          {filteredOptions.map((opt) => (
            <li
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              className="px-4 py-2 cursor-pointer hover:bg-gray-100 transition-colors"
            >
              {opt.name}
            </li>
          ))}
        </ul>
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
        className="relative w-full py-2 bg-transparent cursor-pointer group"
      >
        <div className="flex justify-between items-center">
          <span
            className={`truncate ${
              selectedRegion ? "text-gray-800" : "text-gray-700"
            }`}
          >
            {getDisplayText()}
          </span>
          <div className="flex items-center">
            {selectedRegion && (
              <svg
                onClick={handleReset}
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-2 text-gray-500 hover:text-black"
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
              className={`w-4 h-4 transition-transform text-gray-500 ${
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
          className={`absolute bottom-0 left-0 w-full h-0.5 bg-gray-300 group-hover:bg-[#f78300] transition-all duration-300 ${
            isOpen ? "bg-[#f78300]" : ""
          }`}
        />
      </div>

      <div
        className={`absolute z-20 w-full mt-1 bg-white rounded-lg shadow-2xl max-h-60 overflow-y-auto transition-all duration-300 ease-in-out transform ${
          isOpen
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        {activeParent && (
          <li
            onClick={() => handleSubRegionSelect(activeParent.id)}
            className="px-4 py-2 cursor-pointer hover:bg-gray-100 font-semibold list-none"
          >
            All in "{activeParent.name}"
          </li>
        )}
        <ul>
          {currentOptions.map((opt) => (
            <li
              key={opt.id}
              onClick={() =>
                activeParent
                  ? handleSubRegionSelect(opt.id)
                  : handleParentSelect(opt)
              }
              className="px-4 py-2 cursor-pointer hover:bg-gray-100 transition-colors"
            >
              {opt.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* =========================
   Main Page
========================= */
export default function HomePage() {
  const router = useRouter();

  // data & ui state
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [heroReady, setHeroReady] = useState<boolean>(false); // becomes true once image fully loads

  const [parentRegions, setParentRegions] = useState<Region[]>([]);
  const [subRegions, setSubRegions] = useState<SubRegionsMap>({});
  const [categories, setCategories] = useState<Option[]>([]);

  // search state
  const [regionId, setRegionId] = useState<string>("");
  const [activeParentRegion, setActiveParentRegion] = useState<Region | null>(
    null
  );
  const [categoryId, setCategoryId] = useState<string>("");
  const [q, setQ] = useState<string>("");

  // staged entrance AFTER hero is ready
  const [textVisible, setTextVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  // Load data + preload hero image
  useEffect(() => {
    (async () => {
      try {
        // Fetch hero image URL first
        const { data: gs } = await supabase
          .from("global_settings")
          .select("hero_image_url")
          .limit(1)
          .maybeSingle();

        const nextHero = gs?.hero_image_url ?? null;
        setHeroUrl(nextHero);

        // Preload the hero image, then mark ready
        if (nextHero) {
          const img = new Image();
          img.src = nextHero;
          if (img.complete) {
            setHeroReady(true);
          } else {
            img.onload = () => setHeroReady(true);
            img.onerror = () => setHeroReady(false);
          }
        } else {
          // no hero image—instantly "ready" so content can show
          setHeroReady(true);
        }

        // Fetch filters in parallel (doesn't block hero dissolve)
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

  // Stagger text & search AFTER hero is ready
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
    <div
      className="relative w-full h-screen bg-white"
      // Pull hero up so it begins under the transparent sticky header.
      // Fallback 72px matches Header's SSR fallback.
      style={{ marginTop: "calc(var(--sticky-offset, 72px) * -1)" }}
    >
      {/* White page overlay that dissolves away once the hero is ready */}
      <div
        className={`absolute inset-0 bg-white transition-opacity duration-600 ease-out ${
          heroReady ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        aria-hidden
      />

      {/* Subtle background gradients (visible under the hero during fade) */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(1200px 600px at 20% 20%, rgba(247,131,0,0.18), transparent 60%), radial-gradient(1200px 600px at 80% 80%, rgba(0,0,0,0.18), transparent 55%)",
        }}
      />

      {/* Hero image fades in only after fully loaded */}
      {heroUrl && (
        <img
          src={heroUrl}
          alt="Heritage of Pakistan"
          className={`absolute inset-0 w-full h-full object-cover object-[center_30%] transition-opacity duration-700 ease-out ${
            heroReady ? "opacity-100" : "opacity-0"
          }`}
          draggable={false}
        />
      )}

      {/* Bottom gradient for legibility */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/50 to-transparent" />

      {/* Content */}
      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center px-4">
        {/* Title + Subtitle (fade in after hero) */}
        <div className="w-full max-w-5xl flex flex-col items-center">
          <h1
            className={`text-white text-4xl md:text-6xl font-extrabold text-center drop-shadow-lg transition-all duration-700 ease-out ${
              textVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-3"
            }`}
          >
            Heritage of Pakistan
          </h1>
          <p
            className={`mt-4 text-white/95 text-lg md:text-2xl text-center drop-shadow-md transition-all duration-700 ease-out ${
              textVisible
                ? "opacity-100 translate-y-0 delay-100"
                : "opacity-0 translate-y-3"
            }`}
          >
            Discover, Explore, Preserve
          </p>
        </div>

        {/* Search Bar (fade in after title/subtitle) */}
        <div
          className={`mt-12 w-full max-w-5xl transition-all duration-700 ease-out ${
            searchVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2"
          }`}
        >
          <div className="bg-white/95 backdrop-blur-sm rounded-md shadow-2xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-x-6 gap-y-4 items-center">
              <div className="md:col-span-3">
                <RegionSelect
                  parentRegions={parentRegions}
                  subRegions={subRegions}
                  value={regionId}
                  onChange={setRegionId}
                  activeParent={activeParentRegion}
                  setActiveParent={setActiveParentRegion}
                />
              </div>

              <div className="md:col-span-3">
                <SearchableSelect
                  options={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="Heritage Type"
                />
              </div>

              <div className="md:col-span-4">
                <div className="relative w-full group">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSearch()}
                    placeholder="Search Heritage"
                    className="w-full py-2 bg-transparent text-gray-800 outline-none placeholder-gray-700"
                  />
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-300 group-focus-within:bg-[#f78300] transition-all duration-300" />
                </div>
              </div>

              <div className="md:col-span-2">
                <button
                  onClick={onSearch}
                  className="w-full px-6 py-3 rounded-lg bg-[#f78300] hover:bg-[#e07500] text-white font-semibold transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* End search */}
      </div>
    </div>
  );
}
