// src/app/auth/update-password/UpdatePasswordClient.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Stage = "checking" | "ready" | "done" | "error";

export default function UpdatePasswordClient() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const [stage, setStage] = useState<Stage>("checking");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Optional redirect target after success
  const redirectTo = sp.get("next") || "/dashboard";

  // When user arrives from the email link, Supabase will create a recovery session.
  useEffect(() => {
    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStage("ready");
      }
    });

    // If the event already fired (hard refresh / direct open), check the session as well.
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;

      if (data.session) {
        setStage("ready");
      } else {
        // Allow manual attempt; if there is no recovery session,
        // updateUser will fail with a clear error.
        setStage("ready");
      }
    });

    // Clean the `#access_token=...` hash from the URL if present
    if (typeof window !== "undefined" && window.location.hash) {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [supabase]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    if (pw1.length < 8) {
      setError("Password must be at least 8 characters.");
      setIsSubmitting(false);
      return;
    }
    if (pw1 !== pw2) {
      setError("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    const { error: updErr } = await supabase.auth.updateUser({
      password: pw1,
    });

    if (updErr) {
      setError(updErr.message || "Failed to update password.");
      setStage("error");
      setIsSubmitting(false);
      return;
    }

    setStage("done");
    setMessage("Your password has been updated. Redirecting…");

    // Give the user a moment to read the message before redirecting
    setTimeout(() => {
      router.push(redirectTo);
    }, 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6 shadow-sm bg-white">
        <h1 className="text-2xl font-semibold mb-1">Set a new password</h1>
        <p className="text-sm text-gray-500 mb-6">
          You reached this page from a password recovery email.
        </p>

        {stage === "checking" && (
          <div className="py-8 text-sm text-gray-600">
            Verifying your recovery link…
          </div>
        )}

        {stage === "done" && (
          <div className="space-y-3">
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {message || "Your password has been updated. Redirecting…"}
            </div>
          </div>
        )}

        {(stage === "ready" || stage === "error") && (
          <form className="space-y-4 mt-2" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-gray-700">
              New password
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-[15px] outline-none
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

            <label className="block text-sm font-medium text-gray-700">
              Confirm new password
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-[15px] outline-none
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

            {message && !error && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {message}
              </div>
            )}

            <button
              type="submit"
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-[var(--brand-orange)]
                         px-4 py-2.5 text-sm font-medium text-white shadow-sm
                         hover:bg-[var(--brand-orange-dark)] transition disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Updating…" : "Update password"}
            </button>
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
