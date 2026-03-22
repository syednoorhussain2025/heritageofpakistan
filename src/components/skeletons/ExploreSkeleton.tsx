"use client";

// Matches the mobile Explore page layout: teal header + search bar + card grid

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/30 ${className}`} />;
}

function Card() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm">
      <div className="w-full aspect-[4/3] bg-gray-200 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-gray-200 animate-pulse" />
      </div>
    </div>
  );
}

export default function ExploreSkeleton() {
  return (
    <div className="lg:hidden min-h-screen bg-[#f4f4f4]">
      {/* Teal header — matches MobilePageHeader backgroundColor="var(--brand-green)" minHeight="180px" */}
      <div className="bg-[var(--brand-green)]" style={{ minHeight: "180px", paddingTop: "calc(44px + env(safe-area-inset-top, 0px))" }}>
        <div className="px-4 pt-3 pb-5 space-y-3">
          <Bar className="h-6 w-40" />
          {/* Search bar */}
          <div className="bg-white/20 rounded-full h-11 w-full animate-pulse" />
          {/* Filter chips row */}
          <div className="flex gap-2">
            <div className="bg-white/20 rounded-full h-8 w-20 animate-pulse" />
            <div className="bg-white/20 rounded-full h-8 w-24 animate-pulse" />
            <div className="bg-white/20 rounded-full h-8 w-16 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Card grid */}
      <div className="px-4 pt-4 pb-[80px] grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Card key={i} />)}
      </div>
    </div>
  );
}
