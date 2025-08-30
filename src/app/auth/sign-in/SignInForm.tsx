// src/app/auth/sign-in/SignInForm.tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function SignInForm() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  // Where to send the user after sign-in (defaults to dashboard)
  const redirectTo = sp.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loadingPwd, setLoadingPwd] = useState(false);
  const [loadingOtp, setLoadingOtp] = useState(false);
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
      router.replace(redirectTo);
    } catch (e: any) {
      setErr(e?.message ?? "Sign in failed.");
    } finally {
      setLoadingPwd(false);
    }
  }

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoadingOtp(true);
    try {
      // IMPORTANT: send users to /auth/callback so we can exchange the code for a session
      const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
        redirectTo
      )}`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });
      if (error) throw error;

      setMsg("Magic link sent. Please check your email.");
    } catch (e: any) {
      setErr(e?.message ?? "Could not send magic link.");
    } finally {
      setLoadingOtp(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* LEFT: full-height photo */}
      <div className="relative hidden md:block">
        <Image
          src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop"
          alt="Heritage of Pakistan"
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
      </div>

      {/* RIGHT: auth panel */}
      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-3xl font-semibold [font-family:var(--font-headerlogo-shorthand)] text-[var(--brand-blue)]">
              Welcome back
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Sign in to continue exploring Pakistan’s heritage.
            </p>
          </div>

          {/* Email + Password */}
          <form onSubmit={onEmailPassword} className="space-y-3">
            <label className="block">
              <span className="sr-only">Email</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                           focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]
                           transition"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="sr-only">Password</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                           focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]
                           transition"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <button
              type="submit"
              disabled={loadingPwd}
              className="w-full rounded-lg bg-[var(--brand-orange)] text-white py-2.5 font-medium
                         hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loadingPwd ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs uppercase tracking-wide text-gray-500">
              Or
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Magic link */}
          <form onSubmit={onMagicLink} className="space-y-3">
            <div className="text-sm text-gray-600">Email me a magic link:</div>
            <label className="block">
              <span className="sr-only">Email</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                           focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]
                           transition"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              disabled={loadingOtp}
              className="w-full rounded-lg border border-gray-300 py-2.5 font-medium
                         hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loadingOtp ? "Sending…" : "Send magic link"}
            </button>
          </form>

          {(err || msg) && (
            <div
              className={`rounded-md border p-3 text-sm ${
                err
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {err ?? msg}
            </div>
          )}

          <div className="text-sm">
            New here?{" "}
            <Link
              className="underline hover:text-[var(--brand-orange)]"
              href="/auth/sign-up"
            >
              Create an account
            </Link>
          </div>

          <p className="text-[12px] text-gray-500">
            By continuing you agree to our Terms and acknowledge our Privacy
            Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
