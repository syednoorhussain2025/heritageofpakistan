// src/app/auth/sign-up/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const heroImages = [
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/d4fe2137-78ff-4e17-b7c6-f4b41cad31a8/1771660133978-Islamia%20College%20Peshawar-34.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/04da125d-4c2b-4be6-a112-e52b87f1629a/1771569291072-birds-flying-badshahi-mosque.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/da973cff-1bff-45f8-a13d-38e2af239691/1771663260542-Khaplu%20Palace-20.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/3567294c-1090-43e7-8c2d-6676e5b9ea54/1771680261029-Malam%20Jabba-103.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/c7ffcc06-e765-4e4e-a6ad-cffc2fc1b441/1771690397771-Royal%20Garden%20Altit-8.jpg",
];

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

  const [heroReady, setHeroReady] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Preload first hero image
  useEffect(() => {
    const img = new window.Image();
    img.src = heroImages[0];
    if (img.complete) setHeroReady(true);
    else {
      img.onload = () => setHeroReady(true);
      img.onerror = () => setHeroReady(true);
    }
  }, []);

  // Crossfade slideshow
  useEffect(() => {
    if (!heroReady) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroReady]);

  // Mark body so CSS can strip header items on mobile sign-up only
  useEffect(() => {
    document.body.dataset.page = "sign-up";
    return () => { delete document.body.dataset.page; };
  }, []);

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
        button, input { outline: none !important; }
        /* ── Sign-up: transparent header on all screen sizes ── */
        body[data-page="sign-up"] header {
          background-color: transparent !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          z-index: 3010 !important;
        }
        /* ── Sign-up mobile: burger only, fixed full-screen layout ── */
        @media (max-width: 767px) {
          body[data-page="sign-up"] {
            overflow: hidden;
            background-color: black !important;
            min-height: 0 !important;
            height: 100dvh !important;
          }
          body[data-page="sign-up"] header a[href="/"],
          body[data-page="sign-up"] header [class*="max-w-2xl"],
          body[data-page="sign-up"] header [data-header-user] {
            display: none !important;
          }
          body[data-page="sign-up"] header [aria-hidden="true"] {
            opacity: 1 !important;
          }
          body[data-page="sign-up"] header button[aria-label="Open menu"] svg {
            color: white !important;
          }
          body[data-page="sign-up"] #bottom-nav,
          body[data-page="sign-up"] #bottom-nav-spacer {
            display: none !important;
          }
        }
      `}</style>

      {/* ── MOBILE LAYOUT ── */}
      <div
        className="md:hidden relative flex flex-col items-center justify-center overflow-hidden"
        style={{
          marginTop: "calc(var(--sticky-offset, 72px) * -1)",
          height: "calc(100dvh + var(--sticky-offset, 72px))",
          paddingTop: "var(--sticky-offset, 72px)",
          paddingBottom: "72px",
        }}
      >
        {/* Black backdrop */}
        <div className="fixed inset-0 bg-black z-[2999]" />

        {/* Hero slideshow */}
        {heroImages.map((src, i) => (
          <img
            key={src}
            src={src}
            alt="Heritage of Pakistan"
            className={`fixed inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ease-in-out z-[3001] ${
              heroReady && i === heroIndex ? "opacity-100" : "opacity-0"
            }`}
            draggable={false}
          />
        ))}
        {/* Gradient overlay */}
        <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/40 pointer-events-none z-[3002]" />

        {/* Slide indicators — mobile */}
        <div
          className="fixed left-0 right-0 bottom-56 z-[3003] flex justify-center gap-2 px-4"
          aria-label="Slideshow"
        >
          {heroImages.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setHeroIndex(i)}
              aria-label={`Go to slide ${i + 1} of ${heroImages.length}`}
              aria-current={i === heroIndex ? "true" : undefined}
              className={`rounded-full transition-all duration-300 ${
                i === heroIndex
                  ? "h-2.5 w-2.5 bg-white shadow-md"
                  : "h-2 w-2 bg-white/50 hover:bg-white/70"
              }`}
            />
          ))}
        </div>

        {/* Centred content: title + form card */}
        <div className="relative z-[3003] w-full px-5 flex flex-col gap-4 mt-32">
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
      <div
        className="hidden md:grid h-screen grid-cols-2 overflow-hidden"
        style={{ marginTop: "calc(var(--sticky-offset, 72px) * -1)" }}
      >
        {/* LEFT: Hero slideshow */}
        <div className="relative h-screen overflow-hidden">
          {heroImages.map((src, i) => (
            <img
              key={src}
              src={src}
              alt="Heritage of Pakistan"
              className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ease-in-out ${
                heroReady && i === heroIndex ? "opacity-100" : "opacity-0"
              }`}
              draggable={false}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
          {/* Slide indicators — desktop */}
          <div
            className="absolute bottom-6 left-0 right-0 z-10 flex justify-center gap-2"
            aria-label="Slideshow"
          >
            {heroImages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHeroIndex(i)}
                aria-label={`Go to slide ${i + 1} of ${heroImages.length}`}
                aria-current={i === heroIndex ? "true" : undefined}
                className={`rounded-full transition-all duration-300 ${
                  i === heroIndex
                    ? "h-2.5 w-2.5 bg-white shadow-md"
                    : "h-2 w-2 bg-white/50 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
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
