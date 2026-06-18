// =================================================================
// next.config.mjs — Twisted Engine UI
// =================================================================
// TEACHING: In local dev, the UI runs on :3000 and the backend on :3001.
// Browsers treat different ports as different origins, which means:
//   1. Session cookies (sameSite:'lax') won't be sent cross-origin
//   2. CORS headers are required for every fetch call
//
// The fix: Next.js rewrites proxy API requests through :3000.
// The browser thinks it's talking to :3000 (same origin), but Next.js
// quietly forwards those requests to :3001 on the server side.
// Result: cookies "just work", no CORS issues, same behaviour as production
// (where nginx does the same thing).
//
// In production, these rewrites are harmless but unused — nginx handles
// the routing before Next.js ever sees the request.
// =================================================================

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  // Proxy API/auth/socket requests to the Express backend in development
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://localhost:3001'
    return [
      // Auth routes
      { source: '/auth/:path*',         destination: `${backend}/auth/:path*` },
      { source: '/login',               destination: `${backend}/login` },
      { source: '/register',            destination: `${backend}/register` },
      { source: '/me',                  destination: `${backend}/me` },
      { source: '/logout',              destination: `${backend}/logout` },
      { source: '/verify-email',        destination: `${backend}/verify-email` },

      // Game API routes (all under /game/ prefix on the backend)
      { source: '/game/:path*',         destination: `${backend}/game/:path*` },

      // Admin routes
      { source: '/admin/:path*',        destination: `${backend}/admin/:path*` },
      { source: '/admin-panel/:path*',  destination: `${backend}/admin-panel/:path*` },
      { source: '/mod-panel/:path*',    destination: `${backend}/mod-panel/:path*` },

      // API namespaced routes
      { source: '/api/:path*',          destination: `${backend}/api/:path*` },

      // AdminSauce vanilla iframe
      { source: '/sauce/:path*',        destination: `${backend}/sauce/:path*` },

      // Health check
      { source: '/health',              destination: `${backend}/health` },

      // Socket.IO (polling fallback — WebSocket upgrade is handled by Next.js dev server)
      { source: '/socket.io/:path*',    destination: `${backend}/socket.io/:path*` },
    ]
  },
}

export default nextConfig
