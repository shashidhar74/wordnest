import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { environment } from '../../../environments/environment';

/** Centered, chrome-less layout for sign-in pages. */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  template: `
    <main class="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div class="w-full max-w-sm">
        <div class="mb-6 text-center">
          <span class="block text-2xl font-extrabold tracking-tight text-brand">{{ appName }}</span>
          <span class="text-sm font-medium text-fg-muted">{{ appByline }}</span>
        </div>
        <router-outlet />
      </div>
    </main>
  `,
})
export class AuthLayout {
  protected readonly appName = environment.appName;
  protected readonly appByline = environment.appByline;
}
