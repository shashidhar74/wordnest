import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../../core/config/api.config';
import {
  AiSummaries,
  AnalyticsMonths,
  AnalyticsStats,
  CommentActivity,
  DashboardInsights,
  OldestPosts,
  PostStatus,
  PostsPerMonth,
  ReviewFlow,
  ReviewTime,
  TopAuthors,
} from '../../core/models';
import { ApiService } from '../../core/services/api.service';

/** Read-only calls for the dashboard. One method per /analytics endpoint. */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly api = inject(ApiService);
  private readonly urls = API_ENDPOINTS.analytics;

  stats(months: AnalyticsMonths): Observable<AnalyticsStats> {
    return this.api.get<AnalyticsStats>(this.urls.stats, { params: { months } });
  }

  postsPerMonth(months: AnalyticsMonths): Observable<PostsPerMonth> {
    return this.api.get<PostsPerMonth>(this.urls.postsPerMonth, { params: { months } });
  }

  reviewTime(months: AnalyticsMonths): Observable<ReviewTime> {
    return this.api.get<ReviewTime>(this.urls.reviewTime, { params: { months } });
  }

  topAuthors(months: AnalyticsMonths, limit = 5): Observable<TopAuthors> {
    return this.api.get<TopAuthors>(this.urls.topAuthors, { params: { months, limit } });
  }

  commentActivity(months: AnalyticsMonths): Observable<CommentActivity> {
    return this.api.get<CommentActivity>(this.urls.commentActivity, { params: { months } });
  }

  aiSummaries(months: AnalyticsMonths): Observable<AiSummaries> {
    return this.api.get<AiSummaries>(this.urls.aiSummaries, { params: { months } });
  }

  reviewFlow(months: AnalyticsMonths): Observable<ReviewFlow> {
    return this.api.get<ReviewFlow>(this.urls.reviewFlow, { params: { months } });
  }

  /** Written summary of the dashboard (Gemini, or rules). `refresh` asks for a new one instead of the saved copy. */
  insights(months: AnalyticsMonths, refresh = false): Observable<DashboardInsights> {
    return this.api.get<DashboardInsights>(this.urls.insights, {
      params: { months, refresh: refresh || undefined },
    });
  }

  /** No status = posts waiting for an admin (pending + clarification). Not limited to a period. */
  oldestPosts(status?: PostStatus, limit = 12): Observable<OldestPosts> {
    return this.api.get<OldestPosts>(this.urls.oldestPosts, { params: { status, limit } });
  }
}
