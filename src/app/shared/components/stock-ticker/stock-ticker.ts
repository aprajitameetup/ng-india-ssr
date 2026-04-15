import {
  ChangeDetectionStrategy,
  Component,
  inject,
  NgZone,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StockLevel } from '../../../core/models/product.model';

interface StockResponse {
  stockLevels: StockLevel[];
  timestamp: string;
}

/**
 * CONCEPT: httpResource() / resource() — LIVE data polling
 *
 * resource() manages async state with signals: .value(), .isLoading(), .error().
 * It re-fetches when its reactive dependencies change.
 * For live polling we use a ticker signal that increments every 8 seconds,
 * triggering a refetch — simulating a live stock feed.
 *
 * PLATFORM_ID guard: polling only makes sense in the browser.
 * On the server this renders once with loading state (or skip entirely).
 *
 * ChangeDetectionStrategy.OnPush: resource() marks the component dirty
 * automatically when .value() signal updates — no Zone.js tick needed.
 */
@Component({
  selector: 'app-stock-ticker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ticker-wrapper">
      <div class="ticker-header">
        <span class="live-dot"></span>
        <span class="ticker-title">Live Inventory</span>
        @if (stockResource.isLoading()) {
          <span class="updating">updating…</span>
        }
        @if (stockResource.value(); as data) {
          <span class="timestamp">{{ formatTime(data.timestamp) }}</span>
        }
      </div>

      @if (stockResource.error()) {
        <p class="ticker-error">Unable to fetch live stock data.</p>
      } @else if (stockResource.value(); as data) {
        <div class="ticker-scroll">
          @for (item of data.stockLevels; track item.productId) {
            <div class="ticker-item" [class]="'status-' + item.status">
              <span class="item-name">{{ item.name }}</span>
              <span class="item-count">{{ item.count }}</span>
              <span class="item-status">{{ statusLabel(item.status) }}</span>
            </div>
          }
        </div>
      } @else {
        <div class="ticker-loading">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="skeleton-item"></div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .ticker-wrapper { background: #0f172a; color: #e2e8f0; border-radius: 12px; padding: 16px; overflow: hidden; }
    .ticker-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; flex-shrink: 0; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(1.3); } }
    .ticker-title { font-weight: 700; font-size: .9rem; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; }
    .updating { font-size: .72rem; color: #64748b; margin-left: auto; }
    .timestamp { font-size: .72rem; color: #475569; margin-left: auto; }
    .ticker-scroll { display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto; }
    .ticker-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; font-size: .82rem; }
    .status-in_stock { background: rgba(34,197,94,.1); border-left: 3px solid #22c55e; }
    .status-low_stock { background: rgba(234,179,8,.1); border-left: 3px solid #eab308; }
    .status-out_of_stock { background: rgba(239,68,68,.1); border-left: 3px solid #ef4444; }
    .item-name { flex: 1; font-weight: 500; }
    .item-count { font-weight: 700; font-size: .9rem; min-width: 28px; text-align: right; }
    .item-status { font-size: .7rem; color: #94a3b8; min-width: 68px; text-align: right; }
    .ticker-loading, .ticker-error { display: flex; flex-direction: column; gap: 6px; }
    .skeleton-item { height: 36px; border-radius: 8px; background: rgba(255,255,255,.06); animation: shimmer 1.5s infinite; }
    @keyframes shimmer { 0%,100% { opacity: .4; } 50% { opacity: .8; } }
    .ticker-error { color: #f87171; font-size: .85rem; padding: 12px; }
  `],
})
export class StockTickerComponent {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private ngZone = inject(NgZone);

  /**
   * CONCEPT: resource() reactive polling via a ticker signal
   *
   * The root cause of the counter not updating:
   * setInterval() runs outside Angular's Zone, so calling reload() from it
   * never triggers change detection on an OnPush component.
   *
   * Fix: use a `ticker` signal as the resource `params`.
   * When ticker increments (inside NgZone.run()), Angular's signal graph
   * marks the resource dirty → loader re-runs → view re-renders.
   *
   * NgZone.run() is needed to bring the setInterval callback back into the
   * zone so the signal write is picked up by change detection scheduling.
   */
  private ticker = signal(0);

  stockResource = resource<StockResponse, number>({
    params: () => this.ticker(),
    loader: ({ params }) => {
      // Server: return empty once — no polling server-side
      if (!isPlatformBrowser(this.platformId)) {
        return Promise.resolve({ stockLevels: [], timestamp: new Date().toISOString() });
      }
      return firstValueFrom(this.http.get<StockResponse>('/api/stock'));
    },
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Run interval outside zone to avoid unnecessary CD ticks,
      // but bring the signal write back inside zone via NgZone.run()
      this.ngZone.runOutsideAngular(() => {
        setInterval(() => {
          this.ngZone.run(() => {
            this.ticker.update(n => n + 1);
          });
        }, 5000);
      });
    }
  }

  statusLabel(status: string): string {
    return { in_stock: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Sold Out' }[status] ?? status;
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString();
  }
}
