// app/dashboard/mytrips/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import MyTripsGrid from "@/components/MyTripsGrid";

export default function DashboardMyTripsPage() {
  const supabase = createClient();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) {
          setLoading(false);
          return;
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .maybeSingle();

        setUsername(prof?.username ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  if (loading) return <p className="p-6">Loading your trips...</p>;
  if (!username)
    return (
      <p className="p-6 text-gray-600">Please sign in to view your trips.</p>
    );

  return (
    <div className="p-6">
      <MyTripsGrid
        username={username}
        variant="embedded" // renders inside dashboard right pane
        title="My Trips"
        allowDelete={true}
      />
    </div>
  );
}
