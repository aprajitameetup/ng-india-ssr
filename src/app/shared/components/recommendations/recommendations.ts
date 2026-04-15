import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Product } from '../../../core/models/product.model';

/**
 * CONCEPT: @defer (on idle) + withIncrementalHydration()
 *
 * This component is wrapped in @defer in the parent template:
 *   @defer (on idle; hydrate on idle) { <app-recommendations> }
 *
 * Idle trigger = requestIdleCallback() (or setTimeout fallback).
 * Perfect for non-critical "you might like" content.
 */
@Component({
  selector: 'app-recommendations',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="recs-section">
      <div class="recs-header">
        <h2 class="section-title">Recommended For You</h2>
        <span class="recs-tag">Staff Picks</span>
      </div>

      @if (recsResource.value(); as data) {
        <div class="recs-grid">
          @for (product of data.products; track product.id) {
            <a [routerLink]="['/products', product.slug]" class="rec-card">
              <img [src]="product.image" [alt]="product.name" loading="lazy" width="280" height="180" />
              <div class="rec-body">
                <span class="rec-brand">{{ product.brand }}</span>
                <h4 class="rec-name">{{ product.name }}</h4>
                <p class="rec-desc">{{ product.shortDescription }}</p>
                <div class="rec-footer">
                  <span class="rec-price">{{ product.price | currency }}</span>
                  <span class="rec-rating">★ {{ product.rating }}</span>
                </div>
              </div>
            </a>
          }
        </div>
      } @else {
        <div class="recs-grid">
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton-rec">
              <div class="sk sk-img"></div>
              <div class="sk-body-sk">
                <div class="sk sk-brand"></div>
                <div class="sk sk-name"></div>
                <div class="sk sk-desc"></div>
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .recs-section { padding: 40px 0 20px; }
    .recs-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .section-title { font-size: 1.5rem; font-weight: 800; margin: 0; }
    .recs-tag { background: var(--yellow-bg); color: var(--yellow); font-size: .75rem; font-weight: 700; padding: 4px 10px; border-radius: 20px; }
    .recs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
    .rec-card { display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); text-decoration: none; color: inherit; transition: box-shadow .2s, transform .2s; &:hover { box-shadow: 0 8px 24px rgba(0,0,0,.4); transform: translateY(-2px); } }
    .rec-card img { width: 100%; height: 180px; object-fit: cover; }
    .rec-body { padding: 14px; display: flex; flex-direction: column; gap: 6px; background: var(--bg-card); }
    .rec-brand { font-size: .72rem; text-transform: uppercase; color: var(--text-secondary); font-weight: 600; letter-spacing: .05em; }
    .rec-name { font-size: .95rem; font-weight: 700; margin: 0; line-height: 1.3; color: var(--text-primary); }
    .rec-desc { font-size: .8rem; color: var(--text-muted); margin: 0; line-height: 1.4; }
    .rec-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
    .rec-price { font-weight: 700; color: var(--accent); }
    .rec-rating { font-size: .8rem; color: var(--yellow); font-weight: 600; }
    .skeleton-rec { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
    .sk { background: var(--bg-elevated); animation: shimmer 1.5s infinite; }
    .sk-img { height: 180px; }
    .sk-body-sk { padding: 14px; display: flex; flex-direction: column; gap: 8px; background: var(--bg-card); }
    .sk-brand { height: 10px; width: 40%; border-radius: 4px; }
    .sk-name { height: 14px; width: 80%; border-radius: 4px; }
    .sk-desc { height: 12px; border-radius: 4px; }
    @keyframes shimmer { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
  `],
})
export class RecommendationsComponent {
  private http = inject(HttpClient);

  recsResource = resource<{ products: Product[] }, void>({
    loader: () => firstValueFrom(this.http.get<{ products: Product[] }>('/api/recommendations')),
  });
}
