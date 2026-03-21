// src/app/dashboard/account-details/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DeleteAccountButton from "./DeleteAccountButton";

// Helper function to format the date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export default async function AccountDetailsPage() {
  const supabase = await createClient();

  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    redirect("/auth/sign-in");
  }

  const user = userData.user ?? null;

  if (!user) {
    // This should not happen due to middleware, but it's a good safeguard
    redirect("/auth/sign-in");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-5">Account Details</h1>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-0.5 py-3 px-5 border-b border-gray-100">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Full Name</span>
          <span className="font-semibold text-gray-900 text-base">
            {user.user_metadata.full_name || "Not provided"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 py-3 px-5 border-b border-gray-100">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Email Address</span>
          <span className="font-semibold text-gray-900 text-base">{user.email}</span>
        </div>
        <div className="flex flex-col gap-0.5 py-3 px-5">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Account Created</span>
          <span className="font-semibold text-gray-900 text-base">
            {formatDate(user.created_at)}
          </span>
        </div>
      </div>
      <DeleteAccountButton />
    </div>
  );
}
