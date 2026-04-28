import * as React from 'react';
import Image from 'next/image';
import type { Product } from '@/lib/catalog';

export function ProductCover({ product }: { product: Product }) {
  const baseClass =
    product.cover === 'citrus'
      ? 'gradient-placeholder-citrus'
      : product.cover === 'dark'
      ? 'gradient-placeholder-dark'
      : 'gradient-placeholder';

  return (
    <div
      className={baseClass}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="corner-tag mono">{product.cornerTag}</div>
      {product.image && (
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          style={{ objectFit: 'cover' }}
          priority={product.featured}
        />
      )}
    </div>
  );
}
