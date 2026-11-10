import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

describe('ConfirmDialog', () => {
  function setup(data: ConfirmDialogData) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [ConfirmDialog],
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const confirmButton = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    return { fixture, el, close, confirmButton };
  }

  it('confirms without a comment box', () => {
    const { close, confirmButton } = setup({ title: 'Approve post', message: 'Sure?' });
    expect(confirmButton.disabled).toBe(false);
    confirmButton.click();
    expect(close).toHaveBeenCalledWith({ comment: '' });
  });

  it('keeps Confirm disabled until a required comment is typed, then returns it', async () => {
    const { fixture, el, close, confirmButton } = setup({
      title: 'Reject post',
      message: 'Sure?',
      comment: { label: 'Reason', required: true },
    });

    expect(confirmButton.disabled).toBe(true);

    const textarea = el.querySelector('textarea')!;
    textarea.value = '  Not suitable  ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(confirmButton.disabled).toBe(false);
    confirmButton.click();
    expect(close).toHaveBeenCalledWith({ comment: 'Not suitable' });
  });

  it('closes with nothing when cancelled', () => {
    const { el, close } = setup({ title: 'Reject post', message: 'Sure?' });
    el.querySelector<HTMLButtonElement>('button[type=button]')!.click();
    expect(close).toHaveBeenCalledWith();
  });
});
