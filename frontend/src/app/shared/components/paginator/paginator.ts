import { Component, computed, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

export interface PageChange {
  page: number; // 1-based
  limit: number;
}

/** Compact table footer: "1–25 of 48", page size, prev/next. */
@Component({
  selector: 'app-paginator',
  imports: [NgIcon],
  template: `
    <div class="flex items-center justify-end gap-4 px-3 py-1.5 text-xs text-fg-muted">
      <label class="flex items-center gap-1.5">
        Rows
        <select
          class="h-6 rounded border border-line bg-surface px-1 text-xs text-fg"
          [value]="limit()"
          (change)="changed.emit({ page: 1, limit: +$any($event.target).value })"
        >
          @for (size of sizes(); track size) {
            <option [value]="size">{{ size }}</option>
          }
        </select>
      </label>
      <span class="tabular">{{ from() }}–{{ to() }} of {{ total() }}</span>
      <div class="flex">
        <button
          class="btn-icon size-6"
          aria-label="First page"
          [disabled]="page() <= 1"
          (click)="go(1)"
        >
          <ng-icon name="lucideChevronsLeft" size="14" />
        </button>
        <button
          class="btn-icon size-6"
          aria-label="Previous page"
          [disabled]="page() <= 1"
          (click)="go(page() - 1)"
        >
          <ng-icon name="lucideChevronLeft" size="14" />
        </button>
        <button
          class="btn-icon size-6"
          aria-label="Next page"
          [disabled]="page() >= pages()"
          (click)="go(page() + 1)"
        >
          <ng-icon name="lucideChevronRight" size="14" />
        </button>
        <button
          class="btn-icon size-6"
          aria-label="Last page"
          [disabled]="page() >= pages()"
          (click)="go(pages())"
        >
          <ng-icon name="lucideChevronsRight" size="14" />
        </button>
      </div>
    </div>
  `,
})
export class Paginator {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly limit = input.required<number>();
  readonly sizes = input([10, 25, 50]);
  readonly changed = output<PageChange>();

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit())));
  protected readonly from = computed(() =>
    this.total() ? (this.page() - 1) * this.limit() + 1 : 0,
  );
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.limit()));

  protected go(page: number): void {
    this.changed.emit({ page, limit: this.limit() });
  }
}
