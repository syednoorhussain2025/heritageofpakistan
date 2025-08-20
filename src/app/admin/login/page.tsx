// src/app/admin/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setCurrentEmail(data.user?.email ?? null);
    })();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      alert(error.message);
      return;
    }
    window.location.href = "/admin";
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded shadow p-5">
        <h1 className="text-xl font-semibold mb-4">Admin Login</h1>

        {currentEmail ? (
          <div className="space-y-3">
            <div className="text-sm text-gray-700">
              Signed in as <b>{currentEmail}</b>
            </div>
            <a
              href="/admin"
              className="w-full inline-block text-center px-4 py-2 rounded bg-black text-white"
            >
              Go to Admin Dashboard
            </a>
            <button
              onClick={signOut}
              className="w-full px-4 py-2 rounded bg-gray-200"
            >
              Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={signIn} className="space-y-3">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full border rounded px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                className="w-full border rounded px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 rounded bg-black text-white"
            >
              Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
