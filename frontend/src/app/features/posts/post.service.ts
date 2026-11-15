import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL, API_ENDPOINTS } from '../../core/config/api.config';
import {
  AiDraft,
  GeneratePostRequest,
  Post,
  PostListResponse,
  PostPage,
  PostSummary,
  PostQuery,
  SavePostDto,
} from '../../core/models';
import { ApiService } from '../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly api = inject(ApiService);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly path = API_ENDPOINTS.posts;

  list(query: PostQuery = {}): Observable<PostPage> {
    return this.api.get<PostListResponse>(this.path, { params: { ...query } }).pipe(
      map((res) => ({
        data: (res.posts ?? []).map((p, i) => withDefaults(p, i, this.baseUrl)),
        total: res.total ?? res.posts?.length ?? 0,
        page: res.page ?? query.page ?? 1,
        limit: res.limit ?? query.limit ?? 10,
        statusCounts: res.statusCounts,
      })),
    );
  }

  getById(id: string): Observable<Post> {
    return this.api
      .get<{ post?: RawPost } & RawPost>(`${this.path}/${id}`)
      .pipe(map((res) => withDefaults(res.post ?? res, 0, this.baseUrl)));
  }

  /** Sent as multipart/form-data: the backend reads the file with multer `upload.single('image')`. */
  create(dto: SavePostDto, image: File): Observable<Post> {
    return this.api
      .post<PostResponse>(this.path, toFormData(dto, image))
      .pipe(map((res) => withDefaults(res.post ?? res, 0, this.baseUrl)));
  }

  /** New image chosen → multipart/form-data; otherwise plain JSON and the backend keeps the old image. */
  update(id: string, dto: SavePostDto, image?: File | null): Observable<Post> {
    const body = image ? toFormData(dto, image) : dto;
    return this.api
      .put<PostResponse>(`${this.path}/${id}`, body)
      .pipe(map((res) => withDefaults(res.post ?? res, 0, this.baseUrl)));
  }

  // ---- workflow: PATCH /feed/posts/:id/<action> --------------------------------

  /** draft | clarification → pending (creator, owner). */
  submit(id: string): Observable<unknown> {
    return this.api.patch(`${this.path}/${id}/submit`, {});
  }

  /** pending → clarification (admin). */
  sendBack(id: string, comment: string): Observable<unknown> {
    return this.api.patch(`${this.path}/${id}/send-back`, { comment });
  }

  /** pending → published (admin). */
  approve(id: string): Observable<unknown> {
    return this.api.patch(`${this.path}/${id}/approve`, {});
  }

  /** pending → rejected (admin). */
  reject(id: string, comment: string): Observable<unknown> {
    return this.api.patch(`${this.path}/${id}/reject`, { comment });
  }

  /** published → closed (owner or admin). */
  close(id: string): Observable<unknown> {
    return this.api.patch(`${this.path}/${id}/close`, {});
  }

  remove(id: string): Observable<void> {
    return this.api.delete<void>(`${this.path}/${id}`);
  }

  // ---- AI ----------------------------------------------------------------------

  /**
   * POST /feed/posts/:id/summary — summary of the post as saved (any signed-in user).
   * The backend returns the saved summary when there is one; `refresh` asks for a new one.
   */
  summarize(id: string, refresh = false): Observable<PostSummary> {
    return this.api.post<PostSummary>(
      `${this.path}/${id}/summary`,
      refresh ? { refresh: true } : {},
    );
  }

  /** POST /feed/ai/generate-post — AI draft for the editor form (creator only, not saved). */
  generateDraft(request: GeneratePostRequest): Observable<AiDraft> {
    return this.api.post<AiDraft>(API_ENDPOINTS.ai.generatePost, request);
  }
}

/**
 * Text fields + the file in one multipart body. Don't set a Content-Type header:
 * the browser adds `multipart/form-data` with the boundary multer needs.
 */
function toFormData(dto: SavePostDto, image: File): FormData {
  const form = new FormData();
  form.append('title', dto.title);
  form.append('content', dto.content);
  form.append('status', dto.status);
  form.append('image', image); // field name must match upload.single('image')
  return form;
}

type RawPost = Partial<Omit<Post, 'id' | 'author'>> & {
  id?: string | number;
  author?: Post['author'] | string | null;
  img_url?: string | null;
  created_at?: string;
  updated_on?: string;
  review_comment?: string | null;
  reviewed_by?: string | number | null;
  reviewed_at?: string | null;
};

/** Create/update reply: `{ message, post: {...} }` — or the bare post. */
type PostResponse = { message?: string; post?: RawPost } & RawPost;

function withDefaults(raw: RawPost, index: number, baseUrl: string): Post {
  const author =
    typeof raw.author === 'string'
      ? { id: '', name: raw.author }
      : (raw.author ?? { id: '', name: 'Unknown' });

  return {
    id: raw.id != null ? String(raw.id) : `missing-id-${index}`,
    title: raw.title ?? '(untitled)',
    content: raw.content ?? '',
    status: raw.status ?? 'draft',
    author: { id: author.id ?? '', name: author.name || 'Unknown' },
    imageUrl: raw.imageUrl ?? toImageUrl(raw.img_url, baseUrl),
    reviewComment: raw.reviewComment ?? raw.review_comment ?? undefined,
    reviewedBy: raw.reviewedBy ?? (raw.reviewed_by != null ? String(raw.reviewed_by) : undefined),
    reviewedAt: raw.reviewedAt ?? raw.reviewed_at ?? undefined,
    createdAt: raw.createdAt ?? raw.created_at ?? '',
    updatedAt: raw.updatedAt ?? raw.updated_on ?? '',
  };
}

/**
 * Backend stores a relative path like `images/1727-photo.png` and serves it with
 * `express.static` at `/images`. In the browser that's `/api/images/...`; the dev
 * proxy strips `/api` and forwards to the backend.
 */
function toImageUrl(path: string | null | undefined, baseUrl: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path; // already absolute
  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
}
