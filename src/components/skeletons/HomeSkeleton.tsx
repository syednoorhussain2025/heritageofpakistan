"use client";

// Matches the mobile Home page layout: full-screen hero + search overlay feel

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

export default function HomeSkeleton() {
  return (
    <div className="fixed inset-0 z-[999] bg-black lg:hidden">
      {/* Hero image placeholder */}
      <div className="absolute inset-0 bg-gray-800 animate-pulse" />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/50" />

      {/* Bottom search card */}
      <div className="absolute bottom-[calc(60px+env(safe-area-inset-bottom,0px))] left-0 right-0 px-4">
        <div className="bg-white rounded-2xl px-4 pt-4 pb-4 shadow-2xl">
          <Bar className="h-5 w-32 mb-3" />
          <Bar className="h-11 w-full rounded-xl mb-3" />
          <Bar className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
