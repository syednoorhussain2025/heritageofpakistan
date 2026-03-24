"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import confettiData from "../../../public/review-confetti.json";
import fiveStarData from "../../../public/review-5star.json";

export default function ReviewSuccessPopup({
  onDone,
}: {
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
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      style={{ opacity: fading ? 0 : 1, transition: "opacity 0.6s ease" }}
    >
      {/* Confetti full screen */}
      <div className="absolute inset-0">
        <Lottie animationData={confettiData} loop={false} autoplay style={{ width: "100%", height: "100%" }} />
      </div>

      {/* White popup card */}
      <div
        className="relative z-10 bg-white rounded-3xl px-8 pt-5 mx-6 flex flex-col items-center shadow-2xl"
        style={{ transform: fading ? "scale(0.95)" : "scale(1)", transition: "transform 0.6s ease" }}
      >
        <p className="text-[20px] font-extrabold text-gray-900 mb-0.5">Review Submitted!</p>
        <p className="text-[13px] text-gray-400 text-center">Submit more reviews to earn badges</p>
        {/* Fixed-height clip to cut the lottie's internal whitespace */}
        <div style={{ width: 280, height: 160, overflow: "hidden", marginTop: 4, marginBottom: 4 }}>
          <Lottie
            animationData={fiveStarData}
            loop={false}
            autoplay
            style={{ width: 280, height: 280, marginTop: -60 }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
