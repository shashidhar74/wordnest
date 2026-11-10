// Production environment. `apiBaseUrl` is relative so the app can be served
// behind the same origin / reverse proxy as the Node.js backend.
export const environment = {
  production: true,
  appName: 'WordNest',
  appByline: 'by Shashi',
  apiBaseUrl: '/api',
  // Never fake anything in production.
  mock: {
    auth: false,
    posts: false,
    chat: false,
  },
  tokenStorageKey: 'app.auth.token',
};
