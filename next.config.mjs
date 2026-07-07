/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deployed with `next start` under PM2 (matches the droplet's simple-app pattern).
  // better-sqlite3 and simple-git are server-only native/CLI deps; keep them external
  // so Next doesn't try to bundle them into the server build.
  serverExternalPackages: ["better-sqlite3", "simple-git"],
  reactStrictMode: true,
};

export default nextConfig;
