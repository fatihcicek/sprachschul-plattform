/** @type {import('next').NextConfig} */
const nextConfig = {
  // Eigenständiges Paket (server.js + nötige Module) für das Hosting.
  output: "standalone",
  // Die eingebettete Datenbank bringt WebAssembly-Dateien mit; nicht bündeln.
  images: { unoptimized: true },
  serverExternalPackages: ["@electric-sql/pglite", "nodemailer"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Einladungslinks stehen im Pfad: nie als Referrer an andere Seiten weitergeben.
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};
export default nextConfig;
