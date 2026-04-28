'use client';

import { useState } from 'react';
import { Product, ProductSize, ProductColor } from '@/lib/catalog';
import { useCart } from '@/lib/cart-context';

export function AddToCartButton({ product }: { product: Product }) {
  const { addItem, openCart } = useCart();
  const [selectedSize, setSelectedSize] = useState<ProductSize | undefined>(
    product.sizes?.[2] // default to M if available
  );
  const [selectedColor, setSelectedColor] = useState<string | undefined>(
    product.colors?.[0]?.name
  );
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    const variant = product.variants.find(
      (v) =>
        (!selectedSize || v.size === selectedSize) &&
        (!selectedColor || v.color === selectedColor)
    ) ?? product.variants[0];

    if (!variant) return;

    addItem({
      productId: product.id,
      variantId: variant.id,
      quantity: 1,
      size: selectedSize,
      color: selectedColor,
    });

    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div>
      {/* Color selection */}
      {product.colors && product.colors.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(239, 233, 214, 0.5)',
              marginBottom: '12px',
            }}
          >
            Color — <span style={{ color: '#EFE9D6' }}>
              {product.colors.find((c) => c.name === selectedColor)?.label ?? ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {product.colors.map((color) => (
              <button
                key={color.name}
                onClick={() => setSelectedColor(color.name)}
                title={color.label}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: color.hex,
                  border: `2px solid ${selectedColor === color.name ? '#FF7300' : 'transparent'}`,
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: selectedColor === color.name ? '0 0 0 1px rgba(255,115,0,0.5)' : 'none',
                  transition: 'border-color 0.15s ease',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Size selection */}
      {product.sizes && product.sizes.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(239, 233, 214, 0.5)',
              marginBottom: '12px',
            }}
          >
            Size
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {product.sizes.map((size) => {
              const hasStock = product.variants.some(
                (v) => v.size === size && (!selectedColor || v.color === selectedColor) && v.stock > 0
              );
              return (
                <button
                  key={size}
                  onClick={() => hasStock && setSelectedSize(size)}
                  disabled={!hasStock}
                  style={{
                    minWidth: '44px',
                    height: '44px',
                    padding: '0 12px',
                    border: `1px solid ${
                      selectedSize === size ? '#FF7300' : 'rgba(239, 233, 214, 0.2)'
                    }`,
                    backgroundColor: selectedSize === size ? 'rgba(255, 115, 0, 0.1)' : 'transparent',
                    color: !hasStock
                      ? 'rgba(239, 233, 214, 0.2)'
                      : selectedSize === size
                      ? '#FF7300'
                      : '#EFE9D6',
                    fontFamily: 'var(--font-space-mono, monospace)',
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    cursor: hasStock ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s ease',
                    textDecoration: !hasStock ? 'line-through' : 'none',
                  }}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleAdd}
        style={{
          width: '100%',
          backgroundColor: added ? '#59A569' : '#FF7300',
          color: '#1A161C',
          border: 'none',
          padding: '16px 32px',
          fontFamily: 'var(--font-space-mono, monospace)',
          fontSize: '13px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
          marginBottom: '12px',
        }}
      >
        {added ? '✓ Added to Cart' : 'Add to Cart'}
      </button>

      {/* Stock note */}
      <div
        style={{
          fontFamily: 'var(--font-space-mono, monospace)',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(239, 233, 214, 0.35)',
          textAlign: 'center',
        }}
      >
        Free shipping on orders over $75
      </div>
    </div>
  );
}
