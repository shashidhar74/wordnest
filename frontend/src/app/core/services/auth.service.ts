import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ENDPOINTS } from '../config/api.config';
import {
  AuthResponse,
  LoginRequest,
  SignupRequest,
  SignupResponse,
  TokenPayload,
  User,
} from '../models';
import { ApiService } from './api.service';
import { TokenStorageService } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<User | null>(null);
  private readonly _token = signal<string | null>(this.tokenStorage.get());

  readonly currentUser = this._currentUser.asReadonly();
  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());
  /** Signed-in user's role (from the JWT); undefined if the token has none. */
  readonly role = computed(() => this._currentUser()?.role);

  login(credentials: LoginRequest): Observable<User> {
    return this.api.post<AuthResponse>(API_ENDPOINTS.auth.login, credentials).pipe(
      map((res) => {
        // Prefer the user object if the backend sends one; otherwise build it from the JWT.
        const user =
          res.user ??
          userFromToken(res.token) ??
          ({
            id: String(res.userId ?? ''),
            name: credentials.email,
            email: credentials.email,
          } as User);
        this.tokenStorage.set(res.token);
        this._token.set(res.token);
        this._currentUser.set(user);
        return user;
      }),
    );
  }

  /** Restores the session on app start when a token is already stored. */
  loadCurrentUser(): Observable<User | null> {
    const token = this._token();
    if (!token) return of(null);

    // The mock backend issues fake tokens, so ask it (GET /auth/me) who the user is.
    if (environment.mock.auth) {
      return this.api.get<User>(API_ENDPOINTS.auth.me).pipe(
        tap((user) => this._currentUser.set(user)),
        catchError(() => {
          this.clearSession();
          return of(null);
        }),
      );
    }

    // Real backend: read the user from the JWT. An unreadable or expired token means signed out.
    const user = userFromToken(token);
    if (!user) this.clearSession();
    else this._currentUser.set(user);
    return of(user);
  }

  /** Creates the account only — it does not sign the user in. */
  signup(details: SignupRequest): Observable<SignupResponse> {
    return this.api.post<SignupResponse>(API_ENDPOINTS.auth.signup, details);
  }

  logout(): void {
    this.clearSession();
    void this.router.navigate(['/auth/login']);
  }

  clearSession(): void {
    this.tokenStorage.clear();
    this._token.set(null);
    this._currentUser.set(null);
  }
}

/**
 * Reads the user from a JWT's payload (the middle part of `header.payload.signature`).
 * This only *reads* the token for display — the backend still verifies it on every request.
 * Returns null if the token isn't a JWT or has expired.
 */
function userFromToken(token: string): User | null {
  const payload = decodeJwt(token);
  if (!payload?.userId) return null;
  if (payload.exp && payload.exp * 1000 <= Date.now()) return null; // expired

  const email = payload.email ?? '';
  return { id: String(payload.userId), email, name: payload.name ?? email, role: payload.role };
}

function decodeJwt(token: string): TokenPayload | null {
  try {
    const part = token.split('.')[1];
    // base64url → base64, then decode as UTF-8.
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      [...atob(base64)].map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}
