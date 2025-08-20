// src/components/Header.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  FaHome,
  FaMapMarkerAlt,
  FaLandmark,
  FaSearch,
  FaMap,
  FaListUl,
  FaMountain,
  FaUniversity,
  FaWater,
  FaPlaceOfWorship,
  FaMosque,
  FaCross,
  FaChurch,
  FaGopuram,
  FaUmbrellaBeach,
  FaTree,
} from "react-icons/fa";

/* ---------- Styling helpers ---------- */
const iconColor = "text-orange-500";

/* ---------- Static menus ---------- */
const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Gilgit Baltistan",
  "Azad Kashmir",
];

const QUICK_CATEGORIES = [
  "Mountains & Valleys",
  "Architecture",
  "Forts & Palaces",
  "Waterbodies",
  "Tombs & Sufi Shrines",
  "Archaeological Sites",
  "Mosques",
  "Temples",
  "Churches",
  "Gurdwaras",
  "Deserts",
  "Beaches",
  "Parks & Gardens",
];

/* ---------- Types ---------- */
type Simple = { id: string; name: string };
type Site = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
};

/* ---------- Utils ---------- */
function useDebounced<T>(value: T, delay = 250) {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
}

export default function Header() {
  const router = useRouter();

  /* ----- Lookup IDs for nicer /explore links ----- */
  const [regions, setRegions] = useState<Simple[]>([]);
  const [categories, setCategories] = useState<Simple[]>([]);
  useEffect(() => {
    (async () => {
      const [{ data: rs }, { data: cs }] = await Promise.all([
        supabase.from("regions").select("id,name"),
        supabase.from("categories").select("id,name"),
      ]);
      setRegions(
        ((rs as any[]) || []).map((r) => ({ id: r.id, name: r.name }))
      );
      setCategories(
        ((cs as any[]) || []).map((c) => ({ id: c.id, name: c.name }))
      );
    })();
  }, []);
  const nameToId = useMemo(
    () => ({
      region: (n: string) =>
        regions.find((r) => r.name.toLowerCase() === n.toLowerCase())?.id,
      category: (n: string) =>
        categories.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id,
    }),
    [regions, categories]
  );

  /* ----- Quick search with suggestions ----- */
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [suggestions, setSuggestions] = useState<Site[]>([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dq.trim()) {
        setSuggestions([]);
        return;
      }
      const { data } = await supabase
        .from("sites")
        .select("id,slug,title,cover_photo_url")
        .ilike("title", `%${dq.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!cancelled) setSuggestions(((data as any[]) || []) as Site[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  // Close suggestions on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!suggestRef.current) return;
      if (!suggestRef.current.contains(e.target as Node)) {
        setOpenSuggest(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const submitQuickSearch = () => {
    if (!q.trim()) return;
    router.push(`/explore?q=${encodeURIComponent(q.trim())}`);
    setOpenSuggest(false);
  };

  /* ----- Menus with hover-intent (no jumpiness) ----- */
  const [regionsOpen, setRegionsOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const regionsTimer = useRef<number | null>(null);
  const catsTimer = useRef<number | null>(null);

  const openWithDelay = (which: "regions" | "cats") => {
    const setOpen = which === "regions" ? setRegionsOpen : setCatsOpen;
    const timerRef = which === "regions" ? regionsTimer : catsTimer;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(true), 120); // small delay to open
  };
  const closeWithDelay = (which: "regions" | "cats") => {
    const setOpen = which === "regions" ? setRegionsOpen : setCatsOpen;
    const timerRef = which === "regions" ? regionsTimer : catsTimer;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(false), 180); // slightly longer to close
  };

  const goExploreRegion = (name: string) => {
    const id = nameToId.region(name);
    if (id) router.push(`/explore?regs=${id}`);
    else router.push(`/explore?q=${encodeURIComponent(name)}`);
    setRegionsOpen(false);
  };

  const goExploreCategory = (name: string) => {
    const id = nameToId.category(name);
    if (id) router.push(`/explore?cats=${id}`);
    else router.push(`/explore?q=${encodeURIComponent(name)}`);
    setCatsOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur">
      <div className="max-w-[1400px] mx-auto px-4 py-2 flex items-center gap-3">
        {/* Brand */}
        <Link
          href="/"
          className="whitespace-nowrap font-extrabold text-teal-600 tracking-wide text-xl"
        >
          HERITAGE OF PAKISTAN
        </Link>

        {/* Quick Search */}
        <div className="relative flex-1 max-w-2xl" ref={suggestRef}>
          <div className="flex items-center gap-2 border rounded-full px-3 py-1.5 bg-white shadow-sm">
            <FaSearch className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpenSuggest(true);
              }}
              onKeyDown={(e) => e.key === "Enter" && submitQuickSearch()}
              placeholder="Search Heritage"
              className="w-full outline-none text-sm"
            />
          </div>

          {/* Suggestion dropdown */}
          {openSuggest && suggestions.length > 0 && (
            <div
              className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg overflow-hidden
                         transition ease-out duration-150"
            >
              {suggestions.map((s) => (
                <Link
                  key={s.id}
                  href={`/heritage/${s.slug}`}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50"
                  onClick={() => setOpenSuggest(false)}
                >
                  {s.cover_photo_url ? (
                    <img
                      src={s.cover_photo_url}
                      alt={s.title}
                      className="w-10 h-10 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded" />
                  )}
                  <span className="text-sm">{s.title}</span>
                </Link>
              ))}
              <button
                onClick={submitQuickSearch}
                className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-gray-50"
              >
                See more results for “{q}”
              </button>
            </div>
          )}
        </div>

        {/* Right nav */}
        <nav className="hidden md:flex items-center gap-4 text-[15px]">
          <Link
            href="/"
            className="hover:text-orange-600 flex items-center gap-1"
          >
            <FaHome className={iconColor} />
            <span>Home</span>
          </Link>

          {/* Regions menu (hover intent + smooth transition) */}
          <div
            className="relative"
            onMouseEnter={() => openWithDelay("regions")}
            onMouseLeave={() => closeWithDelay("regions")}
          >
            <button className="hover:text-orange-600 flex items-center gap-1">
              <FaMapMarkerAlt className={iconColor} />
              <span>Regions</span>
              <span className="ml-1">▾</span>
            </button>
            <div
              className={`absolute right-0 mt-2 w-60 bg-white border rounded-xl shadow-lg p-2
                          transition-all duration-200 ease-out
                          ${
                            regionsOpen
                              ? "opacity-100 translate-y-0 pointer-events-auto"
                              : "opacity-0 -translate-y-1 pointer-events-none"
                          }`}
            >
              {PROVINCES.map((name) => (
                <button
                  key={name}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => goExploreRegion(name)}
                >
                  {/* simple per-region icon mapping */}
                  {name.includes("Punjab") && (
                    <FaLandmark className={iconColor} />
                  )}
                  {name.includes("Sindh") && (
                    <FaLandmark className={iconColor} />
                  )}
                  {name.includes("Khyber") && (
                    <FaMountain className={iconColor} />
                  )}
                  {name.includes("Baloch") && (
                    <FaMountain className={iconColor} />
                  )}
                  {name.includes("Gilgit") && (
                    <FaMountain className={iconColor} />
                  )}
                  {name.includes("Azad") && <FaTree className={iconColor} />}
                  <span>{name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Heritage menu (hover intent + smooth transition) */}
          <div
            className="relative"
            onMouseEnter={() => openWithDelay("cats")}
            onMouseLeave={() => closeWithDelay("cats")}
          >
            <button className="hover:text-orange-600 flex items-center gap-1">
              <FaLandmark className={iconColor} />
              <span>Heritage</span>
              <span className="ml-1">▾</span>
            </button>
            <div
              className={`absolute right-0 mt-2 w-72 max-h-[70vh] overflow-auto bg-white border rounded-xl shadow-lg p-2
                          transition-all duration-200 ease-out
                          ${
                            catsOpen
                              ? "opacity-100 translate-y-0 pointer-events-auto"
                              : "opacity-0 -translate-y-1 pointer-events-none"
                          }`}
            >
              {QUICK_CATEGORIES.map((name) => (
                <button
                  key={name}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => goExploreCategory(name)}
                >
                  {/* Icon mapping per category */}
                  {name === "Mountains & Valleys" && (
                    <FaMountain className={iconColor} />
                  )}
                  {name === "Architecture" && (
                    <FaUniversity className={iconColor} />
                  )}
                  {name === "Forts & Palaces" && (
                    <FaLandmark className={iconColor} />
                  )}
                  {name === "Waterbodies" && <FaWater className={iconColor} />}
                  {name === "Tombs & Sufi Shrines" && (
                    <FaPlaceOfWorship className={iconColor} />
                  )}
                  {name === "Archaeological Sites" && (
                    <FaUniversity className={iconColor} />
                  )}
                  {name === "Mosques" && <FaMosque className={iconColor} />}
                  {name === "Temples" && <FaGopuram className={iconColor} />}
                  {name === "Churches" && <FaChurch className={iconColor} />}
                  {name === "Gurdwaras" && <FaCross className={iconColor} />}
                  {name === "Deserts" && <FaMountain className={iconColor} />}
                  {name === "Beaches" && (
                    <FaUmbrellaBeach className={iconColor} />
                  )}
                  {name === "Parks & Gardens" && (
                    <FaTree className={iconColor} />
                  )}
                  <span>{name}</span>
                </button>
              ))}
            </div>
          </div>

          <Link
            href="/explore"
            className="hover:text-orange-600 flex items-center gap-1"
          >
            <FaSearch className={iconColor} />
            <span>Explore</span>
          </Link>

          <Link
            href="/map"
            className="hover:text-orange-600 flex items-center gap-1"
          >
            <FaMap className={iconColor} />
            <span>Map</span>
          </Link>

          <Link
            href="/trip-builder"
            className="hover:text-orange-600 flex items-center gap-1"
          >
            <FaListUl className={iconColor} />
            <span>Trip Builder</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
