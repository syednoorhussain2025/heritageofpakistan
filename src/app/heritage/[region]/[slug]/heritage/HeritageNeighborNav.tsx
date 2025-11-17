import React from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

type HeritageNeighborNavProps = {
  prevHref?: string | null;
  nextHref?: string | null;
  prevTitle?: string | null;
  nextTitle?: string | null;
};

export default function HeritageNeighborNav({
  prevHref,
  nextHref,
  prevTitle,
  nextTitle,
}: HeritageNeighborNavProps) {
  if (!prevHref && !nextHref) return null;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 mt-3 flex items-center justify-between gap-2 text-[13px] text-[#444]">
      {prevHref ? (
        <Link
          href={prevHref}
          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 shadow-sm hover:bg-black/5 transition"
        >
          <Icon name="chevron-left" size={14} />
          <span className="font-medium">Previous</span>
          {prevTitle && (
            <span className="truncate max-w-[9rem] text-[12px] text-[#666]">
              {prevTitle}
            </span>
          )}
        </Link>
      ) : (
        <span />
      )}

      {nextHref ? (
        <Link
          href={nextHref}
          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 shadow-sm hover:bg-black/5 transition ml-auto"
        >
          {nextTitle && (
            <span className="truncate max-w-[9rem] text-[12px] text-[#666] text-right">
              {nextTitle}
            </span>
          )}
          <span className="font-medium">Next</span>
          <Icon name="chevron-right" size={14} />
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
