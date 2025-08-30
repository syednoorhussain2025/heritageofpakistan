// src/app/auth/sign-up/page.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

export default function SignUpPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    setLoading(false);
    if (error) return setErr(error.message);
    setMsg("Check your inbox to confirm your email.");
  }

  return (
    <div className="h-screen grid grid-cols-1 md:grid-cols-2 overflow-hidden">
      {/* LEFT: full-height photo */}
      <div className="relative hidden md:block h-screen">
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
              className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                         focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
              placeholder="Full name"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <input
              className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                         focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
              type="email"
              placeholder="Email address"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="w-full border rounded-lg px-3 py-2 text-[15px] outline-none
                         focus:ring-2 focus:ring-[var(--brand-orange)] focus:border-[var(--brand-orange)]"
              type="password"
              placeholder="Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button
              className="w-full rounded-lg px-3 py-2 text-white
                         bg-[var(--brand-orange)] hover:brightness-95 active:brightness-90
                         disabled:opacity-60 disabled:cursor-not-allowed transition"
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
              href="/auth/sign-in"
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
  );
}
