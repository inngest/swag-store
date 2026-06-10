import * as React from 'react';
import Image from 'next/image';
import { catalogCornerTag, type Product } from '@/lib/catalog';

export function ProductCover({ product, index }: { product: Product; index?: number }) {
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
      <div className="corner-tag mono">{index == null ? product.cornerTag : catalogCornerTag(product, index)}</div>
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
