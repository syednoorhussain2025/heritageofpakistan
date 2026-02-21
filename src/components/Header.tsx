// src/components/Header.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Icon from "./Icon";
import type { User } from "@supabase/supabase-js";
import { storagePublicUrl } from "@/lib/image/storagePublicUrl";
import { useLoaderEngine } from "@/components/loader-engine/LoaderEngineProvider";

/* ---------- Styling helpers ---------- */
const iconStyles = "text-[var(--brand-orange)]";
const PANEL_ANIM_MS = 420;

// TripAdvisor-like header colors
const HEADER_BG = "#f5f7f7";
const SEARCH_BG = "#f5f5f5";
const SEARCH_BORDER = "#e0e0e0";
const BRAND_GREEN = "#004f32"; // deep green for icons / search text
const BRAND_LOGO_GREEN = "#00b5a5"; // bright logo/text green

/* ---------- Types ---------- */
type SiteSearchRow = {
  id: string;
  slug: string | null;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
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

/** Simple thumbnail builder similar to the one in SearchFilters. */
function thumbUrl(input?: string | null, size = 40) {
  if (!input) return "";
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  let absolute = input;

  if (!/^https?:\/\//i.test(input)) {
    if (!SUPA_URL) return "";
    absolute = `${SUPA_URL}/storage/v1/object/public/${input.replace(
      /^\/+/,
      ""
    )}`;
  }

  const isSameProject = SUPA_URL && absolute.startsWith(SUPA_URL);
  if (!isSameProject) return absolute;

  const PUBLIC_MARK = "/storage/v1/object/public/";
  const SIGN_MARK = "/storage/v1/object/sign/";

  let renderBase = "";
  let tail = "";

  if (absolute.includes(PUBLIC_MARK)) {
    renderBase = `${SUPA_URL}/storage/v1/render/image/public/`;
    tail = absolute.split(PUBLIC_MARK)[1];
  } else if (absolute.includes(SIGN_MARK)) {
    renderBase = `${SUPA_URL}/storage/v1/render/image/sign/`;
    tail = absolute.split(SIGN_MARK)[1];
  } else {
    return absolute;
  }

  const u = new URL(renderBase + tail);
  u.searchParams.set("width", String(size));
  u.searchParams.set("height", String(size));
  u.searchParams.set("resize", "cover");
  u.searchParams.set("quality", "75");
  return u.toString();
}

/* Per-result avatar with spinner + fallback */
function SearchThumbCircle({
  thumb,
  absoluteFallback,
  sizeClass, // e.g. "w-10 h-10" or "w-12 h-12"
}: {
  thumb: string;
  absoluteFallback: string;
  sizeClass: string;
}) {
  const [loading, setLoading] = useState<boolean>(!!thumb);
  const [errored, setErrored] = useState<boolean>(false);

  const showImage = !!thumb && !errored;

  return (
    <div className={`relative ${sizeClass} flex-shrink-0`}>
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          aria-hidden="true"
          className={`${sizeClass} rounded-full object-cover ring-1 ring-gray-200`}
          loading="lazy"
          decoding="async"
          style={{ opacity: loading ? 0 : 1, transition: "opacity 150ms ease-out" }}
          onLoad={() => setLoading(false)}
          onError={(e) => {
            const t = e.currentTarget as HTMLImageElement;
            if (absoluteFallback && t.src !== absoluteFallback) {
              t.src = absoluteFallback;
              return;
            }
            setErrored(true);
            setLoading(false);
          }}
        />
      )}

      {/* Spinner while loading an image */}
      {loading && showImage && (
        <div
          className={`absolute inset-0 ${sizeClass} rounded-full bg-gray-100 ring-1 ring-gray-200 flex items-center justify-center`}
        >
          <span
            className="inline-block rounded-full animate-spin"
            style={{
              width: 16,
              height: 16,
              borderWidth: "2px",
              borderStyle: "solid",
              borderColor: "#d1d5db",
              borderTopColor: "transparent",
            }}
          />
        </div>
      )}

      {/* Fallback icon when no thumb or error */}
      {(!thumb || errored) && !loading && (
        <div
          className={`absolute inset-0 ${sizeClass} rounded-full bg-gray-100 ring-1 ring-gray-200 items-center justify-center text-gray-400 flex`}
        >
          <Icon name="image" size={13} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Header ----------------------------------- */
export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { startNavigation } = useLoaderEngine();

  // Use one consistent browser Supabase client throughout this component
  const supabase = useMemo(() => createClient(), []);

  const heritageDetailRe = /^\/heritage\/[^/]+\/[^/]+\/?$/;
  const allowTransparent =
    pathname === "/" || heritageDetailRe.test(pathname || "");

  const [user, setUser] = useState<User | null>(null);

  // Scroll-driven solid state ONLY (no panel influence)
  const [solid, setSolid] = useState<boolean>(!allowTransparent);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(72);

  // Mobile side menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Full-screen search overlay state
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);

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

  /* ------------------------------ Search (live) ------------------------------ */

  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<SiteSearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [openSuggest, setOpenSuggest] = useState(false);
  const suggestRef = useRef<HTMLDivElement | null>(null);

  // Visual booleans for transparent header + search
  const isTransparentHeader =
    allowTransparent && !solid && !searchOverlayOpen;
  const isSearchActive = searchOverlayOpen || isSearchFocused;

  // Live Supabase query – same pattern as LocationRadiusFilter.
  useEffect(() => {
    let active = true;

    (async () => {
      const term = q.trim();
      if (term.length < 2) {
        if (active) {
          setSearchResults([]);
          setSearchLoading(false);
        }
        return;
      }

      setSearchLoading(true);

      const { data, error } = await supabase
        .from("sites")
        .select(
          `
          id,
          slug,
          title,
          cover_photo_url,
          location_free,
          province:provinces(slug)
        `
        )
        .eq("is_published", true)
        .is("deleted_at", null)
        .ilike("title", `%${term}%`)
        .order("title")
        .limit(20);

      if (!active) return;
      setSearchLoading(false);

      if (error || !data) {
        setSearchResults([]);
        return;
      }

      const mapped: SiteSearchRow[] = (data as any[]).map((row) => ({
        id: row.id,
        slug: row.slug ?? null,
        title: row.title,
        cover_photo_url: row.cover_photo_url ?? null,
        location_free: row.location_free ?? null,
        province_slug: row.province?.slug ?? null,
      }));

      setSearchResults(mapped);
    })();

    return () => {
      active = false;
    };
  }, [q, supabase]);

  const submitQuickSearch = () => {
    if (!q.trim()) return;
    router.push(`/explore?q=${encodeURIComponent(q.trim())}`);
    setSearchOverlayOpen(false);
    setOpenSuggest(false);
    setIsSearchFocused(false);
  };

  useClickOutside(suggestRef, () => {
    setOpenSuggest(false);
    setIsSearchFocused(false);
  });

  // Lock body scroll when overlay or mobile menu is open, without layout shift
  useEffect(() => {
    const shouldLock = searchOverlayOpen || mobileMenuOpen;
    if (!shouldLock) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [searchOverlayOpen, mobileMenuOpen]);

  /* ------------------------------ Auth ------------------------------ */
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event !== "INITIAL_SESSION" &&
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      ) {
        return;
      }
      setUser(session?.user ?? null);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      })
      .catch((error) => {
        console.warn("[Header] getSession failed", error);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

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

  const textLight = solid || panelActive || searchOverlayOpen;

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

  // Close panel on click outside
  useClickOutside(megaRef, () => {
    if (megaOpen) setMegaOpen(false);
  });

  /* -------------------------------- User Menu ------------------------------- */
  const UserMenu = ({ user, lightOn }: { user: User; lightOn: boolean }) => {
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
      setIsOpen(false);
      router.replace("/");
      router.refresh();
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

  const searchInputTextClasses =
    isTransparentHeader && !isSearchActive
      ? "text-white placeholder-white/70"
      : "text-[#004f32] placeholder-gray-500";

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
        @keyframes slideInLeft {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slideInLeft {
          animation: slideInLeft 0.3s ease-out forwards;
        }
        @keyframes searchOverlayIn {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .search-overlay-enter {
          animation: searchOverlayIn 0.28s ease-out forwards;
        }
      `}</style>

      {/* HEADER */}
      <header
        ref={headerRef as any}
        className={`fixed lg:sticky top-0 z-[120] w-full transition-colors duration-300 ${
          solid || searchOverlayOpen
            ? "backdrop-blur shadow-sm"
            : "!bg-transparent !shadow-none !backdrop-blur-0"
        }`}
        style={{
          backgroundColor:
            solid || searchOverlayOpen ? "#ffffff" : "transparent",
        }}
      >
        {/* Gradient only when transparent and no panel */}
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/40 via-black/10 to-transparent pointer-events-none transition-opacity duration-300 ${
            allowTransparent && !solid && !panelActive && !searchOverlayOpen
              ? "opacity-100"
              : "opacity-0"
          }`}
        />

        {/* Top bar */}
        <div className="relative z-30 max-w-[1400px] mx-auto px-4 py-2 flex items-center gap-3">
          {/* Burger mobile */}
          <button
            type="button"
            className="lg:hidden p-2 -ml-1 flex items-center justify-center"
            aria-label="Open menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Icon
              name="navigator"
              size={20}
              style={{ color: isTransparentHeader ? "#ffffff" : BRAND_GREEN }}
            />
          </button>

          {/* Logo / text */}
          <Link
            href="/"
            className="flex items-center gap-2 whitespace-nowrap tracking-wide"
          >
            <Icon name="logo" size={26} style={{ color: BRAND_LOGO_GREEN }} />
            <span
              className="hidden md:inline [font:var(--font-headerlogo-shorthand)]"
              style={{ color: BRAND_LOGO_GREEN }}
            >
              HERITAGE OF PAKISTAN
            </span>
          </Link>

          {/* Search pill */}
          <div className="relative flex-1 max-w-2xl ml-2" ref={suggestRef}>
            <div
              className="flex items-center gap-2 rounded-full px-4 py-2 transition-all duration-200 ease-in-out cursor-text"
              style={{
                backgroundColor: isSearchActive
                  ? SEARCH_BG
                  : isTransparentHeader
                  ? "rgba(0,0,0,0.20)"
                  : SEARCH_BG,
                border: `1px solid ${
                  isSearchActive
                    ? SEARCH_BORDER
                    : isTransparentHeader
                    ? "rgba(255,255,255,0.65)"
                    : SEARCH_BORDER
                }`,
              }}
              onMouseEnter={() => setIsSearchHovered(true)}
              onMouseLeave={() => setIsSearchHovered(false)}
              onClick={() => {
                setSearchOverlayOpen(true);
                setIsSearchFocused(true);
                setOpenSuggest(true);
              }}
            >
              <Icon
                name="search"
                size={18}
                style={{
                  color:
                    isTransparentHeader && !isSearchActive
                      ? "#ffffff"
                      : BRAND_GREEN,
                }}
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
                  setSearchOverlayOpen(true);
                }}
                onKeyDown={(e) => e.key === "Enter" && submitQuickSearch()}
                placeholder="Search heritage sites"
                className={`w-full bg-transparent outline-none text-sm ${searchInputTextClasses}`}
                style={{
                  caretColor:
                    isTransparentHeader && !isSearchActive
                      ? "#ffffff"
                      : BRAND_GREEN,
                }}
              />
              {searchLoading && (
                <Icon
                  name="spinner"
                  className="animate-spin"
                  size={16}
                  style={{
                    color:
                      isTransparentHeader && !isSearchActive
                        ? "rgba(255,255,255,0.8)"
                        : `${BRAND_GREEN}`,
                  }}
                />
              )}
            </div>

            {/* Small dropdown suggestions (desktop) */}
            {!searchOverlayOpen && (
              <div
                className={`absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-lg overflow-hidden transition-all ease-out duration-300 ${
                  openSuggest &&
                  q.trim().length >= 2 &&
                  (searchLoading || searchResults.length > 0)
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 -translate-y-4 pointer-events-none"
                }`}
              >
                {searchLoading ? (
                  <div>
                    {[...Array(2)].map((_, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 px-3 py-2 animate-pulse"
                      >
                        <div className="w-10 h-10 bg-gray-200 rounded-full" />
                        <div className="w-3/4 h-4 bg-gray-200 rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="animate-fadeIn">
                    {searchResults.map((s) => {
                      const raw = s.cover_photo_url || "";
                      const thumb = thumbUrl(raw, 40);
                      const SUPA_URL =
                        process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
                          /\/+$/,
                          ""
                        );
                      const absoluteFallback = /^https?:\/\//i.test(raw)
                        ? raw
                        : SUPA_URL
                        ? `${SUPA_URL}/storage/v1/object/public/${raw.replace(
                            /^\/+/,
                            ""
                          )}`
                        : "";

                      const href =
                        s.slug && s.province_slug
                          ? `/heritage/${s.province_slug}/${s.slug}`
                          : `/explore?site=${s.id}`;

                      return (
                        <Link
                          key={s.id}
                          href={href}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            setOpenSuggest(false);
                            setIsSearchFocused(false);
                            setSearchOverlayOpen(false);
                            startNavigation(href, {
                              direction: "forward",
                              variantOverride: "listing",
                            });
                          }}
                        >
                          <SearchThumbCircle
                            thumb={thumb}
                            absoluteFallback={absoluteFallback}
                            sizeClass="w-10 h-10"
                          />

                          <div className="flex flex-col min-w-0">
                            <span className="text-sm text-gray-900 truncate">
                              {s.title}
                            </span>
                            {s.location_free && (
                              <span className="text-xs text-gray-500 truncate">
                                {s.location_free}
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                    {q.trim().length >= 2 && (
                      <button
                        onClick={submitQuickSearch}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-gray-50 cursor-pointer"
                      >
                        See more results for “{q}”
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-4 text-[15px]">
              <Link
                href="/"
                className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
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

              {!headerLoading &&
                headerItems.map((m) => {
                  const hasPanel = (m.sub_items?.length ?? 0) > 0;

                  if (!hasPanel && m.url) {
                    return (
                      <Link
                        key={m.id}
                        href={m.url}
                        className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
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
                      className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
                    >
                      {m.icon_name && (
                        <Icon name={m.icon_name} className={iconStyles} />
                      )}
                      <span className={megaTextClass}>{m.label}</span>
                      {hasPanel && (
                        <span className="ml-1 text-[11px] group-hover:text-[var(--brand-orange)]">
                          ▾
                        </span>
                      )}
                    </button>
                  );
                })}

              <Link
                href="/explore"
                className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
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
                className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
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
                className="group flex items-center gap-1 cursor-pointer transition-transform duration-300 ease-in-out hover:-translate-y-0.5"
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
            </nav>

            {/* User / auth */}
            {user ? (
              <UserMenu user={user} lightOn={textLight} />
            ) : (
              <Link
                href="/auth/sign-in"
                className="group flex items-center gap-2 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center bg-white/80">
                  <Icon
                    name="user"
                    size={16}
                    className={textLight ? "text-gray-700" : "text-white"}
                  />
                </div>
                <span
                  className={`hidden sm:inline text-sm font-medium transition-colors ${
                    textLight ? "text-gray-700" : "text-white"
                  }`}
                >
                  Sign in
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* MOBILE SIDE MENU */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden">
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white shadow-xl animate-slideInLeft flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Icon
                  name="logo"
                  size={24}
                  style={{ color: BRAND_LOGO_GREEN }}
                />
                <span className="text-sm font-semibold text-gray-800">
                  Heritage of Pakistan
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100"
                aria-label="Close menu"
              >
                <Icon name="times" size={18} className="text-gray-600" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2 text-sm">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
              >
                <Icon name="home" size={16} className={iconStyles} />
                <span className="[font-family:var(--font-headermenu)] text-gray-800">
                  Home
                </span>
              </Link>

              <Link
                href="/explore"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
              >
                <Icon name="search" size={16} className={iconStyles} />
                <span className="[font-family:var(--font-headermenu)] text-gray-800">
                  Explore
                </span>
              </Link>

              <Link
                href="/map"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
              >
                <Icon name="map" size={16} className={iconStyles} />
                <span className="[font-family:var(--font-headermenu)] text-gray-800">
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
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
              >
                <Icon name="route" size={16} className={iconStyles} />
                <span className="[font-family:var(--font-headermenu)] text-gray-800">
                  Trip Builder
                </span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* FULL-SCREEN SEARCH OVERLAY */}
      {searchOverlayOpen && (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col search-overlay-enter">
          {/* Top bar – white header with same layout */}
          <div className="w-full border-b border-gray-200 bg-white">
            <div className="max-w-[1400px] mx-auto px-4 py-2 flex items-center gap-3">
              <button
                type="button"
                className="p-2 -ml-1 flex items-center justify-center lg:hidden"
                aria-label="Open menu"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Icon
                  name="navigator"
                  size={20}
                  style={{ color: BRAND_GREEN }}
                />
              </button>

              <Link
                href="/"
                className="flex items-center gap-2 whitespace-nowrap tracking-wide"
                onClick={() => setSearchOverlayOpen(false)}
              >
                <Icon
                  name="logo"
                  size={26}
                  style={{ color: BRAND_LOGO_GREEN }}
                />
                <span
                  className="hidden md:inline [font:var(--font-headerlogo-shorthand)]"
                  style={{ color: BRAND_LOGO_GREEN }}
                >
                  HERITAGE OF PAKISTAN
                </span>
              </Link>

              <div className="relative flex-1 max-w-2xl ml-2">
                <div
                  className="flex items-center gap-2 rounded-full px-4 py-2 transition-all duration-200 ease-in-out"
                  style={{
                    backgroundColor: SEARCH_BG,
                    border: `1px solid ${SEARCH_BORDER}`,
                  }}
                >
                  <Icon
                    name="search"
                    size={18}
                    style={{ color: BRAND_GREEN }}
                  />
                  <input
                    autoFocus
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
                    placeholder="Search heritage sites"
                    className="w-full bg-transparent outline-none text-sm text-[#004f32] placeholder-gray-500"
                    style={{ caretColor: BRAND_GREEN }}
                  />
                  {searchLoading && (
                    <Icon
                      name="spinner"
                      className="animate-spin"
                      size={16}
                      style={{ color: BRAND_GREEN }}
                    />
                  )}
                </div>
              </div>

              <button
                type="button"
                className="p-2 rounded-full hover:bg-gray-100"
                aria-label="Close search"
                onClick={() => {
                  setSearchOverlayOpen(false);
                  setIsSearchFocused(false);
                  setOpenSuggest(false);
                }}
              >
                <Icon name="times" size={18} className="text-gray-700" />
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 w-full overflow-y-auto">
            <div className="max-w-[1400px] mx-auto w-full px-4 py-4">
              {q.trim().length < 2 ? (
                <div className="text-sm text-gray-500">
                  Start typing to search heritage sites.
                </div>
              ) : searchLoading ? (
                <div>
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-2 py-3 animate-pulse"
                    >
                      <div className="w-12 h-12 rounded-full bg-gray-200" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-2/3 bg-gray-200 rounded" />
                        <div className="h-3 w-1/3 bg-gray-100 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No sites found for “{q}”.
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((s) => {
                    const raw = s.cover_photo_url || "";
                    const thumb = thumbUrl(raw, 48);
                    const SUPA_URL =
                      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
                        /\/+$/,
                        ""
                      );
                    const absoluteFallback = /^https?:\/\//i.test(raw)
                      ? raw
                      : SUPA_URL
                      ? `${SUPA_URL}/storage/v1/object/public/${raw.replace(
                          /^\/+/,
                          ""
                        )}`
                      : "";

                    const href =
                      s.slug && s.province_slug
                        ? `/heritage/${s.province_slug}/${s.slug}`
                        : `/explore?site=${s.id}`;

                    return (
                      <Link
                        key={s.id}
                        href={href}
                        className="flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          setSearchOverlayOpen(false);
                          setIsSearchFocused(false);
                          setOpenSuggest(false);
                          startNavigation(href, {
                            direction: "forward",
                            variantOverride: "listing",
                          });
                        }}
                      >
                        <SearchThumbCircle
                          thumb={thumb}
                          absoluteFallback={absoluteFallback}
                          sizeClass="w-12 h-12"
                        />

                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {s.title}
                          </span>
                          {s.location_free && (
                            <span className="text-xs text-gray-500 truncate">
                              {s.location_free}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FULL-WIDTH PANEL (mega menu) */}
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
