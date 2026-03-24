"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import deleteData from "../../../public/delete.json";

export default function DeleteSuccessPopup({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2200);
    const doneTimer = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      style={{ opacity: fading ? 0 : 1, transition: "opacity 0.6s ease" }}
    >
      <div
        className="bg-white rounded-[28px] px-8 py-6 mx-8 flex flex-col items-center shadow-2xl"
        style={{ transform: fading ? "scale(0.95)" : "scale(1)", transition: "transform 0.6s ease" }}
      >
        <div style={{ width: 120, height: 120 }}>
          <Lottie animationData={deleteData} loop={false} autoplay style={{ width: 120, height: 120 }} />
        </div>
        <p className="text-[17px] font-extrabold text-gray-900 mt-2">Review Deleted</p>
        <p className="text-[12px] text-gray-400 text-center mt-1">Your review has been permanently removed</p>
      </div>
    </div>,
    document.body
  );
}
