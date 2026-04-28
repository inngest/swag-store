'use client';

import * as React from 'react';
import { useState } from 'react';
import { Product, ProductSize, formatPrice } from '@/lib/catalog';
import { useCart } from '@/lib/cart-context';

export function AddToCartButton({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [size, setSize] = useState<ProductSize | undefined>(product.sizes?.[2] ?? product.sizes?.[0]);
  const [color, setColor] = useState(product.colors?.[0]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    const variant = product.variants.find(
      (v) => (!size || v.size === size) && (!color || v.color === color.name),
    ) ?? product.variants[0];
    if (!variant) return;
    addItem({
      productId: product.id,
      variantId: variant.id,
      quantity: qty,
      size,
      color: color?.name,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 700);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {product.colors && product.colors.length > 1 && (
        <div>
          <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>
            COLOR · <span style={{ color: 'var(--ink)' }}>{color?.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {product.colors.map((c) => (
              <button
                key={c.name}
                onClick={() => setColor(c)}
                style={{
                  width: 40,
                  height: 40,
                  padding: 4,
                  border: color?.name === c.name ? '1px solid var(--ink)' : '1px solid var(--rule-soft)',
                  background: 'var(--paper)',
                }}
              >
                <span style={{ display: 'block', width: '100%', height: '100%', background: c.hex, border: '1px solid var(--rule-soft)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {product.sizes && product.sizes.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span>SIZE · <span style={{ color: 'var(--ink)' }}>{size}</span></span>
            {product.sizes.length > 1 && (
              <span style={{ color: 'var(--ink)', cursor: 'pointer', textDecoration: 'underline' }}>SIZE GUIDE</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {product.sizes.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`chip mono ${size === s ? 'active' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--ink)', padding: '0 12px', gap: 14 }}>
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="mono" style={{ fontSize: 18, width: 24 }}>−</button>
          <span className="mono tabnum" style={{ fontSize: 14, minWidth: 16, textAlign: 'center' }}>{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} className="mono" style={{ fontSize: 18, width: 24 }}>+</button>
        </div>
        <button onClick={handleAdd} className="btn btn-citrus square" style={{ flex: 1 }}>
          {added ? 'ADDED ✓' : `ADD TO CART — ${formatPrice(product.price * qty)}`}
        </button>
      </div>
    </div>
  );
}
