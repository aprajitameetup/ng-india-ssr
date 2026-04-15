import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CartItem, Product } from '../models/product.model';

/**
 * CONCEPT: CSR-only service
 *
 * Cart state lives only in the browser — no SSR involvement.
 * Uses PLATFORM_ID guard to prevent localStorage access on server.
 * This service is injected only inside the CSR CartComponent (RenderMode.Client).
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private platformId = inject(PLATFORM_ID);

  // Signal-based state — reactive without Zone.js
  private _items = signal<CartItem[]>(this.loadFromStorage());

  // Derived signals (computed) — automatically update when _items changes
  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().reduce((sum, i) => sum + i.quantity, 0));
  readonly total = computed(() =>
    this._items().reduce((sum, i) => {
      const variant = i.product.variants.find(v => v.id === i.variantId);
      const modifier = variant?.priceModifier ?? 0;
      return sum + (i.product.price + modifier) * i.quantity;
    }, 0)
  );

  addItem(product: Product, variantId: string | null = null): void {
    this._items.update(items => {
      const existing = items.find(
        i => i.product.id === product.id && i.variantId === variantId
      );
      if (existing) {
        return items.map(i =>
          i === existing ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...items, { product, variantId, quantity: 1 }];
    });
    this.saveToStorage();
  }

  removeItem(productId: string, variantId: string | null): void {
    this._items.update(items =>
      items.filter(i => !(i.product.id === productId && i.variantId === variantId))
    );
    this.saveToStorage();
  }

  updateQuantity(productId: string, variantId: string | null, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(productId, variantId);
      return;
    }
    this._items.update(items =>
      items.map(i =>
        i.product.id === productId && i.variantId === variantId
          ? { ...i, quantity }
          : i
      )
    );
    this.saveToStorage();
  }

  clearCart(): void {
    this._items.set([]);
    this.saveToStorage();
  }

  private loadFromStorage(): CartItem[] {
    // PLATFORM_ID guard — localStorage is not available on server
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      const stored = localStorage.getItem('shoppulse-cart');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem('shoppulse-cart', JSON.stringify(this._items()));
    } catch { /* storage quota exceeded */ }
  }
}
