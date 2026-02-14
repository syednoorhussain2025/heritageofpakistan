// src/app/admin/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { FaExclamationCircle } from "react-icons/fa";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setCurrentEmail(data.user?.email ?? null);
      setLoading(false);
    })();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      return;
    }
    window.location.href = "/admin";
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-900" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-900 text-gray-300">
      <div className="w-full max-w-sm bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-blue-400 to-emerald-400 text-transparent bg-clip-text">
          Admin Panel
        </h1>

        {currentEmail ? (
          <div className="space-y-4 text-center">
            <div className="text-sm text-gray-400">
              Signed in as{" "}
              <b className="font-medium text-gray-200">{currentEmail}</b>
            </div>
            <a
              href="/admin"
              className="w-full inline-block text-center px-4 py-2.5 rounded-md bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold shadow-lg hover:shadow-blue-500/30 transition-shadow duration-300"
            >
              Go to Dashboard
            </a>
            <button
              onClick={signOut}
              className="w-full px-4 py-2.5 rounded-md bg-gray-700/50 border border-gray-600 hover:bg-gray-700 transition-colors duration-300"
            >
              Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={signIn} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-400">Email</label>
              <input
                type="email"
                className="w-full bg-gray-700/50 border border-gray-600 rounded-md px-3 py-2 mt-1 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">
                Password
              </label>
              <input
                type="password"
                className="w-full bg-gray-700/50 border border-gray-600 rounded-md px-3 py-2 mt-1 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 p-2.5 rounded-md">
                <FaExclamationCircle />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-md bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold shadow-lg hover:shadow-blue-500/30 transition-shadow duration-300"
            >
              Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
