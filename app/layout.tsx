import type { Metadata } from "next";
import "./globals.css";
import { Doto } from 'next/font/google';
import { Web3Provider } from '@/components/providers/Web3Provider';

const doto = Doto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-doto',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Orbit",
  description: "A crisp, orbit-themed Next.js hero page.",
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={doto.variable}>
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
  