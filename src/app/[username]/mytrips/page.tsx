// app/[username]/mytrips/page.tsx
"use client";

import { useParams } from "next/navigation";
import MyTripsGrid from "@/components/MyTripsGrid";

export default function UserTripsPage() {
  const { username } = useParams<{ username: string }>();
  if (!username) return null;

  return (
    <div className="pt-8 min-h-screen bg-[url('https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/background.png')] bg-repeat bg-[length:500px] bg-fixed">
      <MyTripsGrid
        username={username}
        variant="page" // full-page container + breadcrumb + title
        title="Your Trips"
        allowDelete={true}
      />
    </div>
  );
}
