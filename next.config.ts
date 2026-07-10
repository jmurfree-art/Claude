import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // msedge-tts and its ws dependency break when bundled into server chunks
  // (ws frame masking fails with "b.mask is not a function") — load them
  // from node_modules at runtime instead.
  serverExternalPackages: ["msedge-tts", "ws", "https-proxy-agent"],
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
