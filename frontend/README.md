# Node REST Admin — Angular Frontend

Angular 22 single-page app that consumes the **Node.js REST API** backend. It ships with
authentication (JWT), a responsive admin layout, and a complete Users CRUD module that serves as
the template for every new resource.

| Area          | Choice                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Framework     | Angular **22.2** — standalone components, signals, zoneless, OnPush    |
| UI components | Angular Material **22.2** (Material 3 theme, light/dark)               |
| Styling       | Tailwind CSS **v4** (PostCSS) + SCSS, mapped to Material design tokens |
| HTTP          | `HttpClient` (fetch backend) + functional interceptors                 |
| Forms         | Typed Reactive Forms                                                   |
| Testing       | Vitest + jsdom (`@angular/build:unit-test`)                            |
| Quality       | ESLint (angular-eslint), Prettier                                      |
| Build         | `@angular/build:application` (esbuild + Vite dev server)               |

---

## 1. Prerequisites

- **Node.js `^22.22.3`, `^24.15.0` or `>=26`** — the Angular 22 CLI refuses to run on older
  versions. The repo pins **24.21.0** in [`.node-version`](.node-version).
  ```bash
  fnm install 24 && fnm use        # or: nvm install 24 && nvm use
  node -v                           # v24.15.0 or newer
  ```
- **npm 11+** (bundled with Node 24)
- The **Node.js backend** running locally (default `http://localhost:3000`)
- Recommended VS Code extensions are listed in [.vscode/extensions.json](.vscode/extensions.json)
  (Angular Language Service, Tailwind CSS IntelliSense, Prettier, ESLint).

## 2. Getting started

```bash
npm install
npm start            # http://localhost:5000  (proxies /api → http://localhost:3000)
```

Sign in with a user that exists in the backend. Admin users also see the **Users** page.

### Scripts

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm start`         | Dev server with live reload and the `/api` proxy     |
| `npm run build`     | Production build → `dist/nodejs-resp-api-fe/browser` |
| `npm run build:dev` | Unminified build with source maps                    |
| `npm run watch`     | Rebuild on change (development config)               |
| `npm test`          | Unit tests in watch mode (Vitest)                    |
| `npm run test:run`  | Unit tests once (no watch)                           |
| `npm run lint`      | ESLint for `.ts` and `.html`; `lint:fix` to auto-fix |
| `npm run format`    | Prettier write; `format:check` to verify only        |

## 3. Connecting to the Node.js backend

### Development — proxy

The browser calls **relative** URLs (`/api/...`). The dev server forwards them to the backend via
[proxy.conf.json](proxy.conf.json), so **no CORS setup is needed in development**:

```json
{ "/api": { "target": "http://localhost:3000", "secure": false, "changeOrigin": true } }
```

Change `target` if your backend runs on a different port/host.

### Production

`apiBaseUrl` defaults to `/api` (same origin). Either:

- serve the built files from the same host as the API (Express static / Nginx reverse proxy), **or**
- set an absolute URL in [src/environments/environment.ts](src/environments/environment.ts),
  e.g. `https://api.example.com/api`, and enable CORS on the backend for the frontend origin
  with the `Authorization` header allowed.

### Expected API contract

The frontend expects the following endpoints. Adjust
[src/app/core/config/api.config.ts](src/app/core/config/api.config.ts) and the models in
[src/app/core/models/](src/app/core/models/) if your backend differs.

| Method   | Endpoint          | Request body                               | Response                               |
| -------- | ----------------- | ------------------------------------------ | -------------------------------------- |
| `POST`   | `/api/auth/login` | `{ email, password }`                      | `{ token, user }`                      |
| `GET`    | `/api/auth/me`    | — (Bearer token)                           | `User`                                 |
| `GET`    | `/api/users`      | query: `page` (1-based), `limit`, `search` | `{ data: User[], total, page, limit }` |
| `GET`    | `/api/users/:id`  | —                                          | `User`                                 |
| `POST`   | `/api/users`      | `{ name, email, role, password }`          | `User`                                 |
| `PUT`    | `/api/users/:id`  | `{ name?, email?, role? }`                 | `User`                                 |
| `DELETE` | `/api/users/:id`  | —                                          | `204 No Content`                       |

```ts
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt?: string;
  updatedAt?: string;
}
```

**Errors** should be JSON: `{ "message": "Human readable", "errors": { "field": ["msg"] } }`
(`errors` optional). The error interceptor shows `message` in a snackbar; if it is missing, a
default message for the status code is used.

**Auth**: protected routes read `Authorization: Bearer <jwt>`. A `401` from any endpoint (except
login) clears the session and redirects to `/auth/login?returnUrl=…`.

## 4. Project structure

```
src/
├── environments/                 # environment.ts (prod) / environment.development.ts
├── tailwind.css                  # Tailwind entry + Material token → Tailwind colour mapping
├── styles.scss                   # Angular Material M3 theme, global styles
└── app/
    ├── app.config.ts             # providers: router, HttpClient + interceptors, app initializers
    ├── app.routes.ts             # lazy-loaded routes + guards
    ├── core/                     # singletons — imported by features, never the reverse
    │   ├── config/api.config.ts  # API_BASE_URL token + API_ENDPOINTS
    │   ├── models/               # API DTOs & shared types
    │   ├── services/             # ApiService, AuthService, TokenStorage, Loading, Notification, Theme
    │   ├── interceptors/         # loading → auth → error
    │   └── guards/               # authGuard, guestGuard, adminGuard
    ├── layout/
    │   ├── main-layout/          # toolbar + responsive sidenav (signed-in area)
    │   └── auth-layout/          # centered layout for login
    ├── features/                 # one folder per business area, lazy loaded
    │   ├── auth/login/
    │   ├── dashboard/
    │   ├── users/                # user.service.ts, user-list/, user-form-dialog/
    │   └── not-found/
    └── shared/components/        # reusable, presentational: page-header, confirm-dialog, loading-bar
```

### Conventions

- **Angular 22 style guide file names**: `login-page.ts`, not `login-page.component.ts`; class
  `LoginPage`.
- **Standalone + OnPush (the v22 default) + signals** for component state. Use `input()`,
  `output()`, `computed()` and `inject()`; no constructor injection, no NgModules.
- **Built-in control flow** (`@if`, `@for`, `@switch`) — no `*ngIf` / `*ngFor`.
- **Lazy-load every feature** with `loadComponent` in `app.routes.ts`.
- **Never call `HttpClient` from components.** Components → feature service → `ApiService`.
- Keep endpoint paths in `API_ENDPOINTS`; keep DTO types in `core/models`.

## 5. Request pipeline

```
Component ──► FeatureService (UserService) ──► ApiService ──► HttpClient
                                                                │
                           loadingInterceptor  (global progress bar; opt out with SKIP_LOADING)
                           authInterceptor     (adds Bearer token for API_BASE_URL requests)
                           errorInterceptor    (normalise → ApiError, snackbar, 401 → logout)
                                                                │
                                                        Node.js REST API
```

- On startup, an app initializer calls `GET /auth/me` if a token is stored, so a page refresh
  keeps the user signed in.
- Skip the progress bar for background polling:
  `api.get(path, { context: new HttpContext().set(SKIP_LOADING, true) })`.

## 6. Styling: Tailwind + Angular Material

- **Material** provides components (buttons, forms, tables, dialogs…). The theme is defined in
  [src/styles.scss](src/styles.scss) with `mat.theme()` — change `primary` / `tertiary` palettes
  there.
- **Tailwind** handles layout, spacing, typography and responsive utilities.
- Material's system tokens are exposed as Tailwind colours in
  [src/tailwind.css](src/tailwind.css), so use `bg-surface`, `text-primary`,
  `text-on-surface-variant`, `border-outline-variant`, `bg-primary-container` … instead of fixed
  Tailwind colours like `bg-blue-500`. They switch automatically in dark mode.
- **Dark mode**: `ThemeService` toggles `.dark` on `<html>` (toolbar button, persisted in
  `localStorage`, defaults to OS preference). Material follows via `color-scheme`; Tailwind via the
  `dark:` variant.
- Cascade order: Tailwind output is in CSS layers and Material is unlayered, so Material component
  styles win over Tailwind's preflight reset. To force a utility onto a Material element, use the
  important modifier (`fixed!`, `p-0!`).
- Icons use the **Material Symbols Outlined** font: `<mat-icon>search</mat-icon>`.
- Prefer Tailwind in templates; component `.scss` files are only for things utilities can't express
  (the production budget warns at 4 kB per component stylesheet).

## 7. Adding a new resource (e.g. `products`)

1. **Model** — `src/app/core/models/product.model.ts`, export it from `models/index.ts`.
2. **Endpoint** — add `products: '/products'` to `API_ENDPOINTS`.
3. **Service** — copy `features/users/user.service.ts` → `features/products/product.service.ts`.
4. **Pages** — `npx ng g c features/products/product-list-page` (plus a form dialog if needed);
   use `features/users/` as the reference implementation (table, paginator, search, dialogs).
5. **Route** — add a lazy `loadComponent` child under the main layout in `app.routes.ts`
   (with `adminGuard` if restricted).
6. **Navigation** — add an item to `navItems` in `layout/main-layout/main-layout.ts`.
7. **Tests** — add a `*.spec.ts` next to the service; mock HTTP with `provideHttpClientTesting()`.

## 8. Testing & quality

- Unit tests live next to the code (`*.spec.ts`) and run on **Vitest** with jsdom:
  `npm test` / `npm run test:run`.
- HTTP code: use `provideHttpClient()` + `provideHttpClientTesting()` and `HttpTestingController`.
- `npm run lint` and `npm run format:check` should pass before every PR.

## 9. Build & deployment

```bash
npm run build     # output: dist/nodejs-resp-api-fe/browser
```

It is a static SPA: every unknown path must fall back to `index.html`.

**Serve from the Node/Express backend**

```js
const path = require('path');
const dist = path.join(__dirname, '../nodejs_resp_api_fe/dist/nodejs-resp-api-fe/browser');
app.use('/api', apiRouter); // API first
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
```

**Nginx**

```nginx
location /api/ { proxy_pass http://localhost:3000; }
location /     { root /var/www/app/browser; try_files $uri $uri/ /index.html; }
```

## 10. Roadmap / next steps

The setup above is complete and building. Candidate follow-ups, roughly in priority order:

- [ ] Align models and endpoints with the real backend responses (section 3).
- [ ] Refresh-token flow (retry the original request after `POST /auth/refresh` on 401).
- [ ] Register / forgot-password pages under `auth/`.
- [ ] Map backend validation `errors` onto form controls.
- [ ] Role-based UI directive (`*appHasRole`) in addition to `adminGuard`.
- [ ] E2E tests (Playwright) for login and Users CRUD.
- [ ] Runtime config (`/assets/config.json`) so one build can target several API URLs.
- [ ] i18n (`@angular/localize`) if multiple languages are required.

## 11. Troubleshooting

| Symptom                                                          | Fix                                                                                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `The Angular CLI requires a minimum Node.js version of v24.15.0` | Upgrade Node / `fnm use` (see section 1).                                                                                     |
| Snackbar: _Cannot reach the server. Is the backend running?_     | Backend isn't reachable on the proxy `target` — start it or fix the port in `proxy.conf.json`.                                |
| `404` for `/api/...` in dev                                      | Backend routes aren't mounted under `/api`; either add the prefix there or add `"pathRewrite": { "^/api": "" }` to the proxy. |
| Redirected to login right after signing in                       | `GET /api/auth/me` returns 401 — check the backend reads the `Bearer` token.                                                  |
| Icons render as text                                             | The Google Fonts link in `src/index.html` is blocked; self-host Material Symbols.                                             |
| Tailwind classes have no effect on a Material element            | Material's unlayered styles win; use the important modifier, e.g. `p-0!`.                                                     |
