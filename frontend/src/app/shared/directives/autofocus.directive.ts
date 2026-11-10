import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: '[appAutofocus]',
})
export class AutofocusDirective {
  private el = inject(ElementRef<HTMLElement>);

  constructor() {
    afterNextRender(() => this.el.nativeElement.focus());
  }
}
