"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Pages that manage their own full-screen layout — skip transition wrapper
const NO_TRANSITION_PATHS = ["/map"];

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const skip = NO_TRANSITION_PATHS.some((p) => pathname.startsWith(p));

  if (skip) return <>{children}</>;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
