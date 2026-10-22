import type { Metadata } from "next";
import "./globals.css";
import "./quip-theme.css";
export const metadata: Metadata = {
  title: { default: "Quip Control", template: "%s · Quip Control" },
  description: "Private administration for the Quip community",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
