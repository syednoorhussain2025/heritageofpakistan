// src/app/auth/sign-in/page.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import SignInForm from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to Heritage of Pakistan to save your favourite sites, build wishlists, plan trips and more.",
  robots: { index: false, follow: false },
};

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      Loading...
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SignInForm />
    </Suspense>
  );
}
