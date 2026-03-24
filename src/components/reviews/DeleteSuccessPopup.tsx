"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import deleteData from "../../../public/delete.json";
import { hapticHeavy } from "@/lib/haptics";

export default function DeleteSuccessPopup({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  const [textVisible, setTextVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    void hapticHeavy();
    const fadeInTimer = setTimeout(() => setVisible(true), 50);
    const textTimer = setTimeout(() => setTextVisible(true), 800); // ~40% of 2000ms animation
    const fadeOutTimer = setTimeout(() => setFading(true), 2200);
    const doneTimer = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(fadeInTimer); clearTimeout(textTimer); clearTimeout(fadeOutTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      style={{ opacity: fading ? 0 : visible ? 1 : 0, transition: "opacity 0.5s ease" }}
    >
      <div className="flex flex-col items-center gap-1">
        <p className="text-[15px] font-bold tracking-wide" style={{ color: "#c33647", opacity: textVisible ? 1 : 0, transition: "opacity 0.4s ease" }}>Deleted</p>
        <div style={{ width: 120, height: 120 }}>
          <Lottie animationData={deleteData} loop={false} autoplay style={{ width: 120, height: 120 }} />
        </div>
      </div>
    </div>,
    document.body
  );
}
