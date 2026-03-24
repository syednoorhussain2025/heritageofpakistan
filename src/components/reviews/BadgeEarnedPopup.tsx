"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import confettiData from "../../../public/review-confetti.json";
import winnerData from "../../../public/badge-winner.json";
import { hapticCelebration } from "@/lib/haptics";

const BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Beginner:            { bg: "bg-gray-100",   text: "text-gray-700",   border: "border-gray-300" },
  Scout:               { bg: "bg-sky-50",     text: "text-sky-700",    border: "border-sky-200" },
  Explorer:            { bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200" },
  Adventurer:          { bg: "bg-green-50",   text: "text-green-700",  border: "border-green-200" },
  Voyager:             { bg: "bg-teal-50",    text: "text-teal-700",   border: "border-teal-200" },
  Wanderer:            { bg: "bg-purple-50",  text: "text-purple-700", border: "border-purple-200" },
  Globetrotter:        { bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200" },
  "Heritage Guardian": { bg: "bg-orange-50",  text: "text-orange-700", border: "border-orange-200" },
  "Master Traveler":   { bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200" },
  "Legendary Nomad":   { bg: "bg-yellow-50",  text: "text-yellow-700", border: "border-yellow-300" },
};

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
    void hapticCelebration();
    const secondBurst = setTimeout(() => void hapticCelebration(), 600);
    const fadeTimer = setTimeout(() => setFading(true), 5000);
    const doneTimer = setTimeout(() => onDone(), 5600);
    return () => { clearTimeout(secondBurst); clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  const colors = BADGE_COLORS[badge] ?? BADGE_COLORS["Globetrotter"];

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none"
      style={{ opacity: fading ? 0 : 1, transition: "opacity 0.6s ease" }}
    >
      {/* Confetti fullscreen */}
      <div className="absolute inset-0">
        <Lottie animationData={confettiData} loop={false} autoplay style={{ width: "100%", height: "100%" }} />
      </div>

      {/* Card — same mx-8 width as ReviewSuccessPopup, large rounded corners */}
      <div
        className="relative z-10 bg-white rounded-[32px] px-5 pt-5 pb-5 mx-8 shadow-2xl pointer-events-none"
        style={{ transform: fading ? "scale(0.95)" : "scale(1)", transition: "transform 0.6s ease" }}
      >
        {/* Title row */}
        <p className="text-[17px] font-extrabold text-gray-900 text-center mb-0.5">Congratulations!</p>
        <p className="text-[12px] text-gray-400 text-center mb-3">You earned a new Badge</p>

        {/* Body: lottie left, text right */}
        <div className="flex items-center gap-3">
          {/* Winner lottie */}
          <div style={{ width: 110, height: 110, flexShrink: 0 }}>
            <Lottie animationData={winnerData} loop={false} autoplay style={{ width: 110, height: 110 }} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-500 mb-1.5">Badge Earned</p>
            <span className={`inline-flex items-center px-3 py-1 rounded-full border text-[14px] font-bold ${colors.bg} ${colors.text} ${colors.border}`}>
              {badge}
            </span>
            <p className="text-[12px] text-gray-400 mt-2">
              {reviewCount} review{reviewCount !== 1 ? "s" : ""} submitted
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
