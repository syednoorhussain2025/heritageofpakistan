// src/app/auth/sign-in/SignInForm.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const AUTH_JUST_SIGNED_IN = "auth:justSignedIn";

export default function SignInForm() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const redirectTo = sp.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingPwd, setLoadingPwd] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

  async function onEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoadingPwd(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      try {
        window.sessionStorage?.setItem(AUTH_JUST_SIGNED_IN, "1");
      } catch {}

      router.replace(redirectTo);
    } catch (e: any) {
      setErr(e?.message ?? "Sign in failed.");
    } finally {
      setLoadingPwd(false);
    }
  }

  async function onForgotPassword() {
    setErr(null);
    setMsg(null);
    if (!email) {
      setErr("Please enter your email above, then click ‘Forgot password?’.");
      return;
    }
    setLoadingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/update-password?next=${encodeURIComponent(
          redirectTo
        )}`,
      });
      if (error) throw error;
      setMsg("If that email exists, we’ve sent a password reset link.");
    } catch (e: any) {
      setErr(e?.message ?? "Could not send password reset email.");
    } finally {
      setLoadingReset(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-white">
      <style jsx global>{`
        :root {
          --ok-bg: #ecfdf5;
          --ok-border: #a7f3d0;
          --ok-text: #065f46;
          --err-bg: #fef2f2;
          --err-border: #fecaca;
          --err-text: #991b1b;
        }
        button,
        input {
          outline: none !important;
        }
      `}</style>

      <div className="min-h-screen w-full flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[520px]">
          <div className="rounded-[22px] border border-gray-200 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.12)] overflow-hidden">
            {/* Header bar, similar visual weight to your modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-orange-50 flex items-center justify-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-orange)]" />
                </div>
                <div className="leading-tight">
                  <h1 className="text-lg font-semibold text-gray-900">
                    Sign in
                  </h1>
                  <p className="text-sm text-gray-500">
                    Continue exploring Pakistan’s heritage
                  </p>
                </div>
              </div>

              <Link
                href="/"
                className="text-sm text-gray-500 hover:text-gray-800 transition"
                aria-label="Close"
              >
                ✕
              </Link>
            </div>

            <div className="px-6 py-6">
              <form onSubmit={onEmailPassword} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Email
                  </span>
                  <input
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-gray-900 transition
                               focus-visible:border-[var(--brand-orange)] focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]/25"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Password
                  </span>
                  <input
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-gray-900 transition
                               focus-visible:border-[var(--brand-orange)] focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]/25"
                    type="password"
                    placeholder="Password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={loadingPwd}
                    className="inline-flex w-full sm:w-auto sm:flex-1 items-center justify-center rounded-2xl bg-[var(--brand-orange)] px-5 py-3 font-semibold text-white transition
                               hover:brightness-95 active:brightness-90
                               focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]/35
                               disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingPwd ? "Signing in…" : "Sign in"}
                  </button>

                  <button
                    type="button"
                    onClick={onForgotPassword}
                    disabled={loadingReset}
                    className="inline-flex w-full sm:w-auto sm:flex-1 items-center justify-center rounded-2xl bg-black px-5 py-3 font-semibold text-white transition
                               hover:opacity-95 active:opacity-90
                               focus-visible:ring-2 focus-visible:ring-black/30
                               disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingReset ? "Sending…" : "Forgot password"}
                  </button>
                </div>
              </form>

              {(err || msg) && (
                <div
                  className={`mt-5 rounded-2xl border p-4 text-sm ${
                    err
                      ? "border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-text)]"
                      : "border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok-text)]"
                  }`}
                >
                  {err ?? msg}
                </div>
              )}

              <div className="mt-6 text-sm text-gray-600">
                New here?{" "}
                <Link
                  className="font-semibold text-[var(--brand-orange)] hover:opacity-90 underline underline-offset-2"
                  href="/auth/sign-up"
                >
                  Create an account
                </Link>
              </div>

              <p className="mt-2 text-[12px] text-gray-500">
                By continuing you agree to our Terms and acknowledge our Privacy
                Policy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
