import {
  afterNextRender,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgControl } from '@angular/forms';

@Directive({
  selector: 'input[appCharCount],textarea[appCharCount]',
  host: {
    '(input)': 'update()',
    '[class.input-invalid]': 'tooLong()',
  },
})
export class CharCountDirective {
  readonly appCharCount = input.required<number>();

  private readonly el = inject(ElementRef<HTMLInputElement>);
  private readonly length = signal(0);
  private readonly counter = document.createElement('p');
  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.counter.className = 'mt-1 text-xs text-fg-muted ml-auto';
    this.el.nativeElement.after(this.counter);

    effect(() => {
      this.counter.textContent = `${this.length()} / ${this.appCharCount()}`;
      this.counter.classList.toggle('!text-red-600', this.tooLong());
    });

    afterNextRender(() => {
      this.update();
      this.ngControl?.valueChanges
        ?.pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.update());
    });

    this.destroyRef.onDestroy(() => this.counter.remove());
  }

  protected update() {
    this.length.set(this.el.nativeElement.value.length);
  }

  protected tooLong() {
    return this.length() > this.appCharCount();
  }

  //   afterNextRender(()=>{
  //     this.update()
  //   })
}
