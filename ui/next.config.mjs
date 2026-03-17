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

      // Game API routes
      { source: '/my-characters',       destination: `${backend}/my-characters` },
      { source: '/get-char-full',       destination: `${backend}/get-char-full` },
      { source: '/create-character',    destination: `${backend}/create-character` },
      { source: '/creation-data',       destination: `${backend}/creation-data` },
      { source: '/get-map',             destination: `${backend}/get-map` },
      { source: '/get-all-maps',        destination: `${backend}/get-all-maps` },
      { source: '/save-state',          destination: `${backend}/save-state` },
      { source: '/load-state',          destination: `${backend}/load-state` },
      { source: '/equip-item',          destination: `${backend}/equip-item` },
      { source: '/unequip-item',        destination: `${backend}/unequip-item` },
      { source: '/use-item',            destination: `${backend}/use-item` },
      { source: '/get-shop',            destination: `${backend}/get-shop` },
      { source: '/buy-item',            destination: `${backend}/buy-item` },
      { source: '/sell-item',           destination: `${backend}/sell-item` },
      { source: '/my-oghams',           destination: `${backend}/my-oghams` },
      { source: '/get-char-by-name',    destination: `${backend}/get-char-by-name` },
      { source: '/fast-travel-points',  destination: `${backend}/fast-travel-points` },

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
