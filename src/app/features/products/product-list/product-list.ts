import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { resource } from '@angular/core';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card';
import { Product } from '../../../core/models/product.model';
import { MOCK_CATEGORIES } from '../../../core/data/mock-data';

/**
 * RENDER MODE: RenderMode.Server (set in app.routes.server.ts)
 *
 * CONCEPTS DEMONSTRATED:
 * - toSignal() — converts ActivatedRoute queryParams Observable → Signal
 * - resource() with a reactive request — re-fetches when filter signal changes
 * - computed() — derives filtered/sorted list from resource value
 * - OnPush — only re-renders when signals are dirty
 */
@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1 class="page-title">All Products</h1>
        <p class="page-sub">{{ totalCount() }} products</p>
      </div>

      <!-- FILTERS -->
      <div class="filters-bar">
        <button
          class="filter-btn"
          [class.active]="selectedCategory() === null"
          (click)="setCategory(null)"
        >All</button>
        @for (cat of categories; track cat.slug) {
          <button
            class="filter-btn"
            [class.active]="selectedCategory() === cat.slug"
            (click)="setCategory(cat.slug)"
          >{{ cat.label }}</button>
        }

        <div class="sort-wrapper">
          <select (change)="setSortOrder($event)" class="sort-select">
            <option value="default">Sort: Default</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="rating">Top Rated</option>
          </select>
        </div>
      </div>

      <!-- PRODUCT GRID -->
      @if (productsResource.isLoading()) {
        <div class="products-grid">
          @for (i of [1,2,3,4,5,6,7,8]; track i) {
            <div class="skeleton-card"></div>
          }
        </div>
      } @else if (productsResource.error()) {
        <div class="error-state">
          <p>Failed to load products. Please refresh.</p>
        </div>
      } @else if (sortedProducts().length === 0) {
        <div class="empty-state">
          <p>No products found in this category.</p>
          <button (click)="setCategory(null)" class="btn btn-primary">Clear Filter</button>
        </div>
      } @else {
        <div class="products-grid">
          @for (product of sortedProducts(); track product.id) {
            <app-product-card [product]="product" (addToCart)="onAddToCart($event)" />
          }
        </div>
      }

      <!-- CART TOAST -->
      @if (toast()) {
        <div class="toast">✓ {{ toast() }} added to cart</div>
      }
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; padding: 40px 24px; }
    .page-header { margin-bottom: 24px; }
    .page-title { font-size: 2rem; font-weight: 800; margin: 0 0 4px; color: var(--text-primary); }
    .page-sub { color: var(--text-muted); margin: 0; }
    .filters-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 32px; }
    .filter-btn { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border); background: var(--bg-elevated); cursor: pointer; font-size: .85rem; font-weight: 500; color: var(--text-secondary); transition: all .15s; &:hover { border-color: var(--accent); color: var(--accent-light); } &.active { background: var(--accent); color: #fff; border-color: var(--accent); } }
    .sort-wrapper { margin-left: auto; }
    .sort-select { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); font-size: .85rem; color: var(--text-primary); background: var(--bg-elevated); cursor: pointer; }
    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
    .skeleton-card { height: 360px; border-radius: 12px; background: var(--bg-elevated); animation: shimmer 1.5s infinite; }
    @keyframes shimmer { 0%,100% { opacity: .4; } 50% { opacity: .7; } }
    .error-state, .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: .9rem; font-weight: 600; }
    .btn-primary { background: var(--accent); color: #fff; &:hover { background: var(--accent-hover); } }
    .toast { position: fixed; bottom: 24px; right: 24px; background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border); padding: 12px 20px; border-radius: 10px; z-index: 1000; font-size: .9rem; animation: slideIn .3s ease; }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `],
})
export class ProductListComponent {
  private http = inject(HttpClient);
  categories = MOCK_CATEGORIES;

  // CONCEPT: toSignal() — converts Observable to Signal
  // queryParams$ is an Observable; toSignal() subscribes and exposes current value
  // as a signal, compatible with Angular's signal-based change detection.
  private route = inject(ActivatedRoute);
  private queryParams = toSignal(this.route.queryParams, { initialValue: {} });

  // Local reactive state
  selectedCategory = signal<string | null>(null);
  sortOrder = signal<string>('default');
  toast = signal<string | null>(null);

  /**
   * resource() with reactive request
   * The request function returns selectedCategory() — a signal.
   * When selectedCategory changes, resource() automatically re-runs the loader.
   */
  productsResource = resource<{ products: Product[] }, string | null>({
    params: () => this.selectedCategory(),
    loader: ({ params: category }) => {
      const url = category ? `/api/products?category=${category}` : '/api/products';
      return firstValueFrom(this.http.get<{ products: Product[] }>(url));
    },
  });

  // computed() — derived signal: sort the products list reactively
  sortedProducts = computed(() => {
    const data = this.productsResource.value();
    if (!data) return [];
    const products = [...data.products];
    switch (this.sortOrder()) {
      case 'price-asc': return products.sort((a, b) => a.price - b.price);
      case 'price-desc': return products.sort((a, b) => b.price - a.price);
      case 'rating': return products.sort((a, b) => b.rating - a.rating);
      default: return products;
    }
  });

  totalCount = computed(() => this.sortedProducts().length);

  setCategory(cat: string | null): void {
    this.selectedCategory.set(cat);
  }

  setSortOrder(event: Event): void {
    this.sortOrder.set((event.target as HTMLSelectElement).value);
  }

  onAddToCart(product: Product): void {
    this.toast.set(product.name);
    setTimeout(() => this.toast.set(null), 2500);
  }
}
