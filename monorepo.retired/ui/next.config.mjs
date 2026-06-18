/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Set to true temporarily if you need to ship with known TS errors.
    // Keep false in production — silent type errors cause real runtime bugs.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },

  // ── /adminsauce is the canonical admin URL — never changes ──────
  // /admin still works as an internal alias, but /adminsauce is what
  // is publicly exposed and what nginx routes to.
  async rewrites() {
    return [
      // /admin internally, but /adminsauce is the public entry point.
      // Both URLs render the same page; /adminsauce is non-negotiable.
      {
        source: '/admin',
        destination: '/adminsauce',
      },
    ]
  },

  async headers() {
    return [
      {
        // Prevent the admin panel from being iframed except from same origin
        source: '/adminsauce/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
}

export default nextConfig
