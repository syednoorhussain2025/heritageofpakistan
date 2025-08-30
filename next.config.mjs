// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not fail the production build on ESLint errors
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Optional: if you ever see type errors blocking builds, flip this on
  // typescript: { ignoreBuildErrors: true },

  images: {
    // allow your Supabase public bucket / external images
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "**.unsplash.com" },
      { protocol: "https", hostname: "**" }, // keep broad for now; tighten later
    ],
  },
};

export default nextConfig;
