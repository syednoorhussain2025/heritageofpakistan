// src/app/not-found.tsx
import Link from "next/link";
import Icon from "@/components/Icon";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <Icon name="compass" size={64} className="text-gray-400 mb-4" />
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
        <Icon name="home" size={16} />
        <span>Return to Homepage</span>
      </Link>
    </div>
  );
}
