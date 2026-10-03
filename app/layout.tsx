import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAYDAY — Agent Rescue",
  description: "Roadside assistance for AI agents. Send an SOS. Get a verified fix. Keep moving.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
