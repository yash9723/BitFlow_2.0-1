const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─────────────────────────────────────────────────────────────────────────
  // Security Headers
  // Applied to every response served by Next.js.
  // ─────────────────────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Blocks the page from being embedded in an iframe (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          // Stops browsers from guessing the MIME type (MIME-sniffing attacks)
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Limits referrer info sent to external sites
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Prevents browsers from storing sensitive data
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // Disallow reading sensitive hardware APIs
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // Force HTTPS for 1 year (only effective in production over HTTPS)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Content Security Policy — restrict what resources can load
          // 'unsafe-inline' needed for Monaco Editor inline styles; tighten later
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Monaco is self-hosted under /monaco (no CDN needed)
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob:",
              // Simulation + AI calls go through our own /api routes (server-side)
              "connect-src 'self'",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Proxy rewrites removed — simulation requests now go through
  // the authenticated server-side API route at /api/simulate

  // ─────────────────────────────────────────────────────────────────────────
  // Monaco Editor configuration
  // ─────────────────────────────────────────────────────────────────────────
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        { "monaco-editor": "monaco-editor" },
      ];
    }

    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname),
    };

    return config;
  },
};

module.exports = nextConfig;