"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

interface SpinnerProps {
  /** Size of the spinner in px. Default: 64 */
  size?: number;
  /** Show on a white background overlay (full screen). Default: false */
  overlay?: boolean;
  /** Show as a centered block filling its parent container. Default: false */
  fill?: boolean;
}

/**
 * Universal loading spinner using the branded Lottie animation.
 *
 * Usage:
 *   <Spinner />                     — inline, 64px
 *   <Spinner size={40} />           — inline, custom size
 *   <Spinner fill />                — centered inside parent container
 *   <Spinner overlay />             — full-screen white overlay
 */
export function Spinner({ size = 64, overlay = false, fill = false }: SpinnerProps) {
  const animation = (
    <DotLottieReact
      src="/spinner.lottie"
      loop
      autoplay
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
