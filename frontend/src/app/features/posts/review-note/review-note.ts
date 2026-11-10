import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Post } from '../../../core/models';

/**
 * Shows the admin's review comment on a post (from Send back / Reject).
 * The backend keeps only the latest comment, so on other statuses it's labelled as "last".
 */
@Component({
  selector: 'app-review-note',
  imports: [DatePipe, NgIcon],
  template: `
    @if (post().reviewComment; as comment) {
      <aside
        class="rounded-md border px-4 py-3 text-sm"
        [class]="tone()"
        role="note"
        aria-label="Review comment"
      >
        <p class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold">
          <ng-icon [name]="icon()" size="14" />
          {{ heading() }}
          @if (post().reviewedAt) {
            <span class="text-xs font-normal opacity-75">
              · {{ post().reviewedAt | date: 'MMM d, y, h:mm a' }}
            </span>
          }
        </p>
        <!-- whitespace-pre-line keeps the reviewer's line breaks; text is escaped by Angular. -->
        <p class="whitespace-pre-line text-fg">{{ comment }}</p>
      </aside>
    }
  `,
})
export class ReviewNote {
  readonly post = input.required<Post>();

  protected readonly heading = computed(() => {
    switch (this.post().status) {
      case 'clarification':
        return 'Changes requested by the reviewer';
      case 'rejected':
        return 'Rejected — reason';
      default:
        return 'Last review comment';
    }
  });

  protected readonly icon = computed(() =>
    this.post().status === 'rejected' ? 'lucideCircleX' : 'lucideMessageSquare',
  );

  protected readonly tone = computed(() => {
    switch (this.post().status) {
      case 'clarification':
        return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200';
      case 'rejected':
        return 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200';
      default:
        return 'border-line bg-surface-2 text-fg-muted';
    }
  });
}
