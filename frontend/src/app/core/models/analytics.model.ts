import { PostStatus } from './post.model';

/**
 * Shapes returned by the backend's /analytics/* endpoints (routes/analytics.js).
 * Every endpoint except oldest-posts takes `?months=3|6|12`; the numbers are the same for every user.
 */
export type AnalyticsMonths = 3 | 6 | 12;

/** A count for each of the six post statuses. */
export type StatusCounts = Record<PostStatus, number>;

/** GET /analytics/stats */
export interface AnalyticsStats {
  months: number;
  statusCounts: StatusCounts;
  /** Posts created in the period just before this one. */
  previousTotal: number;
  /** Posts waiting for an admin right now (pending + clarification), any age. */
  waiting: { count: number; oldestDays: number | null };
}

/** GET /analytics/posts-per-month — `month` is 'YYYY-MM'. */
export interface MonthStatusCounts extends StatusCounts {
  month: string;
}
export interface PostsPerMonth {
  months: number;
  postsPerMonth: MonthStatusCounts[];
}

/** GET /analytics/review-time — `avgHours` is null for months with no reviews. */
export interface ReviewTime {
  months: number;
  targetHours: number;
  overall: { avgHours: number | null; reviewed: number };
  perMonth: { month: string; avgHours: number | null; reviewed: number }[];
}

/** GET /analytics/top-authors */
export interface AuthorStats extends StatusCounts {
  id: number | null;
  name: string;
  total: number;
}
export interface TopAuthors {
  months: number;
  authors: AuthorStats[];
}

/** GET /analytics/comment-activity — `week` is the Monday it starts on, 'YYYY-MM-DD'. */
export interface CommentActivity {
  months: number;
  totals: { comments: number; replies: number };
  perWeek: { week: string; comments: number; replies: number }[];
}

/** GET /analytics/ai-summaries — published posts by summary source. */
export interface AiSummaries {
  months: number;
  published: number;
  gemini: number;
  extractive: number;
  none: number;
}

/** GET /analytics/review-flow — how often posts moved from one status to another. */
export interface ReviewFlow {
  months: number;
  links: { from: PostStatus; to: PostStatus; count: number }[];
}

/** GET /analytics/insights — a written summary of the dashboard. */
export interface DashboardInsights {
  months: number;
  headline: string;
  points: string[];
  /** What needs attention; can be empty. */
  attention: string[];
  /** 'gemini' = written by Gemini; 'rules' = our own summary (Gemini was busy). */
  source: 'gemini' | 'rules';
  generatedAt: string;
  /** true = the server's saved copy (up to 10 minutes old). */
  cached: boolean;
}

/** GET /analytics/oldest-posts — follows the normal visibility rule. */
export interface OldestPost {
  id: number;
  title: string;
  status: PostStatus;
  created_at: string;
  author: { id: number | null; name: string };
  /** Days since the post was created. */
  ageDays: number;
}
export interface OldestPosts {
  statuses: PostStatus[];
  posts: OldestPost[];
}
