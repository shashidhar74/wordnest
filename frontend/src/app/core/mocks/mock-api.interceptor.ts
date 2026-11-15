import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  Observable,
  delay,
  dematerialize,
  filter,
  map,
  materialize,
  forkJoin,
  of,
  switchMap,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api.config';
import {
  CHAT_MESSAGE_MAX,
  ChatIntent,
  ChatRequest,
  ChatDownload,
  ChatResponse,
  ChatStatRow,
  LoginRequest,
  POST_STATUS,
  Post,
  PostListResponse,
  PostStatus,
  SavePostDto,
} from '../models';
import { MockUser, posts, toPublicUser, users } from './mock-db';

/**
 * Fake backend for development. Each area is switched on separately in
 * `environment.mock`, so you can build the real Node.js API one piece at a time:
 *   mock.auth  → fakes /auth/login and /auth/me
 *   mock.posts → fakes /feed/posts (off = requests go to the real backend)
 *   mock.chat  → fakes POST /chat with keyword rules (switch off once Express /chat exists)
 *
 * Demo accounts:
 *   admin@example.com / admin123
 *   user@example.com  / user123
 */

const LATENCY_MS = 250;
const TOKEN_PREFIX = 'mock-token.';
let nextId = posts.length + 1;

export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE_URL);
  if (!req.url.startsWith(base)) return next(req);

  const response = route(req, req.url.slice(base.length), next, base);
  if (!response) return next(req);

  // materialize/dematerialize so errors are delayed too, like a real network call.
  return response.pipe(materialize(), delay(LATENCY_MS), dematerialize());
};

function route(
  req: HttpRequest<unknown>,
  path: string,
  next: HttpHandlerFn,
  apiBase: string,
): Observable<HttpEvent<unknown>> | null {
  const { method } = req;

  // POST /auth/login
  if (environment.mock.auth && method === 'POST' && path === API_ENDPOINTS.auth.login) {
    const { email, password } = req.body as LoginRequest;
    const user = users.find((u) => u.email.toLowerCase() === email?.toLowerCase());
    if (!user || user.password !== password) return error(401, 'Invalid email or password');
    return ok({ token: TOKEN_PREFIX + user.id, user: toPublicUser(user) });
  }

  // GET /auth/me
  if (environment.mock.auth && method === 'GET' && path === API_ENDPOINTS.auth.me) {
    const me = currentUser(req);
    return me ? ok(toPublicUser(me)) : error(401, 'Not authenticated');
  }

  // POST /chat (until the real Express endpoint exists)
  if (environment.mock.chat && method === 'POST' && path === API_ENDPOINTS.chat) {
    if (!req.headers.has('Authorization')) return error(401, 'Not authenticated');
    const body = req.body as ChatRequest;
    const message = String(body?.message ?? '').trim();
    if (!message || message.length > CHAT_MESSAGE_MAX) return error(422, 'Invalid message');

    // Answer to the bot's "Which post?" → the whole message is the title (no intent model needed).
    if (body.context?.awaiting === 'post_for_summary') {
      return summarizeFlow(req, next, apiBase, { query: stripPunctuation(message), confidence: 1 });
    }
    const res = mockChat(message, roleFromToken(req));
    if (res.intent === 'find_posts') return withRealPosts(res, message, next, apiBase);
    if (res.intent === 'post_report')
      return reportFlow(req, message, next, apiBase, res.confidence);
    if (res.intent === 'summarize_post') {
      return summarizeFlow(req, next, apiBase, {
        query: extractTitle(message),
        latest: ORDINAL.test(message),
        confidence: res.confidence,
      });
    }
    return ok(res);
  }

  if (!environment.mock.posts) return null; // → real backend

  const base = API_ENDPOINTS.posts;
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  const id = path.slice(base.length + 1);

  const me = currentUser(req);
  if (!me) return error(401, 'Not authenticated');

  if (!id && method === 'GET') return listPosts(req); //        GET    /feed/posts
  if (!id && method === 'POST') return createPost(readBody(req.body), me); // POST /feed/posts

  const post = posts.find((p) => p.id === id);
  if (!post) return error(404, 'Post not found');

  if (method === 'GET') return ok(post); //                          GET    /feed/posts/:id
  if (method === 'PUT') {
    //                                                               PUT    /feed/posts/:id
    const { title, content, status } = readBody(req.body);
    Object.assign(post, { title, content, status, updatedAt: new Date().toISOString() });
    return ok(post);
  }
  if (method === 'DELETE') {
    //                                                               DELETE /feed/posts/:id
    posts.splice(posts.indexOf(post), 1);
    return ok(null, 204);
  }
  return null;
}

function listPosts(req: HttpRequest<unknown>) {
  const status = req.params.get('status');
  const search = (req.params.get('search') ?? '').toLowerCase();
  const page = Math.max(1, Number(req.params.get('page') ?? 1));
  const limit = Math.max(1, Number(req.params.get('limit') ?? 10));

  const filtered = posts
    .filter((p) => !status || p.status === status)
    .filter((p) => !search || p.title.toLowerCase().includes(search))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return ok<PostListResponse>({
    posts: filtered.slice((page - 1) * limit, page * limit),
    total: filtered.length,
    page,
    limit,
  });
}

function createPost({ title, content, status }: SavePostDto, me: MockUser) {
  const now = new Date().toISOString();
  const post: Post = {
    id: String(nextId++),
    title,
    content,
    status,
    author: { id: me.id, name: me.name },
    createdAt: now,
    updatedAt: now,
  };
  posts.unshift(post);
  return ok(post, 201);
}

// ---- chat --------------------------------------------------------------------

/**
 * Keyword rules standing in for the real pipeline (trained intent model in ai-service + Express).
 * Same response shape as the real POST /chat, so the panel doesn't change when the mock is switched off.
 */
const CHAT_RULES: [ChatIntent, RegExp][] = [
  // First: "why was my post rejected" / "how many pending" would otherwise match site_help.
  [
    'post_report',
    /\b(report|stats|statistics|breakdown|status[- ]?wise|by status|per status|dashboard|download|export|csv|excel|spreadsheet)\b|\b(how many|count|total|number of|kitne)\b|\b(why|reason|feedback|reviewer|kyu|kyon)\b.*\b(reject\w*|sent back|clarification|review\w*)\b|\breject\w*\b.*\b(kyu|kyon|why)\b/i,
  ],
  [
    'site_help',
    /\b(how (do|can|to)|why|what does|where|can't|cannot|error|password|sign ?up|log ?in|pending|status|image size|format|kaise)\b/i,
  ],
  [
    'create_post',
    /\b(write|create|draft|compose|make|publish|likh|bana)\b.*\b(post|blog|article)\b|\bnew (post|article)\b/i,
  ],
  [
    'summarize_post',
    /\b(summar|tl;?dr|gist|key points|takeaway|short version|sum (it )?up|recap)/i,
  ],
  [
    'find_posts',
    /\b(find|search|show|any|looking for|recommend|read|dikhao|list|latest|all)\b.*\b(posts?|articles?|blogs?)\b|\bposts? (about|on)\b/i,
  ],
  [
    'greeting',
    /^(hi+|hello|hey|yo|namaste|good (morning|evening|afternoon)|thanks?|thank you|thx|bye|kaise ho|what'?s up)\b/i,
  ],
];

const CHAT_REPLIES: Record<ChatIntent, string> = {
  greeting:
    'Hi! I can find posts, summarize a post, help you write one, or answer questions about the blog.',
  find_posts: 'Searching the published posts…', // replaced by withRealPosts()
  summarize_post: 'Summarizing…', // replaced by summarizeFlow()
  post_report: 'Preparing your report…', // replaced by reportFlow()
  create_post: "Let's write it! Open the editor and I'll fill in the topic for Write with AI.",
  site_help:
    'Creators write posts and submit them for review; an admin approves, rejects or sends them back. ' +
    'Images must be PNG or JPG, up to 2 MB.',
  out_of_scope: 'Sorry, I can only help with this blog: finding, summarizing and writing posts.',
  // The fake backend has no dashboard data; only the real one (GET /analytics/insights) can answer this
  dashboard_summary: 'The dashboard summary needs the real backend (mock chat is on).',
};

function mockChat(message: string, role: string | undefined): ChatResponse {
  const intent = CHAT_RULES.find(([, re]) => re.test(message))?.[0] ?? 'out_of_scope';
  const confidence = intent === 'out_of_scope' ? 0.3 : 0.5 + Math.random() * 0.3;
  const res: ChatResponse = { intent, confidence, reply: `(mock) ${CHAT_REPLIES[intent]}` };

  if (intent === 'create_post') {
    if (role === 'creator') {
      res.action = { type: 'open_editor', topic: extractTopic(message) };
    } else {
      res.reply = '(mock) Only creators can write posts. Ask an admin to make you a creator.';
    }
  }
  return res;
}

/**
 * find_posts with real data: asks the real backend for published posts (public GET /feed/posts),
 * matching the topic if there is one. No topic ("how many posts?") → total count + latest posts.
 * This is the same behaviour the real Express /chat should have (see openapi.yaml).
 */
function withRealPosts(
  res: ChatResponse,
  message: string,
  next: HttpHandlerFn,
  apiBase: string,
): Observable<HttpEvent<unknown>> {
  const topic = extractTopic(message);
  const params = new HttpParams({
    fromObject: { status: 'published', limit: '5', ...(topic ? { search: topic } : {}) },
  });
  const listReq = new HttpRequest('GET', `${apiBase}${API_ENDPOINTS.posts}`, null, { params });

  return next(listReq).pipe(
    filter((event): event is HttpResponse<PostListResponse> => event instanceof HttpResponse),
    map((event) => {
      const found = event.body?.posts ?? [];
      const total = event.body?.total ?? found.length;
      const plural = total === 1 ? 'post' : 'posts';
      const more = total > found.length ? ` Here are the latest ${found.length}:` : '';

      let reply: string;
      if (topic) {
        reply = total
          ? `I found ${total} published ${plural} about "${topic}".${more || (found.length ? ' Here they are:' : '')}`
          : `I couldn't find any published posts about "${topic}". Try another word?`;
      } else {
        reply = total
          ? `There ${total === 1 ? 'is' : 'are'} ${total} published ${plural}.${more || ' Here they are:'}`
          : 'There are no published posts yet.';
      }
      return new HttpResponse<ChatResponse>({
        status: 200,
        body: {
          ...res,
          reply: `(mock) ${reply}`,
          posts: found.map((p) => ({ id: p.id, title: p.title })),
        },
      });
    }),
  );
}

/** "summarize the 1st post", "tldr of the latest article" → the newest published post. */
const ORDINAL = /\b(1st|first|latest|newest|last|recent|top)\b/i;

interface RawPostRow {
  id: number | string;
  title: string;
}

/** Public GET /feed/posts?status=published — newest first, optionally matching the title. */
function listPublished(next: HttpHandlerFn, apiBase: string, search?: string) {
  const params = new HttpParams({
    fromObject: { status: 'published', limit: '5', ...(search ? { search } : {}) },
  });
  return next(new HttpRequest('GET', `${apiBase}${API_ENDPOINTS.posts}`, null, { params })).pipe(
    filter((e): e is HttpResponse<{ posts?: RawPostRow[] }> => e instanceof HttpResponse),
    map((e) => (e.body?.posts ?? []).map((p) => ({ id: p.id, title: p.title }))),
  );
}

/**
 * summarize_post: pick the post (title match, or "latest"), then call the real
 * POST /feed/posts/:id/summary (Gemini). No clear post → ask "Which post?" with the latest posts as
 * buttons and `awaiting: post_for_summary`, so a typed title in the next message is understood.
 * Same behaviour the real Express /chat should have (see openapi.yaml).
 */
function summarizeFlow(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  apiBase: string,
  opts: { query?: string; latest?: boolean; confidence: number },
): Observable<HttpEvent<unknown>> {
  const base: ChatResponse = { intent: 'summarize_post', confidence: opts.confidence, reply: '' };
  const search = opts.latest ? undefined : opts.query;

  return listPublished(next, apiBase, search).pipe(
    switchMap((found) => {
      const post = opts.latest || search ? found[0] : undefined;
      if (!post) {
        // Nothing clear → ask, offering the latest posts to click.
        return listPublished(next, apiBase).pipe(
          map((latest) => {
            const notFound = search ? `I couldn't find a published post called "${search}". ` : '';
            return chatReply({
              ...base,
              reply: `(mock) ${notFound}Which post should I summarize? Click one, or type its title.`,
              posts: latest,
              postsAction: 'summarize',
              awaiting: 'post_for_summary',
            });
          }),
        );
      }
      const summaryReq = new HttpRequest(
        'POST',
        `${apiBase}${API_ENDPOINTS.posts}/${post.id}/summary`,
        {},
        { headers: req.headers }, // keep the user's Authorization header
      );
      return next(summaryReq).pipe(
        filter((e): e is HttpResponse<{ summary: string }> => e instanceof HttpResponse),
        map((e) =>
          chatReply({
            ...base,
            reply: `(mock) Summary of "${post.title}":\n\n${e.body?.summary ?? ''}`,
            posts: [post],
            postsAction: 'open',
          }),
        ),
      );
    }),
  );
}

/** "summarize 'Why We Sleep Better'" / "tldr of the juntleman post" → the title part, if any. */
function extractTitle(message: string): string | undefined {
  const quoted = message.match(/["'“‘]([^"'”’]{3,})["'”’]/);
  if (quoted) return quoted[1].trim();
  const rest = message
    .replace(/^(please\s+|pls\s+|can you\s+)?/i, '')
    .replace(
      /\b(summari[sz]e|summary( of)?|tl;?dr( of)?|sum up|gist( of)?|recap( of)?|key points( of| from)?)\b/gi,
      '',
    )
    .replace(
      /\b(the|this|that|a|me|for|of|post|article|blog|called|titled|named|please|pls)\b/gi,
      '',
    )
    .replace(ORDINAL, '');
  const title = stripPunctuation(rest);
  return title.length >= 3 ? title : undefined;
}

function stripPunctuation(text: string): string {
  return text
    .replace(/[?.!,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chatReply(body: ChatResponse) {
  return new HttpResponse<ChatResponse>({ status: 200, body });
}

/** "write a post about diwali with my photo" → "diwali". Slot filling, rule version. */
function extractTopic(message: string): string | undefined {
  const match = message.match(/\b(?:about|on|abt|regarding)\s+(.+)/i);
  const topic = match?.[1]
    .replace(/\b(with|and add|using|please|pls)\b.*$/i, '')
    .replace(/[?.!]+$/, '')
    .trim();
  // "posts on the blog" / "on this site" name the place, not a topic
  if (!topic || /^(the|this|your|our)\s+(blog|site|website)$/i.test(topic)) return undefined;
  return topic.length >= 3 ? topic : undefined;
}

/** Role from the JWT payload (real backend tokens) or the mock user (mock tokens). */
function roleFromToken(req: HttpRequest<unknown>): string | undefined {
  return claimsFromToken(req).role;
}

/**
 * `{ userId, role }` from the token. NOTE: decoding in the browser is only for the mock — the real
 * backend must take these from the *verified* JWT (req.userId / req.userRole), never from the client.
 */
function claimsFromToken(req: HttpRequest<unknown>): { userId?: string; role?: string } {
  const mockUser = currentUser(req);
  if (mockUser) return { userId: mockUser.id, role: mockUser.role };
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as { userId?: string | number; role?: string };
    return { userId: claims.userId != null ? String(claims.userId) : undefined, role: claims.role };
  } catch {
    return {};
  }
}

// ---- post_report ---------------------------------------------------------------

const REPORT_STATUSES: PostStatus[] = [
  'draft',
  'pending',
  'clarification',
  'published',
  'rejected',
  'closed',
];

interface ReportRow {
  id: number | string;
  title: string;
  status: PostStatus;
  user_id?: number | string | null;
  review_comment?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  updated_on?: string | null;
}

/** One status from the public GET /feed/posts (max 50 rows: enough for the mock). */
function listByStatus(next: HttpHandlerFn, apiBase: string, status: PostStatus) {
  const params = new HttpParams({ fromObject: { status, limit: '50' } });
  return next(new HttpRequest('GET', `${apiBase}${API_ENDPOINTS.posts}`, null, { params })).pipe(
    filter(
      (e): e is HttpResponse<{ posts?: ReportRow[]; total?: number }> => e instanceof HttpResponse,
    ),
    map((e) => ({ status, total: e.body?.total ?? 0, rows: e.body?.posts ?? [] })),
  );
}

/**
 * post_report with role rules (the real Express /chat must enforce the same, in SQL):
 *   user    → published count only; no review comments
 *   creator → their own posts by status; reasons for their own rejected / sent-back posts
 *   admin   → all posts by status; any post's reason
 */
function reportFlow(
  req: HttpRequest<unknown>,
  message: string,
  next: HttpHandlerFn,
  apiBase: string,
  confidence: number,
): Observable<HttpEvent<unknown>> {
  const { userId, role } = claimsFromToken(req);
  const base: ChatResponse = { intent: 'post_report', confidence, reply: '' };
  const asksWhy = /\b(why|reasons?|feedback|reviewer|review comments?|say|said|kyu|kyon)\b/i.test(
    message,
  );
  const wantsFile = /\b(download|export|csv|excel|spreadsheet)\b/i.test(message);
  const isAdmin = role === 'admin';
  const isCreator = role === 'creator';

  // "Download the list with status" → same role rules, rows for a CSV.
  if (wantsFile) {
    const statuses: PostStatus[] = isAdmin || isCreator ? REPORT_STATUSES : ['published'];
    return forkJoin(statuses.map((s) => listByStatus(next, apiBase, s))).pipe(
      map((lists) => {
        const rows = lists
          .flatMap((l) => l.rows)
          .filter((r) => isAdmin || !isCreator || String(r.user_id) === userId)
          .sort((a, b) => Number(b.id) - Number(a.id));
        const scope = isAdmin ? 'all posts' : isCreator ? 'your posts' : 'published posts';
        return chatReply({
          ...base,
          reply: rows.length
            ? `(mock) Here's the list of ${scope} with their status (${rows.length}). Click to download:`
            : `(mock) There are no ${scope} to download yet.`,
          download: rows.length ? toDownload(rows, isAdmin || isCreator) : undefined,
        });
      }),
    );
  }

  // Readers: only public information.
  if (!isAdmin && !isCreator) {
    if (asksWhy) {
      return ok({
        ...base,
        reply: "(mock) Only the post's author or an admin can see review comments.",
      });
    }
    return listByStatus(next, apiBase, 'published').pipe(
      map(({ total }) =>
        chatReply({
          ...base,
          reply:
            `(mock) There ${total === 1 ? 'is' : 'are'} ${total} published ${total === 1 ? 'post' : 'posts'}. ` +
            'Draft, pending and rejected counts are only visible to their authors and admins.',
          stats: [{ label: 'Published', status: 'published', count: total }],
        }),
      ),
    );
  }

  const mine = (row: ReportRow) => isAdmin || String(row.user_id) === userId;

  // "Why was X rejected / sent back?" → the admin's review_comment.
  if (asksWhy) {
    const title = extractReasonTitle(message);
    return forkJoin([
      listByStatus(next, apiBase, 'rejected'),
      listByStatus(next, apiBase, 'clarification'),
    ]).pipe(
      map((lists) => {
        const rows = lists
          .flatMap((l) => l.rows)
          .filter(mine)
          .filter((r) => !title || r.title.toLowerCase().includes(title.toLowerCase()))
          .sort((a, b) => String(b.reviewed_at ?? '').localeCompare(String(a.reviewed_at ?? '')))
          .slice(0, 5);
        const whose = isAdmin ? '' : 'your ';

        if (!rows.length) {
          return chatReply({
            ...base,
            reply: title
              ? `(mock) I couldn't find ${whose}rejected or sent-back post matching "${title}".`
              : `(mock) None of ${whose || 'the '}posts are rejected or waiting for clarification.`,
          });
        }
        const lines = rows.map((r) => {
          const what = r.status === 'rejected' ? 'Rejected' : 'Sent back for clarification';
          const when = r.reviewed_at ? ` on ${new Date(r.reviewed_at).toLocaleDateString()}` : '';
          return `• "${r.title}": ${what}${when}.\n  Reason: ${r.review_comment?.trim() || '(no comment entered)'}`;
        });
        return chatReply({
          ...base,
          reply: `(mock) Here's what the reviewer said:\n\n${lines.join('\n\n')}`,
          posts: rows.map((r) => ({ id: r.id, title: r.title })),
        });
      }),
    );
  }

  // Status-wise counts.
  return forkJoin(REPORT_STATUSES.map((s) => listByStatus(next, apiBase, s))).pipe(
    map((lists) => {
      const counts = lists.map((l) => ({
        status: l.status,
        count: isAdmin ? l.total : l.rows.filter(mine).length,
      }));
      const total = counts.reduce((sum, c) => sum + c.count, 0);
      const stats: ChatStatRow[] = counts
        .filter((c) => c.count > 0)
        .map((c) => ({ label: POST_STATUS[c.status].label, status: c.status, count: c.count }));
      stats.push({ label: 'Total', count: total });

      return chatReply({
        ...base,
        reply: total
          ? `(mock) Status report for ${isAdmin ? 'all posts' : 'your posts'}:`
          : `(mock) ${isAdmin ? 'There are no posts yet.' : "You don't have any posts yet."}`,
        stats: total ? stats : undefined,
      });
    }),
  );
}

/** Rows for the CSV. Review comments only for authors / admins (the caller decides). */
function toDownload(rows: ReportRow[], withReviewComment: boolean): ChatDownload {
  const date = (value?: string | null) => (value ? value.slice(0, 10) : '');
  const columns = ['ID', 'Title', 'Status', 'Created', 'Updated'];
  if (withReviewComment) columns.push('Review comment');
  return {
    filename: `posts-${new Date().toISOString().slice(0, 10)}.csv`,
    columns,
    rows: rows.map((r) => {
      const row: (string | number | null)[] = [
        r.id,
        r.title,
        POST_STATUS[r.status]?.label ?? r.status,
        date(r.created_at),
        date(r.updated_on),
      ];
      if (withReviewComment) row.push(r.review_comment ?? '');
      return row;
    }),
  };
}

/** "why was the juntleman post rejected" → "juntleman"; "why was my post rejected" → undefined (all). */
function extractReasonTitle(message: string): string | undefined {
  const quoted = message.match(/["'“‘]([^"'”’]{3,})["'”’]/);
  if (quoted) return quoted[1].trim();
  const rest = message.replace(
    /\b(why|was|is|did|does|has|my|the|a|this|that|post|article|blog|rejected|reject|rejection|sent|send|back|in|clarification|reason|for|what|which|admin|reviewer|say|said|about|feedback|give|gave|got|get|of|hua|kyu|kyon|mera|ka|ki|ko|to|me)\b/gi,
    '',
  );
  const title = stripPunctuation(rest);
  return title.length >= 3 ? title : undefined;
}

function currentUser(req: HttpRequest<unknown>): MockUser | undefined {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token?.startsWith(TOKEN_PREFIX)) return undefined;
  return users.find((u) => u.id === token.slice(TOKEN_PREFIX.length));
}

function ok<T>(body: T, status = 200) {
  return of(new HttpResponse({ status, body }));
}

function error(status: number, message: string) {
  return throwError(() => new HttpErrorResponse({ status, error: { message } }));
}

/** Create/update send FormData when an image is attached, JSON otherwise. */
function readBody(body: unknown): SavePostDto {
  if (!(body instanceof FormData)) return body as SavePostDto;
  return {
    title: String(body.get('title') ?? ''),
    content: String(body.get('content') ?? ''),
    status: (body.get('status') as SavePostDto['status'] | null) ?? 'draft',
  };
}
