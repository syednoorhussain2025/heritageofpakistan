// src/app/auth/sign-up/page.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import SignUpForm from "./SignUpForm";

export const metadata: Metadata = {
  title: "Create an Account",
  description:
    "Create a free account on Heritage of Pakistan to save sites, plan trips, build wishlists and share your heritage experiences.",
  robots: { index: false, follow: false },
};

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      Loading...
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SignUpForm />
    </Suspense>
  );
}
