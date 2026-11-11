import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ChatDraft, POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, Post } from '../../../core/models';
import { PostService } from '../../posts/post.service';

type CardState = 'open' | 'saving' | 'saved' | 'cancelled' | 'moved';

/**
 * Preview of a post the chat assistant wrote (title + content from Gemini).
 * The creator adds a cover image and saves it as a DRAFT with the normal POST /feed/posts
 * (same validation and image rules as the editor), or moves it to the editor, tries another
 * version, or cancels. Once used, the card locks so a draft can't be saved twice.
 */
@Component({
  selector: 'app-chat-draft-card',
  imports: [NgIcon],
  template: `
    <article
      class="mt-1.5 rounded-md border border-line bg-surface p-3 text-sm"
      aria-label="Post draft"
    >
      <p class="mb-1 flex flex-wrap items-center gap-1.5 text-2xs text-fg-subtle uppercase">
        <ng-icon name="lucideSparkles" size="11" class="text-brand" />
        Draft · {{ draft().tone }} · {{ draft().topic }}
      </p>
      <h3 class="font-semibold text-fg">{{ draft().title }}</h3>
      <!-- the full text, scrollable; Angular escapes it, so it can't inject HTML -->
      <p class="mt-1 max-h-36 overflow-y-auto leading-relaxed whitespace-pre-line text-fg-muted">
        {{ draft().content }}
      </p>

      @if (state() === 'open' || state() === 'saving') {
        <div class="mt-2.5">
          <input
            #picker
            type="file"
            class="sr-only"
            [accept]="acceptTypes"
            (change)="pick(picker)"
          />
          @if (previewUrl(); as src) {
            <div class="flex items-end gap-2">
              <img
                [src]="src"
                alt="Cover image preview"
                class="h-16 w-24 rounded border border-line object-cover"
              />
              <button
                type="button"
                class="btn btn-ghost h-6 px-2 text-xs"
                [disabled]="state() === 'saving'"
                (click)="picker.click()"
              >
                Change image
              </button>
            </div>
          } @else {
            <button type="button" class="btn btn-outline" (click)="picker.click()">
              <ng-icon name="lucideImage" size="14" />
              Add cover image
            </button>
          }
          @if (imageError(); as err) {
            <p class="field-error">{{ err }}</p>
          }
        </div>

        <div class="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="!image() || state() === 'saving'"
            [title]="image() ? '' : 'Add a cover image first: every post needs one'"
            (click)="save()"
          >
            <ng-icon
              [name]="state() === 'saving' ? 'lucideLoaderCircle' : 'lucideSave'"
              size="13"
              [class.animate-spin]="state() === 'saving'"
            />
            {{ state() === 'saving' ? 'Saving…' : 'Save as draft' }}
          </button>
          <button
            type="button"
            class="btn btn-outline"
            [disabled]="state() === 'saving'"
            (click)="moveToEditor()"
          >
            Open in editor
          </button>
          <button
            type="button"
            class="btn btn-ghost"
            [disabled]="state() === 'saving'"
            (click)="tryAnother()"
          >
            Try another
          </button>
          <button
            type="button"
            class="btn btn-ghost"
            [disabled]="state() === 'saving'"
            (click)="cancel()"
          >
            Cancel
          </button>
        </div>
      } @else {
        <p class="mt-2 text-xs text-fg-subtle">
          @switch (state()) {
            @case ('saved') {
              Saved as a draft.
            }
            @case ('moved') {
              Opened in the editor.
            }
            @case ('cancelled') {
              Cancelled.
            }
          }
        </p>
      }
    </article>
  `,
})
export class ChatDraftCard {
  private readonly posts = inject(PostService);

  readonly draft = input.required<ChatDraft>();
  /** The post was created (status: draft). */
  readonly saved = output<Post>();
  /** Continue in the editor with this title and content. */
  readonly edit = output<ChatDraft>();
  /** Ask the assistant for another version (same topic and tone). */
  readonly retry = output<ChatDraft>();

  protected readonly acceptTypes = POST_IMAGE_TYPES.join(',');
  protected readonly state = signal<CardState>('open');
  protected readonly image = signal<File | null>(null);
  protected readonly imageError = signal<string | null>(null);
  protected readonly previewUrl = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.setPreview(null));
  }

  /** Same rules as the post editor and the backend: PNG/JPG, at most 2 MB. */
  protected pick(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!POST_IMAGE_TYPES.includes(file.type)) {
      this.imageError.set('Only PNG or JPG images are allowed.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      this.imageError.set('Image must be 2 MB or smaller.');
      return;
    }
    this.imageError.set(null);
    this.image.set(file);
    this.setPreview(URL.createObjectURL(file));
  }

  protected save(): void {
    const { title, content } = this.draft();
    const image = this.image();
    if (!title || !content || !image || this.state() === 'saving') return;
    this.state.set('saving');
    // The backend always creates new posts as drafts; the creator submits for review later.
    this.posts.create({ title, content, status: 'draft' }, image).subscribe({
      next: (post) => {
        this.state.set('saved');
        this.saved.emit(post);
      },
      error: () => this.state.set('open'), // the error interceptor shows the message
    });
  }

  protected moveToEditor(): void {
    this.state.set('moved');
    this.edit.emit(this.draft());
  }

  protected tryAnother(): void {
    this.state.set('cancelled');
    this.retry.emit(this.draft());
  }

  protected cancel(): void {
    this.state.set('cancelled');
  }

  private setPreview(url: string | null): void {
    const old = this.previewUrl();
    if (old) URL.revokeObjectURL(old);
    this.previewUrl.set(url);
  }
}
