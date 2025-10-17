"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

type Props = {
  onAddDay: () => void;
  onAddActivity?: () => void;
  onAddTravel: () => Promise<void> | void;
  onAddSite: () => void;
  disabled?: boolean;
  /** Layering knobs to avoid clashes with other modals/overlays */
  zFab?: number;
  zMenu?: number;
};

export default function Builderaddbutton({
  onAddDay,
  onAddActivity,
  onAddTravel,
  onAddSite,
  disabled = false,
  zFab = 65,
  zMenu = 70,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Simple focus management when the panel opens
  useEffect(() => {
    if (!open) return;
    const firstButton = panelRef.current?.querySelector(
      "button[data-menu-item]"
    ) as HTMLButtonElement | null;
    firstButton?.focus();
  }, [open]);

  const doAction = useCallback(
    (kind: "day" | "activity" | "travel" | "site") => async () => {
      if (disabled) return;
      try {
        if (kind === "day") onAddDay();
        else if (kind === "activity" && onAddActivity) onAddActivity();
        else if (kind === "travel") await onAddTravel();
        else if (kind === "site") onAddSite();
      } finally {
        setOpen(false);
      }
    },
    [disabled, onAddDay, onAddActivity, onAddTravel, onAddSite]
  );

  return (
    <>
      {/* Floating + FAB */}
      <button
        type="button"
        aria-label="Add"
        className={`fixed bottom-6 right-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#00b78b] text-white shadow-xl transition-transform duration-150 hover:scale-105 active:scale-95 ${
          disabled ? "opacity-60 pointer-events-none" : ""
        }`}
        style={{ zIndex: zFab }}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={28} />
      </button>

      {/* Lightweight menu overlay */}
      {open && (
        <div
          className="fixed inset-0 flex items-end sm:items-center sm:justify-center p-4 bg-black/30"
          style={{ zIndex: zMenu }}
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            className="w-full max-w-sm rounded-2xl border bg-white shadow-2xl outline-none"
          >
            <div className="p-5">
              <div className="mb-3 text-lg font-semibold text-slate-800">
                Add to Trip
              </div>
            </div>

            <div className="px-5 pb-5 grid gap-2">
              <button
                data-menu-item
                className="w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={doAction("day")}
              >
                Add Day
              </button>
              <button
                data-menu-item
                className={`w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  !onAddActivity ? "opacity-60 cursor-not-allowed" : ""
                }`}
                onClick={onAddActivity ? doAction("activity") : undefined}
                disabled={!onAddActivity}
              >
                Add Activity
              </button>
              <button
                data-menu-item
                className="w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={doAction("travel")}
              >
                Add Travel
              </button>
              <button
                data-menu-item
                className="w-full rounded-lg border px-4 py-2 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={doAction("site")}
              >
                Add Site
              </button>
            </div>

            <div className="px-5 pb-5 flex justify-end">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
