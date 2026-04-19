"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase/browser";
import { getVariantPublicUrl } from "@/lib/imagevariants";

type Row = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  caption: string | null;
  width?: number | null;
  height?: number | null;
  blur_data_url?: string | null;
  discover_eligible?: boolean | null;
  publicUrl?: string | null;
};

const LEFT_ASPECTS  = ["aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]", "aspect-square", "aspect-[2/3]"];
const RIGHT_ASPECTS = ["aspect-[2/3]", "aspect-square", "aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]"];
const COL2_ASPECTS  = ["aspect-square", "aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]", "aspect-[2/3]"];
const COL3_ASPECTS  = ["aspect-[2/3]", "aspect-[3/4]", "aspect-square", "aspect-[2/3]", "aspect-[3/4]"];

function PhotoTile({
  row,
  index,
  aspectClass,
  eligible,
  onToggle,
  saving,
}: {
  row: Row;
  index: number;
  aspectClass: string;
  eligible: boolean;
  onToggle: (id: string) => void;
  saving: boolean;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl cursor-pointer select-none ${aspectClass}`}
      style={{ backgroundColor: "#e0dcd8" }}
      onClick={() => !saving && onToggle(row.id)}
    >
      {/* Blur placeholder */}
      {row.blur_data_url && !imgLoaded && (
        <div
          className="absolute inset-0 z-[1]"
          style={{
            backgroundImage: `url(${row.blur_data_url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(10px)",
            transform: "scale(1.1)",
          }}
        />
      )}

      {/* Image */}
      {row.publicUrl && (
        <img
          src={row.publicUrl}
          alt={row.caption ?? row.alt_text ?? ""}
          className="absolute inset-0 w-full h-full object-cover z-[2]"
          style={{ opacity: imgLoaded ? 1 : 0, transition: "opacity 0.4s ease" }}
          loading={index < 8 ? "eager" : "lazy"}
          onLoad={() => setImgLoaded(true)}
        />
      )}

      {/* Disabled overlay */}
      {!eligible && (
        <div className="absolute inset-0 z-[4] bg-black/60 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>
      )}

      {/* Enabled checkmark (subtle) */}
      {eligible && imgLoaded && (
        <div className="absolute top-2 right-2 z-[4] w-5 h-5 rounded-full bg-white/80 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
}

export function DiscoverySelectionModal({
  rows,
  siteId,
  onClose,
}: {
  rows: Row[];
  siteId: string | number;
  onClose: (updated: Record<string, boolean>) => void;
}) {
  const [view, setView] = useState<"mobile" | "desktop">("mobile");
  // Local eligible state — id → boolean
  const [eligible, setEligible] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const r of rows) init[r.id] = r.discover_eligible !== false;
    return init;
  });
  const [saving, setSaving] = useState<string | null>(null); // id being saved

  const toggle = useCallback(async (id: string) => {
    const newVal = !eligible[id];
    setEligible((prev) => ({ ...prev, [id]: newVal }));
    setSaving(id);
    try {
      await supabase
        .from("site_images")
        .update({ discover_eligible: newVal })
        .eq("id", id);
    } catch (e) {
      // Revert on error
      setEligible((prev) => ({ ...prev, [id]: !newVal }));
    } finally {
      setSaving(null);
    }
  }, [eligible]);

  // Counts
  const totalEnabled = Object.values(eligible).filter(Boolean).length;

  // Split into columns
  const isMobile = view === "mobile";
  const numCols = isMobile ? 2 : 4;

  const cols: Row[][] = Array.from({ length: numCols }, () => []);
  rows.forEach((r, i) => cols[i % numCols].push(r));

  const aspectArrays = isMobile
    ? [LEFT_ASPECTS, RIGHT_ASPECTS]
    : [LEFT_ASPECTS, RIGHT_ASPECTS, COL2_ASPECTS, COL3_ASPECTS];

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-stretch justify-stretch">
      {/* Panel */}
      <div className="relative flex flex-col w-full h-full bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white z-10 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Discovery Selection</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalEnabled} of {rows.length} photos enabled
            </p>
          </div>

          {/* View switcher */}
          <div className="flex items-center gap-2 flex-1 justify-center">
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
              <button
                onClick={() => setView("mobile")}
                className={`px-3 py-1.5 transition-colors ${view === "mobile" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                Mobile
              </button>
              <button
                onClick={() => setView("desktop")}
                className={`px-3 py-1.5 transition-colors ${view === "desktop" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                Desktop
              </button>
            </div>
          </div>

          <button
            onClick={() => onClose(eligible)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors flex-shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 flex-shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-white border border-gray-300 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" className="w-2.5 h-2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            Enabled for Discover
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-2.5 h-2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            Disabled (tap to toggle)
          </span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className={`grid gap-2 p-3 items-start`} style={{ gridTemplateColumns: `repeat(${numCols}, 1fr)` }}>
            {cols.map((col, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-2">
                {col.map((row, rowIdx) => {
                  const aspects = aspectArrays[colIdx % aspectArrays.length];
                  const aspectClass = aspects[rowIdx % aspects.length];
                  const globalIdx = colIdx + rowIdx * numCols;
                  return (
                    <PhotoTile
                      key={row.id}
                      row={row}
                      index={globalIdx}
                      aspectClass={aspectClass}
                      eligible={eligible[row.id] !== false}
                      onToggle={toggle}
                      saving={saving === row.id}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {rows.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
              </svg>
              <p className="text-sm font-medium">No photos uploaded yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
