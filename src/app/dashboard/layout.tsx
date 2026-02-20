// src/app/dashboard/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardShellClient from "./DashboardShellClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // 1) Require an authenticated user
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    redirect(`/auth/sign-in?redirectTo=/dashboard`);
  }

  const user = sessionData.session?.user ?? null;

  if (!user) {
    redirect(`/auth/sign-in?redirectTo=/dashboard`);
  }

  // 2) The logic to ensure a profile exists has been removed.
  //    This is now handled automatically by the `on_auth_user_created`
  //    database trigger, which is a more reliable approach.

  // 3) Render the client-side UI shell
  return <DashboardShellClient>{children}</DashboardShellClient>;
}
