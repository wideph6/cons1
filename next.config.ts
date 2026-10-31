import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // The built-in New M sticker background is read from disk by its route, not served from public/.
  outputFileTracingIncludes: {
    "/api/admin/new-m/background": ["./assets/new-m/**/*"],
  },
  async redirects() {
    // The file manager was renamed to Old M; bookmarks to its old address still land on it.
    return [{ source: "/admin/files", destination: "/admin/old-m", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
