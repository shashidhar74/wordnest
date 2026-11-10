// Development environment. Requests to `/api` are forwarded to the Node.js
// backend by the dev-server proxy (see proxy.conf.json → http://localhost:3000).
export const environment = {
  production: false,
  appName: 'WordNest',
  appByline: 'by Shashi',
  apiBaseUrl: '/api',
  // In-browser fake backend (src/app/core/mocks). All off: every request goes to
  // the real Node.js API. Switch an area back on only to work without the backend.
  mock: {
    auth: false, // /auth/login, /auth/me
    posts: false, // /feed/posts
    chat: false, // POST /chat: true = keyword rules in the browser (only if the backend / ai-service is down)
  },
  tokenStorageKey: 'app.auth.token',
};
