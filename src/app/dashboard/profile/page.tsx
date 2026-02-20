// src/app/dashboard/profile/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "./profile-form";

// This is a Server Component that fetches all necessary data for the form
export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    redirect("/auth/sign-in?redirectTo=/dashboard/profile");
  }

  const user = sessionData.session?.user ?? null;

  if (!user) {
    redirect("/auth/sign-in?redirectTo=/dashboard/profile");
  }

  // Fetch all data in parallel for best performance
  const [accountRes, categoriesRes, interestsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, avatar_url, bio, city, country_code, travel_style, public_profile"
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("categories")
      .select("id, name, parent_id")
      .is("parent_id", null)
      .order("name"),
    supabase
      .from("user_interests")
      .select("category_id, weight")
      .eq("user_id", user.id),
  ]);

  // Handle potential data loading errors
  const error = accountRes.error || categoriesRes.error || interestsRes.error;
  if (error) {
    return (
      <div className="text-red-600">
        <p>Error loading profile data.</p>
        <p className="text-sm mt-2">{error.message}</p>
      </div>
    );
  }

  // Render the client form component with all the fetched data
  return (
    <ProfileForm
      account={accountRes.data}
      categories={categoriesRes.data || []}
      interests={interestsRes.data || []}
    />
  );
}
