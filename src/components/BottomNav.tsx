"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import Icon from "./Icon";

const ACTIVE_COLOR_CLASS = "text-[#ff752bff]"; // pink like screenshot
const INACTIVE_COLOR_CLASS = "text-[#CFCFCF]"; // soft grey
const ICON_SIZE = 23; // 👈 change this to make all bottom-nav icons bigger/smaller

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
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
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
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  // Keep this in sync with Header auth
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
  }, []);

  const go = (href: string) => {
    router.push(href);
  };

  const isHomeActive = pathname === "/";
  const isHeritageActive = pathname.startsWith("/heritage");
  const isExploreActive = pathname.startsWith("/explore");
  const isMapActive = pathname.startsWith("/map");
  const isDashboardActive = pathname.startsWith("/dashboard");

  const dashboardHref = user ? "/dashboard" : "/auth/sign-in";

  return (
    <>
      {/* Spacer so content isn't hidden behind the bar on small screens */}
      <div className="lg:hidden h-[72px]" />

      <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-gray-200 bg-white/100 backdrop-blur-lg lg:hidden">
        <nav className="mx-auto flex max-w-[640px] items-stretch justify-between px-2 pt-1 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))]">
          {/* Home */}
          <NavItem
            label="Home"
            icon="home"
            href="/"
            isActive={isHomeActive}
            onClick={() => go("/")}
          />

          {/* Heritage */}
          <NavItem
            label="Heritage"
            icon="map-marker-alt"
            href="/heritage"
            isActive={isHeritageActive}
            onClick={() => go("/heritage")}
          />

          {/* Explore */}
          <NavItem
            label="Explore"
            icon="search"
            href="/explore"
            isActive={isExploreActive}
            onClick={() => go("/explore")}
          />

          {/* Map */}
          <NavItem
            label="Map"
            icon="map"
            href="/map"
            isActive={isMapActive}
            onClick={() => go("/map")}
          />

          {/* Dashboard / Sign in */}
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
