// src/app/explore/loading.tsx

// Server Component by default – no "use client" here.
export default function ExploreLoading() {
  return (
    <div className="relative min-h-screen bg-[var(--ivory-cream)]">
      {/* DEBUG BADGE – remove once you're done testing */}
      <div className="fixed top-2 right-2 z-[9999]">
        <span className="rounded-full bg-black/80 text-white text-xs px-3 py-1 shadow-lg">
          Explore loading.tsx
        </span>
      </div>

      <div className="relative z-10">
        <div className="lg:flex">
          {/* LEFT: Filters panel skeleton */}
          <aside className="hidden lg:block w-[360px] fixed left-4 top-[88px] bottom-4 z-20">
            <div className="h-full rounded-2xl bg-white shadow-2xl ring-1 ring-[var(--taupe-grey)] overflow-hidden flex flex-col animate-pulse">
              <div className="px-4 pt-4 pb-3 border-b border-[var(--taupe-grey)]/30">
                <div className="h-5 w-2/3 bg-[var(--taupe-grey)]/40 rounded mb-3" />
                <div className="h-4 w-1/2 bg-[var(--taupe-grey)]/30 rounded" />
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-1/3 bg-[var(--taupe-grey)]/40 rounded" />
                    <div className="h-9 w-full bg-[var(--ivory-cream)] rounded-md" />
                    <div className="h-9 w-full bg-[var(--ivory-cream)] rounded-md" />
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-[var(--taupe-grey)]/30">
                <div className="h-9 w-full bg-[var(--ivory-cream)] rounded-lg" />
              </div>
            </div>
          </aside>

          {/* RIGHT: Main content skeleton */}
          <main className="lg:ml-[380px] p-4 w-full">
            <div className="px-3 sm:px-4 pt-4 sm:pt-5 pb-0 mb-10 sm:mb-4 relative xl:pr-[260px] animate-pulse">
              {/* Headline skeleton */}
              <div className="h-8 sm:h-9 w-2/3 bg-[var(--taupe-grey)]/40 rounded mb-3" />

              {/* Results count skeleton */}
              <div className="h-4 w-40 bg-[var(--taupe-grey)]/30 rounded mb-3" />

              {/* Accent underline */}
              <div className="mt-1 h-[3px] w-20 bg-[var(--mustard-accent)]/70 rounded" />

              {/* Center banner skeleton (desktop) */}
              <div className="hidden xl:flex items-center gap-3 absolute right-2 top-1">
                <div className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg ring-1 ring-[var(--taupe-grey)]/60 px-3 py-2 flex items-center max-w-[360px]">
                  <div className="w-14 h-14 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]/40" />
                  <div className="min-w-0 pl-2 space-y-2">
                    <div className="h-3 w-20 bg-[var(--taupe-grey)]/40 rounded" />
                    <div className="h-4 w-40 bg-[var(--taupe-grey)]/40 rounded" />
                    <div className="h-3 w-28 bg-[var(--taupe-grey)]/30 rounded" />
                  </div>
                </div>
              </div>
            </div>

            {/* Grid of preview card skeletons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="block rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-[var(--taupe-grey)]/60 animate-pulse"
                >
                  {/* Image area */}
                  <div className="relative">
                    <div className="w-full h-48 sm:h-52 bg-[var(--ivory-cream)]" />
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <div className="h-6 bg-[var(--taupe-grey)]/40 rounded w-3/4 mb-2" />
                      <div className="h-4 bg-[var(--taupe-grey)]/30 rounded w-1/2" />
                    </div>
                  </div>

                  {/* Footer area */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="h-4 bg-[var(--taupe-grey)]/40 rounded w-1/3" />
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--ivory-cream)]" />
                      <div className="w-8 h-8 rounded-full bg-[var(--ivory-cream)]" />
                      <div className="w-8 h-8 rounded-full bg-[var(--ivory-cream)]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination skeleton */}
            <div className="flex items-center justify-center gap-3 mt-8 animate-pulse">
              <div className="px-10 py-3 rounded-lg bg-white ring-1 ring-[var(--taupe-grey)]" />
              <div className="h-4 w-24 bg-[var(--taupe-grey)]/40 rounded" />
              <div className="px-10 py-3 rounded-lg bg-white ring-1 ring-[var(--taupe-grey)]" />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
