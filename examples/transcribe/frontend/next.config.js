/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_FUNCTION_APP_URL: process.env.NEXT_PUBLIC_FUNCTION_APP_URL || '',
    NEXT_PUBLIC_SPEECH_REGION: process.env.NEXT_PUBLIC_SPEECH_REGION || 'swedencentral',
  }
}

module.exports = nextConfig
