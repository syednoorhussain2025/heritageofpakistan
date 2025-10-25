// app/[username]/mytrips/page.tsx
"use client";

import { useParams } from "next/navigation";
import MyTripsGrid from "@/components/MyTripsGrid";

export default function UserTripsPage() {
  const { username } = useParams<{ username: string }>();
  if (!username) return null;

  return (
    <MyTripsGrid
      username={username}
      variant="page" // full-page container + breadcrumb + title
      title="Your Trips"
      allowDelete={true}
    />
  );
}
