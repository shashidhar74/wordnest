import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { Component, Injectable, inject, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Post } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { AiSummary } from '../ai-summary/ai-summary';
import { PostComments } from '../comments/post-comments';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { PostService } from '../post.service';
import { ReviewNote } from '../review-note/review-note';

export interface PostViewDialogData {
  id: string;
}

/** Read-only popup: image, title, status, author, dates and full content. */
@Component({
  selector: 'app-post-view-dialog',
  imports: [DatePipe, NgIcon, Avatar, StatusPill, ReviewNote, AiSummary, PostComments],
  template: `
    <article
      class="card flex max-h-[85vh] w-[720px] max-w-[calc(100vw-2rem)] flex-col shadow-xl"
      aria-labelledby="post-view-title"
    >
      <header class="flex items-start gap-3 border-b border-line px-5 py-3">
        <h2 id="post-view-title" class="flex-1 text-lg font-semibold">
          {{ post()?.title ?? 'Loading…' }}
        </h2>
        @if (post(); as p) {
          <app-status-pill [status]="p.status" class="mt-1" />
        }
        <button class="btn-icon -mr-1.5" aria-label="Close" (click)="ref.close()">
          <ng-icon name="lucideX" size="15" />
        </button>
      </header>

      <div class="overflow-y-auto px-5 py-4">
        @if (post(); as p) {
          @if (p.imageUrl && !imageFailed()) {
            <img
              [src]="p.imageUrl"
              [alt]="p.title"
              class="mb-4 max-h-80 w-full rounded-md border border-line bg-surface-2 object-contain"
              (error)="imageFailed.set(true)"
            />
          } @else {
            <div
              class="mb-4 flex h-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-fg-subtle"
            >
              <ng-icon name="lucideImageOff" size="20" />
              <span class="text-xs">{{
                p.imageUrl ? 'Image could not be loaded' : 'No image'
              }}</span>
            </div>
          }

          <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            <span class="flex items-center gap-1.5 text-fg">
              <app-avatar [name]="p.author.name" [size]="20" />
              {{ p.author.name }}
            </span>
            @if (p.createdAt) {
              <span>Created {{ p.createdAt | date: 'MMM d, y, h:mm a' }}</span>
            }
            @if (p.updatedAt) {
              <span>Updated {{ p.updatedAt | date: 'MMM d, y, h:mm a' }}</span>
            }
          </div>

          <app-review-note [post]="p" class="mb-4 block" />

          @if (signedIn()) {
            <app-ai-summary [postId]="p.id" class="mb-4 block" />
          }

          <!-- whitespace-pre-line keeps the author's line breaks; text is escaped by Angular. -->
          <p class="leading-relaxed whitespace-pre-line">{{ p.content }}</p>

          <div class="mt-6 border-t border-line pt-4">
            <app-post-comments [post]="p" />
          </div>
        } @else if (failed()) {
          <p class="py-10 text-center text-fg-muted">Could not load this post.</p>
        } @else {
          <div class="space-y-3 py-2" aria-hidden="true">
            <div class="h-48 animate-pulse rounded-md bg-surface-2"></div>
            <div class="h-3 w-1/3 animate-pulse rounded bg-surface-2"></div>
            <div class="h-3 w-full animate-pulse rounded bg-surface-2"></div>
            <div class="h-3 w-4/5 animate-pulse rounded bg-surface-2"></div>
          </div>
        }
      </div>

      <footer class="flex justify-end border-t border-line px-5 py-3">
        <button class="btn btn-outline" (click)="ref.close()">Close</button>
      </footer>
    </article>
  `,
})
export class PostViewDialog {
  protected readonly ref = inject(DialogRef);
  private readonly data = inject<PostViewDialogData>(DIALOG_DATA);

  protected readonly post = signal<Post | null>(null);
  protected readonly failed = signal(false);
  protected readonly imageFailed = signal(false);
  /** The summary endpoint needs a token (isAuth). */
  protected readonly signedIn = inject(AuthService).isAuthenticated;

  constructor() {
    // Load fresh so the popup always shows the full, saved post.
    inject(PostService)
      .getById(this.data.id)
      .subscribe({
        next: (p) => this.post.set(p),
        error: () => this.failed.set(true),
      });
  }
}

/** `postView.open(id)` — opens the read-only popup. Esc, backdrop click or Close dismiss it. */
@Injectable({ providedIn: 'root' })
export class PostViewService {
  private readonly dialog = inject(Dialog);

  open(id: string): void {
    this.dialog.open<void, PostViewDialogData>(PostViewDialog, {
      data: { id },
      backdropClass: 'app-backdrop',
      ariaLabelledBy: 'post-view-title',
    });
  }
}
