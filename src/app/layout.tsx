import type { Metadata } from 'next';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/lib/cart-context';
import { Navbar } from '@/components/Navbar';
import { CartDrawer } from '@/components/CartDrawer';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Inngest Swag — Durably Yours',
  description:
    'Official Inngest merchandise. Wear the durable execution. Ships via Inngest workflows.',
  openGraph: {
    title: 'Inngest Swag — Durably Yours',
    description: 'Official Inngest merchandise. Ships via Inngest workflows.',
    siteName: 'Inngest Swag Store',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable}`}>
      <body style={{ backgroundColor: '#1A161C', color: '#EFE9D6', fontFamily: 'var(--font-space-grotesk, Space Grotesk, sans-serif)', minHeight: '100vh', WebkitFontSmoothing: 'antialiased' }}>
        <CartProvider>
          <Navbar />
          <main>{children}</main>
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
