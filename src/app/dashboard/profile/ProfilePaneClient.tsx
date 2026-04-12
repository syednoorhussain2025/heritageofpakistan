// Client wrapper for the profile pane — fetches its own data so it can be
// pre-mounted in DashboardPaneShell without a server round-trip.
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import ProfileForm from "./profile-form";

export default function ProfilePaneClient() {
  const supabase = createClient();
  const { userId } = useAuthUserId();

  const [data, setData] = useState<{
    account: any;
    categories: any[];
    interests: any[];
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [accountRes, categoriesRes, interestsRes] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url, bio, city, country_code, travel_style, public_profile").eq("id", userId).single(),
        supabase.from("categories").select("id, name, parent_id").is("parent_id", null).order("name"),
        supabase.from("user_interests").select("category_id, weight").eq("user_id", userId),
      ]);
      setData({
        account: accountRes.data ?? null,
        categories: categoriesRes.data ?? [],
        interests: interestsRes.data ?? [],
      });
    })();
  }, [userId]);

  if (!data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 w-20 rounded-full bg-gray-200 mx-auto" />
        <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
        <div className="h-10 bg-gray-100 rounded-xl" />
        <div className="h-10 bg-gray-100 rounded-xl" />
        <div className="h-10 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  return <ProfileForm account={data.account} categories={data.categories} interests={data.interests} />;
}
