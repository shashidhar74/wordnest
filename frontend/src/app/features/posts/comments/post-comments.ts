import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { filter } from 'rxjs';
import { COMMENT_MAX_LENGTH, CommentNode, Post } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { ConfirmService } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { CommentService } from './comment.service';

/** Where the open reply box is: under top-level comment `rootId`, answering comment `parentId`. */
interface ReplyTarget {
  rootId: number;
  parentId: number;
}

/**
 * Threaded comments under a post (2 levels: comments + replies).
 * - Anyone who can see the post can read; logged-in users can comment on PUBLISHED posts.
 * - Authors edit/delete their own comments; admins can delete any.
 * - After every change the thread is reloaded, so it always matches the server.
 */
@Component({
  selector: 'app-post-comments',
  imports: [DatePipe, NgTemplateOutlet, NgIcon, Avatar],
  template: `
    <section aria-labelledby="comments-title">
      <h3 id="comments-title" class="mb-3 flex items-center gap-1.5 text-md font-semibold">
        <ng-icon name="lucideMessageSquare" size="15" class="text-fg-muted" />
        Comments
        @if (total() > 0) {
          <span class="text-sm font-normal text-fg-muted">({{ total() }})</span>
        }
      </h3>

      <!-- New top-level comment -->
      @if (canComment()) {
        <div class="mb-4 flex gap-2.5">
          <app-avatar [name]="myName()" [size]="28" class="mt-0.5" />
          <div class="min-w-0 flex-1">
            <textarea
              #newBox
              class="input h-auto py-2 leading-relaxed"
              rows="2"
              placeholder="Write a comment…"
              aria-label="Write a comment"
              [maxLength]="max"
              [value]="newText()"
              (input)="newText.set(newBox.value)"
              (keydown.control.enter)="addComment()"
              (keydown.meta.enter)="addComment()"
            ></textarea>
            <div class="mt-1.5 flex items-center justify-between gap-2">
              <span class="text-xs text-fg-subtle"
                >{{ newText().length }}/{{ max }} · Ctrl+Enter to post</span
              >
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="busy() || !newText().trim()"
                (click)="addComment()"
              >
                <ng-icon name="lucideSend" size="13" />
                Comment
              </button>
            </div>
          </div>
        </div>
      } @else if (post().status !== 'published') {
        <p class="mb-4 rounded-md bg-surface-2 px-3 py-2 text-sm text-fg-muted">
          Comments open once the post is published.
        </p>
      }

      <!-- Thread -->
      @if (loading() && !loaded()) {
        <div class="space-y-3" aria-hidden="true">
          <div class="h-12 animate-pulse rounded-md bg-surface-2"></div>
          <div class="ml-10 h-10 animate-pulse rounded-md bg-surface-2"></div>
        </div>
      } @else if (failed()) {
        <p class="text-sm text-fg-muted">
          Couldn't load comments.
          <button type="button" class="font-medium text-brand hover:underline" (click)="load()">
            Try again
          </button>
        </p>
      } @else if (!comments().length) {
        <p class="text-sm text-fg-muted">
          No comments yet.{{ canComment() ? ' Be the first!' : '' }}
        </p>
      } @else {
        <ul class="space-y-4">
          @for (c of comments(); track c.id) {
            <li>
              <ng-container *ngTemplateOutlet="item; context: { $implicit: c, rootId: c.id }" />

              @if (c.replies.length || replyTo()?.rootId === c.id) {
                <ul class="mt-3 ml-5 space-y-3 border-l-2 border-line pl-4">
                  @for (r of c.replies; track r.id) {
                    <li>
                      <ng-container
                        *ngTemplateOutlet="item; context: { $implicit: r, rootId: c.id }"
                      />
                    </li>
                  }

                  <!-- Reply box, under the thread it belongs to -->
                  @if (replyTo()?.rootId === c.id) {
                    <li class="flex gap-2.5">
                      <app-avatar [name]="myName()" [size]="24" class="mt-0.5" />
                      <div class="min-w-0 flex-1">
                        <textarea
                          #replyBox
                          class="input h-auto py-2 leading-relaxed"
                          rows="2"
                          placeholder="Write a reply…"
                          aria-label="Write a reply"
                          [maxLength]="max"
                          [value]="replyText()"
                          (input)="replyText.set(replyBox.value)"
                          (keydown.control.enter)="sendReply()"
                          (keydown.meta.enter)="sendReply()"
                          (keydown.escape)="cancelReply()"
                        ></textarea>
                        <div class="mt-1.5 flex justify-end gap-2">
                          <button type="button" class="btn btn-ghost" (click)="cancelReply()">
                            Cancel
                          </button>
                          <button
                            type="button"
                            class="btn btn-primary"
                            [disabled]="busy() || !replyText().trim()"
                            (click)="sendReply()"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </li>
                  }
                </ul>
              }
            </li>
          }
        </ul>
      }
    </section>

    <!-- One comment (used for both levels) -->
    <ng-template #item let-c let-rootId="rootId">
      <article class="flex gap-2.5">
        @if (c.deleted) {
          <span
            class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-subtle"
          >
            <ng-icon name="lucideTrash2" size="12" />
          </span>
          <p class="py-1 text-sm text-fg-subtle italic">[deleted]</p>
        } @else {
          <app-avatar [name]="c.author?.name ?? '?'" [size]="28" class="mt-0.5" />
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span class="font-medium text-fg">{{ c.author?.name }}</span>
              @if (isMine(c)) {
                <span class="text-2xs text-fg-subtle">(you)</span>
              }
              <span class="text-xs text-fg-subtle">{{
                c.createdAt | date: 'MMM d, y, h:mm a'
              }}</span>
              @if (c.edited) {
                <span class="text-xs text-fg-subtle">(edited)</span>
              }
            </p>

            @if (editingId() === c.id) {
              <!-- Inline edit -->
              <textarea
                #editBox
                class="input mt-1 h-auto py-2 leading-relaxed"
                rows="2"
                aria-label="Edit comment"
                [maxLength]="max"
                [value]="editText()"
                (input)="editText.set(editBox.value)"
                (keydown.control.enter)="saveEdit()"
                (keydown.meta.enter)="saveEdit()"
                (keydown.escape)="editingId.set(null)"
              ></textarea>
              <div class="mt-1.5 flex justify-end gap-2">
                <button type="button" class="btn btn-ghost" (click)="editingId.set(null)">
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="busy() || !editText().trim()"
                  (click)="saveEdit()"
                >
                  Save
                </button>
              </div>
            } @else {
              <!-- whitespace-pre-line keeps line breaks; Angular escapes the text (no HTML injection) -->
              <p class="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-line text-fg">
                {{ c.content }}
              </p>
              <div class="mt-1 flex gap-3 text-xs">
                @if (canComment()) {
                  <button
                    type="button"
                    class="font-medium text-fg-muted hover:text-brand"
                    (click)="startReply(c, rootId)"
                  >
                    Reply
                  </button>
                }
                @if (isMine(c)) {
                  <button
                    type="button"
                    class="font-medium text-fg-muted hover:text-brand"
                    (click)="startEdit(c)"
                  >
                    Edit
                  </button>
                }
                @if (isMine(c) || isAdmin()) {
                  <button
                    type="button"
                    class="font-medium text-fg-muted hover:text-red-600"
                    [disabled]="busy()"
                    (click)="remove(c)"
                  >
                    Delete
                  </button>
                }
              </div>
            }
          </div>
        }
      </article>
    </ng-template>
  `,
})
export class PostComments {
  private readonly api = inject(CommentService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  readonly post = input.required<Post>();

  protected readonly max = COMMENT_MAX_LENGTH;
  protected readonly comments = signal<CommentNode[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);

  protected readonly newText = signal('');
  protected readonly replyTo = signal<ReplyTarget | null>(null);
  protected readonly replyText = signal('');
  protected readonly editingId = signal<number | null>(null);
  protected readonly editText = signal('');

  private readonly me = computed(() => this.auth.currentUser());
  protected readonly myName = computed(() => this.me()?.name ?? '?');
  protected readonly isAdmin = computed(() => this.auth.role() === 'admin');
  /** Same rule as the backend: logged in + published post. */
  protected readonly canComment = computed(() => !!this.me() && this.post().status === 'published');

  constructor() {
    // (Re)load whenever the post changes.
    effect(() => {
      const postId = this.post().id;
      untracked(() => {
        this.loaded.set(false);
        this.resetForms();
        this.load(postId);
      });
    });
  }

  protected isMine(c: CommentNode): boolean {
    const me = this.me();
    return !!me && !!c.author && String(c.author.id) === String(me.id);
  }

  protected load(postId = this.post().id): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.list(postId).subscribe({
      next: (res) => {
        this.comments.set(res.comments);
        this.total.set(res.total);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  // ---- add -------------------------------------------------------------------------

  protected addComment(): void {
    const content = this.newText().trim();
    if (!content || this.busy()) return;
    this.run(this.api.add(this.post().id, { content }), () => this.newText.set(''));
  }

  /** Replying to a reply → the backend keeps it in the same thread; "@name " shows who it answers. */
  protected startReply(c: CommentNode, rootId: number): void {
    this.editingId.set(null);
    this.replyTo.set({ rootId, parentId: c.id });
    this.replyText.set(c.id !== rootId && c.author ? `@${c.author.name} ` : '');
  }

  protected sendReply(): void {
    const target = this.replyTo();
    const content = this.replyText().trim();
    if (!target || !content || this.busy()) return;
    this.run(this.api.add(this.post().id, { content, parentId: target.parentId }), () =>
      this.cancelReply(),
    );
  }

  protected cancelReply(): void {
    this.replyTo.set(null);
    this.replyText.set('');
  }

  // ---- edit ------------------------------------------------------------------------

  protected startEdit(c: CommentNode): void {
    this.cancelReply();
    this.editingId.set(c.id);
    this.editText.set(c.content ?? '');
  }

  protected saveEdit(): void {
    const id = this.editingId();
    const content = this.editText().trim();
    if (id == null || !content || this.busy()) return;
    this.run(this.api.edit(id, content), () => this.editingId.set(null));
  }

  // ---- delete ----------------------------------------------------------------------

  protected remove(c: CommentNode): void {
    const hasReplies = c.replies.length > 0;
    this.confirm
      .ask({
        title: 'Delete comment',
        message: hasReplies
          ? 'Delete this comment? It will show as "[deleted]" and its replies will stay.'
          : 'Delete this comment? This cannot be undone.',
        confirmText: 'Yes, delete',
        danger: true,
      })
      .pipe(filter(Boolean))
      .subscribe(() => this.run(this.api.remove(c.id)));
  }

  // ---- helpers ---------------------------------------------------------------------

  /** Runs a change with the buttons disabled, then reloads the thread. Errors are toasted by the interceptor. */
  private run(request$: ReturnType<CommentService['remove']>, done?: () => void): void {
    this.busy.set(true);
    request$.subscribe({
      next: () => {
        this.busy.set(false);
        done?.();
        this.load();
      },
      error: () => this.busy.set(false),
    });
  }

  private resetForms(): void {
    this.newText.set('');
    this.cancelReply();
    this.editingId.set(null);
  }
}
