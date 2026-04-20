/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  experimental: {
    // Keep heavy Node-only deps out of Next's bundling step. Puppeteer + the
    // serverless Chromium build won't work when Webpack tries to trace them.
    serverComponentsExternalPackages: [
      'puppeteer-core',
      '@sparticuz/chromium',
    ],
  },
}

module.exports = nextConfig
