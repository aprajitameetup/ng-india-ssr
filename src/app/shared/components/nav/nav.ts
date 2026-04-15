import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CartService } from '../../../core/services/cart.service';
import { MOCK_CATEGORIES } from '../../../core/data/mock-data';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="container">
        <a routerLink="/" class="logo">
          <span class="logo-icon">⚡</span>
          <span class="logo-text">ShopPulse</span>
        </a>

        <nav class="nav-links">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
          <a routerLink="/products" routerLinkActive="active">Products</a>
          @for (cat of categories.slice(0, 4); track cat.slug) {
            <a [routerLink]="['/category', cat.slug]" routerLinkActive="active">{{ cat.label }}</a>
          }
        </nav>

        <div class="header-actions">
          <a routerLink="/case-studies" routerLinkActive="learn-active" class="learn-btn case-btn">🔬 Case Studies</a>
          <a routerLink="/issues" routerLinkActive="learn-active" class="learn-btn issues-btn">⚠ Issues & Fixes</a>
          <a routerLink="/learn" routerLinkActive="learn-active" class="learn-btn">📖 Learn SSR</a>
          <a routerLink="/cart" class="cart-btn">
            <span>🛒</span>
            @if (cartCount() > 0) {
              <span class="cart-badge">{{ cartCount() }}</span>
            }
          </a>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .header { background: var(--bg-surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
    .container { max-width: 1280px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; height: 64px; gap: 24px; }
    .logo { display: flex; align-items: center; gap: 8px; text-decoration: none; color: inherit; }
    .logo-icon { font-size: 1.4rem; }
    .logo-text { font-size: 1.2rem; font-weight: 800; color: var(--accent-light); }
    .nav-links { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
    .nav-links a { padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: .88rem; color: var(--text-secondary); font-weight: 500; transition: background .15s; &:hover { background: var(--bg-elevated); color: var(--text-primary); } &.active { background: var(--accent-bg); color: var(--accent-light); } }
    .header-actions { display: flex; align-items: center; gap: 12px; margin-left: auto; }
    .learn-btn { text-decoration: none; font-size: .82rem; font-weight: 700; padding: 7px 14px; border-radius: 20px; background: var(--accent-bg); color: var(--accent-light); border: 1px solid var(--accent-border); transition: all .15s; &:hover { background: var(--accent); color: #fff; } &.learn-active { background: var(--accent); color: #fff; } }
    .issues-btn { background: var(--red-bg); color: #f87171; border-color: rgba(239,68,68,.3); &:hover { background: var(--red); color: #fff; } &.learn-active { background: var(--red); color: #fff; } }
    .case-btn { background: rgba(6,182,212,.12); color: #22d3ee; border-color: rgba(6,182,212,.3); &:hover { background: #06b6d4; color: #fff; } &.learn-active { background: #06b6d4; color: #fff; } }
    .cart-btn { position: relative; text-decoration: none; font-size: 1.4rem; padding: 6px; border-radius: 8px; &:hover { background: var(--bg-elevated); } }
    .cart-badge { position: absolute; top: -2px; right: -4px; background: var(--accent); color: #fff; font-size: .65rem; font-weight: 700; min-width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
  `],
})
export class NavComponent {
  private cartService = inject(CartService);
  cartCount = this.cartService.count;
  categories = MOCK_CATEGORIES;
}
