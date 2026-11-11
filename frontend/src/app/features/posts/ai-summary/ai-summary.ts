import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Subscription } from 'rxjs';
import { PostSummary } from '../../../core/models';
import { PostService } from '../post.service';

/**
 * "Summarize with AI" — calls POST /feed/posts/:id/summary and shows the result.
 * The backend summarizes the post as saved, so unsaved edits aren't included.
 * Failures (429 busy, 503 unavailable …) are toasted by the error interceptor.
 */
@Component({
  selector: 'app-ai-summary',
  imports: [NgIcon],
  template: `
    @if (result(); as r) {
      <aside
        class="rounded-md border border-brand/25 bg-brand-soft px-4 py-3 text-sm"
        role="note"
        aria-label="AI summary"
        aria-live="polite"
      >
        <p class="mb-1 flex items-center gap-1.5 font-semibold text-fg">
          <ng-icon name="lucideSparkles" size="14" class="text-brand" />
          AI summary
          <button
            type="button"
            class="btn btn-ghost ml-auto h-6 px-2 text-xs"
            title="Ask for a new summary instead of the saved one"
            [disabled]="loading()"
            (click)="summarize(true)"
          >
            <ng-icon
              [name]="loading() ? 'lucideLoaderCircle' : 'lucideRotateCcw'"
              size="12"
              [class.animate-spin]="loading()"
            />
            Regenerate
          </button>
        </p>
        <p class="leading-relaxed whitespace-pre-line text-fg">{{ r.summary }}</p>
        <p class="mt-1.5 text-xs text-fg-muted">
          @if (r.source === 'gemini') {
            Written by Gemini AI, may contain mistakes.
          } @else {
            Key sentences picked by WordNest's own summarizer (Gemini was busy).
          }
          @if (r.cached) {
            · saved summary
          }
        </p>
      </aside>
    } @else {
      <button
        type="button"
        class="btn btn-outline"
        [disabled]="loading()"
        (click)="summarize(false)"
      >
        <ng-icon
          [name]="loading() ? 'lucideLoaderCircle' : 'lucideSparkles'"
          size="14"
          [class.animate-spin]="loading()"
        />
        {{ loading() ? 'Summarizing…' : 'Summarize with AI' }}
      </button>
    }
  `,
})
export class AiSummary {
  private readonly posts = inject(PostService);
  readonly postId = input.required<string>();

  protected readonly result = signal<PostSummary | null>(null);
  protected readonly loading = signal(false);
  private request?: Subscription;

  constructor() {
    // Different post → forget the old summary and drop any request still in flight.
    effect(() => {
      this.postId();
      untracked(() => {
        this.request?.unsubscribe();
        this.result.set(null);
        this.loading.set(false);
      });
    });
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  /** refresh = true (Regenerate) asks the backend for a new summary instead of the saved one. */
  protected summarize(refresh: boolean): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.request = this.posts.summarize(this.postId(), refresh).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
