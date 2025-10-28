// app/[username]/mytrips/page.tsx  (SERVER COMPONENT — no "use client")
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MyTripsGrid from "@/components/MyTripsGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UserTripsPage({
  params,
}: {
  params: { username: string };
}) {
  const supabase = await createClient();

  // 1) Require auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/sign-in?redirectTo=/${params.username}/mytrips`);
  }

  // 2) Resolve the signed-in user's canonical username
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.username) {
    redirect(`/auth/sign-in?redirectTo=/${params.username}/mytrips`);
  }

  const canonical = profile.username;

  // 3) If path username ≠ signed-in user's username, redirect to canonical
  if (params.username !== canonical) {
    redirect(`/${canonical}/mytrips`);
  }

  // 4) Render — client grid will use the canonical username only for data lookups
  return (
    <div className="pt-8 min-h-screen bg-[url('https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/background.png')] bg-repeat bg-[length:500px] bg-fixed">
      <MyTripsGrid
        username={canonical}
        variant="page"
        title="Your Trips"
        allowDelete={true}
      />
    </div>
  );
}
