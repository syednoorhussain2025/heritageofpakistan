"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Lottie from "lottie-react";
import deleteData from "../../../public/delete.json";

export default function DeleteSuccessPopup({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeInTimer = setTimeout(() => setVisible(true), 50);
    const fadeOutTimer = setTimeout(() => setFading(true), 2200);
    const doneTimer = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(fadeInTimer); clearTimeout(fadeOutTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      style={{ opacity: fading ? 0 : visible ? 1 : 0, transition: "opacity 0.5s ease" }}
    >
      <div style={{ width: 160, height: 160 }}>
        <Lottie animationData={deleteData} loop={false} autoplay style={{ width: 160, height: 160 }} />
      </div>
    </div>,
    document.body
  );
}
