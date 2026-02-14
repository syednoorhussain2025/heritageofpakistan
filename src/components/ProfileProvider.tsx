// src/components/ProfileProvider.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/browser";
import { useAuthUserId } from "@/hooks/useAuthUserId";

// Define the shape of the profile data we'll be storing
type Profile = {
  full_name: string | null;
  avatar_url: string | null;
  badge: string | null; // ✅ ADDED: Include the badge field
};

// Create the context with a default value
const ProfileContext = createContext<{
  profile: Profile | null;
  loading: boolean;
}>({
  profile: null,
  loading: true,
});

// Create the Provider component
export function ProfileProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useAuthUserId();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setProfile(null);
      return;
    }

    async function fetchProfile() {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, badge") // ✅ ADDED: Fetch the badge from the database
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        setProfile(null);
      } else {
        setProfile(data);
      }
      setLoading(false);
    }

    fetchProfile();
  }, [userId, supabase]);

  const value = { profile, loading };

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

// Create a custom hook for easy access to the profile data
export function useProfile() {
  return useContext(ProfileContext);
}
