"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLoaderEngine } from "@/components/loader-engine/LoaderEngineProvider";
import { useAuthUserId } from "@/hooks/useAuthUserId";

const ACTIVE_COLOR_CLASS = "text-[#ff752bff]";
const INACTIVE_COLOR_CLASS = "text-[#A8A8A8]";
const ICON_SIZE = 23;

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

export default function BottomNav() {
  const pathname = usePathname();
  const { userId } = useAuthUserId();
  const { startNavigation } = useLoaderEngine();

  const [activePath, setActivePath] = useState(pathname);
  const [lastHeritagePath, setLastHeritagePath] = useState<string | null>(null);

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

  const currentPath = activePath || pathname;

  const isHomeActive = currentPath === "/";
  const isHeritageActive = currentPath.startsWith("/heritage");
  const isExploreActive = currentPath.startsWith("/explore");
  const isMapActive = currentPath.startsWith("/map");
  const isDashboardActive = currentPath.startsWith("/dashboard");

  const dashboardHref = userId ? "/dashboard" : "/auth/sign-in";
  const heritageDetailRe = /^\/heritage\/[^/]+\/[^/]+\/?$/;
  const isHeritageDetail = heritageDetailRe.test(pathname || "");

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
          <NavItem
            label="Dashboard"
            icon="dashboard"
            isActive={isDashboardActive}
            onClick={() => go(dashboardHref)}
          />
        </nav>
      </div>
    </>
  );
}
