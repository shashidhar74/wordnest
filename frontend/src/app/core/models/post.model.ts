/**
 * Workflow — matches the backend's PATCH /feed/posts/:id/<action> endpoints:
 *   creator: draft | clarification → Submit → pending
 *   admin:   pending → Approve → published
 *                   → Reject (comment) → rejected
 *                   → Send back (comment) → clarification → (creator edits) → Submit → pending …
 *   owner or admin: published → Close → closed
 */
export type PostStatus =
  'draft' | 'pending' | 'published' | 'rejected' | 'clarification' | 'closed';

export type StatusTone = 'gray' | 'green' | 'amber' | 'red' | 'blue';

export const POST_STATUS: Record<PostStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'gray' },
  pending: { label: 'Pending', tone: 'amber' },
  published: { label: 'Published', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  clarification: { label: 'Clarification', tone: 'blue' },
  closed: { label: 'Closed', tone: 'gray' },
};

export interface PostAuthor {
  id: string;
  name: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  status: PostStatus;
  author: PostAuthor;
  /** Ready-to-use URL for <img src>, built from the backend's `img_url`. */
  imageUrl?: string;
  /** Latest admin comment from Send back / Reject (`review_comment`). */
  reviewComment?: string;
  /** Reviewer's user id (`reviewed_by`) and when they reviewed (`reviewed_at`). */
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Image rules — keep in sync with the backend's multer config (util/upload.js). */
export const POST_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
export const POST_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Body for create (POST) and update (PUT). The backend sets id, author and dates. */
export type SavePostDto = Pick<Post, 'title' | 'content' | 'status'>;

/**
 * Response of `GET /feed/posts`. The backend already returns `{ posts: [...] }`;
 * the paging fields are optional, so it works before pagination is added.
 */
export interface PostListResponse {
  posts: Post[];
  total?: number;
  page?: number;
  limit?: number;
}

// ---- AI (backend util/ai.js) -------------------------------------------------

/** Tones accepted by POST /feed/ai/generate-post — keep in sync with routes/feed.js. */
export const AI_TONES = ['informative', 'casual', 'formal', 'funny'] as const;
export type AiTone = (typeof AI_TONES)[number];

/** Body for POST /feed/ai/generate-post (creator only). Topic: 3–200 chars, keywords: ≤ 200. */
export interface GeneratePostRequest {
  topic: string;
  tone?: AiTone;
  keywords?: string;
}

/** AI-written draft. Not saved by the backend — it only fills the editor form. */
export interface AiDraft {
  title: string;
  content: string;
}

export interface PostQuery {
  status?: PostStatus;
  search?: string;
  page?: number;
  limit?: number;
}
