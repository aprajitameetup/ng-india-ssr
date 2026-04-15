import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { SSR_ISSUES, CATEGORIES, Issue } from './issues-data';

@Component({
  selector: 'app-issues',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="issues-shell">

      <!-- HEADER -->
      <div class="issues-header">
        <div class="issues-header-inner">
          <h1 class="issues-title">SSR Issues & Fixes</h1>
          <p class="issues-sub">14 real-world Angular SSR problems — what breaks, why it breaks, and the exact API that fixes it.</p>

          <!-- CATEGORY FILTER -->
          <div class="filter-bar">
            <button
              class="filter-btn"
              [class.active]="activeCategory() === null"
              (click)="activeCategory.set(null)"
            >All <span class="count">{{ issues.length }}</span></button>
            @for (cat of categoryKeys; track cat) {
              <button
                class="filter-btn"
                [class.active]="activeCategory() === cat"
                (click)="activeCategory.set(cat)"
                [style.--cat-color]="categories[cat].color"
              >
                {{ categories[cat].label }}
                <span class="count">{{ countFor(cat) }}</span>
              </button>
            }
          </div>
        </div>
      </div>

      <!-- ISSUES GRID -->
      <div class="issues-container">
        @if (filtered().length === 0) {
          <p class="empty">No issues in this category.</p>
        }
        @for (issue of filtered(); track issue.id) {
          <div class="issue-card">

            <!-- CARD HEADER -->
            <div class="card-header">
              <span class="issue-num">#{{ issue.id }}</span>
              <h2 class="issue-title">{{ issue.title }}</h2>
              <span
                class="category-badge"
                [style.background]="categories[issue.category].color + '22'"
                [style.color]="categories[issue.category].color"
                [style.border-color]="categories[issue.category].color + '44'"
              >{{ categories[issue.category].label }}</span>
            </div>

            <!-- SPLIT PANELS -->
            <div class="panels">

              <!-- PROBLEM PANEL -->
              <div class="panel problem-panel">
                <div class="panel-label problem-label">
                  <span class="panel-icon">✕</span> Problem
                </div>
                <p class="panel-desc">{{ issue.problem.description }}</p>
                @if (issue.problem.code) {
                  <pre class="code-block"><code>{{ issue.problem.code }}</code></pre>
                }
              </div>

              <!-- FIX PANEL -->
              <div class="panel fix-panel">
                <div class="panel-label fix-label">
                  <span class="panel-icon">✓</span> Fix
                </div>
                <p class="panel-desc">{{ issue.fix.description }}</p>
                @if (issue.fix.code) {
                  <pre class="code-block"><code>{{ issue.fix.code }}</code></pre>
                }
                <div class="api-badge">
                  <span class="api-label">API</span>
                  <span class="api-value">{{ issue.fix.api }}</span>
                </div>
              </div>

            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    /* ── Shell ── */
    .issues-shell { min-height: calc(100vh - 64px); background: var(--bg-base); }

    /* ── Header ── */
    .issues-header { background: #0f172a; padding: 40px 24px; }
    .issues-header-inner { max-width: 1300px; margin: 0 auto; }
    .issues-title { font-size: 2rem; font-weight: 900; color: #fff; margin: 0 0 8px; }
    .issues-sub { color: var(--text-secondary); margin: 0 0 24px; font-size: 1rem; }

    /* ── Filter bar ── */
    .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; }
    .filter-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 20px; border: 1px solid rgba(255,255,255,.15);
      background: transparent; color: var(--text-secondary); cursor: pointer; font-size: .82rem;
      font-weight: 600; transition: all .15s;
      &:hover { background: rgba(255,255,255,.08); color: #fff; }
      &.active { background: var(--cat-color, var(--accent)); color: #fff; border-color: transparent; }
    }
    .filter-btn:first-child.active { background: var(--accent); }
    .count { background: rgba(255,255,255,.2); border-radius: 10px; padding: 1px 6px; font-size: .72rem; }

    /* ── Container ── */
    .issues-container { max-width: 1300px; margin: 0 auto; padding: 32px 24px; display: flex; flex-direction: column; gap: 28px; }
    .empty { color: var(--text-secondary); text-align: center; padding: 60px; }

    /* ── Card ── */
    .issue-card { background: var(--bg-card); border-radius: 14px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.3); border: 1px solid var(--border); }

    /* ── Card Header ── */
    .card-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--bg-elevated); flex-wrap: wrap; }
    .issue-num { font-size: .75rem; font-weight: 800; color: var(--text-secondary); background: var(--bg-surface); border-radius: 6px; padding: 3px 8px; }
    .issue-title { font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin: 0; flex: 1; }
    .category-badge { font-size: .72rem; font-weight: 700; padding: 4px 10px; border-radius: 12px; border: 1px solid; white-space: nowrap; }

    /* ── Panels ── */
    .panels { display: grid; grid-template-columns: 1fr 1fr; }

    /* ── Individual panel ── */
    .panel { padding: 24px; display: flex; flex-direction: column; gap: 14px; }
    .problem-panel { border-right: 1px solid var(--red-bg); background: var(--red-bg); }
    .fix-panel { background: var(--green-bg); }

    .panel-label { display: flex; align-items: center; gap: 8px; font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    .problem-label { color: #f87171; }
    .fix-label { color: #4ade80; }
    .panel-icon { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .72rem; font-weight: 900; }
    .problem-label .panel-icon { background: rgba(239,68,68,.2); color: #f87171; }
    .fix-label .panel-icon { background: rgba(34,197,94,.2); color: #4ade80; }

    .panel-desc { font-size: .88rem; color: var(--text-primary); line-height: 1.7; margin: 0; }

    /* ── Code block ── */
    .code-block {
      background: #0f172a; border-radius: 10px; padding: 16px 18px;
      overflow-x: auto; margin: 0; flex: 1;
      code {
        font-family: 'Fira Code','Cascadia Code','Consolas',monospace;
        font-size: .8rem; color: #e2e8f0; line-height: 1.7;
        white-space: pre; display: block;
      }
    }

    /* ── API badge ── */
    .api-badge { display: flex; align-items: flex-start; gap: 8px; margin-top: auto; padding: 10px 12px; background: rgba(34,197,94,.15); border-radius: 8px; border: 1px solid rgba(34,197,94,.3); }
    .api-label { font-size: .7rem; font-weight: 800; text-transform: uppercase; color: #4ade80; white-space: nowrap; padding-top: 1px; }
    .api-value { font-size: .78rem; font-weight: 600; color: #4ade80; font-family: 'Fira Code','Consolas',monospace; line-height: 1.5; }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .panels { grid-template-columns: 1fr; }
      .problem-panel { border-right: none; border-bottom: 1px solid var(--red-bg); }
    }
  `],
})
export class IssuesComponent {
  issues = SSR_ISSUES;
  categories = CATEGORIES;
  categoryKeys = Object.keys(CATEGORIES);
  activeCategory = signal<string | null>(null);

  filtered = computed(() => {
    const cat = this.activeCategory();
    return cat ? this.issues.filter(i => i.category === cat) : this.issues;
  });

  countFor(cat: string): number {
    return this.issues.filter(i => i.category === cat).length;
  }
}
