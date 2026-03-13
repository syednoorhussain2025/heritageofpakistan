"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

// Pages that manage their own full-screen layout — skip transition wrapper
const NO_TRANSITION_PATHS = ["/map"];

// Tab-level routes (bottom nav) — use fade transition
const TAB_PATHS = ["/", "/explore", "/heritage", "/dashboard", "/profile", "/portfolio"];

function getPathDepth(path: string) {
  return path.split("/").filter(Boolean).length;
}

function isTabSwitch(from: string, to: string) {
  const fromTab = TAB_PATHS.find((t) => from === t || (t !== "/" && from.startsWith(t)));
  const toTab = TAB_PATHS.find((t) => to === t || (t !== "/" && to.startsWith(t)));
  return fromTab !== toTab;
}

function isDrillDown(from: string, to: string) {
  return getPathDepth(to) > getPathDepth(from);
}

function isGoingBack(from: string, to: string) {
  return getPathDepth(to) < getPathDepth(from);
}

type TransitionType = "fade" | "slide-left" | "slide-right";

const variants = {
  fade: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.18, ease: "easeOut" },
  },
  "slide-left": {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
  "slide-right": {
    initial: { opacity: 0, x: -40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const prevPathname = useRef<string>(pathname);
  const transitionType = useRef<TransitionType>("fade");

  const skip = NO_TRANSITION_PATHS.some((p) => pathname.startsWith(p));

  // Compute transition type synchronously during render so AnimatePresence
  // picks up the correct variant for the current navigation.
  if (pathname !== prevPathname.current) {
    const from = prevPathname.current;
    const to = pathname;
    if (isTabSwitch(from, to)) {
      transitionType.current = "fade";
    } else if (isDrillDown(from, to)) {
      transitionType.current = "slide-left";
    } else if (isGoingBack(from, to)) {
      transitionType.current = "slide-right";
    } else {
      transitionType.current = "fade";
    }
    prevPathname.current = to;
  }

  if (skip) return <>{children}</>;

  const v = variants[transitionType.current];

  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={pathname}
        initial={v.initial}
        animate={v.animate}
        exit={v.exit}
        transition={v.transition as any}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
