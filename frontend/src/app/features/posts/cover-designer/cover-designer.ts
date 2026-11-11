import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { API_ENDPOINTS } from '../../../core/config/api.config';
import { CoverDesignResponse } from '../../../core/models';
import { ApiService } from '../../../core/services/api.service';
import { drawCover } from './draw-cover';

/**
 * "Design a cover with AI": Gemini designs it (colours, pattern, emoji, tagline from the post), the browser
 * draws a 1200×630 PNG, the creator previews it and clicks "Use this cover". It's then handed to the parent
 * as a File, so it goes through exactly the same checks and upload as an image from the computer.
 * No third-party images, no licences.
 */
@Component({
  selector: 'app-cover-designer',
  imports: [NgIcon],
  template: `
    @if (!preview()) {
      <button
        type="button"
        class="btn btn-outline"
        [disabled]="busy() || title().trim().length < 3"
        [title]="title().trim().length < 3 ? 'Write a title first' : ''"
        (click)="design()"
      >
        <ng-icon
          [name]="busy() ? 'lucideLoaderCircle' : 'lucideSparkles'"
          size="14"
          class="text-brand"
          [class.animate-spin]="busy()"
        />
        {{ busy() ? 'Designing…' : used() ? 'Design another cover' : 'Design a cover with AI' }}
      </button>
    } @else {
      <figure
        class="rounded-md border border-line bg-surface-2 p-2.5"
        aria-label="AI cover preview"
      >
        <img
          [src]="preview()"
          alt="AI-designed cover preview"
          class="aspect-[1200/630] w-full max-w-md rounded border border-line"
        />
        <figcaption class="mt-1.5 text-2xs text-fg-subtle">
          {{
            source() === 'gemini'
              ? 'Designed by Gemini from your post.'
              : 'Gemini was busy: a built-in design was used.'
          }}
        </figcaption>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="use()">
            <ng-icon name="lucideCheck" size="13" />
            Use this cover
          </button>
          <button type="button" class="btn btn-outline" [disabled]="busy()" (click)="design()">
            <ng-icon
              [name]="busy() ? 'lucideLoaderCircle' : 'lucideRotateCcw'"
              size="13"
              [class.animate-spin]="busy()"
            />
            Try another
          </button>
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="close()">
            Close
          </button>
        </div>
      </figure>
    }
  `,
})
export class CoverDesigner {
  private readonly api = inject(ApiService);

  readonly title = input.required<string>();
  readonly content = input('');
  /** The cover the creator chose, as a PNG File. */
  readonly chosen = output<File>();

  protected readonly busy = signal(false);
  protected readonly preview = signal<string | null>(null);
  protected readonly source = signal<'gemini' | 'preset'>('gemini');
  protected readonly used = signal(false);
  private blob: Blob | null = null;
  private attempt = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.setPreview(null));
  }

  protected design(): void {
    const title = this.title().trim();
    this.busy.set(true);
    this.api
      .post<CoverDesignResponse>(API_ENDPOINTS.ai.coverDesign, {
        title,
        content: this.content().slice(0, 20000),
      })
      .subscribe({
        next: async ({ design, source }) => {
          try {
            this.blob = await drawCover(design, title, ++this.attempt);
            this.source.set(source);
            this.setPreview(URL.createObjectURL(this.blob));
          } finally {
            this.busy.set(false);
          }
        },
        error: () => this.busy.set(false), // the error interceptor shows the message
      });
  }

  protected use(): void {
    if (!this.blob) return;
    const type = this.blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const name = `cover-${Date.now()}.${type === 'image/jpeg' ? 'jpg' : 'png'}`;
    this.chosen.emit(new File([this.blob], name, { type }));
    this.used.set(true);
    this.close();
  }

  protected close(): void {
    this.setPreview(null);
    this.blob = null;
  }

  private setPreview(url: string | null): void {
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.preview.set(url);
  }
}
