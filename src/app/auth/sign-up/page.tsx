// src/app/auth/sign-up/page.tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function safeRedirectTo(next: string | null, fallback: string) {
  if (!next) return fallback;

  const trimmed = next.trim();
  if (!trimmed) return fallback;

  // Only allow same-origin relative paths
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("://")
  ) {
    return trimmed;
  }

  return fallback;
}

export default function SignUpPage() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const redirectTo = safeRedirectTo(sp.get("redirectTo"), "/dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);

    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
      redirectTo
    )}`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo,
      },
    });

    setLoading(false);
    if (error) return setErr(error.message);

    // If email confirmation is disabled, Supabase may return an active session immediately
    if (data?.session) {
      router.replace(redirectTo);
      return;
    }

    setMsg("Check your inbox to confirm your email.");
  }

  return (
    <div className="w-full">
      <style jsx global>{`
        :root {
          --sticky-offset: 72px;
        }
        button, input { outline: none !important; }
      `}</style>

      {/* ── MOBILE LAYOUT ── */}
      <div
        className="md:hidden relative flex flex-col items-center justify-center"
        style={{
          marginTop: "calc(var(--sticky-offset, 72px) * -1)",
          height: "calc(100dvh)",
          paddingTop: "var(--sticky-offset, 72px)",
        }}
      >
        {/* Hero image */}
        <Image
          src="https://heritageofpakistan.org/wp-content/uploads/2025/06/Royal-Garden-Altit-23.jpg"
          alt="Royal Garden, Altit"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/40 pointer-events-none" />

        {/* Centred content: title + form card */}
        <div className="relative z-10 w-full px-5 flex flex-col gap-4">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-[2.4rem] font-black leading-[1.1] text-white drop-shadow-lg">
              Create your<br />account
            </h1>
            <p className="mt-2 text-base text-white/90 italic tracking-wide drop-shadow">
              Discover, Explore, Preserve
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl px-4 pt-4 pb-4 shadow-2xl">
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
                placeholder="Full name"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
                type="email"
                placeholder="Email address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
                type="password"
                placeholder="Password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                className="w-full rounded-lg py-3 font-semibold text-white bg-[var(--brand-orange)] hover:opacity-95 active:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition"
                disabled={loading}
              >
                {loading ? "Creating…" : "Create account"}
              </button>
            </form>

            {msg && <p className="mt-3 text-sm text-green-600 text-center">{msg}</p>}
            {err && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {err}
              </div>
            )}

            <p className="mt-3 text-sm text-center text-gray-600">
              Already have an account?{" "}
              <Link
                className="font-semibold text-[var(--brand-orange)] underline decoration-[var(--brand-orange)] underline-offset-2"
                href={`/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`}
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden md:grid h-screen grid-cols-2 overflow-hidden">
        {/* LEFT: full-height photo */}
        <div className="relative h-screen">
          <Image
            src="https://heritageofpakistan.org/wp-content/uploads/2025/06/Royal-Garden-Altit-23.jpg"
            alt="Royal Garden, Altit"
            fill
            priority
            sizes="50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
        </div>

        {/* RIGHT: sign-up card */}
        <div className="flex h-screen items-center justify-center p-6 md:p-10 overflow-hidden">
          <div className="w-full max-w-md space-y-6">
            <div>
              <h1 className="text-3xl font-semibold [font-family:var(--font-headerlogo-shorthand)] text-[var(--brand-blue)]">
                Create your account
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Start building trips, wishlists, and collections.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
                placeholder="Full name"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
                type="email"
                placeholder="Email address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
                type="password"
                placeholder="Password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                className="w-full rounded-lg px-3 py-2 text-white bg-[var(--brand-orange)] hover:brightness-95 active:brightness-90 disabled:opacity-60 disabled:cursor-not-allowed transition"
                disabled={loading}
              >
                {loading ? "Creating…" : "Create account"}
              </button>
            </form>

            {msg && <p className="text-sm text-green-600">{msg}</p>}
            {err && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {err}
              </div>
            )}

            <div className="text-sm">
              Already have an account?{" "}
              <Link
                className="underline hover:text-[var(--brand-orange)]"
                href={`/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`}
              >
                Sign in
              </Link>
            </div>

            <p className="text-[12px] text-gray-500">
              By creating an account you agree to our Terms and acknowledge our
              Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
