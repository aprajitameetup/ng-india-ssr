import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { WebVitalsService } from '../../../core/services/web-vitals.service';

/**
 * CONCEPT: Core Web Vitals measurement panel
 *
 * Displays live CWV readings via the web-vitals library.
 * - LCP: should be < 2500ms (Good) / > 4000ms (Poor)
 * - CLS: should be < 0.1 (Good) / > 0.25 (Poor)
 * - INP: should be < 200ms (Good) / > 500ms (Poor)
 * - FCP: should be < 1800ms (Good) / > 3000ms (Poor)
 * - TTFB: should be < 800ms (Good) / > 1800ms (Poor)
 *
 * ngSkipHydration is NOT used here — this is purely a client-side component
 * that will hydrate normally. The parent uses ngSkipHydration on a different widget.
 */
@Component({
  selector: 'app-web-vitals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vitals-panel">
      <h4 class="vitals-title">
        <span class="dot"></span>
        Core Web Vitals
        <span class="live-label">Live</span>
      </h4>
      <div class="vitals-grid">
        <div class="vital-row" [class]="lcpRating()">
          <span class="vital-name">LCP</span>
          <span class="vital-value">{{ vitals().lcp !== null ? (vitals().lcp! | number:'1.0-0') + 'ms' : '—' }}</span>
          <span class="vital-rating">{{ lcpRating() }}</span>
        </div>
        <div class="vital-row" [class]="clsRating()">
          <span class="vital-name">CLS</span>
          <span class="vital-value">{{ vitals().cls !== null ? (vitals().cls! | number:'1.3-3') : '—' }}</span>
          <span class="vital-rating">{{ clsRating() }}</span>
        </div>
        <div class="vital-row" [class]="inpRating()">
          <span class="vital-name">INP</span>
          <span class="vital-value">{{ vitals().inp !== null ? (vitals().inp! | number:'1.0-0') + 'ms' : '—' }}</span>
          <span class="vital-rating">{{ inpRating() }}</span>
        </div>
        <div class="vital-row" [class]="fcpRating()">
          <span class="vital-name">FCP</span>
          <span class="vital-value">{{ vitals().fcp !== null ? (vitals().fcp! | number:'1.0-0') + 'ms' : '—' }}</span>
          <span class="vital-rating">{{ fcpRating() }}</span>
        </div>
        <div class="vital-row" [class]="ttfbRating()">
          <span class="vital-name">TTFB</span>
          <span class="vital-value">{{ vitals().ttfb !== null ? (vitals().ttfb! | number:'1.0-0') + 'ms' : '—' }}</span>
          <span class="vital-rating">{{ ttfbRating() }}</span>
        </div>
      </div>
      <p class="vitals-note">Values update as interactions occur. Metrics reflect this page load.</p>
    </div>
  `,
  styles: [`
    .vitals-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    .vitals-title { display: flex; align-items: center; gap: 8px; font-size: .85rem; font-weight: 700; color: var(--text-primary); margin: 0 0 14px; text-transform: uppercase; letter-spacing: .06em; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
    .live-label { font-size: .65rem; background: var(--accent-bg); color: var(--accent); padding: 2px 6px; border-radius: 10px; margin-left: auto; }
    .vitals-grid { display: flex; flex-direction: column; gap: 6px; }
    .vital-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; border-left: 3px solid transparent; }
    .good { background: var(--green-bg); border-color: var(--green); }
    .needs-improvement { background: var(--yellow-bg); border-color: var(--yellow); }
    .poor { background: var(--red-bg); border-color: var(--red); }
    .pending { background: var(--bg-elevated); border-color: var(--border); }
    .vital-name { font-size: .75rem; font-weight: 700; color: var(--text-muted); width: 36px; text-transform: uppercase; }
    .vital-value { font-size: .9rem; font-weight: 700; color: var(--text-primary); flex: 1; }
    .vital-rating { font-size: .7rem; font-weight: 600; text-transform: capitalize; }
    .good .vital-rating { color: #4ade80; }
    .needs-improvement .vital-rating { color: var(--yellow); }
    .poor .vital-rating { color: #f87171; }
    .pending .vital-rating { color: var(--text-secondary); }
    .vitals-note { font-size: .7rem; color: var(--text-secondary); margin: 10px 0 0; }
  `],
  imports: [DecimalPipe],
})
export class WebVitalsComponent implements OnInit {
  private webVitalsService = inject(WebVitalsService);
  vitals = this.webVitalsService.vitals;

  ngOnInit(): void {
    this.webVitalsService.init();
  }

  lcpRating(): string { return this.rate(this.vitals().lcp, 2500, 4000); }
  clsRating(): string { return this.rate(this.vitals().cls, 0.1, 0.25); }
  inpRating(): string { return this.rate(this.vitals().inp, 200, 500); }
  fcpRating(): string { return this.rate(this.vitals().fcp, 1800, 3000); }
  ttfbRating(): string { return this.rate(this.vitals().ttfb, 800, 1800); }

  private rate(value: number | null, good: number, poor: number): string {
    if (value === null) return 'pending';
    if (value <= good) return 'good';
    if (value <= poor) return 'needs-improvement';
    return 'poor';
  }
}
