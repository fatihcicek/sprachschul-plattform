/** @type {import('next').NextConfig} */
const nextConfig = {
  // Eigenständiges Paket (server.js + nötige Module) für das Hosting.
  output: "standalone",
  // Die eingebettete Datenbank bringt WebAssembly-Dateien mit; nicht bündeln.
  images: { unoptimized: true },
  serverExternalPackages: ["@electric-sql/pglite"],
};
export default nextConfig;
