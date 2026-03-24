"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReviewsTab from "./ReviewsTab";

export default function AllReviewsPanel({
  siteId,
  currentUserId,
  onClose,
}: {
  siteId: string;
  currentUserId?: string | null;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  // Ensure body scroll lock is fully released when this panel mounts
  useEffect(() => {
    const body = document.body;
    const prev = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    const scrollY = prev.top ? Math.abs(parseInt(prev.top, 10)) || 0 : 0;
    body.style.overflow = "";
    body.style.position = "";
    body.style.top = "";
    body.style.width = "";
    if (scrollY) window.scrollTo(0, scrollY);
    return () => {
      // Restore nothing — panel closing restores underlying page state naturally
    };
  }, []);

  function handleClose() {
    setClosing(true);
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[5000] bg-[#f2f2f2] flex flex-col ${closing ? "animate-slide-out-right" : "animate-slide-in-right"}`}
      onAnimationEnd={() => { if (closing) onClose(); }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shrink-0">
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600"
          aria-label="Back"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
          </svg>
        </button>
        <h2 className="text-[17px] font-bold text-[var(--brand-blue)]">All Reviews</h2>
      </div>

      {/* Scrollable reviews */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ReviewsTab siteId={siteId} pinnedUserId={currentUserId} />
      </div>
    </div>,
    document.body
  );
}
