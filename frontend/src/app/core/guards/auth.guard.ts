import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models';

/** Allows the route only for signed-in users; otherwise redirects to login. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/** Keeps signed-in users away from the login page. */
export const guestGuard: CanActivateFn = () =>
  inject(AuthService).isAuthenticated() ? inject(Router).createUrlTree(['/posts']) : true;

/** Allows the route only for the given roles, e.g. `canActivate: [roleGuard('creator')]`. */
export const roleGuard =
  (...roles: UserRole[]): CanActivateFn =>
  () => {
    const role = inject(AuthService).role();
    return role && roles.includes(role) ? true : inject(Router).createUrlTree(['/posts']);
  };
