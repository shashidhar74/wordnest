import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./layout/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: 'login',
        title: 'Sign in',
        loadComponent: () => import('./features/auth/login/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'signup',
        title: 'Sign up',
        loadComponent: () => import('./features/auth/signup/signup-page').then((m) => m.SignupPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: 'posts',
        title: 'Posts',
        loadComponent: () =>
          import('./features/posts/post-list/post-list-page').then((m) => m.PostListPage),
      },
      {
        path: 'posts/new',
        title: 'New post',
        canActivate: [roleGuard('creator')],
        loadComponent: () =>
          import('./features/posts/post-editor/post-editor-page').then((m) => m.PostEditorPage),
      },
      {
        path: 'posts/:id',
        title: 'Edit post',
        loadComponent: () =>
          import('./features/posts/post-editor/post-editor-page').then((m) => m.PostEditorPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'posts' },
    ],
  },
  {
    path: '**',
    title: 'Not found',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
