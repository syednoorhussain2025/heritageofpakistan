// src/app/auth/sign-in/SignInForm.tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
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
    <main className="h-screen w-full">
      <style jsx global>{`
        :root {
          --navy-deep: #1c1f4c;
          --sand-gold: #c7a76b;
          --espresso-brown: #4b2e05;
          --ivory-cream: #faf7f2;
          --taupe-grey: #d8cfc4;
          --terracotta-red: #a9502a;
          --mustard-accent: #e2b65c;
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
      `}</style>

      <div className="grid h-full w-full grid-cols-1 md:grid-cols-2">
        {/* LEFT IMAGE */}
        <div className="relative hidden md:block">
          <Image
            src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/Photos/miniature.jpeg"
            alt="Heritage of Pakistan"
            fill
            priority
            sizes="50vw"
            className="object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(169,80,42,0.28) 0%, rgba(250,247,242,0) 55%)",
            }}
          />
        </div>

        {/* RIGHT FORM */}
        <div className="relative flex h-full items-center justify-center overflow-hidden bg-[var(--ivory-cream)] px-6 py-10 md:px-10">
          <img
            src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif.png"
            alt=""
            className="pointer-events-none absolute -top-6 -left-4 w-40 select-none opacity-15 md:w-56"
            style={{ transform: "rotate(-6deg)" }}
          />
          <img
            src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif%20(2).png"
            alt=""
            className="pointer-events-none absolute -top-8 -right-4 w-40 select-none opacity-15 md:w-56"
            style={{ transform: "rotate(6deg)" }}
          />

          <div className="relative z-10 w-full max-w-md">
            <header className="mb-6 text-center md:text-left">
              <h1 className="text-4xl font-black leading-tight text-[var(--dark-grey)]">
                Welcome back
              </h1>
              <p className="mt-1 text-sm text-[var(--espresso-brown)]/80">
                Sign in to continue exploring Pakistan’s heritage.
              </p>
              <div className="mt-3 h-[3px] w-16 rounded bg-[var(--sand-gold)]" />
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

            <div className="mt-6 text-sm text-[var(--espresso-brown)]">
              New here?{" "}
              <Link
                className="font-semibold text-[var(--terracotta-red)] underline decoration-[var(--sand-gold)] underline-offset-2 hover:opacity-90"
                href="/auth/sign-up"
              >
                Create an account
              </Link>
            </div>

            <p className="mt-2 text-[12px] text-[var(--espresso-brown)]/70">
              By continuing you agree to our Terms and acknowledge our Privacy
              Policy.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
