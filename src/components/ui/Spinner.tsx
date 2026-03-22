"use client";

import Lottie from "lottie-react";
import { useEffect, useState } from "react";
import spinnerData from "../../../public/spinner.json";

interface SpinnerProps {
  /** Size of the spinner in px. Default: 64 */
  size?: number;
  /** Show on a white background overlay (full screen). Default: false */
  overlay?: boolean;
  /** Show as a centered block filling its parent container. Default: false */
  fill?: boolean;
}

function hexToLottieRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function tintSpinner(brandGreen: string) {
  const [r, g, b] = hexToLottieRgb(brandGreen);
  // Create a lighter tint (mix with white at ~65%)
  const tr = r + (1 - r) * 0.65;
  const tg = g + (1 - g) * 0.65;
  const tb = b + (1 - b) * 0.65;
  const data = JSON.parse(JSON.stringify(spinnerData));
  JSON.stringify(data, function(key, val) {
    if (key === 'c' && val && val.k && Array.isArray(val.k) && typeof val.k[0] === 'number') {
      const [cr, cg] = val.k;
      // Match original primary green [0, 0.788, 0.655] ≈ #00C9A7
      if (cr < 0.1 && cg > 0.6) { val.k[0] = r; val.k[1] = g; val.k[2] = b; }
      // Match original tint green [0.345, 0.871, 0.678]
      else if (cr > 0.2 && cr < 0.5 && cg > 0.7) { val.k[0] = tr; val.k[1] = tg; val.k[2] = tb; }
    }
    return val;
  });
  return data;
}

export function Spinner({ size = 64, overlay = false, fill = false }: SpinnerProps) {
  const [animData, setAnimData] = useState(spinnerData);

  useEffect(() => {
    const green = getComputedStyle(document.documentElement).getPropertyValue("--brand-green").trim();
    if (green && green.startsWith("#")) {
      setAnimData(tintSpinner(green) as typeof spinnerData);
    }
  }, []);

  const animation = (
    <Lottie
      animationData={animData}
      loop
      autoplay
      initialSegment={[40, 79]}
      style={{ width: size, height: size }}
    />
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        {animation}
      </div>
    );
  }

  if (fill) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {animation}
      </div>
    );
  }

  return animation;
}
