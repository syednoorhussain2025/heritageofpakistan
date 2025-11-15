// src/app/auth/update-password/page.tsx
import { Suspense } from "react";
import UpdatePasswordClient from "./UpdatePasswordClient";

// This route should be dynamic because it depends on Supabase auth state.
export const dynamic = "force-dynamic";

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-sm text-gray-500">Loading password reset flow…</p>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <UpdatePasswordClient />
    </Suspense>
  );
}
