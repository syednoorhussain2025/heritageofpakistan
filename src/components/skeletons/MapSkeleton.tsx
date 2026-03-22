"use client";

// Matches the mobile Map page: teal header + full-screen map fill

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/30 ${className}`} />;
}

export default function MapSkeleton() {
  return (
    <div className="lg:hidden fixed inset-0 bg-[#e8e0d8]">
      {/* Teal header — matches MobilePageHeader backgroundColor="var(--brand-green)" minHeight="100px" */}
      <div className="bg-[var(--brand-green)]" style={{ minHeight: "100px", paddingTop: "calc(44px + env(safe-area-inset-top, 0px))" }}>
        <div className="px-4 pt-3 pb-4 space-y-2">
          <Bar className="h-5 w-28" />
          <div className="bg-white/20 rounded-full h-10 w-full animate-pulse" />
        </div>
      </div>

      {/* Map fill — muted tan like a real map background */}
      <div className="absolute inset-0 top-[100px] bg-[#e8e0d8]" style={{ top: "calc(100px + env(safe-area-inset-top, 0px))" }}>
        {/* Fake map grid lines */}
        <svg width="100%" height="100%" className="opacity-20">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#888" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Fake pin dots */}
        {[
          { top: "20%", left: "30%" },
          { top: "35%", left: "60%" },
          { top: "55%", left: "25%" },
          { top: "45%", left: "70%" },
          { top: "65%", left: "50%" },
        ].map((pos, i) => (
          <div
            key={i}
            className="absolute w-4 h-4 rounded-full bg-[var(--brand-green)] border-2 border-white shadow animate-pulse"
            style={{ top: pos.top, left: pos.left }}
          />
        ))}
      </div>
    </div>
  );
}
