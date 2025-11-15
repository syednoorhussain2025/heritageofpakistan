// src/app/admin/layout.tsx
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({ children }: { children: ReactNode }) {
  // No extra chrome here; the global app layout already renders <Header />.
  return <>{children}</>;
}
