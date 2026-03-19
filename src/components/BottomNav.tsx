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

const dashboardNav = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/profile", label: "Profile", icon: "user" },
  { href: "/dashboard/bookmarks", label: "Bookmarks", icon: "heart" },
  { href: "/dashboard/mywishlists", label: "Wishlists", icon: "list-ul" },
  { href: "/dashboard/mycollections", label: "Collections", icon: "retro" },
  { href: "/dashboard/mytrips", label: "My Trips", icon: "route" },
  { href: "/dashboard/notebook", label: "Notebook", icon: "book" },
  {
    href: "/dashboard/placesvisited",
    label: "Places Visited",
    icon: "map-marker-alt",
  },
  { href: "/dashboard/myreviews", label: "My Reviews", icon: "star" },
  { href: "/dashboard/portfolio", label: "My Portfolio", icon: "image" },
  {
    href: "/dashboard/account-details",
    label: "Account Details",
    icon: "lightbulb",
  },
];

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

/** The WhatsApp-style slide-up profile panel. */
function ProfilePanel({
  open,
  closing,
  onClose,
  avatarUrl,
  displayName,
  onNavigate,
}: {
  open: boolean;
  closing: boolean;
  onClose: () => void;
  avatarUrl: string;
  displayName: string;
  onNavigate: (href: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const panelRef = useRef<HTMLDivElement>(null);

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
      ref={panelRef}
      className={`fixed inset-0 z-[3200] bg-[#f0f2f5] flex flex-col overflow-hidden transition-transform duration-[320ms] ease-out ${
        closing ? "translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0"
        style={{ paddingTop: "calc(0.85rem + env(safe-area-inset-top, 0px))" }}
      >
        <span className="text-[17px] font-semibold text-gray-800">Profile</span>
        <button
          type="button"
          onClick={() => { void hapticLight(); onClose(); }}
          aria-label="Close"
          className="w-8 h-8 rounded-full bg-white/70 flex items-center justify-center text-gray-500 active:bg-white"
        >
          <Icon name="times" size={15} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile section */}
        <div className="flex flex-col items-center px-6 pt-6 pb-8">
          {/* Avatar */}
          <div className="relative">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile"
                className="w-28 h-28 rounded-full object-cover shadow-md"
              />
            ) : (
              <div className="w-28 h-28 rounded-full bg-[var(--brand-blue)] flex items-center justify-center text-white text-4xl font-bold shadow-md">
                {initial}
              </div>
            )}
            {/* Online dot */}
            <div className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-[#25d366] border-2 border-[#f0f2f5]" />
          </div>

          {/* Name */}
          <h2 className="mt-4 text-[22px] font-bold text-gray-900 text-center leading-snug">
            {displayName || "My Account"}
          </h2>
          <p className="mt-0.5 text-[13px] text-gray-500">Heritage of Pakistan</p>
        </div>

        {/* "My Dashboard" section */}
        <div className="px-4 mb-1">
          <p className="text-[13px] font-medium text-gray-500 px-1 mb-2 uppercase tracking-wide">
            My Dashboard
          </p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {dashboardNav.map((item, i) => {
              const isActive = pathname === item.href;
              return (
                <div key={item.href}>
                  <button
                    type="button"
                    onClick={() => { void hapticLight(); onNavigate(item.href); }}
                    className={`w-full flex items-center gap-3 px-4 py-[13px] transition-colors duration-100 active:bg-gray-50 ${
                      isActive ? "bg-orange-50/60" : ""
                    }`}
                  >
                    <Icon
                      name={item.icon}
                      size={20}
                      className={isActive ? "text-[#ff752b]" : "text-gray-400"}
                    />
                    <span
                      className={`flex-1 text-left text-[15.5px] ${
                        isActive
                          ? "font-semibold text-[#ff752b]"
                          : "font-normal text-gray-800"
                      }`}
                    >
                      {item.label}
                    </span>
                    <Icon name="chevron-right" size={14} className="text-gray-300" />
                  </button>
                  {i < dashboardNav.length - 1 && (
                    <div className="h-px bg-gray-100 ml-11" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sign out card */}
        <div className="px-4 mt-4">
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => { void hapticMedium(); void handleLogout(); }}
              className="w-full flex items-center gap-3 px-4 py-[13px] active:bg-red-50 transition-colors duration-100"
            >
              <Icon name="logout" size={20} className="text-red-500" />
              <span className="flex-1 text-left text-[15.5px] text-red-500">
                Sign Out
              </span>
              <Icon name="chevron-right" size={14} className="text-gray-300" />
            </button>
          </div>
        </div>

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

  // Lock safe-area-inset-bottom once after first paint — prevents it from
  // collapsing to 0 on pages where iOS dynamically adjusts the value.
  const [safeBottom, setSafeBottom] = useState<string>("env(safe-area-inset-bottom, 0px)");
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;";
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        const h = el.offsetHeight;
        document.body.removeChild(el);
        if (h > 0) setSafeBottom(`${h}px`);
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
    if (!userId) {
      if (typeof window !== "undefined") window.location.href = "/auth/sign-in?redirectTo=/";
      return;
    }
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

      {/* WhatsApp-style profile panel */}
      <ProfilePanel
        open={panelOpen}
        closing={panelClosing}
        onClose={closePanel}
        avatarUrl={avatarUrl}
        displayName={displayName}
        onNavigate={handlePanelNavigate}
      />
    </>
  );
}
