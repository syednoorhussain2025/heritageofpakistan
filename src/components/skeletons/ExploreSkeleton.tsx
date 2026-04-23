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
      {/* Teal header — matches centered title + inline status row */}
      <div className="bg-[var(--brand-green)]" style={{ paddingTop: "calc(44px + env(safe-area-inset-top, 0px))" }}>
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-center justify-center mb-1.5">
            <Bar className="h-5 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Bar className="h-3.5 w-3.5 rounded-sm" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-3 w-10" />
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
