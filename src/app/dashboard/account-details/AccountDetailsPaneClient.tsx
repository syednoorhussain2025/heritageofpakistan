// Client wrapper for account details pane.
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import DeleteAccountButton from "./DeleteAccountButton";

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export default function AccountDetailsPaneClient() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  if (!user) {
    return (
      <div className="max-w-2xl animate-pulse space-y-3">
        <div className="h-6 bg-gray-200 rounded w-1/3" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-5">Account Details</h1>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-0.5 py-3 px-5 border-b border-gray-100">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Full Name</span>
          <span className="font-semibold text-gray-900 text-base">{user.user_metadata?.full_name || "Not provided"}</span>
        </div>
        <div className="flex flex-col gap-0.5 py-3 px-5 border-b border-gray-100">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Email Address</span>
          <span className="font-semibold text-gray-900 text-base">{user.email}</span>
        </div>
        <div className="flex flex-col gap-0.5 py-3 px-5">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Account Created</span>
          <span className="font-semibold text-gray-900 text-base">{formatDate(user.created_at)}</span>
        </div>
      </div>
      <DeleteAccountButton />
    </div>
  );
}
