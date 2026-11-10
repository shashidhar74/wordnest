import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_ENDPOINTS } from '../config/api.config';
import { ApiError } from '../models';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

/**
 * Normalises backend errors into `ApiError`, shows a snackbar, and signs the
 * user out on 401. Expects Node errors shaped like `{ message }`.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);

      const apiError: ApiError = {
        status: err.status,
        message: err.error?.message ?? defaultMessage(err.status),
      };

      const isSessionCheck = req.url.endsWith(API_ENDPOINTS.auth.me);
      const isLogin = req.url.endsWith(API_ENDPOINTS.auth.login);

      if (err.status === 401 && !isLogin) {
        auth.clearSession();
        if (!isSessionCheck) {
          void router.navigate(['/auth/login'], { queryParams: { returnUrl: router.url } });
        }
      }

      // The silent session-restore call on startup should not raise a toast.
      if (!isSessionCheck) notify.error(apiError.message);

      return throwError(() => apiError);
    }),
  );
};

function defaultMessage(status: number): string {
  switch (status) {
    case 0:
      return 'Cannot reach the server. Is the backend running?';
    case 400:
      return 'The request was invalid.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You do not have permission to do that.';
    case 404:
      return 'The requested resource was not found.';
    default:
      return status >= 500 ? 'Server error. Please try again later.' : 'Something went wrong.';
  }
}
