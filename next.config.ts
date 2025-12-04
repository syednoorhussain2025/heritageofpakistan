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

    // Serve a single modern format to reduce the number of transformations.
    formats: ["image/webp"],

    // Keep optimized variants in the edge cache for about 3 months.
    // 60 seconds * 60 minutes * 24 hours * 90 days
    minimumCacheTTL: 60 * 60 * 24 * 90,
  },

  // Optional: keep strict defaults elsewhere
  // reactStrictMode: true,
};

export default nextConfig;
