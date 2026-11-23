import { connection } from "next/server";
import type { Metadata } from "next";
import "@fontsource/atkinson-hyperlegible-next/latin-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-600.css";
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SponsorGuard",
  description: "SponsorGuard application",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // A unique request nonce must be present when Next renders inline scripts.
  await connection();
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
