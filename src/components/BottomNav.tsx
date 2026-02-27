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

const ACTIVE_COLOR_CLASS = "text-[#ff752bff]";
const INACTIVE_COLOR_CLASS = "text-[#474747]";
const ICON_SIZE = 23;

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
  onClick,
}: {
  label: string;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-transform duration-700 ease-out active:scale-140"
    >
      <Icon
        name={icon}
        size={ICON_SIZE}
        className={isActive ? ACTIVE_COLOR_CLASS : INACTIVE_COLOR_CLASS}
      />
      <span
        className={`text-[11px] font-medium ${
          isActive ? ACTIVE_COLOR_CLASS : INACTIVE_COLOR_CLASS
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/** Builds a thumbnail URL for the avatar. */
function avatarThumbUrl(input: string | null | undefined): string {
  if (!input) return "";
  if (/^https?:\/\//i.test(input)) return input;
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!SUPA_URL) return "";
  return `${SUPA_URL}/storage/v1/object/public/${input.replace(/^\/+/, "")}`;
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

  // Swipe-down to close
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 60) onClose();
    touchStartY.current = null;
  };

  const handleLogout = async () => {
    onClose();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  };

  const initial = displayName.charAt(0).toUpperCase() || "?";

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[3100] bg-black/40 transition-opacity duration-300 ${
          closing ? "opacity-0" : "opacity-100"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed inset-x-0 bottom-0 z-[3200] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-[320ms] ease-out ${
          closing ? "translate-y-full" : "translate-y-0"
        }`}
        style={{ maxHeight: "85vh" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Profile header */}
        <div className="flex flex-col items-center px-6 pt-4 pb-5 border-b border-gray-100 flex-shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover ring-2 ring-gray-200 shadow-sm"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[var(--brand-blue)] flex items-center justify-center text-white text-3xl font-bold shadow-sm">
              {initial}
            </div>
          )}
          <p className="mt-3 text-lg font-semibold text-gray-900 text-center leading-tight">
            {displayName || "My Account"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Heritage of Pakistan</p>
        </div>

        {/* Nav items – scrollable */}
        <div className="flex-1 overflow-y-auto py-2">
          {dashboardNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => onNavigate(item.href)}
                className={`w-full flex items-center gap-4 px-5 py-3.5 transition-colors duration-150 active:bg-gray-50 ${
                  isActive ? "bg-orange-50" : ""
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isActive ? "bg-orange-100" : "bg-gray-100"
                  }`}
                >
                  <Icon
                    name={item.icon}
                    size={18}
                    className={isActive ? "text-orange-600" : "text-gray-500"}
                  />
                </div>
                <span
                  className={`text-[15px] font-medium ${
                    isActive ? "text-orange-700" : "text-gray-800"
                  }`}
                >
                  {item.label}
                </span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-500" />
                )}
              </button>
            );
          })}

          {/* Divider + Sign out */}
          <div className="h-px bg-gray-100 mx-5 my-2" />
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-5 py-3.5 transition-colors duration-150 active:bg-red-50"
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-red-50">
              <Icon name="logout" size={18} className="text-red-500" />
            </div>
            <span className="text-[15px] font-medium text-red-500">
              Sign Out
            </span>
          </button>

          {/* Safe-area padding */}
          <div className="h-[calc(0.5rem+env(safe-area-inset-bottom,0px))]" />
        </div>
      </div>
    </>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const { userId } = useAuthUserId();
  const { profile } = useProfile();
  const { startNavigation } = useLoaderEngine();

  const [activePath, setActivePath] = useState(pathname);
  const [lastHeritagePath, setLastHeritagePath] = useState<string | null>(null);

  // Profile panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);

  useEffect(() => {
    setActivePath(pathname);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("lastHeritagePath");
    setLastHeritagePath(stored);
  }, [pathname]);

  const go = (href: string) => {
    if (!href || href === pathname) return;
    setActivePath(href);
    startNavigation(href);
  };

  const openPanel = () => {
    if (!userId) {
      go("/auth/sign-in");
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
    setTimeout(() => go(href), PANEL_ANIM_MS);
  };

  const currentPath = activePath || pathname;

  const isHomeActive = currentPath === "/";
  const isHeritageActive = currentPath.startsWith("/heritage");
  const isExploreActive = currentPath.startsWith("/explore");
  const isMapActive = currentPath.startsWith("/map");
  const isDashboardActive = currentPath.startsWith("/dashboard");

  const heritageDetailRe = /^\/heritage\/[^/]+\/[^/]+\/?$/;
  const isHeritageDetail = heritageDetailRe.test(pathname || "");

  const heritageHref =
    lastHeritagePath && lastHeritagePath.startsWith("/heritage/")
      ? lastHeritagePath
      : "/heritage/punjab/lahore-fort";

  const displayName = profile?.full_name || "My Account";
  const avatarUrl = avatarThumbUrl(profile?.avatar_url);

  return (
    <>
      {!isHeritageDetail && <div className="lg:hidden h-[72px]" />}

      <div className="fixed inset-x-0 bottom-0 z-[3000] border-t border-gray-200 bg-white/100 backdrop-blur-lg lg:hidden">
        <nav className="mx-auto flex max-w-[640px] items-stretch justify-between px-2 pt-1 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))]">
          <NavItem
            label="Home"
            icon="home"
            isActive={isHomeActive}
            onClick={() => go("/")}
          />
          <NavItem
            label="Heritage"
            icon="map-marker-alt"
            isActive={isHeritageActive}
            onClick={() => go(heritageHref)}
          />
          <NavItem
            label="Explore"
            icon="search"
            isActive={isExploreActive}
            onClick={() => go("/explore")}
          />
          <NavItem
            label="Map"
            icon="map"
            isActive={isMapActive}
            onClick={() => go("/map")}
          />

          {/* Profile / Sign-in tab */}
          <button
            type="button"
            onClick={openPanel}
            aria-label={userId ? "Open profile menu" : "Sign in"}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-transform duration-700 ease-out active:scale-140"
          >
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
            <span
              className={`text-[11px] font-medium ${
                isDashboardActive || panelOpen
                  ? ACTIVE_COLOR_CLASS
                  : INACTIVE_COLOR_CLASS
              }`}
            >
              {userId ? "You" : "Sign In"}
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
