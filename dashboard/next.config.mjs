/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict React mode catches the obvious effect/state bugs early.
  reactStrictMode: true,
  // Self-contained runtime image — Next emits everything needed (server
  // entry, copied node_modules, server-action manifest) under
  // .next/standalone. Avoids the "Cannot read properties of undefined
  // (reading 'workers')" / "Failed to find Server Action" class of
  // errors that appear when `next start` is invoked against a partial
  // build output (typical Dokploy / Nixpacks setup).
  output: 'standalone',
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
