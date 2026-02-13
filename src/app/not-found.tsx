// src/app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <div
        aria-hidden="true"
        className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-4"
      >
        <span className="text-3xl leading-none">🧭</span>
      </div>

      <h1 className="text-4xl font-bold text-gray-800 mb-2">
        404 - Page Not Found
      </h1>

      <p className="text-lg text-gray-600 mb-6">
        Sorry, the page you are looking for does not exist.
      </p>

      <Link
        href="/"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[var(--brand-orange)] hover:bg-[#E07500] text-white font-semibold transition-colors shadow-lg hover:shadow-xl"
      >
        <span aria-hidden="true">🏠</span>
        <span>Return to Homepage</span>
      </Link>
    </div>
  );
}
