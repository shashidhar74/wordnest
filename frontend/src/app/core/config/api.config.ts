import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Base URL for all backend REST calls, e.g. `/api` or `https://api.example.com/api`. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});

/** Every backend endpoint the app calls. */
export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    me: '/auth/me',
    // Matches the Node backend: router.post('/users', …) under app.use('/auth', …)
    signup: '/auth/users',
  },
  // Matches the Node backend route: app.use('/feed', feedRoutes) → /feed/posts
  posts: '/feed/posts',
  ai: {
    // POST /feed/posts/:id/summary is built from `posts` in PostService.
    generatePost: '/feed/ai/generate-post',
  },
  // Threaded comments (backend routes/comments.js, mounted at /feed)
  comments: {
    forPost: (postId: string | number) => `/feed/posts/${postId}/comments`,
    byId: (commentId: string | number) => `/feed/comments/${commentId}`,
  },
  // Blog chatbot. Faked by the mock backend while `environment.mock.chat` is true.
  chat: '/chat',
} as const;
