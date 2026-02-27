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

  const handleLogout = async () => {
    onClose();
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
          onClick={onClose}
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
                    onClick={() => onNavigate(item.href)}
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
              onClick={handleLogout}
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
      go("/auth/sign-in?redirectTo=/");
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
