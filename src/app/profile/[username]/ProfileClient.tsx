"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { getPublicUrl } from "@/lib/image/publicUrl";
import Image from "next/image";

type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  badge: string | null;
  avatar_path: string | null;
};

export default function ProfileClient() {
  const params = useParams<{ username: string }>();
  const username = params.username;

  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, bio, badge, avatar_path")
        .eq("username", username)
        .single();
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      setProfile(data as Profile);
      setLoading(false);
    }
    if (username) {
      load();
    }
  }, [username, supabase]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-gray-500 text-sm">Loading profile...</p>
    </div>
  );
  if (!profile) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-gray-500 text-sm">User not found.</p>
    </div>
  );

  return (
    <div
      className="max-w-2xl mx-auto px-4 py-6"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        {profile.avatar_path ? (
          <Image
            src={getPublicUrl("avatars", profile.avatar_path)}
            alt="avatar"
            width={80}
            height={80}
            className="rounded-full ring-2 ring-gray-100 shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gray-200 shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 truncate">
            {profile.full_name ?? profile.username}
          </h1>
          <p className="text-sm text-gray-500 truncate">@{profile.username}</p>
          {profile.badge && (
            <p className="mt-0.5 text-sm text-green-700 font-medium">{profile.badge}</p>
          )}
          {profile.bio && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-3">{profile.bio}</p>
          )}
        </div>
      </div>

      {/* Links */}
      <div className="flex flex-col gap-3">
        <a
          href={`/portfolio/${profile.id}`}
          className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold text-gray-800 active:bg-gray-50 transition"
        >
          View Portfolio
        </a>
        <a
          href={`/profiles/${profile.id}`}
          className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-semibold text-gray-800 active:bg-gray-50 transition"
        >
          View Reviews
        </a>
      </div>
    </div>
  );
}
