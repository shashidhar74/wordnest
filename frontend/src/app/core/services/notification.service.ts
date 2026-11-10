import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

/** Signal-based toast queue, rendered by <app-toaster> in the root component. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  success(message: string): void {
    this.show('success', message, 3000);
  }

  error(message: string): void {
    this.show('error', message, 5000);
  }

  info(message: string): void {
    this.show('info', message, 3000);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private show(kind: Toast['kind'], message: string, duration: number): void {
    const id = this.nextId++;
    // Keep at most 3 on screen.
    this._toasts.update((list) => [...list.slice(-2), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), duration);
  }
}
