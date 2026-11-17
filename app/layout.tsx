import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";

const sans = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"], adjustFontFallback: false });

export const metadata: Metadata = {
  title: "Baleen",
  description: "Filters the shelf down to what actually works.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
