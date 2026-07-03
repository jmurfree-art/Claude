import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // HeyGen avatar preview images
      { protocol: "https", hostname: "**.heygen.com" },
      { protocol: "https", hostname: "**.heygen.ai" },
      // Mock provider avatar previews
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },
};

export default nextConfig;
