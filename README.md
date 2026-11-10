# blog-app

- `backend/`  Express + PostgreSQL API (port 3000, override with `PORT`)
- `frontend/` Angular app (port 5000, `/api` is proxied to 3000)

## First time

```
npm run install:all
```

## Run both

```
npm run dev
```

Run only one: `npm run dev:api` or `npm run dev:web`.
