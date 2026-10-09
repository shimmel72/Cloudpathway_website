/**
 * Plain JavaScript on purpose, not next.config.ts.
 *
 * Production installs run `npm prune --omit=dev`, which removes TypeScript.
 * With a .ts config, `next start` then notices TypeScript is missing and tries
 * to `npm install` it at boot — which fails under the systemd unit's
 * ProtectSystem=strict (node_modules is read-only) and crash-loops the service.
 * A .mjs config needs nothing at runtime.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3"],
  // The site is behind nginx, which already announces itself; this one only
  // tells a visitor which framework to probe.
  poweredByHeader: false,
};

export default nextConfig;
