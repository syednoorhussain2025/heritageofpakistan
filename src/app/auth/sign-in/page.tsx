// src/app/auth/sign-in/page.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function SignInPage() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();
  const redirectTo = sp.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) return setErr(error.message);
    router.push(redirectTo);
  }

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${redirectTo}` },
    });
    setLoading(false);
    if (error) return setErr(error.message);
    setMsg("Check your email for the sign-in link.");
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* LEFT: full-height photo */}
      <div className="relative hidden md:block">
        <Image
          src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/6479569d-d7c3-40b5-ac1e-9646df15d466/1755592810806-St-Lukes-Church-Abbottabad-89.jpg"
          alt="St. Luke’s Church, Abbottabad"
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        {/* subtle gradient for readability on small screens if ever shown */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
      </div>

      {/* RIGHT: auth panel */}
      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md space-y-6">
          {/* Title */}
          <div>
            <h1 className="text-3xl font-semibold [font-family:var(--font-headerlogo-shorthand)]">
              Welcome back
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Sign in to continue exploring Pakistan’s heritage.
            </p>
          </div>

          {/* Email + password */}
          <form onSubmit={onEmailPassword} className="space-y-3">
            <label className="block">
              <span className="sr-only">Email</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                           focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]
                           transition"
                type="email"
                placeholder="Email address"
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
              className="w-full rounded-lg px-3 py-2 text-white
                         bg-[var(--brand-orange)] hover:brightness-95 active:brightness-90
                         disabled:opacity-60 disabled:cursor-not-allowed transition"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Divider */}
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
                placeholder="Email address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button
              className="w-full rounded-lg px-3 py-2 border
                         hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>

          {/* Messages */}
          {msg && <p className="text-sm text-green-600">{msg}</p>}
          {err && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}

          {/* Footer actions */}
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
