// src/app/auth/sign-in/SignInForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const AUTH_JUST_SIGNED_IN = "auth:justSignedIn";

export default function SignInForm() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();

  const requestedRedirect = sp.get("redirectTo");
  const redirectTo =
    requestedRedirect && requestedRedirect.startsWith("/")
      ? requestedRedirect
      : "/dashboard";

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

  async function waitForSessionReady(timeoutMs = 5000): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const { data, error } = await supabase.auth.getSession();
      if (error) break;
      if (data.session?.user) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    return false;
  }

  // Mark body so CSS can strip header items on mobile sign-in only
  useEffect(() => {
    document.body.dataset.page = "sign-in";
    return () => { delete document.body.dataset.page; };
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!active || !session?.user) return;
        window.location.assign(redirectTo);
      })
      .catch((error) => {
        console.warn("[auth/sign-in] getSession failed", error);
      });
    return () => {
      active = false;
    };
  }, [supabase, redirectTo]);

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

      await waitForSessionReady();
      window.location.assign(redirectTo);
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
    <main className="w-full">
      <style jsx global>{`
        :root {
          --navy-deep: var(--brand-blue);
          --sand-gold: var(--brand-orange);
          --espresso-brown: #4b2e05;
          --ivory-cream: #ffffff;
          --taupe-grey: #d4d4d4;
          --terracotta-red: var(--brand-orange);
          --mustard-accent: var(--brand-orange);
          --olive-green: #7b6e3f;
          --dark-grey: #2b2b2b;
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
        /* ── Sign-in mobile: transparent header, burger only ── */
        @media (max-width: 767px) {
          body[data-page="sign-in"] {
            overflow: hidden;
            background-color: black !important;
            min-height: 0 !important;
            height: 100dvh !important;
          }
          body[data-page="sign-in"] header a[href="/"],
          body[data-page="sign-in"] header [class*="max-w-2xl"],
          body[data-page="sign-in"] header [data-header-user] {
            display: none !important;
          }
          body[data-page="sign-in"] header {
            background-color: transparent !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          body[data-page="sign-in"] header [aria-hidden="true"] {
            opacity: 1 !important;
          }
          body[data-page="sign-in"] header button[aria-label="Open menu"] svg {
            color: white !important;
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
        {/* Hero image — fixed so keyboard open doesn't shift it */}
        <Image
          src="https://heritageofpakistan.org/wp-content/uploads/2025/06/Royal-Garden-Altit-23.jpg"
          alt="Royal Garden, Altit"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
          style={{ position: "fixed" }}
        />
        {/* Gradient overlay */}
        <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/40 pointer-events-none" />

        {/* Centred content: title + form card */}
        <div className="relative z-10 w-full px-5 flex flex-col gap-4">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-[2.4rem] font-black leading-[1.1] text-white drop-shadow-lg">
              Welcome back
            </h1>
            <p className="mt-2 text-base text-white/90 italic tracking-wide drop-shadow">
              Sign in to explore Pakistan’s heritage.
            </p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl px-4 pt-4 pb-4 shadow-2xl">
            <form onSubmit={onEmailPassword} className="flex flex-col gap-3">
              <input
                className="w-full rounded-lg border border-[var(--taupe-grey)] bg-white px-3 py-2 text-[15px] text-[var(--dark-grey)] transition focus:border-[var(--mustard-accent)] focus:ring-2 focus:ring-[var(--mustard-accent)]"
                type="email"
                placeholder="Email address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className="w-full rounded-lg border border-[var(--taupe-grey)] bg-white px-3 py-2 text-[15px] text-[var(--dark-grey)] transition focus:border-[var(--mustard-accent)] focus:ring-2 focus:ring-[var(--mustard-accent)]"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loadingPwd}
                className="w-full rounded-lg bg-[var(--terracotta-red)] py-3 font-semibold text-white transition hover:opacity-95 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingPwd ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={onForgotPassword}
                disabled={loadingReset}
                className="text-sm font-medium text-[var(--navy-deep)] underline transition hover:text-[var(--terracotta-red)] disabled:opacity-60"
              >
                {loadingReset ? "Sending…" : "Forgot password?"}
              </button>
            </div>

            {(err || msg) && (
              <div
                className={`mt-3 rounded-md border p-3 text-sm ${
                  err
                    ? "border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-text)]"
                    : "border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok-text)]"
                }`}
              >
                {err ?? msg}
              </div>
            )}

            <p className="mt-3 text-sm text-center text-[var(--brand-grey)]">
              New here?{" "}
              <Link
                className="font-semibold text-[var(--brand-orange)] underline decoration-[var(--brand-orange)] underline-offset-2"
                href="/auth/sign-up"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden md:grid h-screen w-full grid-cols-2">
        {/* LEFT IMAGE */}
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

        {/* RIGHT FORM */}
        <div className="relative flex h-full items-center justify-center overflow-hidden bg-[var(--ivory-cream)] px-6 py-10 md:px-10">
          <div className="relative z-10 w-full max-w-md">
            <header className="mb-6 text-left">
              <h1 className="text-4xl font-black leading-tight text-[var(--brand-blue)]">
                Welcome back
              </h1>
              <p className="mt-1 text-sm text-[var(--brand-grey)]">
                Sign in to continue exploring Pakistan’s heritage.
              </p>
              <div className="mt-3 h-[3px] w-16 rounded bg-[var(--brand-orange)]" />
            </header>

            <form onSubmit={onEmailPassword} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[var(--navy-deep)]">
                  Email
                </span>
                <input
                  className="w-full rounded-lg border border-[var(--taupe-grey)] bg-white px-3 py-2 text-[15px] text-[var(--dark-grey)] transition focus-visible:border-[var(--mustard-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mustard-accent)]"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[var(--navy-deep)]">
                  Password
                </span>
                <input
                  className="w-full rounded-lg border border-[var(--taupe-grey)] bg-white px-3 py-2 text-[15px] text-[var(--dark-grey)] transition focus-visible:border-[var(--mustard-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mustard-accent)]"
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>

              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={loadingPwd}
                  className="inline-flex w-[min(18rem,60%)] items-center justify-center rounded-lg bg-[var(--terracotta-red)] px-4 py-2.5 font-semibold text-white transition hover:opacity-95 active:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--mustard-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingPwd ? "Signing in…" : "Sign in"}
                </button>

                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={loadingReset}
                  className="whitespace-nowrap text-sm font-medium text-[var(--navy-deep)] underline transition hover:text-[var(--terracotta-red)] focus-visible:ring-2 focus-visible:ring-[var(--mustard-accent)] disabled:opacity-60"
                >
                  {loadingReset ? "Sending…" : "Forgot password?"}
                </button>
              </div>
            </form>

            {(err || msg) && (
              <div
                className={`mt-6 rounded-md border p-3 text-sm ${
                  err
                    ? "border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-text)]"
                    : "border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok-text)]"
                }`}
              >
                {err ?? msg}
              </div>
            )}

            <div className="mt-6 text-sm text-[var(--brand-grey)]">
              New here?{" "}
              <Link
                className="font-semibold text-[var(--brand-orange)] underline decoration-[var(--brand-orange)] underline-offset-2 hover:opacity-90"
                href="/auth/sign-up"
              >
                Create an account
              </Link>
            </div>

            <p className="mt-2 text-[12px] text-[var(--brand-grey)]/60">
              By continuing you agree to our Terms and acknowledge our Privacy
              Policy.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
