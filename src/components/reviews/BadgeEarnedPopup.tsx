"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import confettiData from "../../../public/review-confetti.json";
import badgeData from "../../../public/badge-winner.json";

export default function BadgeEarnedPopup({
  badge,
  reviewCount,
  onDone,
}: {
  badge: string;
  reviewCount: number;
  onDone: () => void;
}) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 5000);
    const doneTimer = setTimeout(() => onDone(), 5600);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none"
      style={{ opacity: fading ? 0 : 1, transition: "opacity 0.6s ease" }}
    >
      {/* Confetti fullscreen */}
      <div className="absolute inset-0">
        <Lottie animationData={confettiData} loop={false} autoplay style={{ width: "100%", height: "100%" }} />
      </div>

      {/* Card */}
      <div
        className="relative z-10 bg-white rounded-2xl px-5 py-4 mx-8 shadow-2xl pointer-events-none"
        style={{ transform: fading ? "scale(0.95)" : "scale(1)", transition: "transform 0.6s ease" }}
      >
        <div className="flex items-center gap-4">
          {/* Badge lottie */}
          <div style={{ width: 80, height: 80, overflow: "hidden", shrink: 0 } as React.CSSProperties}>
            <Lottie animationData={badgeData} loop={false} autoplay style={{ width: 80, height: 80 }} />
          </div>
          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">New Badge Earned!</p>
            <p className="text-[19px] font-extrabold text-gray-900 leading-tight">{badge}</p>
            <p className="text-[12px] text-gray-400 mt-1">{reviewCount} review{reviewCount !== 1 ? "s" : ""} submitted</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
