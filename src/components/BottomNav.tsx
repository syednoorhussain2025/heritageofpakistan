"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { useLoaderEngine } from "@/components/loader-engine/LoaderEngineProvider";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useProfile } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/browser";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { type TabKey, setTab, subscribeTab, getActiveTab, pathnameToTab } from "@/lib/tabStore";

const ACTIVE_COLOR_CLASS = "text-[var(--brand-orange)]";
const INACTIVE_COLOR_CLASS = "text-[var(--brand-black)]";
const ICON_SIZE = 29;

const PANEL_ANIM_MS = 320;


// All tab items switch instantly via tabStore — no router, no React re-render.
function TabNavItem({
  label,
  icon,
  tab,
  isActive,
}: {
  label: string;
  icon: string;
  tab: TabKey;
  isActive: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex flex-1 items-center justify-center py-3 nav-item-tap"
      onTouchStart={() => setTab(tab)}
      onMouseDown={() => setTab(tab)}
    >
      <span className="nav-item-icon" style={{ display: "flex" }}>
        <Icon
          name={icon}
          size={ICON_SIZE}
          className={isActive ? ACTIVE_COLOR_CLASS : INACTIVE_COLOR_CLASS}
        />
      </span>
    </button>
  );
}

// Map is now a TabShell pane — switches identically to Home/Discover/Explore
function MapNavItem({ isActive }: { isActive: boolean }) {
  return (
    <button
      type="button"
      aria-label="Map"
      className="flex flex-1 items-center justify-center py-3 nav-item-tap"
      onTouchStart={() => setTab("map")}
      onMouseDown={() => setTab("map")}
    >
      <span className="nav-item-icon" style={{ display: "flex" }}>
        <Icon name="adminmap" size={ICON_SIZE} className={isActive ? ACTIVE_COLOR_CLASS : INACTIVE_COLOR_CLASS} />
      </span>
    </button>
  );
}

/** Builds a public URL for the avatar stored in the "avatars" bucket. */
function avatarThumbUrl(input: string | null | undefined): string {
  if (!input) return "";
  if (/^https?:\/\//i.test(input)) return input;
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!SUPA_URL) return "";
  const path = input.replace(/^\/+/, "");
  // avatar_url is stored as a relative path inside the "avatars" bucket
  return `${SUPA_URL}/storage/v1/object/public/avatars/${path}`;
}

/** Profile avatar circle used in the bottom nav tab. */
function ProfileTabIcon({
  avatarUrl,
  initial,
  isActive,
}: {
  avatarUrl: string;
  initial: string;
  isActive: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const ring = isActive ? "ring-2 ring-[var(--brand-orange)]" : "ring-2 ring-gray-300";

  if (avatarUrl && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt="Profile"
        className={`w-[26px] h-[26px] rounded-full object-cover ${ring}`}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div
      className={`w-[26px] h-[26px] rounded-full bg-[var(--brand-blue)] flex items-center justify-center text-white text-[11px] font-bold ${ring}`}
    >
      {initial}
    </div>
  );
}

const panelNavItems = [
  { href: "/dashboard/profile", label: "Profile", icon: "user-round" },
  { href: "/dashboard/mywishlists", label: "Saved Lists", icon: "layout-list" },
  { href: "/dashboard/mycollections", label: "Collections", icon: "cards" },
  { href: "/dashboard/mytrips", label: "My Trips", icon: "line-segments-light" },
  { href: "/dashboard/myreviews", label: "My Reviews", icon: "star-light" },
  { href: "/dashboard/placesvisited", label: "Places Visited", icon: "person-simple-hike-light" },
  { href: "/dashboard/portfolio", label: "My Portfolio", icon: "layout-grid" },
  { href: "/dashboard/notebook", label: "My Notes", icon: "book-open-text-light" },
  { href: "/dashboard/account-details", label: "Account Details", icon: "square-user-round" },
];

function NavListItem({
  item,
  isActive,
  onPress,
  index,
}: {
  item: { href: string; label: string; icon: string };
  isActive: boolean;
  onPress: () => void;
  index: number;
}) {
  return (
    <button
      type="button"
      onClick={() => { void hapticLight(); onPress(); }}
      className="w-full flex items-center gap-3.5 px-4 py-[15px] active:bg-gray-50 transition-colors relative select-none"
      style={{ WebkitUserSelect: "none" } as React.CSSProperties}
    >
      {index > 0 && <span className="absolute top-0 right-0 left-[20px] h-px bg-gray-100" />}
      <Icon name={item.icon} size={30} className="text-black shrink-0" />
      <span className={`flex-1 text-left text-[15px] ${isActive ? "font-semibold text-[var(--brand-dark-grey)]" : "font-normal text-[var(--brand-dark-grey)]"}`}>
        {item.label}
      </span>
      <Icon name="chevron-right" size={13} className="text-[var(--brand-light-grey)]" />
    </button>
  );
}

/** Booking.com-style profile panel. */
function ProfilePanel({
  open,
  closing,
  onClose,
  avatarUrl,
  displayName,
  isLoggedIn,
  onNavigate,
}: {
  open: boolean;
  closing: boolean;
  onClose: () => void;
  avatarUrl: string;
  displayName: string;
  isLoggedIn: boolean;
  onNavigate: (href: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const handleLogout = async () => {
    onClose();
    try { window.sessionStorage?.setItem("auth:justSignedOut", "1"); } catch {}
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  };


  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[3300] bg-[var(--brand-light-grey)] flex flex-col overflow-hidden transition-transform duration-[320ms] ease-out ${
        closing ? "translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Teal header */}
      <div
        className="bg-[var(--brand-green)] flex-shrink-0 flex flex-col px-4 pb-5"
        style={{ paddingTop: "calc(0.85rem + var(--sat, 44px))" }}
      >
        {/* Close button row */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-white text-[17px] font-semibold">Account</span>
          <button
            type="button"
            onClick={() => { void hapticLight(); onClose(); }}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white active:bg-white/30"
          >
            <Icon name="times" size={15} />
          </button>
        </div>

        {/* Avatar + info row */}
        <div className="flex items-center gap-4">
          {/* Avatar circle with gold border */}
          <div className="w-16 h-16 rounded-full border-2 border-[#ffd700] overflow-hidden flex items-center justify-center bg-white/20 flex-shrink-0">
            {avatarUrl && isLoggedIn ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon name="user-round" size={32} className="text-white" />
              </div>
            )}
          </div>

          {/* Name / sign-in prompt */}
          <div className="flex-1 min-w-0">
            {isLoggedIn ? (
              <>
                <p className="text-white text-[17px] font-semibold leading-tight truncate">{displayName}</p>
                <p className="text-white/70 text-[13px] mt-0.5">Heritage of Pakistan</p>
              </>
            ) : (
              <>
                <p className="text-white text-[16px] font-semibold leading-tight">Sign in to manage</p>
                <p className="text-white/80 text-[13px] mt-0.5">your trips and more</p>
              </>
            )}
          </div>
        </div>

        {/* Sign in button (unauthenticated only) */}
        {!isLoggedIn && (
          <button
            type="button"
            onClick={() => { void hapticMedium(); onClose(); window.location.href = "/auth/sign-in?redirectTo=/"; }}
            className="mt-4 w-full py-3 rounded-xl bg-white text-[var(--brand-green)] text-[15px] font-bold text-center active:bg-gray-100 transition-colors"
          >
            Sign in or register
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "var(--brand-light-grey)" }}>
        <div className="px-5 pt-5 pb-6">
          {/* Nav list card */}
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
            {panelNavItems.map((item, i) => (
              <NavListItem
                key={item.href}
                item={item}
                index={i}
                isActive={pathname === item.href}
                onPress={() => onNavigate(item.href)}
              />
            ))}
          </div>

          {/* Sign out — only when logged in */}
          {isLoggedIn && (
            <button
              type="button"
              onClick={() => { void hapticMedium(); void handleLogout(); }}
              className="mt-2.5 w-full flex items-center gap-3.5 px-4 py-[15px] rounded-2xl bg-white border border-gray-200 active:bg-red-50 transition-colors select-none"
              style={{ WebkitUserSelect: "none" } as React.CSSProperties}
            >
              <Icon name="sign-out" size={19} className="text-red-500 shrink-0" />
              <span className="flex-1 text-[15px] font-normal text-red-500 text-left">Sign Out</span>
            </button>
          )}
        </div>

        {/* Safe-area bottom padding */}
        <div className="h-[calc(2rem+env(safe-area-inset-bottom,0px))]" />
      </div>
    </div>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useAuthUserId();
  const { profile } = useProfile();
  const { startNavigation } = useLoaderEngine();

  // Prefetch dashboard on mount so tapping the profile button feels instant
  useEffect(() => {
    router.prefetch("/dashboard");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active tab state driven by tabStore (not router) — updates synchronously on tap
  const [activeTab, setActiveTabState] = useState<TabKey | null>(() => pathnameToTab(pathname));
  useEffect(() => {
    // Sync on mount and on real route changes (back/forward, deep links)
    setActiveTabState(pathnameToTab(pathname));
    return subscribeTab((tab) => setActiveTabState(tab));
  }, [pathname]);

  // Lock safe-area insets once after first paint — prevents them from
  // collapsing to 0 on pages where iOS dynamically adjusts the values.
  const [safeBottom, setSafeBottom] = useState<string>("env(safe-area-inset-bottom, 0px)");
  useEffect(() => {
    requestAnimationFrame(() => {
      // Bottom inset
      const elB = document.createElement("div");
      elB.style.cssText = "position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;";
      document.body.appendChild(elB);

      // Top inset
      const elT = document.createElement("div");
      elT.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden;";
      document.body.appendChild(elT);

      requestAnimationFrame(() => {
        const hB = elB.offsetHeight;
        document.body.removeChild(elB);
        if (hB > 0) {
          setSafeBottom(`${hB}px`);
          document.documentElement.style.setProperty("--safe-bottom", `${hB}px`);
        }

        const hT = elT.offsetHeight;
        document.body.removeChild(elT);
        // Always set --sat: use measured value if > 0, else 44px for iOS status bar
        const satPx = hT > 0 ? hT : 44;
        document.documentElement.style.setProperty("--sat", `${satPx}px`);
      });
    });
  }, []);

  // Hide nav when keyboard is open
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    let showUnsub: (() => void) | null = null;
    let hideUnsub: (() => void) | null = null;
    (async () => {
      try {
        const { Keyboard } = await import("@capacitor/keyboard");
        const s = await Keyboard.addListener("keyboardWillShow", () => setKeyboardOpen(true));
        const h = await Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
        showUnsub = () => s.remove();
        hideUnsub = () => h.remove();
      } catch { /* web — no-op */ }
    })();
    return () => { showUnsub?.(); hideUnsub?.(); };
  }, []);

  // Profile panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);

  const openPanel = () => {
    if (userId) {
      // Logged in: go to dashboard hub directly — no panel
      void hapticLight();
      startNavigation("/dashboard", { overlay: "white" });
      return;
    }
    // Unauthenticated: show sign-in prompt panel
    setPanelOpen(true);
    setPanelClosing(false);
  };

  const closePanel = () => {
    setPanelClosing(true);
    setTimeout(() => {
      setPanelOpen(false);
      setPanelClosing(false);
    }, PANEL_ANIM_MS);
  };

  const handlePanelNavigate = (href: string) => {
    startNavigation(href, { overlay: "transparent" });
    closePanel();
  };

  const isHomeActive      = activeTab === "home";
  const isDiscoverActive  = activeTab === "discover";
  const isExploreActive   = activeTab === "explore";
  const isMapActive       = activeTab === "map";
  const isDashboardActive = pathname.startsWith("/dashboard");

  const displayName = profile?.full_name || "My Account";
  const avatarUrl = avatarThumbUrl(profile?.avatar_url);

  return (
    <>
      {/* Spacer suppressed — pages handle their own bottom padding */}

      {/* White fill below nav to cover any background bleed under safe area */}
      {!keyboardOpen && <div className="fixed inset-x-0 bottom-0 z-[3199] lg:hidden bg-white" style={{ height: safeBottom }} />}

      {!keyboardOpen && <div id="bottom-nav" className="fixed inset-x-0 z-[3200] border-t border-gray-200 bg-white lg:hidden" style={{ bottom: safeBottom }}>
        <nav className="mx-auto flex max-w-[640px] items-stretch justify-between px-2 h-[52px]">
          <TabNavItem label="Home"     icon="house"    tab="home"     isActive={isHomeActive} />
          <TabNavItem label="Discover" icon="compass"  tab="discover" isActive={isDiscoverActive} />
          <TabNavItem label="Explore"  icon="search"   tab="explore"  isActive={isExploreActive} />
          <MapNavItem isActive={isMapActive} />

          {/* Profile / Sign-in tab */}
          <button
            type="button"
            onClick={openPanel}
            aria-label={userId ? "Open profile menu" : "Sign in"}
            className="flex flex-1 items-center justify-center py-3 nav-item-tap"
          >
            <span className="nav-item-icon" style={{ display: "flex" }}>
              {userId ? (
                <ProfileTabIcon
                  avatarUrl={avatarUrl}
                  initial={displayName.charAt(0).toUpperCase()}
                  isActive={isDashboardActive || panelOpen}
                />
              ) : (
                <Icon
                  name="user-round"
                  size={ICON_SIZE}
                  className={isDashboardActive ? ACTIVE_COLOR_CLASS : INACTIVE_COLOR_CLASS}
                />
              )}
            </span>
          </button>
        </nav>
      </div>}

      {/* Booking.com-style profile panel */}
      <ProfilePanel
        open={panelOpen}
        closing={panelClosing}
        onClose={closePanel}
        avatarUrl={avatarUrl}
        displayName={displayName}
        isLoggedIn={!!userId}
        onNavigate={handlePanelNavigate}
      />
    </>
  );
}
