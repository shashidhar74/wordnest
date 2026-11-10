import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from '../services/auth.service';

/** Attaches `Authorization: Bearer <token>` to requests aimed at our API. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  const isApiRequest = req.url.startsWith(inject(API_BASE_URL));

  if (!token || !isApiRequest) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
