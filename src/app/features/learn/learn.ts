import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { LearnContentService, GuideSection, GUIDES } from './learn-content.service';

@Component({
  selector: 'app-learn',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="learn-shell">

      <!-- TOP GUIDE TABS -->
      <div class="guide-tabs-bar">
        <div class="guide-tabs-inner">
          @for (guide of guides; track guide.id) {
            <button
              class="guide-tab"
              [class.active]="activeGuideId() === guide.id"
              (click)="selectGuide(guide.id)"
            >
              <span class="guide-tab-label">{{ guide.label }}</span>
              @if (activeGuideId() === guide.id) {
                <span class="guide-tab-desc">{{ guide.description }}</span>
              }
            </button>
          }
        </div>
      </div>

      <div class="learn-body">

        <!-- LEFT SIDEBAR: Chapter list -->
        <aside class="chapter-sidebar">
          @if (loading()) {
            <div class="chapter-loading">
              @for (i of [1,2,3,4,5,6,7,8]; track i) {
                <div class="sk sk-chapter"></div>
              }
            </div>
          } @else {
            <nav class="chapter-nav">
              @for (section of sections(); track section.index) {
                <button
                  class="chapter-btn"
                  [class.active]="activeChapterIndex() === section.index"
                  (click)="selectChapter(section.index)"
                >
                  <span class="chapter-short">{{ section.shortTitle }}</span>
                  @if (activeChapterIndex() === section.index) {
                    <span class="chapter-full">{{ section.title }}</span>
                  }
                </button>
              }
            </nav>
          }
        </aside>

        <!-- MAIN CONTENT -->
        <main class="content-area" #contentArea>
          @if (loading()) {
            <div class="content-loading">
              @for (i of [1,2,3]; track i) { <div class="sk sk-para"></div> }
              <div class="sk sk-code"></div>
              @for (i of [1,2]; track i) { <div class="sk sk-para short"></div> }
            </div>
          } @else if (error()) {
            <div class="content-error">
              <h2>Could not load guide</h2>
              <p>{{ error() }}</p>
            </div>
          } @else if (activeSection()) {

            <!-- SUB-SECTIONS STEP BAR (shown when chapter has h3 sub-steps) -->
            @if (activeSection()!.subSections.length > 0) {
              <div class="subsections-bar">
                @for (sub of activeSection()!.subSections; track sub.id) {
                  <a
                    class="sub-pill"
                    [class.level3]="sub.level === 3"
                    [href]="'#' + sub.id"
                    (click)="scrollToSub($event, sub.id)"
                  >{{ sub.title }}</a>
                }
              </div>
            }

            <article class="markdown-body" [innerHTML]="safeHtml()"></article>

            <!-- PREV / NEXT -->
            <nav class="chapter-nav-footer">
              @if (prevSection()) {
                <button class="nav-btn prev-btn" (click)="selectChapter(prevSection()!.index)">
                  ← {{ prevSection()!.shortTitle }}
                </button>
              } @else { <span></span> }
              @if (nextSection()) {
                <button class="nav-btn next-btn" (click)="selectChapter(nextSection()!.index)">
                  {{ nextSection()!.shortTitle }} →
                </button>
              }
            </nav>
          }
        </main>

        <!-- RIGHT SIDEBAR: Sub-section TOC (sticky in-page nav) -->
        @if (activeSection() && activeSection()!.subSections.length > 0) {
          <aside class="toc-sidebar">
            <p class="toc-label">On this page</p>
            <nav class="toc-nav">
              @for (sub of activeSection()!.subSections; track sub.id) {
                <a
                  class="toc-link"
                  [class.level3]="sub.level === 3"
                  [href]="'#' + sub.id"
                  (click)="scrollToSub($event, sub.id)"
                >{{ sub.title }}</a>
              }
            </nav>
          </aside>
        }

      </div>
    </div>
  `,
  styles: [`
    /* ── Shell ── */
    .learn-shell { display: flex; flex-direction: column; min-height: calc(100vh - 64px); background: var(--bg-base); }

    /* ── Guide Tabs Bar ── */
    .guide-tabs-bar { background: #1e1b4b; border-bottom: 1px solid rgba(255,255,255,.1); padding: 0 24px; position: sticky; top: 64px; z-index: 50; }
    .guide-tabs-inner { max-width: 1600px; margin: 0 auto; display: flex; gap: 2px; }
    .guide-tab { display: flex; flex-direction: column; align-items: flex-start; padding: 12px 20px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; border-bottom: 3px solid transparent; transition: all .15s; text-align: left; min-width: 160px; }
    .guide-tab:hover { color: #c7d2fe; background: rgba(255,255,255,.05); }
    .guide-tab.active { color: #fff; border-bottom-color: var(--accent-light); background: rgba(255,255,255,.07); }
    .guide-tab-label { font-size: .88rem; font-weight: 700; }
    .guide-tab-desc { font-size: .7rem; color: var(--accent-light); margin-top: 2px; max-width: 240px; line-height: 1.3; }

    /* ── Body grid ── */
    .learn-body { display: grid; grid-template-columns: 220px 1fr 220px; flex: 1; max-width: 1600px; width: 100%; margin: 0 auto; }

    /* ── Left Sidebar ── */
    .chapter-sidebar { border-right: 1px solid var(--border); background: var(--bg-surface); position: sticky; top: 128px; height: calc(100vh - 128px); overflow-y: auto; }
    .chapter-nav { padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
    .chapter-btn { display: flex; flex-direction: column; align-items: flex-start; padding: 8px 12px; border-radius: 8px; border: none; background: transparent; cursor: pointer; color: var(--text-secondary); font-size: .82rem; text-align: left; transition: all .12s; width: 100%; }
    .chapter-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
    .chapter-btn.active { background: var(--accent-bg); color: var(--accent-hover); font-weight: 700; }
    .chapter-short { font-weight: 600; line-height: 1.3; }
    .chapter-full { font-size: .7rem; color: var(--accent); margin-top: 3px; line-height: 1.3; }
    .chapter-loading { padding: 16px; display: flex; flex-direction: column; gap: 8px; }

    /* ── Content Area ── */
    .content-area { padding: 32px 40px; background: var(--bg-surface); min-width: 0; border-right: 1px solid var(--border); }
    .content-loading { display: flex; flex-direction: column; gap: 16px; }
    .content-error { color: var(--red); padding: 40px 0; }

    /* ── Sub-sections step bar ── */
    .subsections-bar {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 14px 16px; background: var(--accent-bg); border-radius: 10px;
      margin-bottom: 28px; border: 1px solid var(--accent-border);
    }
    .sub-pill {
      display: inline-block; padding: 5px 12px; border-radius: 20px;
      background: var(--bg-elevated); border: 1px solid var(--accent-border); color: var(--accent-hover);
      font-size: .78rem; font-weight: 600; text-decoration: none;
      transition: all .15s; white-space: nowrap;
      &:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
      &.level4, &.level3 { font-size: .72rem; background: var(--bg-elevated); border-color: var(--border); color: var(--text-muted); &:hover { background: var(--accent); color: #fff; } }
    }

    /* ── Right TOC sidebar ── */
    .toc-sidebar { padding: 20px 16px; position: sticky; top: 128px; height: fit-content; max-height: calc(100vh - 148px); overflow-y: auto; background: var(--bg-surface); }
    .toc-label { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-secondary); margin: 0 0 10px; }
    .toc-nav { display: flex; flex-direction: column; gap: 2px; }
    .toc-link { font-size: .78rem; color: var(--text-muted); text-decoration: none; padding: 4px 8px; border-radius: 6px; border-left: 2px solid transparent; transition: all .12s; line-height: 1.4; display: block; &:hover { color: var(--accent); background: var(--accent-bg); border-left-color: var(--accent-light); } &.level3 { padding-left: 18px; font-size: .73rem; color: var(--text-secondary); } }

    /* ── Skeleton ── */
    .sk { background: var(--bg-elevated); border-radius: 6px; animation: shimmer 1.5s infinite; }
    .sk-chapter { height: 32px; border-radius: 8px; }
    .sk-para { height: 16px; }
    .sk-para.short { width: 60%; }
    .sk-code { height: 120px; border-radius: 8px; }
    @keyframes shimmer { 0%,100% { opacity: .6; } 50% { opacity: 1; } }

    /* ── Footer nav ── */
    .chapter-nav-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); }
    .nav-btn { padding: 10px 18px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-elevated); cursor: pointer; font-size: .88rem; font-weight: 600; color: var(--text-secondary); transition: all .15s; &:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); } }

    /* ── Markdown body ── */
    .markdown-body {
      font-size: .97rem; line-height: 1.85; color: var(--text-primary); max-width: 780px;
      h1 { font-size: 1.9rem; font-weight: 900; color: var(--text-primary); margin: 0 0 24px; border-bottom: 2px solid var(--border); padding-bottom: 12px; }
      h2 { font-size: 1.45rem; font-weight: 800; color: var(--text-primary); margin: 40px 0 16px; }
      h3 { font-size: 1.1rem; font-weight: 700; color: var(--accent-light); margin: 32px 0 12px; padding-top: 8px; scroll-margin-top: 140px; }
      h4 { font-size: .97rem; font-weight: 700; color: var(--text-primary); margin: 20px 0 8px; scroll-margin-top: 140px; }
      p { margin: 0 0 14px; }
      a { color: var(--accent); }
      strong { font-weight: 700; color: var(--text-primary); }
      code { font-family: 'Fira Code','Cascadia Code','Consolas',monospace; font-size: .87em; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; color: var(--accent-light); }
      pre { background: #0f172a; border-radius: 10px; padding: 20px 24px; overflow-x: auto; margin: 20px 0; code { background: transparent; border: none; padding: 0; color: #e2e8f0; font-size: .875rem; line-height: 1.7; } }
      blockquote { margin: 20px 0; padding: 12px 20px; border-left: 4px solid var(--accent); background: var(--accent-bg); border-radius: 0 8px 8px 0; color: var(--text-primary); font-style: italic; p { margin: 0; } }
      ul, ol { padding-left: 24px; margin: 0 0 14px; }
      li { margin-bottom: 5px; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: .88rem; display: block; overflow-x: auto; }
      th { background: #1e1b4b; color: #e0e7ff; padding: 10px 14px; text-align: left; font-weight: 700; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
      td { padding: 9px 14px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--text-primary); }
      tr:nth-child(even) td { background: var(--bg-elevated); }
      hr { border: none; border-top: 1px solid var(--border); margin: 28px 0; }
    }
  `],
})
export class LearnComponent implements OnInit {
  private learnService = inject(LearnContentService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  guides = GUIDES;
  activeGuideId = signal<string>('beginner');
  activeChapterIndex = signal<number>(0);
  sections = signal<GuideSection[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  private queryParams = toSignal(this.route.queryParams, { initialValue: {} as Record<string, string> });

  activeSection = computed(() =>
    this.sections().find(s => s.index === this.activeChapterIndex()) ?? null
  );

  safeHtml = computed((): SafeHtml => {
    const section = this.activeSection();
    return section ? this.sanitizer.bypassSecurityTrustHtml(section.html) : '';
  });

  prevSection = computed(() => {
    const idx = this.activeChapterIndex();
    return this.sections().find(s => s.index === idx - 1) ?? null;
  });

  nextSection = computed(() => {
    const idx = this.activeChapterIndex();
    return this.sections().find(s => s.index === idx + 1) ?? null;
  });

  ngOnInit(): void {
    const params = this.queryParams();
    const guideId = params['guide'] ?? 'beginner';
    const chapter = parseInt(params['chapter'] ?? '0', 10);
    this.activeGuideId.set(guideId);
    this.loadGuide(guideId, chapter);
  }

  selectGuide(id: string): void {
    this.activeGuideId.set(id);
    this.activeChapterIndex.set(0);
    this.updateUrl(id, 0);
    this.loadGuide(id, 0);
  }

  selectChapter(index: number): void {
    this.activeChapterIndex.set(index);
    this.updateUrl(this.activeGuideId(), index);
    document.querySelector('.content-area')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToSub(event: Event, id: string): void {
    event.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private loadGuide(guideId: string, chapter = 0): void {
    const guide = GUIDES.find(g => g.id === guideId);
    if (!guide) return;
    this.loading.set(true);
    this.error.set(null);

    this.learnService.loadGuide(guide.file).pipe(
      catchError(() => {
        this.error.set('Failed to load guide. Make sure the server is running on port 4001.');
        this.loading.set(false);
        return of([]);
      })
    ).subscribe(sections => {
      this.sections.set(sections);
      this.activeChapterIndex.set(Math.min(chapter, sections.length - 1));
      this.loading.set(false);
    });
  }

  private updateUrl(guide: string, chapter: number): void {
    this.router.navigate([], { queryParams: { guide, chapter }, replaceUrl: true });
  }
}
