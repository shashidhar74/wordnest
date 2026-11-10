import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-signup-page',
  imports: [ReactiveFormsModule, RouterLink, NgIcon],
  templateUrl: './signup-page.html',
})
export class SignupPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  protected readonly submitting = signal(false);
  protected readonly hidePassword = signal(true);

  // Same rules as the backend's express-validator checks on POST /auth/users.
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const details = this.form.getRawValue();
    this.submitting.set(true);
    this.auth.signup({ ...details, name: details.name.trim() }).subscribe({
      next: () => {
        this.notify.success('Account created — please sign in.');
        // Back to sign-in with the email already filled in.
        void this.router.navigate(['/auth/login'], {
          queryParams: { prefillEmail: details.email },
        });
      },
      // e.g. 409 "Email is already exist!!" — shown as a toast by the error interceptor.
      error: () => this.submitting.set(false),
    });
  }
}
