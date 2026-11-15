import { Paginated } from './api.model';

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
  /** Posts per status this user can see (same search, status filter ignored), for the tab numbers. */
  statusCounts?: Record<PostStatus, number>;
}

/** A page of posts, plus the per-status numbers for the filter tabs (missing from the mock backend). */
export interface PostPage extends Paginated<Post> {
  statusCounts?: Record<PostStatus, number>;
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

/** Response of POST /feed/posts/:id/summary. */
export interface PostSummary {
  summary: string;
  /** 'gemini' = written by Gemini; 'extractive' = our own summarizer (key sentences of the post). */
  source: 'gemini' | 'extractive';
  /** true = the saved summary was returned, no AI call. */
  cached: boolean;
}

export type CoverMotif =
  'waves' | 'dots' | 'rays' | 'circles' | 'grid' | 'diagonal' | 'confetti' | 'mountains';

/** A cover design chosen by Gemini (validated by the backend); the browser draws it. */
export interface CoverDesign {
  /** 2-colour gradient, '#RRGGBB'. */
  background: [string, string];
  /** Pattern colour. */
  accent: string;
  /** Title colour, readable on the background. */
  text: string;
  motif: CoverMotif;
  /** One emoji, or '' */
  emoji: string;
  /** Up to 6 words, or '' */
  tagline: string;
}

/** Response of POST /feed/ai/cover-design. source 'preset' = Gemini was busy, a built-in palette was used. */
export interface CoverDesignResponse {
  design: CoverDesign;
  source: 'gemini' | 'preset';
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
