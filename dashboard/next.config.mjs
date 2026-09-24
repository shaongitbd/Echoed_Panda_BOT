import { fileURLToPath } from 'node:url';

// This folder is the app's root. Next 15+ otherwise walks up to the bot's
// package-lock.json in panda/ and treats panda/ as the workspace, which moves
// the standalone server to .next/standalone/dashboard/server.js — breaking the
// build script's copy steps and `npm start`.
const appRoot = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: appRoot,
  turbopack: { root: appRoot },
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
