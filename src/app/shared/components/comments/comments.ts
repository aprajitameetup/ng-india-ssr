import { ChangeDetectionStrategy, Component, inject, input, resource } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Comment } from '../../../core/models/product.model';

/**
 * CONCEPT: @defer (on interaction) + withIncrementalHydration()
 *
 * This component is wrapped in @defer in the parent template:
 *   @defer (on interaction; hydrate on interaction) { <app-comments> }
 *
 * SSR behavior: The @defer block renders the CONTENT (not placeholder) on the server.
 * The ngh="d0" marker tells the client hydrator to skip hydration until the interaction trigger fires.
 *
 * resource() fetches comments lazily — only when the component is instantiated
 * (which is after the user interacts in incremental hydration mode).
 */
@Component({
  selector: 'app-comments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comments-section">
      <h3 class="section-title">Customer Reviews</h3>

      @if (commentsResource.isLoading()) {
        <div class="comments-loading">
          @for (i of [1,2,3]; track i) {
            <div class="skeleton-comment">
              <div class="sk sk-avatar"></div>
              <div class="sk-content">
                <div class="sk sk-name"></div>
                <div class="sk sk-body"></div>
                <div class="sk sk-body short"></div>
              </div>
            </div>
          }
        </div>
      }

      @if (commentsResource.error()) {
        <p class="error">Could not load reviews. Please try again later.</p>
      }

      @if (commentsResource.value(); as data) {
        <div class="comments-list">
          @for (comment of data.comments; track comment.id) {
            <div class="comment-card">
              <div class="comment-header">
                <div class="avatar">{{ comment.avatar }}</div>
                <div>
                  <strong>{{ comment.author }}</strong>
                  <div class="comment-meta">
                    <span class="stars">{{ starsFor(comment.rating) }}</span>
                    <span class="date">{{ comment.date }}</span>
                  </div>
                </div>
              </div>
              <p class="comment-body">{{ comment.body }}</p>
              <p class="helpful">{{ comment.helpful }} people found this helpful</p>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .comments-section { padding: 8px 0; }
    .section-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 20px; color: var(--text-primary); }
    .comments-list { display: flex; flex-direction: column; gap: 16px; }
    .comment-card { background: var(--bg-elevated); border-radius: 10px; padding: 16px; border: 1px solid var(--border); }
    .comment-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: .85rem; flex-shrink: 0; }
    .comment-meta { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
    .stars { color: var(--yellow); }
    .date { font-size: .75rem; color: var(--text-secondary); }
    .comment-body { margin: 0 0 8px; color: var(--text-primary); line-height: 1.6; }
    .helpful { font-size: .78rem; color: var(--text-secondary); margin: 0; }
    .error { color: var(--red); }
    .comments-loading { display: flex; flex-direction: column; gap: 16px; }
    .skeleton-comment { display: flex; gap: 12px; }
    .sk-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--bg-elevated); flex-shrink: 0; }
    .sk-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .sk { background: var(--bg-elevated); border-radius: 4px; height: 14px; animation: shimmer 1.5s infinite; }
    .sk-name { width: 30%; }
    .sk-body { width: 100%; }
    .sk-body.short { width: 60%; }
    @keyframes shimmer { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
  `],
})
export class CommentsComponent {
  productSlug = input.required<string>();
  private http = inject(HttpClient);

  commentsResource = resource<{ comments: Comment[]; productSlug: string }, string>({
    params: () => this.productSlug(),
    loader: ({ params: slug }) =>
      firstValueFrom(this.http.get<{ comments: Comment[]; productSlug: string }>(`/api/comments/${slug}`)),
  });

  starsFor(rating: number): string {
    return '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
  }
}
