import { Component, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-toaster',
  imports: [NgIcon],
  template: `
    <div
      class="pointer-events-none fixed right-4 bottom-4 z-[1100] flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      @for (toast of notify.toasts(); track toast.id) {
        <div
          class="card pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 shadow-lg"
          role="status"
        >
          @switch (toast.kind) {
            @case ('success') {
              <ng-icon name="lucideCircleCheck" class="mt-0.5 text-emerald-600" size="15" />
            }
            @case ('error') {
              <ng-icon name="lucideCircleAlert" class="mt-0.5 text-red-600" size="15" />
            }
            @default {
              <ng-icon name="lucideInfo" class="mt-0.5 text-brand" size="15" />
            }
          }
          <p class="flex-1 text-sm">{{ toast.message }}</p>
          <button
            class="btn-icon -my-1 -mr-1 size-6"
            aria-label="Dismiss"
            (click)="notify.dismiss(toast.id)"
          >
            <ng-icon name="lucideX" size="13" />
          </button>
        </div>
      }
    </div>
  `,
})
export class Toaster {
  protected readonly notify = inject(NotificationService);
}
