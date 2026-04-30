import type { Metadata } from 'next';
import './globals.css';
import './brand.css';
import { CartProvider } from '@/lib/cart-context';
import { Navbar } from '@/components/Navbar';
import { CartDrawer } from '@/components/CartDrawer';
import { Footer } from '@/components/atoms/Footer';
// import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';

export const metadata: Metadata = {
  title: 'Inngest Swag — Wear the Workflow',
  description:
    'Official Inngest merchandise. Every order is a durable Inngest workflow you can watch run in real-time.',
  openGraph: {
    title: 'Inngest Swag — Wear the Workflow',
    description: 'Official Inngest merchandise. Built durably.',
    siteName: 'Inngest Swag Store',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
          <CartDrawer />
          {/* <ColorSchemeToggle /> */}
        </CartProvider>
      </body>
    </html>
  );
}
