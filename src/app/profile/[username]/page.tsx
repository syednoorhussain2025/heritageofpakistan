"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
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

export default function PublicProfilePage() {
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

  if (loading) return <p>Loading profile...</p>;
  if (!profile) return <p>User not found.</p>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center space-x-4 mb-6">
        {profile.avatar_path ? (
          <Image
            src={getPublicUrl("avatars", profile.avatar_path, {
              width: 120,
              quality: 80,
            })}
            alt="avatar"
            width={80}
            height={80}
            className="rounded-full"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gray-300" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">
            {profile.full_name ?? profile.username}
          </h1>
          {profile.badge && (
            <p className="text-green-600 font-medium">{profile.badge}</p>
          )}
          {profile.bio && (
            <p className="text-sm text-gray-600 mt-1">{profile.bio}</p>
          )}
        </div>
      </div>

      {/* Links */}
      <div className="space-y-2">
        <a
          href={`/portfolio/${profile.id}`}
          className="text-blue-600 underline"
        >
          View Portfolio
        </a>
        <a href={`/profiles/${profile.id}`} className="text-blue-600 underline">
          View Reviews
        </a>
      </div>
    </div>
  );
}
