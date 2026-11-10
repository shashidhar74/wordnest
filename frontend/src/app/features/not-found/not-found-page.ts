import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <main
      class="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-4 text-center"
    >
      <p class="font-mono text-5xl font-semibold text-brand">404</p>
      <p class="text-fg-muted">The page you're looking for doesn't exist.</p>
      <a routerLink="/" class="btn btn-primary mt-1">Go home</a>
    </main>
  `,
})
export class NotFoundPage {}
