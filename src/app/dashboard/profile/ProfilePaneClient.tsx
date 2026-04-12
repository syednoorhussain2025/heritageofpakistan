// Client wrapper for the profile pane — uses React Query so data is prefetched
// before the user taps, eliminating the skeleton on open.
"use client";

import { useProfilePane } from "@/hooks/useDashboardQueries";
import ProfileForm from "./profile-form";

export default function ProfilePaneClient() {
  const { data, isLoading } = useProfilePane();

  if (isLoading || !data) {
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
