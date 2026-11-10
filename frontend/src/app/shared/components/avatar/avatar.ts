import { Component, computed, input } from '@angular/core';

/** Initials badge, e.g. "MC" for Maya Chen. `shape="square"` matches the table's vendor/author chips. */
@Component({
  selector: 'app-avatar',
  host: { class: 'inline-flex shrink-0' },
  template: `
    <span
      class="inline-flex items-center justify-center font-semibold uppercase select-none"
      [class]="
        shape() === 'round'
          ? 'rounded-full bg-brand-soft text-brand'
          : 'rounded bg-surface-2 text-fg-muted ring-1 ring-line'
      "
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.4"
      [attr.title]="name()"
    >
      {{ initials() }}
    </span>
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input(24);
  readonly shape = input<'round' | 'square'>('round');

  // `?? ''` guards against bad data at runtime (e.g. an API sending no name).
  protected readonly initials = computed(() =>
    (this.name() ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join(''),
  );
}
