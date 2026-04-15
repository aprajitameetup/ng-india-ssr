import { ChangeDetectionStrategy, Component, inject, input, resource } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Product } from '../../../core/models/product.model';

/**
 * CONCEPT: @defer (on viewport) + withIncrementalHydration()
 *
 * This component is wrapped in @defer in the parent template:
 *   @defer (on viewport; hydrate on viewport) { <app-related-products> }
 *
 * SSR: content renders server-side (not placeholder).
 * Client: hydration is deferred until the section scrolls into viewport.
 * resource() re-fetches when productSlug input changes.
 */
@Component({
  selector: 'app-related-products',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="related-section">
      <h3 class="section-title">You Might Also Like</h3>

      @if (relatedResource.isLoading()) {
        <div class="related-grid">
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton-card">
              <div class="sk sk-image"></div>
              <div class="sk sk-name"></div>
              <div class="sk sk-price"></div>
            </div>
          }
        </div>
      } @else if (relatedResource.value(); as data) {
        <div class="related-grid">
          @for (product of data.products; track product.id) {
            <a [routerLink]="['/products', product.slug]" class="related-card">
              <img [src]="product.image" [alt]="product.name" loading="lazy" width="200" height="140" />
              <div class="related-info">
                <p class="related-name">{{ product.name }}</p>
                <p class="related-price">{{ product.price | currency }}</p>
              </div>
            </a>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .related-section { padding: 8px 0; }
    .section-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 20px; color: var(--text-primary); }
    .related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
    .related-card { display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); text-decoration: none; color: inherit; transition: box-shadow .2s; &:hover { box-shadow: 0 4px 16px rgba(0,0,0,.4); } }
    .related-card img { width: 100%; height: 140px; object-fit: cover; }
    .related-info { padding: 10px; background: var(--bg-card); }
    .related-name { font-size: .85rem; font-weight: 600; margin: 0 0 4px; line-height: 1.3; color: var(--text-primary); }
    .related-price { font-size: .9rem; font-weight: 700; color: var(--accent); margin: 0; }
    .skeleton-card { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
    .sk { background: var(--bg-elevated); animation: shimmer 1.5s infinite; }
    .sk-image { height: 140px; }
    .sk-name { height: 14px; margin: 10px; border-radius: 4px; }
    .sk-price { height: 14px; width: 50%; margin: 6px 10px 10px; border-radius: 4px; }
    @keyframes shimmer { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
  `],
})
export class RelatedProductsComponent {
  productSlug = input.required<string>();
  private http = inject(HttpClient);

  relatedResource = resource<{ products: Product[] }, string>({
    params: () => this.productSlug(),
    loader: ({ params: slug }) =>
      firstValueFrom(this.http.get<{ products: Product[] }>(`/api/related/${slug}`)),
  });
}
