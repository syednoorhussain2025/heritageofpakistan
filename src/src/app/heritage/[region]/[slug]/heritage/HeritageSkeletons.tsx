// src/components/HeritageSkeletons.tsx

import React from "react";
import HeritageSection from "./HeritageSection";

/* -------------------------- Small skeleton atoms -------------------------- */

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

function SkeletonCircle({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-full bg-gray-200 ${className}`} />
  );
}

/* --------------------------------- Hero ---------------------------------- */

export function HeroSkeleton() {
  return (
    <div
      className="relative w-full h-screen"
      style={{
        // Pull hero behind the sticky (transparent) header and compensate inside.
        marginTop: "calc(var(--sticky-offset, 72px) * -1)",
        paddingTop: "var(--sticky-offset, 72px)",
      }}
    >
      <div className="w-full h-full bg-gray-200 animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />
      <div className="absolute inset-0 flex items-end">
        <div className="w-full pb-6 grid grid-cols-1 md:grid-cols-2 gap-6 px-[54px] md:px-[82px] lg:px-[109px] max-w-screen-2xl mx-auto">
          <div className="text-white">
            <SkeletonBar className="h-10 w-72 mb-3" />
            <SkeletonBar className="h-4 w-96 mb-2" />
            <SkeletonBar className="h-4 w-64" />
            <div className="mt-4 flex items-center gap-3">
              <SkeletonBar className="h-4 w-20" />
              <SkeletonBar className="h-4 w-28" />
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <SkeletonBar className="h-7 w-44 rounded-full" />
            <SkeletonBar className="h-7 w-64 rounded-full" />
            <SkeletonBar className="h-9 w-40 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Sidebar Card ------------------------------ */

export function SidebarCardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <SkeletonBar className="h-5 w-48 mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} className="h-4 w-full mb-2" />
      ))}
    </div>
  );
}

/* -------------------------------- Gallery -------------------------------- */

export function GallerySkeleton({ count = 6 }: { count?: number }) {
  return (
    <HeritageSection id="gallery" title="Photo Gallery" iconName="gallery">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden">
            <SkeletonBar className="h-40 w-full" />
            <SkeletonBar className="h-5 w-32 mt-2 ml-2 mb-2" />
          </div>
        ))}
      </div>
      <SkeletonBar className="h-9 w-48 rounded-lg mt-3" />
    </HeritageSection>
  );
}

/* ---------------------------- Bibliography list --------------------------- */

export function BibliographySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <HeritageSection
      id="bibliography"
      title="Bibliography & Sources"
      iconName="bibliography-sources"
    >
      <ol className="list-decimal list-inside space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i}>
            <SkeletonBar className="h-4 w-3/4" />
          </li>
        ))}
      </ol>
    </HeritageSection>
  );
}

/* --------------------------------- Reviews -------------------------------- */

export function ReviewsSkeleton() {
  return (
    <HeritageSection id="reviews" title="Traveler Reviews" iconName="star">
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-3">
            <div className="flex items-center gap-3 mb-2">
              <SkeletonCircle className="w-9 h-9" />
              <SkeletonBar className="h-4 w-40" />
            </div>
            <SkeletonBar className="h-4 w-full mb-2" />
            <SkeletonBar className="h-4 w-5/6 mb-2" />
            <SkeletonBar className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </HeritageSection>
  );
}
