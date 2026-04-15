import {
  ChangeDetectionStrategy,
  Component,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCardComponent } from '../../shared/components/product-card/product-card';
import { StockTickerComponent } from '../../shared/components/stock-ticker/stock-ticker';
import { RecommendationsComponent } from '../../shared/components/recommendations/recommendations';
import { WebVitalsComponent } from '../../shared/components/web-vitals/web-vitals';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Product, Category } from '../../core/models/product.model';
import { MOCK_CATEGORIES } from '../../core/data/mock-data';

/**
 * RENDER MODE: RenderMode.Server (set in app.routes.server.ts)
 *
 * CONCEPTS DEMONSTRATED HERE:
 * - resource() for featured products
 * - @defer (on idle) { <app-recommendations> } — non-critical content loads last
 * - withIncrementalHydration(): hydrate on idle for recommendations
 * - StockTickerComponent: live httpResource() polling
 * - WebVitalsComponent: CWV measurement panel
 * - signal() for local UI state (toast notification)
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ProductCardComponent, StockTickerComponent, WebVitalsComponent, RecommendationsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- CONCEPT: LCP target — hero image should be largest above-fold element -->
    <section class="hero">
      <div class="hero-content">
        <h1 class="hero-title">Tech Worth Every Penny</h1>
        <p class="hero-sub">Premium electronics. Fast delivery. SSR-powered speed.</p>
        <a routerLink="/products" class="hero-cta">Shop All Products</a>
      </div>
      <!-- fetchpriority="high" on the hero image is critical for LCP -->
      <img
        src="https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1200&q=80"
        alt="ShopPulse hero — the latest tech"
        class="hero-image"
        fetchpriority="high"
        width="1200"
        height="400"
      />
    </section>

    <!-- Add-to-cart toast: captured by withEventReplay() before hydration completes -->
    @if (toastProduct()) {
      <div class="toast" role="alert">
        ✓ {{ toastProduct()!.name }} added to cart
      </div>
    }

    <div class="page-container">
      <div class="main-content">

        <!-- CATEGORIES -->
        <section class="section">
          <h2 class="section-heading">Shop by Category</h2>
          <div class="categories-grid">
            @for (cat of categories; track cat.slug) {
              <a [routerLink]="['/category', cat.slug]" class="category-card">
                <img [src]="cat.image" [alt]="cat.label" loading="lazy" width="200" height="120" />
                <span>{{ cat.label }}</span>
              </a>
            }
          </div>
        </section>

        <!-- FEATURED PRODUCTS — resource() -->
        <section class="section">
          <h2 class="section-heading">Featured Products</h2>

          @if (featuredResource.isLoading()) {
            <div class="products-grid">
              @for (i of [1,2,3,4]; track i) {
                <div class="skeleton-card"></div>
              }
            </div>
          } @else if (featuredResource.value(); as data) {
            <div class="products-grid">
              @for (product of data.products; track product.id) {
                <app-product-card
                  [product]="product"
                  (addToCart)="showToast($event)"
                />
              }
            </div>
          }
        </section>

        <!-- RECOMMENDATIONS — @defer on idle + hydrate on idle -->
        <!-- CONCEPT: Non-critical content deferred until browser is idle -->
        <!-- withIncrementalHydration(): ngh marker set, hydrates on idle -->
        @defer (on idle; hydrate on idle) {
          <app-recommendations />
        } @placeholder {
          <div class="recs-placeholder">
            <div class="sk sk-heading"></div>
            <div class="sk-grid">
              @for (i of [1,2,3,4]; track i) { <div class="sk sk-card"></div> }
            </div>
          </div>
        } @loading {
          <div class="recs-loading">Loading recommendations…</div>
        }

      </div>

      <!-- SIDEBAR -->
      <aside class="sidebar">
        <!-- LIVE STOCK TICKER — httpResource() polling every 8s -->
        <div class="sidebar-widget">
          <app-stock-ticker />
        </div>

        <!-- WEB VITALS PANEL — CWV measurement, browser-only -->
        <div class="sidebar-widget">
          <app-web-vitals />
        </div>
      </aside>
    </div>
  `,
  styles: [`
    .hero { position: relative; height: 320px; overflow: hidden; background: #0f172a; display: flex; align-items: center; margin-bottom: 0; }
    .hero-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .35; }
    .hero-content { position: relative; z-index: 1; padding: 0 48px; max-width: 600px; }
    .hero-title { font-size: 2.5rem; font-weight: 900; color: #fff; margin: 0 0 12px; line-height: 1.1; }
    .hero-sub { color: #94a3b8; font-size: 1.1rem; margin: 0 0 24px; }
    .hero-cta { display: inline-block; background: #6366f1; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 1rem; transition: background .15s; &:hover { background: #4f46e5; } }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #111; color: #fff; padding: 12px 20px; border-radius: 10px; z-index: 1000; font-size: .9rem; font-weight: 500; animation: slideIn .3s ease; }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .page-container { max-width: 1280px; margin: 0 auto; padding: 40px 24px; display: grid; grid-template-columns: 1fr 320px; gap: 40px; }
    .main-content { min-width: 0; }
    .sidebar { display: flex; flex-direction: column; gap: 20px; }
    .sidebar-widget { position: sticky; top: 80px; }
    .section { margin-bottom: 48px; }
    .section-heading { font-size: 1.5rem; font-weight: 800; margin: 0 0 24px; color: var(--text-primary); }
    .categories-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .category-card { display: flex; flex-direction: column; align-items: center; gap: 8px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); text-decoration: none; color: var(--text-secondary); font-size: .85rem; font-weight: 600; transition: box-shadow .2s, border-color .2s; padding-bottom: 12px; background: var(--bg-card); &:hover { box-shadow: 0 4px 16px rgba(0,0,0,.4); border-color: var(--accent-border); color: var(--text-primary); } }
    .category-card img { width: 100%; height: 100px; object-fit: cover; opacity: .85; }
    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
    .skeleton-card { height: 340px; border-radius: 12px; background: var(--bg-elevated); animation: shimmer 1.5s infinite; }
    .recs-placeholder { }
    .sk { background: var(--bg-elevated); border-radius: 8px; animation: shimmer 1.5s infinite; }
    .sk-heading { height: 28px; width: 200px; margin-bottom: 20px; }
    .sk-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .sk-card { height: 280px; }
    .recs-loading { padding: 20px; color: var(--text-muted); text-align: center; }
    @keyframes shimmer { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
  `],
})
export class HomeComponent {
  private http = inject(HttpClient);
  categories = MOCK_CATEGORIES;
  toastProduct = signal<Product | null>(null);

  /**
   * resource() — Angular's reactive async primitive.
   * On server: fetches during SSR render, data included in HTML.
   * On client: TransferState ensures no duplicate fetch.
   */
  featuredResource = resource<{ products: Product[] }, void>({
    loader: () => firstValueFrom(this.http.get<{ products: Product[] }>('/api/products?featured=true')),
  });

  showToast(product: Product): void {
    this.toastProduct.set(product);
    setTimeout(() => this.toastProduct.set(null), 3000);
  }
}
