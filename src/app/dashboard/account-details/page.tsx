// src/app/dashboard/account-details/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Helper function to format the date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export default async function AccountDetailsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // This should not happen due to middleware, but it's a good safeguard
    redirect("/auth/sign-in");
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Account Details</h1>
      <div className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b">
          <span className="text-gray-600">Full Name</span>
          <span className="font-medium text-gray-900">
            {user.user_metadata.full_name || "Not provided"}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 border-b">
          <span className="text-gray-600">Email Address</span>
          <span className="font-medium text-gray-900">{user.email}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2">
          <span className="text-gray-600">Account Created On</span>
          <span className="font-medium text-gray-900">
            {formatDate(user.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
