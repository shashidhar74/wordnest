import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, NgIcon],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from the `?returnUrl=` query param (withComponentInputBinding). */
  readonly returnUrl = input<string>();
  /** `?prefillEmail=` — set after a successful sign-up so the user only types the password. */
  readonly prefillEmail = input<string>();

  protected readonly mockAuth = environment.mock.auth;
  protected readonly submitting = signal(false);
  protected readonly hidePassword = signal(true);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    effect(() => {
      const email = this.prefillEmail();
      if (email) untracked(() => this.form.controls.email.setValue(email));
    });
  }

  protected fillDemo(email: string, password: string): void {
    this.form.setValue({ email, password });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigateByUrl(this.returnUrl() || '/posts'),
      // Error toast is shown by the error interceptor.
      error: () => this.submitting.set(false),
    });
  }
}
