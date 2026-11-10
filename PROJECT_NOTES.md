# Blog App: Project Notes

This file tracks the design, the reasons behind decisions, what's done, and what's next.
Update it whenever something changes.

> **Working style:** I'm learning backend development. I write the code myself; AI assistants
> should guide, explain and review, and only edit files when I ask.
> **Exception (2026-11-10): AI code is written by Claude**: `ai-service/`, the chatbot (`controller/chat.js`,
> `routes/chat.js`, `util/ai-service.js`, `util/ai.js`) and the frontend chat / AI UI. Claude explains what it built.

---

## 1. Overview

A blog platform with a publishing workflow and AI features.

- **Creators** write posts and submit them for review.
- **Admins** approve, reject, or send posts back for clarification.
- **Users** read published posts. Likes and comments are planned.
- **AI** summarizes posts and drafts new posts from a topic.

## 2. Folder structure

```
blog-app/
├── backend/            Express 5 + PostgreSQL API
│   ├── app.js          CORS, JSON parser, routes, /images static, error handler
│   ├── routes/         auth.js, feed.js (URLs + validation + middleware)
│   ├── controller/     auth.js, feed.js (logic + SQL)
│   ├── middleware/     is-auth.js (JWT), has-role.js (roles)
│   ├── util/           database.js (pg Pool), upload.js (multer), ai.js (Gemini)
│   ├── docs/           openapi.yaml (Swagger description of every endpoint)
│   ├── images/         uploaded post images (not committed)
│   └── .env            secrets (never commit, never put in frontend)
├── frontend/           Angular app
├── ai-service/         Python + FastAPI: our own AI models (see section 13)
│   ├── app/            main.py (endpoints), one module per model
│   ├── notebooks/      experiments before code moves into app/
│   ├── data/           hand-made datasets (data/raw/ = downloads, not committed)
│   ├── models/         trained models + Hugging Face cache (not committed)
│   ├── tests/          pytest
│   ├── .venv/          Python virtual environment (not committed)
│   └── .env            DB settings + HF_HOME (never commit)
├── package.json        runs both apps with `concurrently`
├── README.md
└── PROJECT_NOTES.md    this file
```

## 3. Running the app

| Command (from `blog-app/`) | What it does |
|---|---|
| `npm run install:all` | Installs packages for root, backend and frontend |
| `npm run dev` | Starts both apps (logs labelled `[api]` and `[web]`) |
| `npm run dev:api` / `npm run dev:web` | Starts only one app |

**AI service** (separate terminal, not part of `npm run dev` yet):
```powershell
cd ai-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

| Piece | Port |
|---|---|
| Backend (Express) | **3000** (override with the `PORT` env variable) |
| Frontend (Angular) | **5000** |
| Frontend proxy | `/api/*` → `http://localhost:3000/*` (the `/api` prefix is removed) |
| AI service (FastAPI) | **8000** |
| PostgreSQL | **5433** (moved from 5432; backup at `postgresql.conf.bak-5432`) |

**Ports already taken on this machine** by the Docker "sims" stack (another project):
8080 (kafka-ui), 8081, 8091, 8180, 9200, 5432, 6379. That's why the backend moved from 8080 to 3000
and the frontend from 4200 to 5000. Check with `docker ps` before picking a new port.

**API docs (Swagger)**
| URL | What |
|---|---|
| http://localhost:3000/docs | Backend: every endpoint, "Try it out", **Authorize** with a JWT |
| http://localhost:3000/docs/openapi.json | Raw spec (can be imported into Postman) |
| http://localhost:8000/docs | AI service (FastAPI builds it automatically) |

Open the backend docs on port 3000, not through the Angular proxy (`/api/docs`): "Try it out" would call the wrong URL.

**`.env` keys** (values are secret): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`,
`JWT_SECRET`, `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`.

**Things to remember**
- Use `npm run dev` (nodemon), not `node app.js`. A server you forget to restart keeps running old code and gives confusing 404s.
- `.env` is only read at startup. Restart the backend after changing it.
- Restarting PostgreSQL needs admin rights: `services.msc` → **PostgreSQL** service (not `postgresql-x64-17`, which is stopped).
- PostgreSQL config file: `C:\Program Files\PostgreSQL\17\data\postgresql.conf`.

## 4. Tech stack

| Area | Choice | Why |
|---|---|---|
| Server | Express 5 | Async errors go straight to the error middleware |
| Database | PostgreSQL + `pg` (raw SQL) | Learn SQL properly before using an ORM |
| Validation | express-validator v7 | Rules declared on the route; `validationResult(req)` in the controller |
| Uploads | multer (disk storage) | png/jpg/jpeg only, 2 MB limit |
| Passwords | bcryptjs (cost 12) | Never store plain passwords |
| Auth | jsonwebtoken (1 hour expiry) | Stateless; payload `{ userId, email, role }` |
| AI | Google Gemini REST API via built-in `fetch` | Free tier, no SDK needed, nothing to download |
| Dev | nodemon, concurrently | Auto-restart; run both apps from one terminal |
| API docs | swagger-ui-express + `yaml`, hand-written `docs/openapi.yaml` | Routes stay clean (no doc comments); one file to read and review |
| API style | **REST only, no GraphQL** (decided 2026-11-10) | Already working and documented; image upload (multer) is simple in REST, awkward in GraphQL; REST is the more common skill to master first. Learn GraphQL later in a separate practice project |
| DB access | Raw SQL (`pg`), moving to a **data layer** (`models/*.js`) | Keep learning SQL; the data layer keeps SQL in one place so rules (e.g. "guests see only published") aren't repeated across controllers |
| Own AI | Python 3.13, FastAPI, scikit-learn, nltk, PyTorch (**CPU**), transformers, sentence-transformers | Python is where the ML tools are; Express stays the gatekeeper |

## 5. Database

### `users`
| Column | Notes |
|---|---|
| id | primary key |
| name | |
| email | UNIQUE |
| password | bcrypt hash |
| role | CHECK in (`user`, `creator`, `admin`) |
| created_at | |

### `posts`
| Column | Notes |
|---|---|
| id | primary key |
| title, content | |
| status | CHECK in (`draft`, `pending`, `clarification`, `published`, `rejected`, `closed`) |
| author | **leftover, to be removed.** The author comes from `user_id` → `users.name` |
| img_url | e.g. `images/1712345-photo.png` |
| user_id | FK → users.id (the owner) |
| reviewed_by, reviewed_at, review_comment | set by admin actions |
| created_at, updated_on | |

**Design decisions**
- **Owner = `user_id`, not `author`.** Store the user's ID once (normalization). Never store the name twice.
- **`user_id` comes from the token** (`req.userId`), never from the request body, so nobody can create posts as someone else.
- **Always use parameterized queries** (`$1, $2 ...`). Never build SQL by joining user input into the string.
- **`COUNT(*)` returns a string** in `pg`, so wrap it in `parseInt`.

## 6. Authentication & authorization

- `POST /auth/users` signs up. A duplicate email returns 409 (also catches PG error `23505`).
- `POST /auth/login` returns `{ message, token, userId }`.
- `is-auth.js` reads `Authorization: Bearer <token>`, verifies it, and sets `req.userId` and `req.userRole`. Returns 401 if the token is missing or invalid.
- `has-role.js` is a **middleware factory**: `hasRole('creator', 'admin')` returns a middleware that responds 403 if the user's role isn't in the list.

| Status | Meaning |
|---|---|
| 401 | Not logged in, or the token is invalid or expired |
| 403 | Logged in, but not allowed |
| 404 | Not found |
| 409 | Conflict (duplicate email, wrong post status, race condition) |
| 422 | Validation failed |

### Roles
| Role | Can do |
|---|---|
| user | Read published posts (likes and comments planned) |
| creator | Create, edit, submit and close **own** posts; AI generate |
| admin | Review (send back, approve, reject), close and delete any post |

## 7. Publishing workflow (state machine)

```
draft ──submit──► pending ──approve──► published ──close──► closed
  ▲                │   │
  │            send-back reject
  │                ▼   ▼
  └─submit── clarification   rejected
```

Defined once in `TRANSITIONS` in `controller/feed.js`. A single `changeStatus(action)` factory handles every action.

| Action | From | To | Who | Comment |
|---|---|---|---|---|
| submit | draft, clarification | pending | owner (creator) | no |
| sendBack | pending | clarification | admin | **required** |
| approve | pending | published | admin | no |
| reject | pending | rejected | admin | **required** |
| close | published | closed | owner or admin | no |

**Thought process**
- **One table of rules plus one function** is easier to maintain than five copy-pasted controllers.
- **The `UPDATE` repeats the status check** (`WHERE id=$5 AND status = ANY($6)`). If two people act at the same moment, only one update succeeds and the other gets a 409 ("status has changed, please refresh").
- **`CASE WHEN` in the `UPDATE`** only fills the review columns when an admin acts.

**Edit and delete rules**
- **Edit** (`PUT`): owner only, and only while the post is `draft` or `clarification`. Otherwise 409.
- **Delete**: owners can delete their own `draft` or `rejected` posts. Admins can delete any post.
- **New posts always start as `draft`.** The frontend doesn't send a status.

**Image handling**
- `upload.single('image')` runs **before** the validators, because multer is what fills `req.body` for form uploads.
- **If validation or the database step fails**, the uploaded file is deleted (`clearImage`).
- **When the image is replaced**, the old file is deleted only after the `UPDATE` succeeds.
- **The frontend sends `FormData`.** Don't set `Content-Type` yourself; the browser adds the boundary.

## 8. API reference

All paths below are backend paths. From the frontend, prefix them with `/api`.
Full details (bodies, responses, error codes) are in Swagger: http://localhost:3000/docs.
**When an endpoint changes, update `backend/docs/openapi.yaml` too.** Swagger doesn't notice by itself.

| Method | Path | Auth | Body / query |
|---|---|---|---|
| POST | `/auth/users` | – | `{ name, email, password (min 6) }` |
| POST | `/auth/login` | – | `{ email, password }` |
| GET | `/feed/posts` | – | `?page&limit(≤50)&search&status` → `{ posts, limit, total, totalPages }` |
| GET | `/feed/posts/:postId` | – | |
| POST | `/feed/posts` | creator | FormData: `title`, `content` (min 5), `image` |
| PUT | `/feed/posts/:postId` | owner | FormData: `title`, `content`, optional `image` |
| DELETE | `/feed/posts/:postId` | creator, admin | |
| PATCH | `/feed/posts/:postId/submit` | creator | |
| PATCH | `/feed/posts/:postId/send-back` | admin | `{ comment }` |
| PATCH | `/feed/posts/:postId/approve` | admin | |
| PATCH | `/feed/posts/:postId/reject` | admin | `{ comment }` |
| PATCH | `/feed/posts/:postId/close` | creator, admin | |
| POST | `/feed/posts/:postId/summary` | any logged-in user | → `{ summary }` |
| POST | `/feed/ai/generate-post` | creator | `{ topic (3–200), tone?, keywords? (≤200) }` → `{ title, content }` |
| GET | `/images/<file>` | – | static image files |
| POST | `/chat` | any logged-in user | `{ message (1–500), context?: { awaiting } }` → `{ intent, confidence, reply, posts?, stats?, download?, action?, awaiting?, suggestions? }`. Needs ai-service |
| GET | `/docs` | – | Swagger UI (`/docs/openapi.json` = raw spec) |

`tone` must be one of `formal`, `casual`, `funny`, `informative` (default `informative`).

## 9. AI features

### Why Gemini
- **The Claude API needs paid credits.** A free claude.ai account doesn't include API access.
- **Ollama runs models locally.** It's free, but it needs a big download and a strong server, which is hard to deploy.
- **The Gemini free tier is enough for learning.** Limits are per minute (RPM/TPM) and per day (RPD), and the daily count resets every day. Going over gives a **429**.
- **No training needed.** You send the post in the prompt and get an answer back.

### Design (`backend/util/ai.js`)
- **All AI calls go through one file.** To switch provider later (Claude, OpenAI, Ollama), only this file changes.
- **The API key stays on the server.** It's sent in the `x-goog-api-key` header and never reaches the frontend.
- **`systemInstruction` holds the rules**; the user content goes in `contents`.
- **Defence against prompt injection:** the post text is wrapped in `<post>` tags, and the model is told to treat it only as content, never as instructions.
- **Generating posts uses JSON mode** (`responseMimeType: 'application/json'`). The reply is parsed and its shape is checked, and an invalid reply returns 502.
- **Requests give up after 60 seconds** (`AbortSignal.timeout(60000)`).
- **Errors are mapped to clear status codes:**

| Situation | Status | Message |
|---|---|---|
| Network error or timeout | 503 | AI service is temporarily unavailable |
| Google 429 (rate limit) | 429 | AI is busy, please try again in a minute |
| Google 5xx (overloaded) | 503 | AI service is temporarily unavailable |
| Google 400/401/403/404 | 500 | AI service is not configured correctly (wrong key or model) |
| Empty reply (e.g. safety block) | 422 | AI could not produce an answer for this content |
| Invalid JSON from the model | 502 | AI returned an invalid response |

**Model:** `GEMINI_MODEL=gemini-3.5-flash`. `gemini-2.5-flash` returned 404 (retired for new users), and the newer flash models often returned 503 (high demand). Models change, so if the AI breaks, check the model name first.

### Generated posts are not saved
`generate-post` only returns `{ title, content }`. The creator reviews and edits it, adds an image, and saves it as a draft through the normal `POST /feed/posts`. A person always stays in control.

## 10. Frontend integration plan

**Buttons by role and status**

| Role | Where | Buttons |
|---|---|---|
| user | Post detail | Summarize |
| creator | Own draft / clarification | Edit, Delete (draft only), Submit, Summarize |
| creator | Own published | Close |
| creator | New post page | **Generate with AI** (topic, tone, keywords) → fills the form |
| admin | Pending post | Approve, Send back (comment), Reject (comment) |
| admin | Published post | Close, Delete |

**Rules**
- Remove the `status` field from the create/edit form. The backend sets the status.
- Send `Authorization: Bearer <token>` on every protected call. On a 401, go to the login page.
- For AI calls, disable the button and show a spinner (replies can take 5–30 s). Show the backend's `message` on error. The rest of the page must keep working if the AI fails.
- Before Generate with AI overwrites title or content the creator has already typed, ask them first.

**AI buttons: done** (written by Claude, to be reviewed together)
| Feature | Where | Who | Files |
|---|---|---|---|
| Summarize with AI | Post popup + post editor | any signed-in user | `features/posts/ai-summary/ai-summary.ts` |
| Write with AI (topic, tone, keywords) | Post editor, new or draft/clarification post | creator | `post-editor-page.ts` / `.html` |

- `PostService.summarize(id)` and `generateDraft({ topic, tone, keywords })` call the two AI endpoints.
- Summary covers the **saved** post (only the id is sent), so unsaved edits aren't included.
- Write with AI asks before replacing typed text and never saves. The creator adds an image and clicks Save.
- Errors come from the backend's `message`, shown by the error interceptor; the buttons re-enable.

## 11. Phases

| # | Phase | Status |
|---|---|---|
| 1 | Express setup, posts CRUD, validation | ✅ Done |
| 2 | PostgreSQL connection, raw SQL | ✅ Done |
| 3 | Pagination, search, status filter | ✅ Done |
| 4 | Image upload with cleanup | ✅ Done |
| 5 | Signup, login, JWT | ✅ Done |
| 6 | Roles (user / creator / admin) | ✅ Done |
| 7 | Publishing workflow (state machine) | ✅ Done, tested end-to-end |
| 8 | AI summary + generate post (Gemini) | ✅ Backend done. Generate tested; summary not yet tested against a real post |
| 9 | Monorepo (`blog-app`) | ✅ Done |
| 10 | Frontend integration (workflow + AI buttons) | 🟡 AI buttons done; workflow buttons to check against section 10 |
| 11 | Likes and comments | Planned |
| 12 | Deployment (Express serves the built Angular app) | Planned |
| 13 | Own AI service + chatbot (see section 13) | ⏸️ Paused 2026-11-10: intent model + `/chat` working end to end |
| 14 | API docs (Swagger) | ✅ Done, spec validated |

## 12. Open tasks

- [x] Test `POST /feed/posts/:id/summary` with a real post (2026-11-09)
- [ ] `controller/auth.js` line 63: change `'Invalid Passord!!'` to `'Invalid email or password!!'` (same message for both cases, so attackers can't find out which emails exist)
- [ ] Return `role` and `name` in the login response, so the frontend can show the right buttons.
      Today the frontend reads `role` from the JWT, but the JWT has no `name`, so **the app shows the email as the user's name**
- [x] **Security (done 2026-11-10):** guests / users only reach `published` posts; creators also their own; admins all.
      Applies to `GET /feed/posts`, `GET /feed/posts/:postId` (hidden → 404) and `POST .../summary`.
      Public GETs use `middleware/optional-auth.js` (no token = guest, bad token = 401)
- [ ] Remove `author` from the `INSERT` in `posts` (now in `models/post.js` → `create`) before dropping the column
- [ ] **Migrations:** table definitions in `.sql` files in git (e.g. `backend/db/migrations/001_create_users.sql`),
      run with a tool like `node-pg-migrate`. Today the schema exists only in the local database
- [x] **Data layer (done 2026-11-10):** all post SQL in `backend/models/post.js` (`list`, `findVisible`, `findMeta`,
      `create`, `update`, `remove`, `changeStatus`); the visibility rule is written once (`visibleTo`).
      `controller/feed.js` keeps only the HTTP part. Next: `models/user.js` for `controller/auth.js`;
      `controller/chat.js` still has its own SQL (move it to the models later)
- [ ] Decide whether `/docs` (Swagger) stays public in production
- [ ] `GET /feed/my-posts`: a creator's own posts, all statuses
- [ ] `GET /admin/posts?status=pending`: the admin review queue
- [x] Public `GET /feed/posts` should only show `published` posts to users and guests (see Security above)
- [ ] Add `hasRole('creator')` to `PUT /feed/posts/:postId`
- [ ] Optionally clear `review_comment` on approve
- [ ] Remove the unused `author` column (the leftover `getPostsByTitle` was removed 2026-11-10)
- [ ] Old posts with `user_id NULL`: `UPDATE posts SET user_id = 1 WHERE user_id IS NULL;`
- [ ] Store summaries in a `summary` column (faster, saves free-tier quota); regenerate when the post is edited
- [ ] Per-user rate limit on AI endpoints
- [ ] Frontend integration (section 10): AI part done; review the AI code together and check the workflow buttons
- [ ] Delete the old `node_rest_api` and `nodejs_resp_api_fe` folders once `blog-app` is confirmed working

## 13. AI learning roadmap

1. **Prompt engineering:** system prompts, examples (few-shot), JSON output. *(Started: `ai.js`)*
2. **Streaming:** show the summary word by word using server-sent events.
3. **Embeddings + pgvector:** "related posts" and semantic search inside PostgreSQL.
4. **RAG (retrieval-augmented generation):** "Ask the blog": find relevant posts, then answer using only them.
5. **Tool use / agents:** let the model call your own functions (e.g. search posts, get stats).
6. **Evaluation:** check AI output quality automatically.
7. **Optional:** try local models with Ollama, and compare providers by changing only `ai.js`.

### Own AI service (`ai-service/`)

**Goal:** build and train our own models instead of only calling Gemini, to learn ML end to end.
Training a ChatGPT-sized model from scratch isn't realistic (data, GPUs, cost), so the plan is small
models we train ourselves, combined into a chatbot.

```
Angular (5000) ──► Express (3000) ──► ai-service (8000)      Express keeps auth, roles, validation, rate limits
                        └── PostgreSQL ◄──┘                   ai.js will call the service instead of Gemini
```

**Machine check (2026-11-07)**
| Item | Result | Effect |
|---|---|---|
| CPU | i7-1255U, 10 cores | Fine for classic ML and small models |
| GPU | Intel UHD only, **no NVIDIA** | No local GPU training → CPU, or Kaggle/Colab for big jobs |
| RAM | 15.6 GB, often only ~2–3 GB free | Stop the sims Docker containers when training |
| Disk | C: ~18 GB free, D: ~62 GB free | Everything AI lives on D: (`--no-cache-dir`, `HF_HOME`) |
| pgvector | Not installed | Start with NumPy cosine search; pgvector (or its Docker image) later |
| Data | **4 posts, ~400 characters** | Too little: add posts / use public datasets / label our own |

**What's feasible here:** extractive summarizer, TF-IDF + LR, small transformer fine-tune (DistilBERT size),
sentence embeddings, tiny GPT for learning — all on CPU. **Not locally:** LoRA fine-tuning of an LLM
(use Kaggle/Colab), running 7B+ models.

**Chatbot design**
```
message → intent classifier (ours) ─┬─ find_posts     → embedding search
                                    ├─ summarize_post → our summarizer
                                    ├─ create_post    → collect details → preview → confirm → save as draft
                                    ├─ site_help      → FAQ retrieval
                                    ├─ greeting       → template reply
                                    └─ out_of_scope   → polite refusal (also when confidence < ~0.6)
```

Training data: `ai-service/data/intents.csv`, 6 intents × 30 = 180 rows (see `data/README.md`).
Test set `intents_test.csv`: to be written by me, without looking at the training file.

**Creating posts from the chat (`create_post`)**

The only intent that *does* something (writes to the database), so it has extra rules:
```
"create a post about goa with a photo"
  → role check: creators only
  → collect missing details over several messages:  topic ✓  tone (ask / default)  image (ask)
  → write title + content
  → show a preview → "Save as draft?" → yes
  → Express POST /feed/posts (multipart, the user's own JWT) → draft
```
- **Always through Express**, never write to the DB from Python. Validation, roles and image rules stay in one place.
- **The bot acts as the user** (forwards their JWT), never with more rights than they have.
- **Confirm before saving.** Guards against mistakes and prompt injection.
- **Always a draft.** The post still goes through admin review.
- **Slot filling** ("goa" from "create a post about goa") is a second training project:
  rules first ("about X", "on X"), then a token-classification (NER) model.

**Images: decided 2026-11-09**
| Order | Option | Status |
|---|---|---|
| 1st | **User uploads the image in the chat** (image picker; backend already accepts PNG/JPG ≤ 2 MB) | Planned |
| 2nd | **AI-generated cover image** (Gemini image model) as an extra button; check which image models the key can use first | Later |
| ✗ | Own image model (diffusion) | Not practical on this CPU / RAM |
| ? | Free stock photo by topic | Optional, needs an API key + photo credits |

**Status when paused (2026-11-10)**
- **Intent model:** 7 intents (`find_posts`, `summarize_post`, `create_post`, `post_report`, `site_help`, `greeting`,
  `out_of_scope`). Training 419 rows (60 per intent), test 84 rows. TF-IDF (word 1–2) + logistic regression:
  **test accuracy 87%, macro F1 87%**. Notebook `ai-service/notebooks/intent.ipynb`, model `models/intent_tfidf_lr.joblib`.
- **ai-service:** `POST /intent`, `GET /intent/model`, model loaded at startup; 10 pytest tests pass.
- **Express `POST /chat`** (`controller/chat.js`): intent from ai-service → answer from the DB / Gemini, role rules in SQL.
  Find posts, count + latest, summarize (title / "latest" / "Which post?" follow-up), open editor with topic,
  status-wise report, rejection reasons, CSV download, FAQ, greetings.
- **Frontend chat panel:** floating button, suggestion chips by role and last intent, post links, status table,
  CSV download, "Open editor" action. Mock (`environment.mock.chat`) is **off**; switch on only to work without the backend.
- **Run it:** `npm run dev` starts backend + frontend + ai-service (`npm run dev:ai` alone). Tests: `npm run test:ai`.
- **Known gaps:** confidence is low (≈0.3), so no "not sure" threshold yet; topic/title extraction is rule-based;
  Gemini summaries sometimes fail with 503 "high demand"; the 12 `post_report` test rows were written by Claude.

**Steps**
1. [x] Service skeleton: venv on D:, CPU PyTorch, FastAPI `/health`, pytest
2. [ ] `POST /summarize`: extractive (TF-IDF / TextRank), compare with Gemini
3. [x] Intent classifier: TF-IDF + LR baseline (87% test). [ ] Next: small transformer, compare
4. [ ] Embeddings + `POST /search` (find posts by meaning)
5. [x] `POST /chat` + chat panel, using the intent model (rule-based answers)
5b. [ ] `create_post` fully in the chat: trained slot filling (topic, tone), image upload in the chat, preview + confirm
5c. [ ] Later: "generate cover image" button (Gemini image model)

**Resume with:** step 3 (transformer: should fix meaning-based mistakes like "847 divided by 13" and raise
confidence so a threshold works), or step 2 (own summarizer, removes the Gemini 503 problem).
6. [ ] Evaluation: ROUGE, precision@k, F1 on a held-out set
7. [ ] Later: tiny GPT from scratch (learning), LoRA fine-tune on Kaggle/Colab

**Training habits:** split train/val/test (stratified), never tune on the test set, fix random seeds,
log every experiment, always beat a baseline, commit the datasets we write.

## 14. Lessons learned

- **Express 5 leaves `req.body` undefined** unless a body parser actually reads a body. For JSON, check the `Content-Type` header; for forms, check multer.
- **express-validator v7 removed `express-validator/check`.** Import from `express-validator` directly.
- **Route order matters.** `/posts/search` must come before `/posts/:postId`.
- **Each CORS header is one comma-separated string** (`'GET, POST, ...'`), not several arguments.
- **`res.status(...)`, not `res.statusCode(...)`.**
- **Placeholder numbers must match** the params array (`$1..$n`), and you need `RETURNING *` to get the row back.
- **Ownership checks need `===` with the right types.** `user_id` from the database and `userId` from the token must both be numbers.
- **A wrong DB password gives error code `28P01`.** Restarting the server doesn't fix it; fix `DB_PASSWORD`.
- **`EADDRINUSE` means another program owns the port.** Find it with `Get-NetTCPConnection -LocalPort <port> -State Listen`;
  if the owner is `wslrelay`, it's a Docker container (`docker ps`). Read the port from `process.env.PORT` so it's easy to change.
- **A `ERR_CONNECTION_REFUSED` on a random high port** (e.g. 50269) is usually an old preview tab whose server has stopped.
- **In YAML `{ ... }` maps, a comma ends the value.** Quote examples that contain commas: `example: 'a, b, c'`.
- **OpenAPI public endpoints need `security: []`** when others use `bearerAuth`. Validate with
  `npx @redocly/cli lint docs/openapi.yaml`.
- **pip fails with `getaddrinfo failed`** when the internet drops. Retry with `--timeout 60 --retries 10`; packages already
  installed (e.g. torch) are kept.
- **Install CPU-only PyTorch** (`--index-url https://download.pytorch.org/whl/cpu`) on a machine without an NVIDIA GPU:
  much smaller, same results.
