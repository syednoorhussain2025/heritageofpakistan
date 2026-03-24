// src/components/ProfileProvider.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/browser";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { withTimeout } from "@/lib/async/withTimeout";

type Profile = {
  full_name: string | null;
  avatar_url: string | null;
  badge: string | null;
};

const QUERY_TIMEOUT_MS = 12000;

const ProfileContext = createContext<{
  profile: Profile | null;
  loading: boolean;
  updateBadge: (badge: string) => void;
}>({
  profile: null,
  loading: true,
  updateBadge: () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useAuthUserId();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!userId) {
      setLoading(false);
      setProfile(null);
      return;
    }

    async function fetchProfile() {
      setLoading(true);
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("profiles")
            .select("full_name, avatar_url, badge")
            .eq("id", userId)
            .maybeSingle(),
          QUERY_TIMEOUT_MS,
          "profile.fetch"
        );

        if (!active) return;

        if (error) {
          console.error("Error fetching profile:", error);
          setProfile(null);
          return;
        }

        setProfile((data as Profile | null) ?? null);
      } catch (error) {
        if (!active) return;
        console.warn("[ProfileProvider] fetchProfile failed", error);
        // Fail-soft so UI never gets stuck on profile fetch timeout.
        setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchProfile();

    return () => {
      active = false;
    };
  }, [userId, supabase]);

  /** Optimistically update the badge in local state after a badge upgrade */
  const updateBadge = useCallback((badge: string) => {
    setProfile((prev) => prev ? { ...prev, badge } : prev);
  }, []);

  const value = useMemo(() => ({ profile, loading, updateBadge }), [profile, loading, updateBadge]);

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
