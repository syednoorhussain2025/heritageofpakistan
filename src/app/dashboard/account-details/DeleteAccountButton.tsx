// src/app/dashboard/account-details/DeleteAccountButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { hapticHeavy } from "@/lib/haptics";
import Icon from "@/components/Icon";

export default function DeleteAccountButton() {
  const supabase = createClient();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    void hapticHeavy();
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete account");
      await supabase.auth.signOut();
      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete account. Please contact support.");
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <Icon name="exclamation-triangle" size={16} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">Delete your account?</p>
            <p className="text-xs text-red-500 mt-0.5 leading-snug">
              This will permanently delete your account, reviews, wishlists, and collections. This cannot be undone.
            </p>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setConfirming(false); setError(null); }}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 active:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-full bg-red-500 text-sm font-bold text-white active:bg-red-600 transition disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Yes, Delete"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onTouchStart={() => void hapticHeavy()}
        onClick={() => setConfirming(true)}
        className="w-full flex items-center gap-3.5 px-5 py-4 rounded-2xl bg-white active:bg-red-50 transition-colors"
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
          <Icon name="trash" size={16} className="text-red-500" />
        </div>
        <span className="flex-1 text-left text-[15px] font-normal text-red-500">Delete Account</span>
      </button>
    </div>
  );
}
