import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { LoadingBar } from './shared/components/loading-bar/loading-bar';
import { Toaster } from './shared/components/toaster/toaster';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingBar, Toaster],
  template: `
    <app-loading-bar />
    <router-outlet />
    <app-toaster />
  `,
})
export class App {
  // Instantiated here so the saved light/dark theme applies on startup.
  protected readonly theme = inject(ThemeService);
}
