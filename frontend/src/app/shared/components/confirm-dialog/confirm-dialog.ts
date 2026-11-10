import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';

/** Optional comment box inside the dialog (e.g. reason for Reject / Send back). */
export interface ConfirmComment {
  label: string;
  placeholder?: string;
  /** Confirm stays disabled until something is typed. */
  required?: boolean;
}

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** Class for the confirm button, e.g. 'btn-success' — overrides `danger`. */
  confirmClass?: string;
  comment?: ConfirmComment;
}

/** Result when confirmed: `{ comment }` ('' if the dialog had no comment box). */
export interface ConfirmResult {
  comment: string;
}

/** Yes/no dialog, optionally with a comment box. Closes with a ConfirmResult, or nothing if cancelled. */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <form
      class="card w-[440px] max-w-[calc(100vw-2rem)] p-5 shadow-xl"
      (submit)="$event.preventDefault(); confirm()"
    >
      <h2 class="text-md font-semibold">{{ data.title }}</h2>
      <p class="mt-1.5 text-fg-muted">{{ data.message }}</p>

      @if (data.comment; as c) {
        <label class="label mt-4" for="confirm-comment">
          {{ c.label }}
          @if (c.required) {
            <span class="text-red-600">*</span>
          }
        </label>
        <textarea
          id="confirm-comment"
          rows="4"
          class="input h-auto py-2"
          [placeholder]="c.placeholder ?? ''"
          [value]="comment()"
          (input)="comment.set($any($event.target).value)"
        ></textarea>
      }

      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="btn btn-outline" (click)="ref.close()">
          {{ data.cancelText ?? 'Cancel' }}
        </button>
        <button
          type="submit"
          [class]="'btn ' + (data.confirmClass ?? (data.danger ? 'btn-danger' : 'btn-primary'))"
          [disabled]="!canConfirm()"
        >
          {{ data.confirmText ?? 'Confirm' }}
        </button>
      </div>
    </form>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ConfirmResult>>(DialogRef);

  protected readonly comment = signal('');
  protected readonly canConfirm = computed(
    () => !this.data.comment?.required || this.comment().trim().length > 0,
  );

  protected confirm(): void {
    if (this.canConfirm()) this.ref.close({ comment: this.comment().trim() });
  }
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(Dialog);

  /** `confirm.ask({ title, message }).subscribe(ok => …)` — true if confirmed. */
  ask(data: ConfirmDialogData): Observable<boolean> {
    return this.open(data).pipe(map(Boolean));
  }

  /** Like ask(), but also returns what was typed: `{ comment }` if confirmed, `undefined` if cancelled. */
  open(data: ConfirmDialogData): Observable<ConfirmResult | undefined> {
    return this.dialog.open<ConfirmResult, ConfirmDialogData>(ConfirmDialog, {
      data,
      backdropClass: 'app-backdrop',
    }).closed;
  }
}
