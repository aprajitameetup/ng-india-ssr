import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import {
  CASE_STUDIES,
  CASE_STUDY_CATEGORIES,
  CaseStudy,
} from './case-studies-data';

@Component({
  selector: 'app-case-studies',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cs-shell">

      <!-- ── HEADER ── -->
      <div class="cs-header">
        <div class="cs-header-inner">
          <div class="cs-header-label">Real-World Angular SSR</div>
          <h1 class="cs-title">Case Studies</h1>
          <p class="cs-sub">
            Production problems, root-cause analysis, and the exact Angular APIs that fix them.
            Each case study is based on a real scenario.
          </p>
          <div class="cs-stats">
            <div class="cs-stat">
              <span class="cs-stat-num">{{ caseStudies.length }}</span>
              <span class="cs-stat-label">Case Studies</span>
            </div>
            @for (key of categoryKeys; track key) {
              @if (countForCategory(key) > 0) {
                <div class="cs-stat" [style.--cat]="categories[key].color">
                  <span class="cs-stat-num cat-num">{{ countForCategory(key) }}</span>
                  <span class="cs-stat-label">{{ categories[key].label }}</span>
                </div>
              }
            }
          </div>
        </div>
      </div>

      <!-- ── BODY ── -->
      <div class="cs-body">

        <!-- LEFT: case study list -->
        <aside class="cs-sidebar">
          @for (cs of caseStudies; track cs.id) {
            <button
              class="cs-list-item"
              [class.active]="activeId() === cs.id"
              (click)="activeId.set(cs.id)"
            >
              <span
                class="cs-cat-dot"
                [style.background]="categories[cs.category].color"
              ></span>
              <span class="cs-list-num">#{{ cs.id }}</span>
              <span class="cs-list-title">{{ cs.title }}</span>
            </button>
          }
          <div class="cs-coming-soon">
            <span>More cases coming soon…</span>
          </div>
        </aside>

        <!-- RIGHT: detail -->
        <main class="cs-detail">
          @if (active(); as cs) {

            <!-- TITLE BLOCK -->
            <div class="cs-detail-header">
              <div class="cs-detail-meta">
                <span
                  class="cs-cat-badge"
                  [style.background]="categories[cs.category].color + '22'"
                  [style.color]="categories[cs.category].color"
                  [style.border-color]="categories[cs.category].color + '44'"
                >{{ categories[cs.category].label }}</span>
                <span class="cs-detail-num">Case Study #{{ cs.id }}</span>
              </div>
              <h2 class="cs-detail-title">{{ cs.title }}</h2>
              <p class="cs-detail-subtitle">{{ cs.subtitle }}</p>
            </div>

            <!-- SCENARIO -->
            <section class="cs-section">
              <div class="cs-section-label">
                <span class="cs-section-icon scenario-icon">📋</span>
                The Scenario
              </div>
              <p class="cs-scenario-text">{{ cs.scenario }}</p>
            </section>

            <!-- SYMPTOMS -->
            <section class="cs-section">
              <div class="cs-section-label">
                <span class="cs-section-icon symptoms-icon">🔍</span>
                What You See
              </div>
              <ul class="cs-symptoms">
                @for (s of cs.symptoms; track s) {
                  <li class="cs-symptom">
                    <span class="symptom-dot"></span>
                    {{ s }}
                  </li>
                }
              </ul>
            </section>

            <!-- ROOT CAUSE -->
            <section class="cs-section cause-section">
              <div class="cs-section-label">
                <span class="cs-section-icon cause-icon">⚡</span>
                Root Cause
              </div>
              <p class="cs-cause-text">{{ cs.rootCause }}</p>
              @if (cs.rootCauseCode) {
                <pre class="code-block cause-code"><code>{{ cs.rootCauseCode }}</code></pre>
              }
            </section>

            <!-- SOLUTIONS -->
            <section class="cs-section">
              <div class="cs-section-label solutions-label">
                <span class="cs-section-icon fix-icon">✓</span>
                Solutions
                <span class="solutions-count">{{ cs.solutions.length }} fixes</span>
              </div>

              <div class="solutions-list">
                @for (sol of cs.solutions; track sol.title; let i = $index) {
                  <div class="solution-card">
                    <div class="solution-header">
                      <span class="solution-num">{{ i + 1 }}</span>
                      <h3 class="solution-title">{{ sol.title }}</h3>
                    </div>
                    <div class="solution-when">
                      <span class="when-label">When to use</span>
                      <span class="when-value">{{ sol.when }}</span>
                    </div>
                    <p class="solution-desc">{{ sol.description }}</p>
                    @if (sol.code) {
                      <pre class="code-block"><code>{{ sol.code }}</code></pre>
                    }
                    <div class="api-badge">
                      <span class="api-label">API</span>
                      <span class="api-value">{{ sol.api }}</span>
                    </div>
                  </div>
                }
              </div>
            </section>

            <!-- KEY TAKEAWAY -->
            <section class="cs-section takeaway-section">
              <div class="cs-section-label">
                <span class="cs-section-icon">💡</span>
                Key Takeaway
              </div>
              <blockquote class="cs-takeaway">{{ cs.keyTakeaway }}</blockquote>
            </section>

          }
        </main>
      </div>
    </div>
  `,
  styles: [`
    /* ── Shell ── */
    .cs-shell { min-height: calc(100vh - 64px); background: var(--bg-base); display: flex; flex-direction: column; }

    /* ── Header ── */
    .cs-header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 40px 24px; border-bottom: 1px solid var(--border); }
    .cs-header-inner { max-width: 1400px; margin: 0 auto; }
    .cs-header-label { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--accent-light); margin-bottom: 8px; }
    .cs-title { font-size: 2.2rem; font-weight: 900; color: #fff; margin: 0 0 10px; }
    .cs-sub { color: var(--text-secondary); font-size: 1rem; margin: 0 0 24px; max-width: 680px; line-height: 1.7; }
    .cs-stats { display: flex; gap: 20px; flex-wrap: wrap; }
    .cs-stat { display: flex; flex-direction: column; gap: 2px; }
    .cs-stat-num { font-size: 1.6rem; font-weight: 900; color: #fff; line-height: 1; }
    .cs-stat-num.cat-num { color: var(--cat, var(--accent)); }
    .cs-stat-label { font-size: .72rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .06em; }

    /* ── Body ── */
    .cs-body { display: grid; grid-template-columns: 280px 1fr; flex: 1; max-width: 1400px; width: 100%; margin: 0 auto; }

    /* ── Sidebar ── */
    .cs-sidebar { background: var(--bg-surface); border-right: 1px solid var(--border); padding: 16px 10px; position: sticky; top: 64px; height: calc(100vh - 64px); overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
    .cs-list-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; border: none; background: transparent; cursor: pointer; text-align: left; width: 100%; transition: all .12s; }
    .cs-list-item:hover { background: var(--bg-elevated); }
    .cs-list-item.active { background: var(--accent-bg); outline: 1px solid var(--accent-border); }
    .cs-cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .cs-list-num { font-size: .7rem; font-weight: 800; color: var(--text-secondary); background: var(--bg-elevated); border-radius: 4px; padding: 2px 6px; flex-shrink: 0; }
    .cs-list-item.active .cs-list-num { background: var(--accent-bg); color: var(--accent-light); }
    .cs-list-title { font-size: .82rem; font-weight: 600; color: var(--text-secondary); line-height: 1.3; }
    .cs-list-item.active .cs-list-title { color: var(--accent-light); font-weight: 700; }
    .cs-coming-soon { margin-top: 12px; padding: 12px; border-radius: 8px; border: 1px dashed var(--border); text-align: center; font-size: .75rem; color: var(--text-muted); }

    /* ── Detail ── */
    .cs-detail { padding: 36px 48px; overflow-y: auto; }

    /* ── Detail Header ── */
    .cs-detail-header { margin-bottom: 32px; padding-bottom: 28px; border-bottom: 1px solid var(--border); }
    .cs-detail-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .cs-cat-badge { font-size: .72rem; font-weight: 700; padding: 4px 12px; border-radius: 12px; border: 1px solid; }
    .cs-detail-num { font-size: .75rem; font-weight: 700; color: var(--text-secondary); }
    .cs-detail-title { font-size: 1.75rem; font-weight: 900; color: var(--text-primary); margin: 0 0 8px; line-height: 1.2; }
    .cs-detail-subtitle { font-size: 1rem; color: var(--text-secondary); margin: 0; font-style: italic; }

    /* ── Sections ── */
    .cs-section { margin-bottom: 32px; }
    .cs-section-label { display: flex; align-items: center; gap: 8px; font-size: .78rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--text-secondary); margin-bottom: 14px; }
    .cs-section-icon { font-size: 1rem; }
    .solutions-label { color: var(--text-primary); }
    .solutions-count { background: var(--accent-bg); color: var(--accent-light); font-size: .7rem; padding: 2px 8px; border-radius: 10px; margin-left: 4px; }

    /* ── Scenario ── */
    .cs-scenario-text { font-size: .95rem; color: var(--text-primary); line-height: 1.85; margin: 0; max-width: 780px; white-space: pre-line; }

    /* ── Symptoms ── */
    .cs-symptoms { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .cs-symptom { display: flex; align-items: flex-start; gap: 10px; font-size: .9rem; color: var(--text-primary); line-height: 1.5; background: var(--red-bg); padding: 10px 14px; border-radius: 8px; border-left: 3px solid #ef4444; }
    .symptom-dot { width: 6px; height: 6px; border-radius: 50%; background: #f87171; flex-shrink: 0; margin-top: 6px; }

    /* ── Root Cause ── */
    .cause-section { background: rgba(245,158,11,.06); border: 1px solid rgba(245,158,11,.2); border-radius: 12px; padding: 20px 24px; }
    .cs-cause-text { font-size: .92rem; color: var(--text-primary); line-height: 1.8; margin: 0 0 16px; white-space: pre-line; }
    .cause-code { margin: 0; }

    /* ── Solutions ── */
    .solutions-list { display: flex; flex-direction: column; gap: 20px; }
    .solution-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
    .solution-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--bg-elevated); border-bottom: 1px solid var(--border); }
    .solution-num { width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 800; flex-shrink: 0; }
    .solution-title { font-size: 1rem; font-weight: 800; color: var(--text-primary); margin: 0; }
    .solution-when { display: flex; gap: 8px; align-items: flex-start; margin: 14px 20px 0; padding: 8px 12px; background: var(--accent-bg); border-radius: 8px; border: 1px solid var(--accent-border); }
    .when-label { font-size: .7rem; font-weight: 800; text-transform: uppercase; color: var(--accent-light); white-space: nowrap; padding-top: 1px; }
    .when-value { font-size: .82rem; color: var(--accent-light); line-height: 1.4; }
    .solution-desc { font-size: .88rem; color: var(--text-primary); line-height: 1.75; margin: 14px 20px; white-space: pre-line; }

    /* ── Code block ── */
    .code-block {
      background: #0f172a; border-radius: 10px; padding: 18px 20px;
      overflow-x: auto; margin: 0 20px 16px; flex: 1;
      code {
        font-family: 'Fira Code','Cascadia Code','Consolas',monospace;
        font-size: .8rem; color: #e2e8f0; line-height: 1.75;
        white-space: pre; display: block;
      }
    }
    .cause-code { margin: 0; }

    /* ── API Badge ── */
    .api-badge { display: flex; align-items: flex-start; gap: 8px; margin: 0 20px 20px; padding: 10px 12px; background: rgba(34,197,94,.12); border-radius: 8px; border: 1px solid rgba(34,197,94,.25); }
    .api-label { font-size: .7rem; font-weight: 800; text-transform: uppercase; color: #4ade80; white-space: nowrap; padding-top: 1px; }
    .api-value { font-size: .78rem; font-weight: 600; color: #4ade80; font-family: 'Fira Code','Consolas',monospace; line-height: 1.5; }

    /* ── Takeaway ── */
    .takeaway-section { border: none; }
    .cs-takeaway { margin: 0; padding: 20px 24px; border-left: 4px solid var(--accent); background: var(--accent-bg); border-radius: 0 12px 12px 0; font-size: .95rem; color: var(--text-primary); line-height: 1.8; font-style: italic; white-space: pre-line; }

    /* ── Responsive ── */
    @media (max-width: 960px) {
      .cs-body { grid-template-columns: 1fr; }
      .cs-sidebar { position: static; height: auto; flex-direction: row; flex-wrap: wrap; }
      .cs-detail { padding: 24px 20px; }
    }
  `],
})
export class CaseStudiesComponent {
  caseStudies = CASE_STUDIES;
  categories = CASE_STUDY_CATEGORIES;
  categoryKeys = Object.keys(CASE_STUDY_CATEGORIES);
  activeId = signal<number>(1);

  active = computed<CaseStudy | null>(
    () => this.caseStudies.find(cs => cs.id === this.activeId()) ?? null
  );

  countForCategory(cat: string): number {
    return this.caseStudies.filter(cs => cs.category === cat).length;
  }
}
