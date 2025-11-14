"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Icon from "./Icon";
import type { User } from "@supabase/supabase-js";
import { storagePublicUrl } from "@/lib/image/storagePublicUrl";

/* ---------- Styling helpers ---------- */
const iconStyles = "text-[var(--brand-orange)]";
const PANEL_ANIM_MS = 420;

/* ---------- Types ---------- */
type Site = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
  province_slug?: string | null;
};

type HeaderSubItem = {
  id: string;
  main_item_id: string;
  label: string;
  icon_name: string | null;
  url: string | null;
  title: string | null;
  detail: string | null;
  site_id: string | null;
  site_image_id: string | null;
  sort_order: number;
  image_url: string | null;
};

type HeaderMainItem = {
  id: string;
  label: string;
  slug: string;
  icon_name: string | null;
  url: string | null;
  sort_order: number;
  sub_items: HeaderSubItem[];
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
  const pathname = usePathname();
  const supabase = createClient();

  const heritageDetailRe = /^\/heritage\/[^/]+\/[^/]+\/?$/;
  const allowTransparent =
    pathname === "/" || heritageDetailRe.test(pathname || "");

  const [user, setUser] = useState<User | null>(null);

  // Scroll-driven solid state ONLY (no panel influence)
  const [solid, setSolid] = useState<boolean>(!allowTransparent);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(72);

  useEffect(() => {
    const HEADER_FALLBACK = 72;
    const DEFAULT_THRESHOLD = 140;

    const measureAndSetOffsetVar = () => {
      const h = headerRef.current?.offsetHeight ?? HEADER_FALLBACK;
      setHeaderHeight(h);
      document.documentElement.style.setProperty("--sticky-offset", `${h}px`);
      return h;
    };

    measureAndSetOffsetVar();

    if (!allowTransparent) {
      setSolid(true);
      return;
    }

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
  }, [allowTransparent]);

  /* ------------------------------ Search ------------------------------ */

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
        .select("id,slug,title,cover_photo_url,province_slug")
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

  /* -------------------------- Header menu data + mega state -------------------------- */

  const [headerItems, setHeaderItems] = useState<HeaderMainItem[]>([]);
  const [headerLoading, setHeaderLoading] = useState<boolean>(true);
  const [activeMainId, setActiveMainId] = useState<string | null>(null);
  const [activeSubId, setActiveSubId] = useState<string | null>(null);

  const [megaOpen, setMegaOpen] = useState(false);
  const megaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHeaderLoading(true);

      const { data: mainItems, error: mainErr } = await supabase
        .from("header_main_items")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (mainErr || !mainItems || mainItems.length === 0) {
        if (!cancelled) {
          setHeaderItems([]);
          setHeaderLoading(false);
        }
        return;
      }

      const mainIds = (mainItems as any[]).map((m) => m.id);

      const { data: subItems, error: subErr } = await supabase
        .from("header_sub_items")
        .select("*")
        .in("main_item_id", mainIds)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      let finalSubItems: HeaderSubItem[] = [];
      let imageMap: Record<string, string> = {};

      if (!subErr && subItems && subItems.length > 0) {
        const imageIds = (subItems as any[])
          .map((s) => s.site_image_id)
          .filter((id) => !!id) as string[];

        if (imageIds.length > 0) {
          const { data: images } = await supabase
            .from("site_images")
            .select("id,storage_path")
            .in("id", imageIds);

          if (images) {
            imageMap = (images as any[]).reduce((acc, img) => {
              acc[img.id] = img.storage_path;
              return acc;
            }, {} as Record<string, string>);
          }
        }

        finalSubItems = (subItems as any[]).map((s) => {
          const storagePath = s.site_image_id
            ? imageMap[s.site_image_id] ?? null
            : null;
          const imageUrl = storagePath
            ? storagePublicUrl("site-images", storagePath)
            : null;

          return {
            id: s.id,
            main_item_id: s.main_item_id,
            label: s.label,
            icon_name: s.icon_name,
            url: s.url,
            title: s.title,
            detail: s.detail,
            site_id: s.site_id,
            site_image_id: s.site_image_id,
            sort_order: s.sort_order,
            image_url: imageUrl,
          } as HeaderSubItem;
        });
      }

      const subByMain: Record<string, HeaderSubItem[]> = {};
      finalSubItems.forEach((s) => {
        const arr =
          subByMain[s.main_item_id] || (subByMain[s.main_item_id] = []);
        arr.push(s);
      });

      const final: HeaderMainItem[] = (mainItems as any[]).map((m) => ({
        id: m.id,
        label: m.label,
        slug: m.slug,
        icon_name: m.icon_name,
        url: m.url,
        sort_order: m.sort_order,
        sub_items: subByMain[m.id] || [],
      }));

      if (!cancelled) {
        setHeaderItems(final);
        setHeaderLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const activeMain =
    headerItems.find((m) => m.id === activeMainId) ||
    (headerItems.length > 0 ? headerItems[0] : null);

  const activeSubItems = activeMain?.sub_items || [];
  const activeSub =
    activeSubItems.find((s) => s.id === activeSubId) ||
    (activeSubItems.length > 0 ? activeSubItems[0] : null);

  const panelActive = megaOpen && !!activeSub && activeSubItems.length > 0;

  // Text / icon color: light when solid OR panel open
  const textLight = solid || panelActive;

  const megaTextClass = `transition-colors duration-200 [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
    textLight ? "[color:var(--brand-grey)]" : "text-white"
  }`;

  const handleMainClick = (
    id: string,
    hasPanel: boolean,
    url: string | null
  ) => {
    if (!hasPanel) {
      if (url) router.push(url);
      return;
    }

    // toggle behavior on same item
    if (megaOpen && activeMainId === id) {
      setMegaOpen(false);
      return;
    }

    setActiveMainId(id);
    const firstSub =
      headerItems.find((m) => m.id === id)?.sub_items?.[0] ?? null;
    setActiveSubId(firstSub?.id ?? null);
    setMegaOpen(true);
  };

  // Close panel on scroll
  useEffect(() => {
    if (!megaOpen) return;
    const onScroll = () => setMegaOpen(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [megaOpen]);

  // Close panel on ESC
  useEffect(() => {
    if (!megaOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMegaOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [megaOpen]);

  // Close panel on click outside (header is outside because it's z-40)
  useClickOutside(megaRef, () => {
    if (megaOpen) setMegaOpen(false);
  });

  /* -------------------------------- User Menu (uses textLight via prop) ------------------------------- */
  const UserMenu = ({ user, lightOn }: { user: User; lightOn: boolean }) => {
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
              lightOn ? "text-gray-700" : "text-white"
            }`}
          >
            {name}
          </span>
          <Icon
            name="chevron-down"
            size={14}
            className={`transition-transform ${isOpen ? "rotate-180" : ""} ${
              lightOn ? "text-gray-500" : "text-white"
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

  /* ------------------------------------------------------------------------ */

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
        @keyframes imageFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fadeInImage {
          animation: imageFadeIn 0.35s ease-in-out forwards;
        }
      `}</style>

      {/* HEADER (above panel). Background depends ONLY on scroll (solid). */}
      <header
        ref={headerRef as any}
        className={`sticky top-0 z-40 transition-colors duration-300 ${
          solid
            ? "bg-white/95 backdrop-blur shadow-sm"
            : "!bg-transparent !shadow-none !backdrop-blur-0"
        }`}
        style={{
          backgroundColor: solid ? "rgba(255,255,255,0.95)" : "transparent",
        }}
      >
        {/* Gradient only when transparent and no panel */}
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/40 via-black/10 to-transparent pointer-events-none transition-opacity duration-300 ${
            allowTransparent && !solid && !panelActive
              ? "opacity-100"
              : "opacity-0"
          }`}
        />

        <div className="relative z-10 max-w-[1400px] mx-auto px-4 py-2 flex items-center gap-3">
          <Link
            href="/"
            className="whitespace-nowrap tracking-wide mr-auto [font:var(--font-headerlogo-shorthand)] [color:var(--font-headerlogo-font-color)]"
          >
            HERITAGE OF PAKISTAN
          </Link>

          {/* Search */}
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
                className={textLight ? "text-gray-400" : "text-white"}
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
                  textLight
                    ? "placeholder-gray-400 text-gray-800"
                    : "placeholder-white text-white"
                }`}
              />
              {isSearching && (
                <Icon
                  name="spinner"
                  className={`animate-spin ${
                    textLight ? "text-gray-500" : "text-white/80"
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
                      <div className="w-10 h-10 bg-gray-200 rounded" />
                      <div className="w-3/4 h-4 bg-gray-200 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="animate-fadeIn">
                  {suggestions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/heritage/${s.province_slug ?? ""}/${s.slug}`}
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

          {/* Nav + mega menu */}
          <nav className="hidden md:flex items-center gap-4 text-[15px]">
            <Link
              href="/"
              className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
            >
              <Icon name="home" className={iconStyles} />
              <span
                className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                  textLight ? "[color:var(--brand-grey)]" : "text-white"
                }`}
              >
                Home
              </span>
            </Link>

            {/* Dynamic header items */}
            {!headerLoading &&
              headerItems.map((m) => {
                const hasPanel = (m.sub_items?.length ?? 0) > 0;

                if (!hasPanel && m.url) {
                  // Simple link when no panel
                  return (
                    <Link
                      key={m.id}
                      href={m.url}
                      className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
                    >
                      {m.icon_name && (
                        <Icon name={m.icon_name} className={iconStyles} />
                      )}
                      <span className={megaTextClass}>{m.label}</span>
                    </Link>
                  );
                }

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleMainClick(m.id, hasPanel, m.url)}
                    className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
                  >
                    {m.icon_name && (
                      <Icon name={m.icon_name} className={iconStyles} />
                    )}
                    <span className={megaTextClass}>{m.label}</span>
                    {hasPanel && (
                      <span
                        className={`ml-1 transition-colors duration-200 group-hover:text-[var(--brand-orange)] ${
                          textLight
                            ? "text-[color:var(--brand-grey)]"
                            : "text-white"
                        }`}
                      >
                        ▾
                      </span>
                    )}
                  </button>
                );
              })}

            {/* Explore, Map, Trip Builder, Auth */}
            <Link
              href="/explore"
              className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
            >
              <Icon name="search" className={iconStyles} />
              <span
                className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                  textLight ? "[color:var(--brand-grey)]" : "text-white"
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
                  textLight ? "[color:var(--brand-grey)]" : "text-white"
                }`}
              >
                Map
              </span>
            </Link>

            <button
              onClick={() => {
                if (user?.user_metadata?.username) {
                  router.push(`/${user.user_metadata.username}/mytrips`);
                } else if (user?.email) {
                  const safeSlug = user.email.split("@")[0];
                  router.push(`/${safeSlug}/mytrips`);
                } else {
                  router.push("/auth/sign-in");
                }
              }}
              className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
            >
              <Icon name="route" className={iconStyles} />
              <span
                className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                  textLight ? "[color:var(--brand-grey)]" : "text-white"
                }`}
              >
                Trip Builder
              </span>
            </button>

            {user ? (
              <UserMenu user={user} lightOn={textLight} />
            ) : (
              <Link
                href="/auth/sign-in"
                className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5 will-change-transform backface-hidden"
              >
                <Icon name="user" className={iconStyles} />
                <span
                  className={`transition-colors duration-200 group-hover:text-[var(--brand-orange)] [font-family:var(--font-headermenu)] [font-size:var(--font-headermenu-font-size)] ${
                    textLight ? "[color:var(--brand-grey)]" : "text-white"
                  }`}
                >
                  Sign in
                </span>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* FULL-WIDTH PANEL (behind header, above gradient, always mounted for smooth close) */}
      {activeSub && activeSubItems.length > 0 && (
        <div
          ref={megaRef}
          className={`fixed inset-x-0 top-0 z-30 bg-white/95 backdrop-blur shadow-lg border-b border-gray-200 transform transition-transform duration-[${PANEL_ANIM_MS}ms] ease-out ${
            megaOpen
              ? "translate-y-0 opacity-100 pointer-events-auto"
              : "-translate-y-full opacity-0 pointer-events-none"
          }`}
          style={{
            transition:
              "transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease-out",
          }}
        >
          <div
            className="mx-auto max-w-[1400px] px-8 py-10 flex gap-8 min-h-[520px]"
            style={{ paddingTop: headerHeight + 16 }}
          >
            {/* Left column: sub menu list */}
            <div className="w-1/3 border-r border-gray-100 pr-4">
              <ul className="space-y-1">
                {activeSubItems.map((s) => {
                  const isActive = s.id === activeSub.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveSubId(s.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-[var(--brand-light-orange)] text-[var(--brand-orange)]"
                            : "hover:bg-gray-50 text-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {s.icon_name && (
                            <Icon name={s.icon_name} className={iconStyles} />
                          )}
                          <span className="font-medium">{s.label}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Right column: detail + image (fade on change) */}
            <div className="w-2/3 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] gap-6">
              <div
                key={activeSub.id + "_text"}
                className="flex flex-col justify-center opacity-0 animate-fadeIn"
              >
                <h3 className="text-lg font-semibold text-gray-900">
                  {activeSub.title || activeSub.label}
                </h3>
                {activeSub.detail && (
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    {activeSub.detail}
                  </p>
                )}
                {activeSub.url && (
                  <Link
                    href={activeSub.url}
                    className="mt-4 inline-flex items-center text-sm font-medium text-[var(--brand-orange)] hover:underline"
                  >
                    Discover more
                  </Link>
                )}
              </div>
              <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-gray-100">
                {activeSub.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={activeSub.id + "_img"}
                    src={activeSub.image_url}
                    alt={activeSub.title || activeSub.label}
                    className="h-full w-full object-cover opacity-0 animate-fadeInImage"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
