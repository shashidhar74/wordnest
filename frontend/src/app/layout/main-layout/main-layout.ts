import { BreakpointObserver } from '@angular/cdk/layout';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { filter, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { ChatPanel } from '../../features/chat/chat-panel/chat-panel';
import { Avatar } from '../../shared/components/avatar/avatar';

interface NavLink {
  label: string;
  icon: string;
  route: string;
  exact?: boolean;
}

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIcon,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    Avatar,
    ChatPanel,
  ],
  templateUrl: './main-layout.html',
  host: {
    '(document:keydown.control.k)': 'focusSearch($event)',
    '(document:keydown.meta.k)': 'focusSearch($event)',
  },
})
export class MainLayout {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly appName = environment.appName;
  protected readonly appByline = environment.appByline;
  protected readonly isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  /** Below `lg` the sidebar overlays the content instead of pushing it. */
  protected readonly isCompact = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 1023.98px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  protected readonly sidebarOpen = signal(true);

  /** "New post" is only for creators. */
  protected readonly nav = computed<NavLink[]>(() => [
    { label: 'All posts', icon: 'lucideNewspaper', route: '/posts', exact: true },
    ...(this.auth.role() === 'creator'
      ? [{ label: 'New post', icon: 'lucidePlus', route: '/posts/new', exact: true }]
      : []),
  ]);

  constructor() {
    // Start collapsed on small screens; re-open when widening.
    effect(() => this.sidebarOpen.set(!this.isCompact()));

    // Close the overlay sidebar after navigating on small screens.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.isCompact() && this.sidebarOpen.set(false));
  }

  protected focusSearch(event: Event): void {
    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }

  /** Enter in the top search box → Posts filtered by that text. */
  protected search(input: HTMLInputElement): void {
    const search = input.value.trim();
    void this.router.navigate(['/posts'], { queryParams: search ? { search } : {} });
    input.value = '';
    input.blur();
  }
}
