"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import confettiData from "../../../public/review-confetti.json";
import winnerData from "../../../public/badge-winner.json";
import { hapticCelebration } from "@/lib/haptics";
import { useProfile } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/browser";

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

function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  const supabase = createClient();
  const { data } = supabase.storage.from("avatars").getPublicUrl(avatar_url);
  return data.publicUrl;
}

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
  const { profile } = useProfile();

  const displayName = profile?.full_name || "Traveler";
  const avatarSrc = resolveAvatarSrc(profile?.avatar_url);

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

      {/* Card */}
      <div
        className="relative z-10 bg-white rounded-[32px] px-6 pt-5 pb-5 mx-8 shadow-2xl pointer-events-none flex flex-col items-center"
        style={{ transform: fading ? "scale(0.95)" : "scale(1)", transition: "transform 0.6s ease" }}
      >
        {/* User row */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 shrink-0 border-2 border-amber-200">
            {avatarSrc ? (
              <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-amber-50 flex items-center justify-center text-amber-500 font-bold text-[14px]">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="text-left">
            <p className="text-[13px] font-bold text-gray-900 leading-tight">{displayName}</p>
            <p className="text-[11px] text-gray-400 leading-tight">just leveled up!</p>
          </div>
        </div>

        {/* Title */}
        <p className="text-[17px] font-extrabold text-gray-900">Congratulations!</p>
        <p className="text-[12px] text-gray-400 text-center mt-0.5">You earned a new Badge</p>

        {/* Winner lottie */}
        <div style={{ width: 260, height: 220, overflow: "hidden", marginTop: 2 }}>
          <Lottie
            animationData={winnerData}
            loop={false}
            autoplay
            style={{ width: 320, height: 320, marginTop: -30, marginLeft: -30, marginRight: -30, marginBottom: -70 }}
          />
        </div>

        {/* Badge name */}
        <span className={`inline-flex items-center px-5 py-2 rounded-full border-2 text-[17px] font-extrabold mt-1 ${colors.bg} ${colors.text} ${colors.border}`}>
          {badge}
        </span>

        {/* Review count */}
        <p className="text-[12px] text-gray-400 mt-2">
          {reviewCount} review{reviewCount !== 1 ? "s" : ""} submitted
        </p>
      </div>
    </div>,
    document.body
  );
}
