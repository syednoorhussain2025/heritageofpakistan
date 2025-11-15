// app/dashboard/mytrips/page.tsx
"use client";

import MyTripsGrid from "@/components/MyTripsGrid";

export default function DashboardMyTripsPage() {
  return (
    <div className="p-0">
      {/* Username is resolved inside the component; skeletons render immediately */}
      <MyTripsGrid username="" context="dashboard" />
    </div>
  );
}
