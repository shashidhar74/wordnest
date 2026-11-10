import { Component, inject } from '@angular/core';
import { LoadingService } from '../../../core/services/loading.service';

/** 2px indeterminate bar pinned to the top of the viewport while HTTP calls are in flight. */
@Component({
  selector: 'app-loading-bar',
  styles: `
    @keyframes slide {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(250%);
      }
    }
    .bar {
      animation: slide 1.1s ease-in-out infinite;
    }
  `,
  template: `
    @if (loading.isLoading()) {
      <div
        class="fixed inset-x-0 top-0 z-[1100] h-0.5 overflow-hidden bg-brand/15"
        role="progressbar"
        aria-label="Loading"
      >
        <div class="bar h-full w-2/5 bg-brand"></div>
      </div>
    }
  `,
})
export class LoadingBar {
  protected readonly loading = inject(LoadingService);
}
