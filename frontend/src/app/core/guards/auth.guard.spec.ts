import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { TokenStorageService } from '../services/token-storage.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const run = () =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/users' } as RouterStateSnapshot),
    );

  function setup(token: string | null) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: TokenStorageService,
          useValue: { get: () => token, set: () => undefined, clear: () => undefined },
        },
      ],
    });
  }

  it('allows navigation when a token is present', () => {
    setup('abc');
    expect(run()).toBe(true);
  });

  it('redirects to login with returnUrl when signed out', () => {
    setup(null);
    const result = run() as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/auth/login?returnUrl=%2Fusers');
  });
});
