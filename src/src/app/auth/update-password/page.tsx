// src/app/auth/update-password/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const [stage, setStage] = useState<"checking" | "ready" | "done" | "error">(
    "checking"
  );
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  // Optional: after success, redirectTo (fallback dashboard)
  const redirectTo = sp.get("next") || "/dashboard";

  // When user arrives from the email link, supabase-js will create a recovery session.
  useEffect(() => {
    let unsub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStage("ready");
      }
    }).data.subscription;

    // In case the event already fired (hard refresh, direct open), check session too
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStage("ready");
      else setStage("ready"); // allow manual try; if no session, update will fail with a clear error
    });

    return () => unsub?.unsubscribe();
  }, [supabase]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (pw1.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setError("Passwords do not match.");
      return;
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: pw1 });
    if (updErr) {
      setError(updErr.message || "Failed to update password.");
      setStage("error");
      return;
    }

    setMessage("Password updated successfully.");
    setStage("done");
    // Optional: clean up the URL hash that contains tokens
    if (typeof window !== "undefined" && window.location.hash) {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6 shadow-sm bg-white">
        <h1 className="text-2xl font-semibold mb-1">Set a new password</h1>
        <p className="text-sm text-gray-500 mb-6">
          You reached this page from a password recovery email.
        </p>

        {stage === "checking" && (
          <div className="text-sm text-gray-600">Preparing secure session…</div>
        )}

        {stage !== "checking" && (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">New password</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                           focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]
                           transition"
                type="password"
                autoComplete="new-password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                required
                minLength={8}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Confirm password</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                           focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]
                           transition"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
                minLength={8}
              />
            </label>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {message}
              </div>
            )}

            <button
              className="w-full rounded-lg bg-[var(--brand-orange)] text-white py-2 font-medium
                         hover:opacity-90 focus:ring-2 focus:ring-offset-1 focus:ring-[var(--brand-orange)]"
              type="submit"
            >
              Update password
            </button>

            {stage === "done" && (
              <div className="text-sm text-gray-600 text-center">
                You can now continue to{" "}
                <Link className="underline" href={redirectTo}>
                  your account
                </Link>
                .
              </div>
            )}
          </form>
        )}

        <div className="mt-6 text-center text-sm">
          <Link className="underline" href="/auth/sign-in">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
