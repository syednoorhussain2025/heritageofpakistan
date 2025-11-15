// src/src/app/[username]/mytrips/page.tsx  (SERVER COMPONENT — no "use client")
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MyTripsGrid from "@/components/MyTripsGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserTripsPageProps = {
  // In Next.js 15, params is a Promise
  params: Promise<{ username: string }>;
};

export default async function UserTripsPage({ params }: UserTripsPageProps) {
  // Await the async params object
  const { username } = await params;

  const supabase = await createClient();

  // 1) Require auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirectTo=/${username}/mytrips`);
  }

  // 2) Resolve the signed-in user's canonical username
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.username) {
    redirect(`/auth/sign-in?redirectTo=/${username}/mytrips`);
  }

  const canonical = profile.username;

  // 3) If path username ≠ signed-in user's username, redirect to canonical
  if (username !== canonical) {
    redirect(`/${canonical}/mytrips`);
  }

  // 4) Render — client grid will use the canonical username only for data lookups
  return (
    <div className="pt-8 min-h-screen bg-[url('https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/background.png')] bg-repeat bg-[length:500px] bg-fixed">
      <MyTripsGrid
        username={canonical}
        title="Your Trips"
        allowDelete={true}
      />
    </div>
  );
}
