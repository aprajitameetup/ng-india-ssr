import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface VitalsSnapshot {
  lcp: number | null;   // Largest Contentful Paint (ms)
  cls: number | null;   // Cumulative Layout Shift (score)
  inp: number | null;   // Interaction to Next Paint (ms)
  fcp: number | null;   // First Contentful Paint (ms)
  ttfb: number | null;  // Time to First Byte (ms)
}

/**
 * CONCEPT: Core Web Vitals measurement
 *
 * Uses the web-vitals library (PerformanceObserver under the hood).
 * LCP, CLS, INP, FCP, TTFB are exposed as signals for reactive UI.
 *
 * Only runs in browser — PerformanceObserver does not exist on server.
 * PLATFORM_ID guard prevents server-side errors.
 */
@Injectable({ providedIn: 'root' })
export class WebVitalsService {
  private platformId = inject(PLATFORM_ID);

  private _vitals = signal<VitalsSnapshot>({
    lcp: null, cls: null, inp: null, fcp: null, ttfb: null,
  });

  readonly vitals = this._vitals.asReadonly();

  init(): void {
    // PLATFORM_ID guard — PerformanceObserver is browser-only
    if (!isPlatformBrowser(this.platformId)) return;

    // Dynamically import to avoid server-side bundle issues
    import('web-vitals').then(({ onLCP, onCLS, onINP, onFCP, onTTFB }) => {
      onLCP(metric => this._vitals.update(v => ({ ...v, lcp: metric.value })));
      onCLS(metric => this._vitals.update(v => ({ ...v, cls: metric.value })));
      onINP(metric => this._vitals.update(v => ({ ...v, inp: metric.value })));
      onFCP(metric => this._vitals.update(v => ({ ...v, fcp: metric.value })));
      onTTFB(metric => this._vitals.update(v => ({ ...v, ttfb: metric.value })));
    });
  }
}
