"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import HeritageSidebar from "./HeritageSidebar";
import type { TravelGuideSummary } from "./heritagedata";

function SlidePanel({
  site,
  provinceName,
  regions,
  maps,
  travelGuideSummary,
  onClose,
}: {
  site: any;
  provinceName: string | null;
  regions: any[];
  maps: { embed: string | null; link: string | null };
  travelGuideSummary?: TravelGuideSummary | null;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  // Parallax push — slide in on mount, slide back when closing
  useEffect(() => {
    const el = document.getElementById("heritage-page-root");
    if (!el) return;
    el.style.transition = "transform 0.5s cubic-bezier(0.25,0.1,0.25,1)";
    const raf = requestAnimationFrame(() => {
      el.style.transform = closing ? "translateX(0)" : "translateX(-173px)";
    });
    return () => cancelAnimationFrame(raf);
  }, [closing]);

  function handleClose() {
    setClosing(true);
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[4999]"
        style={{
          backgroundColor: "rgba(0,0,0,0)",
          animation: closing
            ? "sideSheetBackdropOut 0.35s ease-in forwards"
            : "sideSheetBackdropIn 0.72s ease-out forwards",
        }}
      />
      <div
        className={`fixed inset-0 z-[5000] bg-white flex flex-col ${closing ? "animate-side-sheet-out" : "animate-side-sheet-in"}`}
        onAnimationEnd={() => { if (closing) onClose(); }}
      >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 bg-white border-b border-slate-100"
        style={{ paddingTop: "calc(var(--sat, 44px) + 10px)", paddingBottom: "14px" }}
      >
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 shrink-0"
          aria-label="Back"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
          </svg>
        </button>
        <div className="flex flex-col gap-0.5">
          <span className="text-[18px] font-extrabold" style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}>
            {site.title}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-400">
            <Icon name="travel-guide" size={14} className="text-[var(--brand-orange)]" />
            Travel Information
          </span>
        </div>
      </div>

      {/* Content — all 3 section groups stacked */}
      <div className="flex-1 overflow-y-auto space-y-4 p-0">
        <HeritageSidebar
          site={site}
          provinceName={provinceName}
          regions={regions}
          maps={maps}
          travelGuideSummary={travelGuideSummary}
          sectionGroup="mobile-travel"
        />
        <HeritageSidebar
          site={site}
          provinceName={provinceName}
          regions={regions}
          maps={maps}
          travelGuideSummary={travelGuideSummary}
          sectionGroup="mobile-climate"
        />
        <HeritageSidebar
          site={site}
          provinceName={provinceName}
          regions={regions}
          maps={maps}
          travelGuideSummary={travelGuideSummary}
          sectionGroup="mobile-stay"
        />
      </div>
    </div>
    </>,
    document.body
  );
}

function PreviewCell({ iconName, label, value }: { iconName: string; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col items-center text-center px-1">
      <div className="w-14 h-14 flex items-center justify-center">
        <Icon name={iconName} size={41} className="text-slate-400" />
      </div>
      <span className="text-[11px] font-semibold text-[var(--brand-blue)] leading-tight -mt-0.5">{label}</span>
      <span className="text-[11px] text-slate-500 leading-snug line-clamp-2 mt-1.5">{value}</span>
    </div>
  );
}

export default function TravelGuideSheet({
  site,
  provinceName,
  regions,
  maps,
  travelGuideSummary,
}: {
  site: any;
  provinceName: string | null;
  regions: any[];
  maps: { embed: string | null; link: string | null };
  travelGuideSummary?: TravelGuideSummary | null;
}) {
  const [showPanel, setShowPanel] = useState(false);

  const tgs = travelGuideSummary;
  const ov = site.overrides ?? {};

  function pick(siteVal: any, guideVal: any) {
    if (ov) return siteVal ?? guideVal ?? null;
    return guideVal ?? siteVal ?? null;
  }

  const location = pick(site.travel_location, tgs?.location);
  const howToReach = pick(site.travel_how_to_reach, tgs?.how_to_reach);
  const nearestCity = pick(site.travel_nearest_major_city, tgs?.nearest_major_city);
  const bestTime = pick(site.travel_best_time_free, tgs?.best_time_to_visit);
  const airportAccess = pick(site.travel_airport_access, tgs?.airport_access);
  const accessOptions = pick(site.travel_access_options, tgs?.access_options);

  const previewRows = [
    { iconName: "map-pinned", label: "Location", value: location },
    { iconName: "mode-of-travel-24dp-1f1f1f-fill0-wght200-grad0-opsz24", label: "How to Reach", value: howToReach },
    { iconName: "city-light", label: "Nearest City", value: nearestCity },
    { iconName: "calendar-dots-light", label: "Best Time to Visit", value: bestTime },
    { iconName: "plane", label: "Airport Access", value: airportAccess },
    { iconName: "commute-24dp-1f1f1f-fill0-wght200-grad0-opsz24-1", label: "Access Options", value: accessOptions },
  ].filter((r) => r.value);

  if (previewRows.length === 0) return null;

  return (
    <>
      <section
        className="md:hidden pt-12 pb-12 cursor-pointer mobile-divider active:bg-slate-50 transition-colors"
        onClick={() => setShowPanel(true)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2 px-4">
          <h2
            className="flex items-center gap-2 text-[22px] font-extrabold"
            style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
          >
            <Icon name="travel-guide" size={24} className="text-[var(--brand-orange)]" />
            <span>Travel Guide</span>
          </h2>
          <span aria-hidden="true" className="inline-flex shrink-0 h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
              <path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z" />
            </svg>
          </span>
        </div>

        {/* Preview grid */}
        <div className="mt-3 px-4 grid grid-cols-3 gap-3">
          {previewRows.map((r) => (
            <PreviewCell key={r.label} iconName={r.iconName} label={r.label} value={r.value} />
          ))}
        </div>

      </section>

      {showPanel && (
        <SlidePanel
          site={site}
          provinceName={provinceName}
          regions={regions}
          maps={maps}
          travelGuideSummary={travelGuideSummary}
          onClose={() => setShowPanel(false)}
        />
      )}
    </>
  );
}
