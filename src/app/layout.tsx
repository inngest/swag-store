import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import './brand.css';
import { CartProvider } from '@/lib/cart-context';
import { listPublicProducts } from '@/lib/store-db';
import { Navbar } from '@/components/Navbar';
import { CartDrawer } from '@/components/CartDrawer';
import { Footer } from '@/components/atoms/Footer';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';

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

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const products = await listPublicProducts();
  const showBrandLab =
    process.env.NODE_ENV === 'development' && process.env.SWAG_STORE_ENABLE_BRAND_LAB === '1';

  return (
    <html lang="en">
      <body>
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: '#FB6142',
              colorBackground: '#F2F2F2',
              colorText: '#020202',
              borderRadius: '0px',
            },
          }}
        >
          <CartProvider>
            <Navbar />
            <main>{children}</main>
            <Footer />
            <CartDrawer products={products} />
            {showBrandLab && <ColorSchemeToggle />}
          </CartProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
