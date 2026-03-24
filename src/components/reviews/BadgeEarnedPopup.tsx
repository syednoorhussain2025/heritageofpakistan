"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import confettiData from "../../../public/review-confetti.json";
import winnerData from "../../../public/badge-winner.json";
import { hapticCelebration } from "@/lib/haptics";

const BADGE_COLORS: Record<string, string> = {
  Beginner:            "#9ca3af",
  Scout:               "#38bdf8",
  Explorer:            "#60a5fa",
  Adventurer:          "#34d399",
  Voyager:             "#2dd4bf",
  Wanderer:            "#a78bfa",
  Globetrotter:        "#fbbf24",
  "Heritage Guardian": "#fb923c",
  "Master Traveler":   "#f87171",
  "Legendary Nomad":   "#facc15",
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

  const badgeColor = BADGE_COLORS[badge] ?? "#fbbf24";

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-start pointer-events-none"
      style={{ opacity: fading ? 0 : 1, transition: "opacity 0.6s ease" }}
    >
      {/* Confetti fullscreen */}
      <div className="absolute inset-0">
        <Lottie animationData={confettiData} loop={false} autoplay style={{ width: "100%", height: "100%" }} />
      </div>

      {/* Text block — floats at top, no background */}
      <div
        className="relative z-10 flex flex-col items-center pt-24 px-6"
        style={{ transform: fading ? "scale(0.95)" : "scale(1)", transition: "transform 0.6s ease" }}
      >
        <p
          className="text-[28px] font-extrabold text-center leading-tight"
          style={{ color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.45)" }}
        >
          Congratulations!
        </p>
        <p
          className="text-[15px] font-semibold text-center mt-1"
          style={{ color: "rgba(255,255,255,0.85)", textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}
        >
          You earned a new Badge
        </p>

        {/* Badge pill */}
        <div
          className="mt-3 px-5 py-1.5 rounded-full font-bold text-[16px]"
          style={{
            background: "rgba(0,0,0,0.35)",
            color: badgeColor,
            border: `2px solid ${badgeColor}`,
            textShadow: "0 1px 4px rgba(0,0,0,0.5)",
          }}
        >
          {badge}
        </div>

        <p
          className="text-[13px] mt-2"
          style={{ color: "rgba(255,255,255,0.7)", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
        >
          {reviewCount} review{reviewCount !== 1 ? "s" : ""} submitted
        </p>
      </div>

      {/* Large winner lottie — centered lower half */}
      <div className="relative z-10 flex-1 flex items-center justify-center w-full">
        <Lottie
          animationData={winnerData}
          loop={false}
          autoplay
          style={{ width: 280, height: 280 }}
        />
      </div>
    </div>,
    document.body
  );
}
