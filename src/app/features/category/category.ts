import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ProductCardComponent } from '../../shared/components/product-card/product-card';
import { Product } from '../../core/models/product.model';
import { MOCK_CATEGORIES } from '../../core/data/mock-data';

/**
 * RENDER MODE: RenderMode.Server
 * Dynamic page — product lists may change with inventory so we skip prerender.
 */
@Component({
  selector: 'app-category',
  standalone: true,
  imports: [ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      @if (currentCategory()) {
        <div class="category-hero">
          <img
            [src]="currentCategory()!.image"
            [alt]="currentCategory()!.label"
            class="category-hero-img"
            fetchpriority="high"
            width="1280"
            height="200"
          />
          <div class="category-hero-overlay">
            <h1>{{ currentCategory()!.label }}</h1>
            <p>{{ totalCount() }} products</p>
          </div>
        </div>
      }

      @if (productsResource.isLoading()) {
        <div class="products-grid">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="skeleton-card"></div>
          }
        </div>
      } @else if (productsResource.value(); as data) {
        @if (data.products.length === 0) {
          <div class="empty-state">
            <p>No products found in this category.</p>
          </div>
        } @else {
          <div class="products-grid">
            @for (product of data.products; track product.id) {
              <app-product-card [product]="product" />
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; padding: 0 24px 40px; }
    .category-hero { position: relative; height: 200px; overflow: hidden; border-radius: 0 0 16px 16px; margin-bottom: 40px; }
    .category-hero-img { width: 100%; height: 100%; object-fit: cover; }
    .category-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to right, rgba(0,0,0,.7), transparent); display: flex; flex-direction: column; justify-content: center; padding: 0 40px; color: #fff; }
    .category-hero-overlay h1 { font-size: 2rem; font-weight: 800; margin: 0 0 4px; }
    .category-hero-overlay p { margin: 0; color: rgba(255,255,255,.75); }
    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
    .skeleton-card { height: 360px; border-radius: 12px; background: var(--bg-elevated); animation: shimmer 1.5s infinite; }
    @keyframes shimmer { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
  `],
})
export class CategoryComponent {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);

  private params = toSignal(this.route.params, { initialValue: {} as Record<string, string> });
  private categorySlug = computed(() => this.params()['name'] ?? '');

  currentCategory = computed(() =>
    MOCK_CATEGORIES.find(c => c.slug === this.categorySlug()) ?? null
  );

  productsResource = resource<{ products: Product[] }, string>({
    params: () => this.categorySlug(),
    loader: ({ params: cat }) =>
      firstValueFrom(this.http.get<{ products: Product[] }>(`/api/products?category=${cat}`)),
  });

  totalCount = computed(() => this.productsResource.value()?.products.length ?? 0);
}
