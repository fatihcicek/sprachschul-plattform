import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Kurswerk",
  description: "Plattform für Sprachschulen und BAMF-Kursträger",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F6F4EF", color: "#14213D" }}>{children}</body>
    </html>
  );
}
