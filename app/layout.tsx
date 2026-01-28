import type { Metadata } from "next";
import "./globals.css";
import { Doto } from 'next/font/google';

const doto = Doto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-doto',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Orbit",
  description: "A crisp, orbit-themed Next.js hero page."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={doto.variable}>{children}</body>
    </html>
  );
}
