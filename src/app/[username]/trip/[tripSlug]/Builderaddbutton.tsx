"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

type Props = {
  onAddDay: () => void;
  onAddTravel: () => Promise<void> | void;
  onAddSite: () => void;
  disabled?: boolean;
  zFab?: number;
  zMenu?: number;
};

export default function Builderaddbutton({
  onAddDay,
  onAddTravel,
  onAddSite,
  disabled = false,
  zFab = 65,
  zMenu = 70,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const firstButton = panelRef.current?.querySelector(
      "button[data-menu-item]"
    ) as HTMLButtonElement | null;
    firstButton?.focus();
  }, [open]);

  const doAction = useCallback(
    (kind: "day" | "travel" | "site") => async () => {
      if (disabled) return;
      try {
        if (kind === "day") onAddDay();
        else if (kind === "travel") await onAddTravel();
        else if (kind === "site") onAddSite();
      } finally {
        setOpen(false);
      }
    },
    [disabled, onAddDay, onAddTravel, onAddSite]
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
        <Icon name="plus" size={30} />
      </button>

      {/* Popup Menu */}
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
              {/* Add Day */}
              <button
                data-menu-item
                className="w-full inline-flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-slate-50 outline-none focus:outline-none"
                onClick={doAction("day")}
              >
                <Icon
                  name="day"
                  size={22}
                  className="text-[var(--brand-orange,#f59e0b)]"
                />
                <span className="text-[15px] font-medium text-slate-800">
                  Add Day
                </span>
              </button>

              {/* Add Travel */}
              <button
                data-menu-item
                className="w-full inline-flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-slate-50 outline-none focus:outline-none"
                onClick={doAction("travel")}
              >
                <Icon
                  name="route"
                  size={22}
                  className="text-[var(--brand-orange,#f59e0b)]"
                />
                <span className="text-[15px] font-medium text-slate-800">
                  Add Travel
                </span>
              </button>

              {/* Add Site */}
              <button
                data-menu-item
                className="w-full inline-flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-slate-50 outline-none focus:outline-none"
                onClick={doAction("site")}
              >
                <Icon
                  name="architecture-design"
                  size={22}
                  className="text-[var(--brand-orange,#f59e0b)]"
                />
                <span className="text-[15px] font-medium text-slate-800">
                  Add Site
                </span>
              </button>
            </div>

            <div className="px-5 pb-5 flex justify-end">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 outline-none focus:outline-none"
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
