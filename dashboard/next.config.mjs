/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict React mode catches the obvious effect/state bugs early.
  reactStrictMode: true,
  // We render Echoed avatars and server icons from s3.echoed.gg.
  // Allowlist that host so next/image can optimize them.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's3.echoed.gg' },
      { protocol: 'https', hostname: 'cdn.echoed.gg' },
    ],
  },
};

export default nextConfig;
