"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import Icon from "./Icon";
import { useLoaderEngine } from "@/components/loader-engine/LoaderEngineProvider";

// WCAG-compliant contrast on white background
const ACTIVE_COLOR_CLASS = "text-[#B45F00]"; // darker brand orange, ~4.6:1
const INACTIVE_COLOR_CLASS = "text-[#6B6B6B]"; // darker gray, ~5.3:1
const ICON_SIZE = 23;

function NavItem({
  label,
  icon,
  href,
  isActive,
  onClick,
}: {
  label: string;
  icon: string;
  href: string;
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

export default function BottomNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const { startNavigation } = useLoaderEngine();

  const [activePath, setActivePath] = useState(pathname);
  const [lastHeritagePath, setLastHeritagePath] = useState<string | null>(null);

  useEffect(() => {
    setActivePath(pathname);
  }, [pathname]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load and keep last heritage path in sync whenever the route changes
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

  const currentPath = activePath || pathname;

  const isHomeActive = currentPath === "/";
  const isHeritageActive = currentPath.startsWith("/heritage");
  const isExploreActive = currentPath.startsWith("/explore");
  const isMapActive = currentPath.startsWith("/map");
  const isDashboardActive = currentPath.startsWith("/dashboard");

  const dashboardHref = user ? "/dashboard" : "/auth/sign-in";
  const heritageDetailRe = /^\/heritage\/[^/]+\/[^/]+\/?$/;
  const isHeritageDetail = heritageDetailRe.test(pathname || "");

  // Use last opened heritage page if available, otherwise fall back to Lahore Fort
  const heritageHref =
    lastHeritagePath && lastHeritagePath.startsWith("/heritage/")
      ? lastHeritagePath
      : "/heritage/punjab/lahore-fort";

  return (
    <>
      {!isHeritageDetail && <div className="lg:hidden h-[72px]" />}

      <div className="fixed inset-x-0 bottom-0 z-[3000] border-t border-gray-200 bg-white/100 backdrop-blur-lg lg:hidden">
        <nav className="mx-auto flex max-w-[640px] items-stretch justify-between px-2 pt-1 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))]">
          <NavItem
            label="Home"
            icon="home"
            href="/"
            isActive={isHomeActive}
            onClick={() => go("/")}
          />
          <NavItem
            label="Heritage"
            icon="map-marker-alt"
            href={heritageHref}
            isActive={isHeritageActive}
            onClick={() => go(heritageHref)}
          />
          <NavItem
            label="Explore"
            icon="search"
            href="/explore"
            isActive={isExploreActive}
            onClick={() => go("/explore")}
          />
          <NavItem
            label="Map"
            icon="map"
            href="/map"
            isActive={isMapActive}
            onClick={() => go("/map")}
          />
          <NavItem
            label="Dashboard"
            icon="dashboard"
            href={dashboardHref}
            isActive={isDashboardActive}
            onClick={() => go(dashboardHref)}
          />
        </nav>
      </div>
    </>
  );
}
