"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import Image from "next/image";
import Icon from "./Icon";
import { useLoaderEngine } from "@/components/loader-engine/LoaderEngineProvider";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useProfile } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/browser";
import { hapticLight, hapticMedium } from "@/lib/haptics";

const ACTIVE_COLOR_CLASS = "text-[#ff752bff]";
const INACTIVE_COLOR_CLASS = "text-[#111111]";
const ICON_SIZE = 29;

const PANEL_ANIM_MS = 320;


function NavItem({
  label,
  icon,
  isActive,
  href,
  onPress,
}: {
  label: string;
  icon: string;
  isActive: boolean;
  href: string;
  onPress?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex flex-1 items-center justify-center py-3 nav-item-tap"
      onTouchStart={() => { void hapticLight(); onPress?.(); }}
      onMouseDown={() => onPress?.()}
    >
      <span className="nav-item-icon" style={{ display: "flex", transformOrigin: "center center" }}>
        <Icon
          name={icon}
          size={ICON_SIZE}
          className={isActive ? ACTIVE_COLOR_CLASS : INACTIVE_COLOR_CLASS}
        />
      </span>
    </Link>
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
  const ring = isActive ? "ring-2 ring-[#ff752bff]" : "ring-2 ring-gray-300";

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

const mainNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/profile", label: "Profile", icon: "user" },
  { href: "/dashboard/bookmarks", label: "Bookmarks", icon: "heart" },
  { href: "/dashboard/mywishlists", label: "Wishlists", icon: "list-ul" },
  { href: "/dashboard/mycollections", label: "Collections", icon: "retro" },
  { href: "/dashboard/mytrips", label: "My Trips", icon: "route" },
  { href: "/dashboard/notebook", label: "Notebook", icon: "book" },
];

const travelActivityItems = [
  { href: "/dashboard/placesvisited", label: "Places Visited", icon: "map-marker-alt" },
  { href: "/dashboard/myreviews", label: "My Reviews", icon: "star" },
  { href: "/dashboard/portfolio", label: "My Portfolio", icon: "image" },
];

const helpItems = [
  { href: "/dashboard/account-details", label: "Account Details", icon: "lightbulb" },
];

function NavListItem({
  item,
  isActive,
  onPress,
}: {
  item: { href: string; label: string; icon: string };
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => { void hapticLight(); onPress(); }}
      className="w-full flex items-center gap-3.5 px-4 py-[13px] transition-colors duration-100 active:bg-gray-50"
    >
      <div className="w-8 h-8 rounded-lg bg-[#e6f7f3] flex items-center justify-center flex-shrink-0">
        <Icon name={item.icon} size={17} className={isActive ? "text-[#00b78b]" : "text-[#00b78b]"} />
      </div>
      <span className={`flex-1 text-left text-[15px] ${isActive ? "font-semibold text-[#00b78b]" : "font-normal text-gray-800"}`}>
        {item.label}
      </span>
      <Icon name="chevron-right" size={13} className="text-gray-300" />
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

  const initial = displayName.charAt(0).toUpperCase() || "?";

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[3200] bg-[#f5f5f5] flex flex-col overflow-hidden transition-transform duration-[320ms] ease-out ${
        closing ? "translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Teal header */}
      <div
        className="bg-[#00b78b] flex-shrink-0 flex flex-col px-4 pb-5"
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
                <Icon name="user" size={32} className="text-white" />
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
            className="mt-4 w-full py-3 rounded-xl bg-white text-[#00b78b] text-[15px] font-bold text-center active:bg-gray-100 transition-colors"
          >
            Sign in or register
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* Main nav group */}
        <div className="px-4 mt-4">
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
            {mainNavItems.map((item) => (
              <NavListItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                onPress={() => onNavigate(item.href)}
              />
            ))}
          </div>
        </div>

        {/* Help & Support group */}
        <div className="px-4 mt-5">
          <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">Help &amp; Support</p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
            {helpItems.map((item) => (
              <NavListItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                onPress={() => onNavigate(item.href)}
              />
            ))}
          </div>
        </div>

        {/* Travel Activity group */}
        <div className="px-4 mt-5">
          <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">Travel Activity</p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
            {travelActivityItems.map((item) => (
              <NavListItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                onPress={() => onNavigate(item.href)}
              />
            ))}
          </div>
        </div>

        {/* Sign out — only when logged in */}
        {isLoggedIn && (
          <div className="px-4 mt-5">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => { void hapticMedium(); void handleLogout(); }}
                className="w-full flex items-center gap-3.5 px-4 py-[13px] active:bg-red-50 transition-colors duration-100"
              >
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Icon name="logout" size={17} className="text-red-500" />
                </div>
                <span className="flex-1 text-left text-[15px] text-red-500">Sign Out</span>
                <Icon name="chevron-right" size={13} className="text-gray-300" />
              </button>
            </div>
          </div>
        )}

        {/* Safe-area bottom padding */}
        <div className="h-[calc(2rem+env(safe-area-inset-bottom,0px))]" />
      </div>
    </div>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const { userId } = useAuthUserId();
  const { profile } = useProfile();
  const { startNavigation } = useLoaderEngine();

  const [lastHeritagePath, setLastHeritagePath] = useState<string | null>(null);
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null);
  // Clear optimistic state once navigation completes
  useEffect(() => { setOptimisticHref(null); }, [pathname]);

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

  // Profile panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("lastHeritagePath");
    setLastHeritagePath(stored);
  }, [pathname]);

  const openPanel = () => {
    if (userId) {
      // Logged in: go to dashboard hub directly — no panel
      void hapticLight();
      startNavigation("/dashboard");
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
    closePanel();
    setTimeout(() => startNavigation(href), PANEL_ANIM_MS);
  };

  const isHomeActive = optimisticHref === "/" || (!optimisticHref && pathname === "/");
  const isHeritageActive = optimisticHref?.startsWith("/heritage") || (!optimisticHref && pathname.startsWith("/heritage"));
  const isExploreActive = optimisticHref === "/explore" || (!optimisticHref && pathname.startsWith("/explore"));
  const isMapActive = optimisticHref === "/map" || (!optimisticHref && pathname.startsWith("/map"));
  const isDashboardActive = pathname.startsWith("/dashboard");

  const heritageDetailRe = /^\/heritage\/[^/]+\/[^/]+\/?$/;
  const isHeritageDetail = heritageDetailRe.test(pathname || "");
  const isTabPage = pathname === "/" || pathname.startsWith("/explore");
  const isHomePage = isTabPage;

  const heritageHref =
    lastHeritagePath && lastHeritagePath.startsWith("/heritage/")
      ? lastHeritagePath
      : "/heritage/punjab/lahore-fort";

  const displayName = profile?.full_name || "My Account";
  const avatarUrl = avatarThumbUrl(profile?.avatar_url);

  return (
    <>
      {/* Spacer suppressed — pages handle their own bottom padding */}

      {/* White fill below nav to cover any background bleed under safe area */}
      <div className="fixed inset-x-0 bottom-0 z-[2999] lg:hidden bg-white" style={{ height: safeBottom }} />

      <div id="bottom-nav" className="fixed inset-x-0 z-[3000] border-t border-gray-200 bg-white lg:hidden" style={{ bottom: safeBottom }}>
        <nav className="mx-auto flex max-w-[640px] items-stretch justify-between px-2 h-[52px]">
          <NavItem label="Home" icon="house" isActive={isHomeActive} href="/" onPress={() => setOptimisticHref("/")} />
          <NavItem label="Heritage" icon="compass" isActive={isHeritageActive} href={heritageHref} onPress={() => setOptimisticHref(heritageHref)} />
          <NavItem label="Explore" icon="search" isActive={isExploreActive} href="/explore" onPress={() => setOptimisticHref("/explore")} />
          <NavItem label="Map" icon="adminmap" isActive={isMapActive} href="/map" onPress={() => setOptimisticHref("/map")} />

          {/* Profile / Sign-in tab */}
          <button
            type="button"
            onTouchStart={() => void hapticLight()}
            onClick={openPanel}
            aria-label={userId ? "Open profile menu" : "Sign in"}
            className="flex flex-1 items-center justify-center py-3 nav-item-tap"
          >
            <span className="nav-item-icon" style={{ display: "flex", transformOrigin: "center center" }}>
              {userId ? (
                <ProfileTabIcon
                  avatarUrl={avatarUrl}
                  initial={displayName.charAt(0).toUpperCase()}
                  isActive={isDashboardActive || panelOpen}
                />
              ) : (
                <Icon
                  name="user"
                  size={ICON_SIZE}
                  className={isDashboardActive ? ACTIVE_COLOR_CLASS : INACTIVE_COLOR_CLASS}
                />
              )}
            </span>
          </button>
        </nav>
      </div>

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
