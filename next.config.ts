import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'static-cdn.jtvnw.net' },
      { protocol: 'https', hostname: 'clips-media-assets2.twitch.tv' },
    ],
  },
  async headers() {
    return [
      {
        // COEP/COOP only on dashboard — required for FFmpeg WASM (SharedArrayBuffer)
        // Do NOT apply to login page or auth routes — breaks Supabase OAuth redirect
        source: '/dashboard/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig