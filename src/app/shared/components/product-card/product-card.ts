import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Product } from '../../../core/models/product.model';
import { CartService } from '../../../core/services/cart.service';

/**
 * CONCEPTS DEMONSTRATED:
 * - input() — signal-based input (replaces @Input decorator, Angular 17.1+)
 * - output() — signal-based output (replaces @Output/@EventEmitter)
 * - ChangeDetectionStrategy.OnPush — component only re-renders when input references change
 *   or when a signal it reads is marked dirty. No Zone.js tick needed.
 * - withEventReplay() — "Add to Cart" clicks captured before hydration, replayed after.
 *   The jsaction attribute is added automatically by Angular when withEventReplay() is active.
 */
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CurrencyPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="product-card" [class.out-of-stock]="!product().inStock">
      <a [routerLink]="['/products', product().slug]" class="card-image-link">
        <img
          [src]="product().image"
          [alt]="product().name"
          class="card-image"
          loading="lazy"
          width="300"
          height="220"
        />
        @if (!product().inStock) {
          <span class="badge out-of-stock-badge">Out of Stock</span>
        } @else if (product().originalPrice) {
          <span class="badge sale-badge">
            -{{ discount() }}%
          </span>
        }
        @if (stockStatus()) {
          <span class="stock-live" [class]="'stock-' + stockStatus()!.status">
            {{ stockStatus()!.count }} left
          </span>
        }
      </a>

      <div class="card-body">
        <p class="brand">{{ product().brand }}</p>
        <h3 class="name">
          <a [routerLink]="['/products', product().slug]">{{ product().name }}</a>
        </h3>
        <p class="short-desc">{{ product().shortDescription }}</p>

        <div class="rating">
          <span class="stars">{{ stars() }}</span>
          <span class="review-count">({{ product().reviewCount }})</span>
        </div>

        <div class="price-row">
          <span class="price">{{ product().price | currency }}</span>
          @if (product().originalPrice) {
            <span class="original-price">{{ product().originalPrice | currency }}</span>
          }
        </div>

        <button
          class="btn btn-primary add-to-cart"
          [disabled]="!product().inStock"
          (click)="onAddToCart()"
        >
          {{ product().inStock ? 'Add to Cart' : 'Unavailable' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .product-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,.3);
      transition: box-shadow .2s, transform .2s, border-color .2s;
      display: flex;
      flex-direction: column;
      &:hover { box-shadow: 0 8px 28px rgba(0,0,0,.5); transform: translateY(-2px); border-color: var(--accent-border); }
      &.out-of-stock { opacity: .6; }
    }
    .card-image-link { position: relative; display: block; }
    .card-image { width: 100%; height: 220px; object-fit: cover; display: block; opacity: .9; }
    .badge { position: absolute; top: 10px; left: 10px; padding: 4px 10px; border-radius: 20px; font-size: .75rem; font-weight: 700; }
    .sale-badge { background: var(--red); color: #fff; }
    .out-of-stock-badge { background: #374151; color: #9ca3af; }
    .stock-live { position: absolute; bottom: 8px; right: 8px; font-size: .7rem; padding: 3px 8px; border-radius: 10px; font-weight: 600; }
    .stock-in_stock { background: var(--green-bg); color: #4ade80; border: 1px solid rgba(34,197,94,.3); }
    .stock-low_stock { background: var(--yellow-bg); color: #fcd34d; border: 1px solid rgba(245,158,11,.3); }
    .stock-out_of_stock { background: var(--red-bg); color: #f87171; border: 1px solid rgba(239,68,68,.3); }
    .card-body { padding: 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .brand { font-size: .75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin: 0; }
    .name { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-primary); a { color: inherit; text-decoration: none; &:hover { color: var(--accent-light); } } }
    .short-desc { font-size: .82rem; color: var(--text-muted); margin: 0; line-height: 1.4; }
    .rating { display: flex; align-items: center; gap: 6px; }
    .stars { color: var(--yellow); font-size: .9rem; }
    .review-count { font-size: .78rem; color: var(--text-muted); }
    .price-row { display: flex; align-items: baseline; gap: 8px; margin-top: auto; }
    .price { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
    .original-price { font-size: .85rem; color: var(--text-muted); text-decoration: line-through; }
    .btn { padding: 10px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: .9rem; font-weight: 600; transition: background .15s; }
    .btn-primary { background: var(--accent); color: #fff; &:hover:not(:disabled) { background: var(--accent-hover); } &:disabled { background: var(--bg-elevated); color: var(--text-muted); cursor: default; } }
    .add-to-cart { width: 100%; margin-top: 8px; }
  `],
})
export class ProductCardComponent {
  // input() — signal-based, replaces @Input()
  product = input.required<Product>();
  stockStatus = input<{ status: string; count: number } | null>(null);

  // output() — signal-based, replaces @Output() EventEmitter
  addToCart = output<Product>();

  private cartService = inject(CartService);

  discount() {
    const p = this.product();
    if (!p.originalPrice) return 0;
    return Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
  }

  stars() {
    const r = this.product().rating;
    return '★'.repeat(Math.floor(r)) + (r % 1 >= 0.5 ? '½' : '') + '☆'.repeat(5 - Math.ceil(r));
  }

  onAddToCart(): void {
    this.cartService.addItem(this.product());
    // output() emits for parent to react (e.g., show toast)
    this.addToCart.emit(this.product());
  }
}
