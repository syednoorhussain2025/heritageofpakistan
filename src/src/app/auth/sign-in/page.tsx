// src/app/auth/sign-in/page.tsx
import { Suspense } from "react";
import SignInForm from "./SignInForm";

// A simple loading UI to show while the form is loading
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
