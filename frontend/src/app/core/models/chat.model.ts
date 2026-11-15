/**
 * Blog chatbot — matches `POST /chat` in backend/docs/openapi.yaml (ChatResponse).
 * Intents come from the trained model in ai-service (models/intent_tfidf_lr.joblib).
 */
import { PostStatus } from './post.model';

export type ChatIntent =
  | 'find_posts'
  | 'summarize_post'
  | 'create_post'
  | 'post_report'
  | 'site_help'
  | 'greeting'
  | 'out_of_scope'
  /** Not from the trained model: the backend spots "dashboard" / "analytics" itself. */
  | 'dashboard_summary';

/** One row of a post_report table, e.g. { status: 'pending', label: 'Pending', count: 3 }. */
export interface ChatStatRow {
  label: string;
  count: number;
  /** Shown as a status pill when set; the "Total" row has none. */
  status?: PostStatus;
}

/**
 * What the bot asked for in its last reply; the next message is read as the answer:
 *   post_for_summary → a post title · post_topic → what a new post is about · post_tone → its tone
 */
export type ChatAwaiting = 'post_for_summary' | 'post_topic' | 'post_tone';

export type ChatTone = 'informative' | 'casual' | 'formal' | 'funny';

/**
 * A post being written in the chat. Partial while the bot is still asking (topic, then tone);
 * complete (with title + content from Gemini) when it's shown as a preview to save.
 */
export interface ChatDraft {
  topic?: string;
  tone?: ChatTone;
  title?: string;
  content?: string;
}

export interface ChatRequest {
  /** 1–500 characters. */
  message: string;
  /** Sent back from the previous reply, so a follow-up answer keeps its meaning. */
  context?: { awaiting?: ChatAwaiting; draft?: Pick<ChatDraft, 'topic' | 'tone'> };
}

export interface ChatPostLink {
  id: number | string;
  title: string;
}

/** A table the panel offers as a CSV download (post_report: "download the list with status"). */
export interface ChatDownload {
  /** e.g. "posts-2026-11-09.csv" */
  filename: string;
  columns: string[];
  rows: (string | number | null)[][];
}

/** Something the panel offers to do for the user. v1: open the editor with a topic. */
export interface ChatAction {
  type: 'open_editor';
  /** New post: pre-fill Write with AI with this topic. */
  topic?: string;
  /** Existing post: open it in the editor (e.g. right after saving a draft from the chat). */
  postId?: string | number;
}

export interface ChatResponse {
  intent: ChatIntent;
  /** Top probability from the intent model, 0–1. */
  confidence: number;
  reply: string;
  posts?: ChatPostLink[];
  /** What clicking a post does: open it (default) or summarize it. */
  postsAction?: 'open' | 'summarize';
  /** post_report: counts per status (only the statuses the user may see). */
  stats?: ChatStatRow[];
  /** post_report: rows for a "Download CSV" button (same role rules as `stats`). */
  download?: ChatDownload;
  action?: ChatAction;
  /** Optional chips for the next step. If missing, the panel picks follow-ups by intent and role. */
  suggestions?: string[];
  /** create_post: the post being written (sent back as context.draft; a preview once it has a title). */
  draft?: ChatDraft;
  /** The bot asked a question; the panel sends this back as `context.awaiting` with the next message. */
  awaiting?: ChatAwaiting;
}

/** One bubble in the chat panel (UI only, never sent to the backend). */
export interface ChatMessage {
  id: number;
  from: 'user' | 'bot';
  text: string;
  /** Bot replies only. */
  intent?: ChatIntent;
  confidence?: number;
  posts?: ChatPostLink[];
  postsAction?: 'open' | 'summarize';
  stats?: ChatStatRow[];
  download?: ChatDownload;
  action?: ChatAction;
  suggestions?: string[];
  draft?: ChatDraft;
  /** Request failed — show the text in an error style. */
  failed?: boolean;
}

export const CHAT_MESSAGE_MAX = 500;
