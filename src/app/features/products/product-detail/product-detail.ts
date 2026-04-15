import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  OnInit,
  signal,
  viewChild,
  ElementRef,
  resource,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import { CommentsComponent } from '../../../shared/components/comments/comments';
import { RelatedProductsComponent } from '../../../shared/components/related-products/related-products';
import { CartService } from '../../../core/services/cart.service';
import { Product, ProductVariant } from '../../../core/models/product.model';

/**
 * RENDER MODE: RenderMode.Prerender (SSG)
 * All product slugs are pre-rendered at build time via getPrerenderParams() in app.routes.server.ts.
 *
 * CONCEPTS DEMONSTRATED:
 * - linkedSignal() — selected variant synced to product's first in-stock variant
 * - viewChild() — signal-based query for the reviews section DOM element
 * - resource() with reactive request (slug signal)
 * - toSignal() — converts route params Observable → Signal
 * - computed() — derives final price from product + variant modifier
 * - @defer (on interaction; hydrate on interaction) { <app-comments> }
 * - @defer (on viewport; hydrate on viewport) { <app-related-products> }
 * - withEventReplay() — "Add to Cart" click captured before hydration if user acts fast
 */
@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CurrencyPipe, CommentsComponent, RelatedProductsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="detail-container">
      @if (productResource.isLoading()) {
        <div class="loading-skeleton">
          <div class="sk sk-image"></div>
          <div class="sk-info">
            <div class="sk sk-brand"></div>
            <div class="sk sk-title"></div>
            <div class="sk sk-desc"></div>
            <div class="sk sk-price"></div>
          </div>
        </div>
      } @else if (productResource.error()) {
        <div class="error-state">
          <h2>Product not found</h2>
          <p>This product may have been removed or the URL is incorrect.</p>
        </div>
      } @else if (productResource.value(); as product) {
        <div class="product-layout">

          <!-- IMAGE PANEL -->
          <div class="image-panel">
            <img
              [src]="activeImage()"
              [alt]="product.name"
              class="main-image"
              fetchpriority="high"
              width="600"
              height="480"
            />
            @if (product.images.length > 1) {
              <div class="thumbnails">
                @for (img of product.images; track img) {
                  <img
                    [src]="img"
                    [alt]="product.name"
                    class="thumb"
                    [class.active]="activeImage() === img"
                    (click)="activeImage.set(img)"
                    loading="lazy"
                    width="80"
                    height="60"
                  />
                }
              </div>
            }
          </div>

          <!-- INFO PANEL -->
          <div class="info-panel">
            <p class="brand-label">{{ product.brand }}</p>
            <h1 class="product-title">{{ product.name }}</h1>

            <div class="rating-row">
              <span class="stars">★ {{ product.rating }}</span>
              <span class="review-link" (click)="scrollToReviews()">
                {{ product.reviewCount }} reviews
              </span>
            </div>

            <div class="price-row">
              <span class="price">{{ finalPrice() | currency }}</span>
              @if (product.originalPrice) {
                <span class="original-price">{{ product.originalPrice | currency }}</span>
                <span class="discount-badge">Save {{ savings() | currency }}</span>
              }
            </div>

            <p class="description">{{ product.description }}</p>

            <!-- VARIANTS — linkedSignal() demo -->
            @if (product.variants.length > 0) {
              <div class="variants-section">
                <p class="variants-label">
                  {{ product.variants[0].label }}:
                  <strong>{{ selectedVariant()?.value }}</strong>
                </p>
                <div class="variants-grid">
                  @for (variant of product.variants; track variant.id) {
                    <button
                      class="variant-btn"
                      [class.selected]="selectedVariant()?.id === variant.id"
                      [class.out-of-stock]="!variant.inStock"
                      [disabled]="!variant.inStock"
                      (click)="selectVariant(variant)"
                    >
                      {{ variant.value }}
                      @if (!variant.inStock) { <span class="oos-label">sold out</span> }
                      @else if (variant.priceModifier > 0) {
                        <span class="price-mod">+{{ variant.priceModifier | currency:'USD':'symbol':'1.0-0' }}</span>
                      }
                    </button>
                  }
                </div>
              </div>
            }

            <!-- STOCK STATUS -->
            @if (!product.inStock) {
              <p class="stock-status out-of-stock">⚠ Out of Stock</p>
            } @else if (product.stockCount < 15) {
              <p class="stock-status low-stock">⚡ Only {{ product.stockCount }} left in stock</p>
            } @else {
              <p class="stock-status in-stock">✓ In Stock — ready to ship</p>
            }

            <!-- ADD TO CART — withEventReplay() ensures this click is captured
                 even if user clicks before hydration completes.
                 jsaction attribute added automatically by Angular. -->
            <button
              class="btn btn-primary add-to-cart-btn"
              [disabled]="!product.inStock || !selectedVariant()?.inStock"
              (click)="addToCart(product)"
            >
              {{ product.inStock ? 'Add to Cart' : 'Out of Stock' }}
            </button>

            <!-- SPECS TABLE -->
            <details class="specs-details">
              <summary>Technical Specifications</summary>
              <table class="specs-table">
                @for (spec of objectEntries(product.specs); track spec[0]) {
                  <tr>
                    <td class="spec-key">{{ spec[0] }}</td>
                    <td class="spec-val">{{ spec[1] }}</td>
                  </tr>
                }
              </table>
            </details>
          </div>
        </div>

        <!-- DIVIDER -->
        <hr class="section-divider" />

        <!-- COMMENTS — @defer on interaction + hydrate on interaction -->
        <!-- CONCEPT: incremental hydration — this section stays dehydrated until user clicks "Show Reviews" -->
        <div #reviewsSection>
          <button class="show-reviews-btn" (click)="showReviews.set(true)">
            {{ showReviews() ? '' : 'Show Customer Reviews' }}
          </button>

          @defer (on interaction(reviewsSection); hydrate on interaction) {
            <app-comments [productSlug]="product.slug" />
          } @placeholder {
            <div class="reviews-placeholder">
              <p>Click above to load {{ product.reviewCount }} customer reviews.</p>
            </div>
          } @loading {
            <p class="loading-text">Loading reviews…</p>
          }
        </div>

        <!-- RELATED PRODUCTS — @defer on viewport + hydrate on viewport -->
        <!-- CONCEPT: incremental hydration — hydration fires when this section enters viewport -->
        <hr class="section-divider" />

        @defer (on viewport; hydrate on viewport) {
          <app-related-products [productSlug]="product.slug" />
        } @placeholder {
          <div class="related-placeholder">
            <p>Scroll down to see related products…</p>
          </div>
        } @loading {
          <p class="loading-text">Loading related products…</p>
        }
      }
    </div>
  `,
  styles: [`
    .detail-container { max-width: 1100px; margin: 0 auto; padding: 40px 24px; }
    .product-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-bottom: 48px; }
    .image-panel { }
    .main-image { width: 100%; border-radius: 12px; aspect-ratio: 5/4; object-fit: cover; border: 1px solid var(--border); }
    .thumbnails { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .thumb { width: 72px; height: 54px; object-fit: cover; border-radius: 6px; border: 2px solid transparent; cursor: pointer; &.active { border-color: var(--accent); } &:hover { border-color: var(--accent-light); } }
    .info-panel { display: flex; flex-direction: column; gap: 16px; }
    .brand-label { font-size: .75rem; text-transform: uppercase; color: var(--text-secondary); font-weight: 600; letter-spacing: .08em; margin: 0; }
    .product-title { font-size: 1.8rem; font-weight: 800; margin: 0; line-height: 1.2; color: var(--text-primary); }
    .rating-row { display: flex; align-items: center; gap: 10px; }
    .stars { color: var(--yellow); font-weight: 700; }
    .review-link { font-size: .85rem; color: var(--accent); cursor: pointer; text-decoration: underline; }
    .price-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .price { font-size: 2rem; font-weight: 800; color: var(--text-primary); }
    .original-price { font-size: 1.1rem; color: var(--text-secondary); text-decoration: line-through; }
    .discount-badge { background: var(--yellow-bg); color: var(--yellow); font-size: .78rem; font-weight: 700; padding: 3px 8px; border-radius: 12px; }
    .description { font-size: .95rem; color: var(--text-primary); line-height: 1.7; margin: 0; }
    .variants-section { }
    .variants-label { font-size: .88rem; color: var(--text-primary); margin: 0 0 10px; }
    .variants-grid { display: flex; gap: 8px; flex-wrap: wrap; }
    .variant-btn { padding: 8px 14px; border-radius: 8px; border: 2px solid var(--border); background: var(--bg-card); cursor: pointer; font-size: .85rem; font-weight: 600; transition: all .15s; display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--text-primary); &.selected { border-color: var(--accent); background: var(--accent-bg); color: var(--accent-hover); } &.out-of-stock { opacity: .5; cursor: default; text-decoration: line-through; } &:hover:not(:disabled) { border-color: var(--accent-light); } }
    .oos-label { font-size: .65rem; color: var(--red); text-decoration: none; font-weight: 400; }
    .price-mod { font-size: .7rem; color: var(--text-muted); }
    .stock-status { font-size: .88rem; font-weight: 600; margin: 0; padding: 8px 12px; border-radius: 8px; }
    .in-stock { background: var(--green-bg); color: #4ade80; }
    .low-stock { background: var(--yellow-bg); color: var(--yellow); }
    .out-of-stock { background: var(--red-bg); color: #f87171; }
    .btn { padding: 14px 24px; border-radius: 10px; border: none; cursor: pointer; font-size: 1rem; font-weight: 700; transition: background .15s; }
    .btn-primary { background: var(--accent); color: #fff; width: 100%; &:hover:not(:disabled) { background: var(--accent-hover); } &:disabled { background: var(--bg-elevated); color: var(--text-muted); cursor: default; } }
    .add-to-cart-btn { font-size: 1.05rem; }
    .specs-details { margin-top: 8px; }
    .specs-details summary { cursor: pointer; font-weight: 600; color: var(--accent); font-size: .9rem; padding: 8px 0; }
    .specs-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: .85rem; }
    .specs-table tr { border-bottom: 1px solid var(--border); }
    .spec-key { padding: 8px 0; color: var(--text-muted); width: 40%; font-weight: 500; }
    .spec-val { padding: 8px 0; color: var(--text-primary); font-weight: 500; }
    .section-divider { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
    .show-reviews-btn { background: transparent; border: 1px solid var(--accent); color: var(--accent); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: .9rem; margin-bottom: 16px; &:hover { background: var(--accent-bg); } }
    .reviews-placeholder, .related-placeholder { padding: 24px; background: var(--bg-elevated); border-radius: 10px; text-align: center; color: var(--text-secondary); }
    .loading-text { color: var(--text-secondary); text-align: center; padding: 20px; }
    .loading-skeleton { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
    .sk { background: var(--bg-elevated); border-radius: 8px; animation: shimmer 1.5s infinite; }
    .sk-image { height: 420px; border-radius: 12px; }
    .sk-info { display: flex; flex-direction: column; gap: 16px; }
    .sk-brand { height: 12px; width: 30%; }
    .sk-title { height: 32px; width: 80%; }
    .sk-desc { height: 100px; }
    .sk-price { height: 40px; width: 40%; }
    .error-state { text-align: center; padding: 80px 20px; }
    @keyframes shimmer { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
    @media (max-width: 768px) {
      .product-layout { grid-template-columns: 1fr; }
      .loading-skeleton { grid-template-columns: 1fr; }
    }
  `],
})
export class ProductDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private cartService = inject(CartService);

  // CONCEPT: toSignal() — converts route params Observable to Signal
  private params = toSignal(this.route.params, { initialValue: {} as Record<string, string> });
  private slug = computed(() => this.params()['slug'] ?? '');

  // CONCEPT: resource() with reactive slug
  productResource = resource<Product, string>({
    params: () => this.slug(),
    loader: ({ params: slug }) =>
      firstValueFrom(this.http.get<Product>(`/api/products/${slug}`)),
  });

  // CONCEPT: linkedSignal() — derived signal that stays in sync with product data
  // When product loads, selectedVariant is initialized to the first in-stock variant.
  // But the user can override it by clicking a variant button.
  selectedVariant = linkedSignal<ProductVariant | null>(() => {
    const product = this.productResource.value();
    if (!product || product.variants.length === 0) return null;
    return product.variants.find(v => v.inStock) ?? product.variants[0];
  });

  // Active image — separate signal so user can switch thumbnails
  activeImage = linkedSignal<string>(() => {
    return this.productResource.value()?.image ?? '';
  });

  // CONCEPT: viewChild() — signal-based DOM query (replaces @ViewChild decorator)
  reviewsSectionRef = viewChild<ElementRef>('reviewsSection');

  showReviews = signal(false);

  // computed() — derives final price based on selected variant modifier
  finalPrice = computed(() => {
    const product = this.productResource.value();
    if (!product) return 0;
    const modifier = this.selectedVariant()?.priceModifier ?? 0;
    return product.price + modifier;
  });

  savings = computed(() => {
    const product = this.productResource.value();
    if (!product?.originalPrice) return 0;
    return product.originalPrice - product.price;
  });

  ngOnInit(): void {}

  selectVariant(variant: ProductVariant): void {
    // linkedSignal update — user overrides the auto-linked value
    this.selectedVariant.set(variant);
  }

  scrollToReviews(): void {
    // viewChild() — access DOM element via signal
    this.reviewsSectionRef()?.nativeElement.scrollIntoView({ behavior: 'smooth' });
    this.showReviews.set(true);
  }

  addToCart(product: Product): void {
    this.cartService.addItem(product, this.selectedVariant()?.id ?? null);
  }

  objectEntries(obj: Record<string, string>): [string, string][] {
    return Object.entries(obj);
  }
}
