/**
 * Threaded comments — matches the backend's GET /feed/posts/:postId/comments (controller/comments.js → buildTree).
 * Two levels: top-level comments, each with its replies.
 */
export interface CommentAuthor {
  id: number | string;
  name: string;
}

export interface CommentNode {
  id: number;
  parentId: number | null;
  /** null when the comment was deleted (soft delete keeps the row so its replies stay). */
  content: string | null;
  /** null when deleted. */
  author: CommentAuthor | null;
  createdAt: string;
  edited: boolean;
  deleted: boolean;
  replies: CommentNode[];
}

export interface CommentListResponse {
  /** Readable comments (deleted ones don't count). */
  total: number;
  comments: CommentNode[];
}

/** Body of POST /feed/posts/:postId/comments. Replying to a reply is moved under its top-level comment by the backend. */
export interface AddCommentDto {
  content: string;
  parentId?: number | null;
}

/** Same limit as the backend validator and the database CHECK. */
export const COMMENT_MAX_LENGTH = 2000;
