// src/components/Header.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Icon from "./Icon";
import { User } from "@supabase/supabase-js";

/* ---------- Styling helpers ---------- */
const iconStyles = "text-[var(--brand-orange)]";

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

/* ------------------------------- Header ----------------------------------- */
export default function Header() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);

  /* ---------- Transparent by default; solid after threshold ---------- */
  const [solid, setSolid] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const HEADER_FALLBACK = 72; // px
    const DEFAULT_THRESHOLD = 140; // px

    const measureAndSetOffsetVar = () => {
      const h = headerRef.current?.offsetHeight ?? HEADER_FALLBACK;
      document.documentElement.style.setProperty("--sticky-offset", `${h}px`);
      return h;
    };

    const computeThreshold = () => {
      const marker =
        document.getElementById("white-header-trigger") ||
        document.getElementById("header-threshold");
      if (marker) {
        const top = marker.getBoundingClientRect().top + window.scrollY;
        const headerH = headerRef.current?.offsetHeight ?? HEADER_FALLBACK;
        return Math.max(0, top - headerH);
      }
      return DEFAULT_THRESHOLD;
    };

    measureAndSetOffsetVar();
    let threshold = computeThreshold();

    const onScroll = () => setSolid(window.scrollY >= threshold);
    const onResize = () => {
      measureAndSetOffsetVar();
      threshold = computeThreshold();
      onScroll();
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && headerRef.current) {
      ro = new ResizeObserver(() => onResize());
      ro.observe(headerRef.current);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (ro && headerRef.current) ro.disconnect();
    };
  }, []);

  /* -------------------------------- User Menu ------------------------------- */
  const UserMenu = ({ user }: { user: User }) => {
    const supabase = createClient();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const timerRef = useRef<number | null>(null);

    const openWithDelay = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setIsOpen(true), 120);
    };
    const closeWithDelay = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setIsOpen(false), 180);
    };

    const handleLogout = async () => {
      await supabase.auth.signOut();
      router.push("/");
      setIsOpen(false);
    };

    const name = user.user_metadata?.full_name || "User";
    const initial = name.charAt(0).toUpperCase();

    const menuItems = [
      { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
      {
        href: "/dashboard/mywishlists",
        icon: "list-ul",
        label: "My Wishlists",
      },
      { href: "/dashboard/mytrips", icon: "route", label: "My Trips" },
      { href: "/dashboard/bookmarks", icon: "heart", label: "Bookmarks" },
      {
        href: "/dashboard/mycollections",
        icon: "retro",
        label: "My Collections",
      },
      {
        href: "/dashboard/placesvisited",
        icon: "map-marker-alt",
        label: "Places Visited",
      },
      {
        href: "/dashboard/recommendations",
        icon: "lightbulb",
        label: "Recommendations",
      },
      { href: "/dashboard/myreviews", icon: "star", label: "My Reviews" },
      {
        href: "/dashboard/account-details",
        icon: "user",
        label: "Account Details",
      },
    ];

    return (
      <div
        className="relative"
        ref={menuRef}
        onMouseEnter={openWithDelay}
        onMouseLeave={closeWithDelay}
      >
        <div className="flex items-center gap-2 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-[var(--brand-blue)] flex items-center justify-center text-white font-semibold">
            {initial}
          </div>
          <span
            className={`hidden sm:inline text-sm font-medium transition-colors ${
              solid ? "text-gray-700" : "text-white"
            }`}
          >
            {name}
          </span>
          <Icon
            name="chevron-down"
            size={14}
            className={`transition-transform ${isOpen ? "rotate-180" : ""} ${
              solid ? "text-gray-500" : "text-white"
            }`}
          />
        </div>

        <div
          className={`absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-lg p-2 transition-all duration-200 ease-out ${
            isOpen
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 -translate-y-1 pointer-events-none"
          }`}
        >
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className="group w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 text-gray-700 transition-colors duration-200"
            >
              <div className="flex items-center gap-3 transition-transform duration-200 ease-in-out group-hover:translate-x-1">
                <Icon name={item.icon} size={16} className={iconStyles} />
                <span className="transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [color:var(--brand-grey)]">
                  {item.label}
                </span>
              </div>
            </Link>
          ))}
          <div className="h-px bg-gray-200 my-1" />
          <button
            onClick={handleLogout}
            className="group w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-gray-50 text-gray-700 transition-colors duration-200"
          >
            <div className="flex items-center gap-3 transition-transform duration-200 ease-in-out group-hover:translate-x-1">
              <Icon name="logout" size={16} className={iconStyles} />
              <span className="transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [color:var(--brand-grey)]">
                Logout
              </span>
            </div>
          </button>
        </div>
      </div>
    );
  };

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
  }, [supabase]);

  const nameToId = useMemo(
    () => ({
      region: (n: string) =>
        regions.find((r) => r.name.toLowerCase() === n.toLowerCase())?.id,
      category: (n: string) =>
        categories.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id,
    }),
    [regions, categories]
  );

  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [suggestions, setSuggestions] = useState<Site[]>([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const suggestRef = useRef<HTMLDivElement | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dq.trim()) {
        setSuggestions([]);
        return;
      }
      setIsSearching(true);
      const { data } = await supabase
        .from("sites")
        .select("id,slug,title,cover_photo_url")
        .ilike("title", `%${dq.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!cancelled) setSuggestions(((data as any[]) || []) as Site[]);
      setIsSearching(false);
    })();
    return () => {
      cancelled = true;
      setIsSearching(false);
    };
  }, [dq, supabase]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useClickOutside(suggestRef, () => {
    setOpenSuggest(false);
    setIsSearchFocused(false);
  });

  const submitQuickSearch = () => {
    if (!q.trim()) return;
    router.push(`/explore?q=${encodeURIComponent(q.trim())}`);
    setOpenSuggest(false);
    setIsSearchFocused(false);
  };

  const [regionsOpen, setRegionsOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const regionsTimer = useRef<number | null>(null);
  const catsTimer = useRef<number | null>(null);

  const openWithDelay = (which: "regions" | "cats") => {
    const setOpen = which === "regions" ? setRegionsOpen : setCatsOpen;
    const timerRef = which === "regions" ? regionsTimer : catsTimer;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(true), 120);
  };
  const closeWithDelay = (which: "regions" | "cats") => {
    const setOpen = which === "regions" ? setRegionsOpen : setCatsOpen;
    const timerRef = which === "regions" ? regionsTimer : catsTimer;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(false), 180);
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
    <>
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .menu-item-divider > button {
          position: relative;
        }
        .menu-item-divider > button:not(:last-child)::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 15%;
          right: 15%;
          height: 1px;
          background-color: #f3f4f6;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in-out forwards;
        }
      `}</style>

      <header
        ref={headerRef as any}
        data-solid={solid}
        className={`sticky top-0 z-40 transition-colors duration-300 ${
          solid
            ? "bg-white/95 backdrop-blur shadow-sm"
            : "!bg-transparent !shadow-none !backdrop-blur-0"
        }`}
        style={{
          backgroundColor: solid ? "rgba(255,255,255,0.95)" : "transparent",
        }}
      >
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/40 via-black/10 to-transparent pointer-events-none transition-opacity duration-300 ${
            solid ? "opacity-0" : "opacity-100"
          }`}
        />

        <div className="relative z-10 max-w-[1400px] mx-auto px-4 py-2 flex items-center gap-3">
          <Link
            href="/"
            className="whitespace-nowrap tracking-wide mr-auto [font:var(--font-headerlogo-shorthand)] [color:var(--font-headerlogo-font-color)]"
          >
            HERITAGE OF PAKISTAN
          </Link>

          <div className="relative flex-1 max-w-2xl" ref={suggestRef}>
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 bg-transparent transition-all duration-200 ease-in-out ${
                isSearchHovered || isSearchFocused
                  ? "ring-1 ring-[var(--brand-orange)]"
                  : "ring-1 ring-transparent"
              }`}
              onMouseEnter={() => setIsSearchHovered(true)}
              onMouseLeave={() => setIsSearchHovered(false)}
            >
              <Icon
                name="search"
                size={16}
                className={solid ? "text-gray-400" : "text-white"}
              />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpenSuggest(true);
                }}
                onFocus={() => {
                  setIsSearchFocused(true);
                  setOpenSuggest(true);
                }}
                onKeyDown={(e) => e.key === "Enter" && submitQuickSearch()}
                placeholder="Search Heritage"
                className={`w-full bg-transparent outline-none text-sm ${
                  solid
                    ? "placeholder-gray-400 text-gray-800"
                    : "placeholder-white text-white"
                }`}
              />
              {isSearching && (
                <Icon
                  name="spinner"
                  className={`animate-spin ${
                    solid ? "text-gray-500" : "text-white/80"
                  }`}
                  size={16}
                />
              )}
            </div>

            <div
              className={`absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-lg overflow-hidden transition-all ease-out duration-300 ${
                openSuggest &&
                q.trim() !== "" &&
                (isSearching || suggestions.length > 0)
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 -translate-y-4 pointer-events-none"
              }`}
            >
              {isSearching ? (
                <div>
                  {[...Array(2)].map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 px-3 py-2 animate-pulse"
                    >
                      <div className="w-10 h-10 bg-gray-200 rounded"></div>
                      <div className="w-3/4 h-4 bg-gray-200 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="animate-fadeIn">
                  {suggestions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/heritage/${s.slug}`}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        setOpenSuggest(false);
                        setIsSearchFocused(false);
                      }}
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
                    className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-gray-50 cursor-pointer"
                  >
                    See more results for “{q}”
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-4 text-[15px]">
            <Link
              href="/"
              className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
            >
              <Icon name="home" className={iconStyles} />
              <span
                className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                  solid ? "[color:var(--brand-grey)]" : "text-white"
                }`}
              >
                Home
              </span>
            </Link>

            <div
              className="relative"
              onMouseEnter={() => openWithDelay("regions")}
              onMouseLeave={() => closeWithDelay("regions")}
            >
              <button className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden">
                <Icon name="map-marker-alt" className={iconStyles} />
                <span
                  className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                    solid ? "[color:var(--brand-grey)]" : "text-white"
                  }`}
                >
                  Regions
                </span>
                <span
                  className={`ml-1 transition-colors duration-200 group-hover:text-[var(--brand-orange)] ${
                    solid ? "text-[color:var(--brand-grey)]" : "text-white"
                  }`}
                >
                  ▾
                </span>
              </button>
              <div
                className={`absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-lg p-2 transition-all duration-200 ease-out ${
                  regionsOpen
                    ? "opacity-100 translate-y-0 pointer-events-auto"
                    : "opacity-0 -translate-y-1 pointer-events-none"
                }`}
              >
                <div className="menu-item-divider">
                  {PROVINCES.map((name) => (
                    <button
                      key={name}
                      className="group relative w-full text-left px-3 py-2.5 rounded hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
                      onClick={() => goExploreRegion(name)}
                    >
                      <div className="flex items-center gap-2 transition-transform duration-200 ease-in-out group-hover:translate-x-1">
                        <Icon name="map-marker-alt" className={iconStyles} />
                        <span className="transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] [color:var(--brand-grey)]">
                          {name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="relative"
              onMouseEnter={() => openWithDelay("cats")}
              onMouseLeave={() => closeWithDelay("cats")}
            >
              <button className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden">
                <Icon name="landmark" className={iconStyles} />
                <span
                  className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                    solid ? "[color:var(--brand-grey)]" : "text-white"
                  }`}
                >
                  Heritage
                </span>
                <span
                  className={`ml-1 transition-colors duration-200 group-hover:text-[var(--brand-orange)] ${
                    solid ? "text-[color:var(--brand-grey)]" : "text-white"
                  }`}
                >
                  ▾
                </span>
              </button>
              <div
                className={`absolute right-0 mt-2 w-72 max-h-[85vh] overflow-y-auto scrollbar-hide bg-white rounded-xl shadow-lg p-2 transition-all duration-200 ease-out ${
                  catsOpen
                    ? "opacity-100 translate-y-0 pointer-events-auto"
                    : "opacity-0 -translate-y-1 pointer-events-none"
                }`}
              >
                <div className="menu-item-divider">
                  {QUICK_CATEGORIES.map((name) => (
                    <button
                      key={name}
                      className="group relative w-full text-left px-3 py-2.5 rounded hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
                      onClick={() => goExploreCategory(name)}
                    >
                      <div className="flex items-center gap-2 transition-transform duration-200 ease-in-out group-hover:translate-x-1">
                        <Icon
                          name={
                            name === "Mountains & Valleys"
                              ? "mountain"
                              : name === "Architecture"
                              ? "university"
                              : "landmark"
                          }
                          className={iconStyles}
                        />
                        <span className="transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] [color:var(--brand-grey)]">
                          {name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Link
              href="/explore"
              className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
            >
              <Icon name="search" className={iconStyles} />
              <span
                className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                  solid ? "[color:var(--brand-grey)]" : "text-white"
                }`}
              >
                Explore
              </span>
            </Link>

            <Link
              href="/map"
              className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
            >
              <Icon name="map" className={iconStyles} />
              <span
                className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                  solid ? "[color:var(--brand-grey)]" : "text-white"
                }`}
              >
                Map
              </span>
            </Link>

            <Link
              href="/trip-builder"
              className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
            >
              <Icon name="route" className={iconStyles} />
              <span
                className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                  solid ? "[color:var(--brand-grey)]" : "text-white"
                }`}
              >
                Trip Builder
              </span>
            </Link>

            {user ? (
              <UserMenu user={user} />
            ) : (
              <Link
                href="/auth/sign-in"
                className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
              >
                <Icon name="user" className={iconStyles} />
                <span
                  className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                    solid ? "[color:var(--brand-grey)]" : "text-white"
                  }`}
                >
                  Sign in
                </span>
              </Link>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
