import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'app.theme';

/**
 * Toggles light/dark mode by setting a `dark` class on <html>. Angular Material
 * follows via `color-scheme`, Tailwind via the custom `dark:` variant.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<Theme>(this.initialTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      this.document.documentElement.classList.toggle('dark', theme === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* storage unavailable */
      }
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  private initialTheme(): Theme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* storage unavailable */
    }
    // matchMedia is missing in some environments (e.g. jsdom in unit tests).
    const prefersDark = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    return prefersDark?.matches ? 'dark' : 'light';
  }
}
