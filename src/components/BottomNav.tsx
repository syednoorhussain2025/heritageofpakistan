"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import Icon from "./Icon";
import { useLoaderEngine } from "@/components/loader-engine/LoaderEngineProvider";

const ACTIVE_COLOR_CLASS = "text-[#ff752bff]";
const INACTIVE_COLOR_CLASS = "text-[#A8A8A8]";
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
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-transform duration-300 ease-out active:scale-110"
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
            href="/heritage"
            isActive={isHeritageActive}
            onClick={() => go("/heritage")}
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
