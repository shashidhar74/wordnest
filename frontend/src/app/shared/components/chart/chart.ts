import {
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  input,
  viewChild,
} from '@angular/core';
import type { Options } from 'highcharts';
import Highcharts from 'highcharts/esm/highcharts.js';
import 'highcharts/esm/modules/accessibility.js';
import 'highcharts/esm/modules/sankey.js';

/**
 * Draws one Highcharts chart from an `options` object and redraws it whenever the options change.
 * The chart fills its host element and follows its size (ResizeObserver), so give the host a height.
 *
 *   <app-chart class="h-64" [options]="myOptions()" />
 *
 * Highcharts is only loaded by pages that use this component (lazy routes), not by the whole app.
 * Licence: free for personal / non-commercial projects; a commercial product needs a Highcharts licence.
 */
@Component({
  selector: 'app-chart',
  template: `<div #box class="size-full"></div>`,
  host: { class: 'block min-h-0 min-w-0' },
})
export class Chart implements OnDestroy {
  readonly options = input.required<Options>();

  private readonly box = viewChild.required<ElementRef<HTMLDivElement>>('box');
  private chart?: Highcharts.Chart;
  // Missing in some test environments (jsdom), so only create it when the browser has it.
  private readonly resizer =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => this.chart?.reflow());

  constructor() {
    // Runs after Angular has rendered the <div>, and again whenever `options()` changes.
    afterRenderEffect(() => {
      const options = this.options();
      const el = this.box().nativeElement;
      this.chart?.destroy();
      this.chart = Highcharts.chart(el, options);
      this.resizer?.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.resizer?.disconnect();
    this.chart?.destroy();
  }
}
