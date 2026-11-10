import { Component, input } from '@angular/core';

/** Page title + optional subtitle, with a slot on the right for actions. */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="mt-0.5 text-fg-muted">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
