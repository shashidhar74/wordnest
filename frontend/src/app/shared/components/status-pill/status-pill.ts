import { Component, computed, input } from '@angular/core';
import { POST_STATUS, PostStatus } from '../../../core/models';

/** Coloured pill for a post's status (Draft / Published). */
@Component({
  selector: 'app-status-pill',
  template: `<span class="pill" [class]="'tone-' + meta().tone">{{ meta().label }}</span>`,
})
export class StatusPill {
  readonly status = input.required<PostStatus>();
  protected readonly meta = computed(() => POST_STATUS[this.status()]);
}
