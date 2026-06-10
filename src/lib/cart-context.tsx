'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { CartItem } from './catalog';

const CART_STORAGE_KEY = 'swag-store-cart';

function loadStoredItems(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        i != null &&
        typeof i === 'object' &&
        typeof i.productId === 'string' &&
        typeof i.variantId === 'string' &&
        typeof i.quantity === 'number' &&
        i.quantity > 0
    );
  } catch {
    return [];
  }
}

// ─── Cart State ─────────────────────────────────────────────────────────────

type CartState = {
  items: CartItem[];
  isOpen: boolean;
};

type CartAction =
  | { type: 'HYDRATE'; items: CartItem[] }
  | { type: 'ADD_ITEM'; item: CartItem }
  | { type: 'REMOVE_ITEM'; variantId: string }
  | { type: 'UPDATE_QUANTITY'; variantId: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' };

type CartContextValue = {
  state: CartState;
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  itemCount: number;
  subtotal: number;
};

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, items: action.items };
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.variantId === action.item.variantId);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.variantId === action.item.variantId
              ? { ...i, quantity: i.quantity + action.item.quantity }
              : i
          ),
          isOpen: true,
        };
      }
      return {
        ...state,
        items: [...state.items, action.item],
        isOpen: true,
      };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) => i.variantId !== action.variantId),
      };
    case 'UPDATE_QUANTITY':
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.variantId !== action.variantId),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.variantId === action.variantId ? { ...i, quantity: action.quantity } : i
        ),
      };
    case 'CLEAR_CART':
      return { ...state, items: [] };
    case 'OPEN_CART':
      return { ...state, isOpen: true };
    case 'CLOSE_CART':
      return { ...state, isOpen: false };
    default:
      return state;
  }
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false });
  const hydrated = useRef(false);

  // Hydrate items from localStorage on mount (client only; isOpen stays ephemeral)
  useEffect(() => {
    dispatch({ type: 'HYDRATE', items: loadStoredItems() });
  }, []);

  // Persist items on every cart mutation (skip the initial pre-hydration render)
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // Storage unavailable (private mode, quota) — cart stays in-memory
    }
  }, [state.items]);

  const addItem = useCallback((item: CartItem) => dispatch({ type: 'ADD_ITEM', item }), []);
  const removeItem = useCallback((variantId: string) => dispatch({ type: 'REMOVE_ITEM', variantId }), []);
  const updateQuantity = useCallback((variantId: string, quantity: number) =>
    dispatch({ type: 'UPDATE_QUANTITY', variantId, quantity }), []);
  const clearCart = useCallback(() => dispatch({ type: 'CLEAR_CART' }), []);
  const openCart = useCallback(() => dispatch({ type: 'OPEN_CART' }), []);
  const closeCart = useCallback(() => dispatch({ type: 'CLOSE_CART' }), []);

  // In a real app, pull prices from catalog here
  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = 0; // Resolved at checkout from catalog

  return (
    <CartContext.Provider
      value={{ state, addItem, removeItem, updateQuantity, clearCart, openCart, closeCart, itemCount, subtotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
