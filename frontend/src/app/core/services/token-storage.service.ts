import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Persists the JWT. Swap to sessionStorage or an httpOnly-cookie flow if required. */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly key = environment.tokenStorageKey;

  get(): string | null {
    try {
      return localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }

  set(token: string): void {
    localStorage.setItem(this.key, token);
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }
}
