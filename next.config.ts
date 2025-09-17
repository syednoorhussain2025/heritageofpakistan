// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ✅ IMAGE OPTIMIZATION (Next.js Image Component + Vercel pipeline)
  images: {
    // Allow optimized loading from your Supabase public bucket(s).
    // This wildcard covers any project-ref subdomain like abcd1234.supabase.co
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],

    // Generate srcset breakpoints. Tweak if your design uses different widths.
    deviceSizes: [360, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 24, 32, 48, 64, 96, 128, 256],

    // Serve modern formats when the browser supports them.
    formats: ["image/avif", "image/webp"],

    // Keep optimization ON (do not set unoptimized: true).
    // unoptimized: false, // (false by default)
  },

  // Optional: keep strict defaults elsewhere
  // reactStrictMode: true,
};

export default nextConfig;
