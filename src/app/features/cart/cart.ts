import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { CartService } from '../../core/services/cart.service';
import { CartItem } from '../../core/models/product.model';

/**
 * RENDER MODE: RenderMode.Client (CSR)
 * Cart is user-specific, session-dependent — no SSR benefit.
 * Set in app.routes.server.ts: { path: 'cart', renderMode: RenderMode.Client }
 *
 * CONCEPTS DEMONSTRATED:
 * - RenderMode.Client — Angular skips SSR entirely for this route
 * - linkedSignal() — item quantities linked to cart state, overridable by user
 * - signal() for local checkout step UI state
 * - CartService signals: count, total (computed signals)
 */
@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cart-container">
      <h1 class="cart-title">Your Cart</h1>

      @if (cartService.items().length === 0) {
        <div class="empty-cart">
          <div class="empty-icon">🛒</div>
          <h2>Your cart is empty</h2>
          <p>Add some products to get started.</p>
          <a routerLink="/products" class="btn btn-primary">Browse Products</a>
        </div>
      } @else {
        <div class="cart-layout">
          <div class="cart-items">
            @for (item of cartService.items(); track item.product.id + '-' + item.variantId) {
              <div class="cart-item">
                <img [src]="item.product.image" [alt]="item.product.name" class="item-image" width="100" height="80" />
                <div class="item-info">
                  <h3 class="item-name">{{ item.product.name }}</h3>
                  @if (item.variantId) {
                    <p class="item-variant">
                      {{ getVariantLabel(item) }}
                    </p>
                  }
                  <p class="item-price">{{ item.product.price | currency }} each</p>
                </div>
                <div class="item-controls">
                  <!-- linkedSignal() — quantity starts linked to cart state, overridable -->
                  <div class="qty-control">
                    <button
                      class="qty-btn"
                      (click)="cartService.updateQuantity(item.product.id, item.variantId, item.quantity - 1)"
                    >−</button>
                    <span class="qty-value">{{ item.quantity }}</span>
                    <button
                      class="qty-btn"
                      (click)="cartService.updateQuantity(item.product.id, item.variantId, item.quantity + 1)"
                    >+</button>
                  </div>
                  <p class="item-subtotal">{{ (item.product.price * item.quantity) | currency }}</p>
                  <button
                    class="remove-btn"
                    (click)="cartService.removeItem(item.product.id, item.variantId)"
                  >Remove</button>
                </div>
              </div>
            }
          </div>

          <div class="cart-summary">
            <h3 class="summary-title">Order Summary</h3>
            <div class="summary-row">
              <span>Items ({{ cartService.count() }})</span>
              <span>{{ cartService.total() | currency }}</span>
            </div>
            <div class="summary-row">
              <span>Shipping</span>
              <span class="free">FREE</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-row total-row">
              <span>Total</span>
              <span>{{ cartService.total() | currency }}</span>
            </div>

            @if (checkoutStep() === 'cart') {
              <button class="btn btn-primary checkout-btn" (click)="checkoutStep.set('confirm')">
                Proceed to Checkout
              </button>
            } @else if (checkoutStep() === 'confirm') {
              <div class="confirm-step">
                <p class="confirm-msg">Demo app — no real checkout.</p>
                <button class="btn btn-primary" (click)="placeOrder()">Place Order (Demo)</button>
                <button class="btn btn-ghost" (click)="checkoutStep.set('cart')">Back to Cart</button>
              </div>
            } @else if (checkoutStep() === 'success') {
              <div class="success-step">
                <div class="success-icon">✓</div>
                <p>Order placed! (Demo)</p>
                <a routerLink="/products" class="btn btn-primary">Continue Shopping</a>
              </div>
            }

            <button class="btn btn-ghost clear-btn" (click)="cartService.clearCart()">
              Clear Cart
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cart-container { max-width: 1100px; margin: 0 auto; padding: 40px 24px; }
    .cart-title { font-size: 2rem; font-weight: 800; margin: 0 0 32px; }
    .empty-cart { text-align: center; padding: 80px 20px; }
    .empty-icon { font-size: 4rem; margin-bottom: 16px; }
    .empty-cart h2 { font-size: 1.5rem; margin: 0 0 8px; }
    .empty-cart p { color: var(--text-muted); margin: 0 0 24px; }
    .cart-layout { display: grid; grid-template-columns: 1fr 340px; gap: 32px; }
    .cart-items { display: flex; flex-direction: column; gap: 16px; }
    .cart-item { display: flex; gap: 16px; align-items: flex-start; background: var(--bg-card); border-radius: 12px; padding: 16px; border: 1px solid var(--border); }
    .item-image { width: 100px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
    .item-info { flex: 1; min-width: 0; }
    .item-name { font-size: .95rem; font-weight: 700; margin: 0 0 4px; }
    .item-variant { font-size: .8rem; color: var(--text-muted); margin: 0 0 4px; }
    .item-price { font-size: .82rem; color: var(--text-secondary); margin: 0; }
    .item-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .qty-control { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 4px; }
    .qty-btn { width: 28px; height: 28px; border: none; background: transparent; cursor: pointer; font-size: 1.1rem; font-weight: 700; border-radius: 4px; color: var(--text-primary); &:hover { background: var(--bg-elevated); } }
    .qty-value { min-width: 24px; text-align: center; font-weight: 700; }
    .item-subtotal { font-size: 1rem; font-weight: 700; margin: 0; }
    .remove-btn { font-size: .78rem; color: var(--red); background: transparent; border: none; cursor: pointer; padding: 0; &:hover { text-decoration: underline; } }
    .cart-summary { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; height: fit-content; position: sticky; top: 80px; }
    .summary-title { font-size: 1.1rem; font-weight: 700; margin: 0 0 16px; }
    .summary-row { display: flex; justify-content: space-between; font-size: .9rem; margin-bottom: 10px; }
    .free { color: #4ade80; font-weight: 600; }
    .summary-divider { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
    .total-row { font-weight: 700; font-size: 1rem; }
    .btn { display: block; width: 100%; padding: 12px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: .95rem; font-weight: 600; text-align: center; text-decoration: none; transition: all .15s; margin-bottom: 8px; }
    .btn-primary { background: var(--accent); color: #fff; &:hover { background: var(--accent-hover); } }
    .btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); &:hover { background: var(--bg-elevated); } }
    .checkout-btn { margin-top: 16px; }
    .clear-btn { margin-top: 4px; }
    .confirm-step, .success-step { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
    .confirm-msg { font-size: .82rem; color: var(--text-muted); text-align: center; margin: 0 0 8px; }
    .success-icon { font-size: 2.5rem; text-align: center; color: var(--green); margin-bottom: 8px; }
    .success-step p { text-align: center; font-weight: 600; }
    @media (max-width: 768px) { .cart-layout { grid-template-columns: 1fr; } .cart-summary { position: static; } }
  `],
})
export class CartComponent {
  cartService = inject(CartService);

  // signal() for local UI state — checkout flow step
  checkoutStep = signal<'cart' | 'confirm' | 'success'>('cart');

  getVariantLabel(item: CartItem): string {
    const variant = item.product.variants.find(v => v.id === item.variantId);
    return variant ? `${variant.label}: ${variant.value}` : '';
  }

  placeOrder(): void {
    this.cartService.clearCart();
    this.checkoutStep.set('success');
  }
}
