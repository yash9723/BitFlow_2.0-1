const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // No source maps in production: the shipped JS stays minified (scripts/check-bundle-leaks.ts).
  productionBrowserSourceMaps: false,
  poweredByHeader: false,

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
            // usb / serial: flashing a real FPGA board and its serial port (lib/synth/flash.ts, lib/webserial.ts)
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(self), serial=(self)",
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
              // jsDelivr: YoWASP Yosys (WebAssembly) for synthesis in the browser (lib/synth/worker.ts)
              // Google Analytics (components/Analytics.tsx) loads only after the visitor accepts the banner
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://cdn.jsdelivr.net https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",   // fonts are self-hosted (lib/fonts.ts)
              "img-src 'self' data: blob: https://www.googletagmanager.com https://*.google-analytics.com",
              // Simulation + AI calls go through our own /api routes (server-side);
              // jsDelivr serves the YoWASP WebAssembly files
              "connect-src 'self' https://cdn.jsdelivr.net https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      // Gowin chip databases (scripts/vendor-gowin.mjs): the path names the tool version, so they never change
      { source: "/fpga/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },

  // Old /learn/<slug> problem links: a permanent redirect at the edge (a redirect() in the page
  // can only happen after the client-side gate has started streaming, which makes it a 200)
  async redirects() {
    return [{ source: "/learn/:slug((?!roadmap$)[^/]+)", destination: "/problems/:slug", permanent: true }];
  },

  // elkjs (schematic/FSM layout in /api/synthesize) is a large prebuilt
  // bundle: load it from node_modules at runtime instead of re-bundling it.
  experimental: {
    serverComponentsExternalPackages: ["elkjs"],
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