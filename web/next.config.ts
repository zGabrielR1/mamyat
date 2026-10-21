import type { NextConfig } from "next";

// Cloudflare routes /api directly to Python. The rewrite also supports local
// development and the standalone server within the container.
const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const freeBuild = process.env.CLOUDFLARE_FREE_BUILD === "1";

const nextConfig: NextConfig = {
  output: freeBuild ? "export" : "standalone",
  trailingSlash: freeBuild,
  images: { unoptimized: freeBuild },
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  poweredByHeader: false,
  async rewrites() {
    if (freeBuild) return [];
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
    ];
  },
  async headers() {
    if (freeBuild) return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
