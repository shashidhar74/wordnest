import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { Options, SeriesBarOptions, SeriesColumnOptions } from 'highcharts';
import { NgIcon } from '@ng-icons/core';
import { Subject, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import {
  AiSummaries,
  AnalyticsMonths,
  AnalyticsStats,
  CommentActivity,
  DashboardInsights,
  OldestPost,
  POST_STATUS,
  PostStatus,
  PostsPerMonth,
  ReviewFlow,
  ReviewTime,
  TopAuthors,
} from '../../core/models';
import { ThemeService } from '../../core/services/theme.service';
import { Chart } from '../../shared/components/chart/chart';
import { StatusPill } from '../../shared/components/status-pill/status-pill';
import { PostViewService } from '../posts/post-view-dialog/post-view-dialog';
import { AnalyticsService } from './analytics.service';
import { alpha, chartPalette, commonOptions, xAxisStyle, yAxisStyle } from './chart-theme';

const STATUSES: PostStatus[] = [
  'draft',
  'pending',
  'clarification',
  'published',
  'rejected',
  'closed',
];

/** Everything the dashboard shows for one period, loaded together. */
interface DashboardData {
  stats: AnalyticsStats;
  perMonth: PostsPerMonth;
  reviewTime: ReviewTime;
  authors: TopAuthors;
  comments: CommentActivity;
  ai: AiSummaries;
  flow: ReviewFlow;
}

/** '2026-06' → 'Jun' */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}

/** Nodes of the review-flow chart. "Resubmitted" breaks the clarification ↔ pending loop,
 *  because a Sankey chart can't draw a link going back to an earlier node. */
const FLOW_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending: 'In review',
  clarification: 'Clarification',
  resubmitted: 'Resubmitted',
  published: 'Published',
  rejected: 'Rejected',
  closed: 'Closed',
};

/**
 * One-screen dashboard, the same for every logged-in user.
 * The status chips (and donut slices) filter the per-month chart, the authors chart and the table.
 * Data: the backend's /analytics/* endpoints, reloaded when the period (3/6/12 months) changes.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [Chart, StatusPill, NgIcon, DatePipe],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  private readonly analytics = inject(AnalyticsService);
  private readonly theme = inject(ThemeService);
  protected readonly postView = inject(PostViewService);

  protected readonly periods: AnalyticsMonths[] = [3, 6, 12];
  protected readonly months = signal<AnalyticsMonths>(6);
  /** null = all statuses */
  protected readonly selected = signal<PostStatus | null>(null);

  protected readonly data = signal<DashboardData | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly oldest = signal<OldestPost[]>([]);
  protected readonly oldestLoading = signal(true);

  // "Summarize" panel: a written summary of the dashboard (Gemini, or rules when Gemini is busy)
  protected readonly insightsOpen = signal(false);
  protected readonly insights = signal<DashboardInsights | null>(null);
  protected readonly insightsLoading = signal(false);
  private readonly insightsRequest = new Subject<{ months: AnalyticsMonths; refresh: boolean }>();

  private readonly palette = computed(() => chartPalette(this.theme.theme()));

  constructor() {
    // All chart data for the period, in parallel. switchMap drops an old request if the period changes again.
    toObservable(this.months)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(
          (m) =>
            forkJoin({
              stats: this.analytics.stats(m),
              perMonth: this.analytics.postsPerMonth(m),
              reviewTime: this.analytics.reviewTime(m),
              authors: this.analytics.topAuthors(m),
              comments: this.analytics.commentActivity(m),
              ai: this.analytics.aiSummaries(m),
              flow: this.analytics.reviewFlow(m),
            }).pipe(catchError(() => of(null))), // the error toast is shown by the interceptor
        ),
        takeUntilDestroyed(),
      )
      .subscribe((d) => {
        this.failed.set(d === null);
        if (d) this.data.set(d);
        this.loading.set(false);
      });

    // The table: oldest posts of the selected status (default: waiting for review).
    toObservable(this.selected)
      .pipe(
        tap(() => this.oldestLoading.set(true)),
        switchMap((s) =>
          this.analytics.oldestPosts(s ?? undefined).pipe(
            map((r) => r.posts),
            catchError(() => of([] as OldestPost[])),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((posts) => {
        this.oldest.set(posts);
        this.oldestLoading.set(false);
      });

    // The written summary. switchMap: only the latest request counts (e.g. period changed meanwhile).
    this.insightsRequest
      .pipe(
        tap(() => this.insightsLoading.set(true)),
        switchMap(({ months, refresh }) =>
          this.analytics.insights(months, refresh).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) this.insights.set(result);
        this.insightsLoading.set(false);
      });
  }

  protected setMonths(m: AnalyticsMonths): void {
    this.months.set(m);
    // keep an open summary in step with the period
    if (this.insightsOpen()) this.insightsRequest.next({ months: m, refresh: false });
  }

  /** "Summarize" button: open (and load if needed) or close the summary panel. */
  protected toggleInsights(): void {
    if (this.insightsOpen()) {
      this.insightsOpen.set(false);
      return;
    }
    this.insightsOpen.set(true);
    if (this.insights()?.months !== this.months()) {
      this.insightsRequest.next({ months: this.months(), refresh: false });
    }
  }

  protected refreshInsights(): void {
    this.insightsRequest.next({ months: this.months(), refresh: true });
  }

  /** Click a chip or slice to filter; click it again (or "All") to clear. */
  protected toggle(status: PostStatus | null): void {
    this.selected.update((current) => (current === status ? null : status));
  }

  protected openPost(post: OldestPost): void {
    this.postView.open(String(post.id));
  }

  // ---------------------------------------------------------------- chips + KPI tiles

  protected readonly total = computed(() => {
    const counts = this.data()?.stats.statusCounts;
    return counts ? STATUSES.reduce((sum, s) => sum + counts[s], 0) : 0;
  });

  protected readonly chips = computed(() => {
    const counts = this.data()?.stats.statusCounts;
    const total = this.total();
    return STATUSES.map((status) => ({
      status,
      label: POST_STATUS[status].label,
      count: counts?.[status] ?? 0,
      percent: total ? Math.round(((counts?.[status] ?? 0) / total) * 100) : 0,
      color: this.palette().status[status],
    }));
  });

  protected readonly kpi = computed(() => {
    const d = this.data();
    if (!d) return null;
    const { statusCounts: c, previousTotal, waiting } = d.stats;
    const total = this.total();
    const decided = c.published + c.rejected;
    const ai = d.ai;
    const pct = (n: number) => (ai.published ? Math.round((n / ai.published) * 100) : 0);
    return {
      total,
      // null when there's nothing to compare with
      growth: previousTotal ? Math.round(((total - previousTotal) / previousTotal) * 100) : null,
      waiting: waiting.count,
      oldestDays: waiting.oldestDays,
      avgHours: d.reviewTime.overall.avgHours,
      targetHours: d.reviewTime.targetHours,
      approval: decided ? Math.round((c.published / decided) * 100) : null,
      published: c.published,
      rejected: c.rejected,
      ai: {
        gemini: pct(ai.gemini),
        extractive: pct(ai.extractive),
        none: pct(ai.none),
        published: ai.published,
      },
    };
  });

  /** 'Pending', 'Published' … for the selected chip ('' when none). */
  protected readonly selectedLabel = computed(() => {
    const s = this.selected();
    return s ? POST_STATUS[s].label : '';
  });

  /** Statuses drawn in the stacked charts: all of them, or only the selected one. */
  private readonly shownStatuses = computed(() => {
    const s = this.selected();
    return s ? [s] : STATUSES;
  });

  // ---------------------------------------------------------------- charts

  protected readonly donutOptions = computed<Options>(() => {
    const p = this.palette();
    const sel = this.selected();
    const counts = this.data()?.stats.statusCounts;
    const centre = sel ? (counts?.[sel] ?? 0) : this.total();
    const base = commonOptions(p);
    return {
      ...base,
      chart: { ...base.chart, type: 'pie' },
      // The number in the middle of the ring
      title: {
        text: `<span style="font-size:20px;font-weight:700">${centre}</span><br><span style="font-size:10.5px;color:${p.muted}">${sel ? POST_STATUS[sel].label : 'posts'}</span>`,
        verticalAlign: 'middle',
        floating: true,
        y: 6,
        style: { color: p.fg },
      },
      tooltip: { ...base.tooltip, pointFormat: '<b>{point.y}</b> posts ({point.percentage:.0f}%)' },
      plotOptions: {
        pie: {
          innerSize: '70%',
          size: '100%',
          borderWidth: 2,
          borderColor: p.surface,
          dataLabels: { enabled: false },
          cursor: 'pointer',
          point: {
            events: {
              click: (e) => this.toggle((e.point.options.custom?.['status'] as PostStatus) ?? null),
            },
          },
        },
      },
      series: [
        {
          type: 'pie',
          name: 'Posts',
          data: STATUSES.map((s) => ({
            name: POST_STATUS[s].label,
            y: counts?.[s] ?? 0,
            // fade the slices that are not selected
            color: !sel || sel === s ? p.status[s] : alpha(p.status[s], 0.22),
            custom: { status: s },
          })),
        },
      ],
    };
  });

  protected readonly perMonthOptions = computed<Options>(() => {
    const p = this.palette();
    const rows = this.data()?.perMonth.postsPerMonth ?? [];
    const series: SeriesColumnOptions[] = this.shownStatuses().map((s) => ({
      type: 'column',
      name: POST_STATUS[s].label,
      color: p.status[s],
      data: rows.map((r) => r[s]),
    }));
    return {
      ...commonOptions(p),
      xAxis: { ...xAxisStyle(p), categories: rows.map((r) => monthLabel(r.month)) },
      yAxis: {
        ...yAxisStyle(p),
        allowDecimals: false,
        stackLabels: {
          enabled: true,
          style: { color: p.muted, fontWeight: '600', fontSize: '10.5px', textOutline: 'none' },
        },
      },
      tooltip: { ...commonOptions(p).tooltip, shared: true },
      plotOptions: {
        column: {
          stacking: 'normal',
          borderWidth: 0,
          borderRadius: 2,
          pointPadding: 0.06,
          groupPadding: 0.1,
        },
      },
      series,
    };
  });

  protected readonly reviewTimeOptions = computed<Options>(() => {
    const p = this.palette();
    const rt = this.data()?.reviewTime;
    const rows = rt?.perMonth ?? [];
    return {
      ...commonOptions(p),
      xAxis: { ...xAxisStyle(p), categories: rows.map((r) => monthLabel(r.month)) },
      yAxis: {
        ...yAxisStyle(p),
        min: 0,
        labels: { ...yAxisStyle(p).labels, format: '{value}h' },
        // dashed line at the target
        plotLines: [
          { value: rt?.targetHours ?? 24, color: p.good, dashStyle: 'Dash', width: 1.5, zIndex: 4 },
        ],
      },
      tooltip: { ...commonOptions(p).tooltip, valueSuffix: ' h' },
      series: [
        {
          type: 'areaspline',
          name: 'Avg review time',
          data: rows.map((r) => r.avgHours), // null = no reviews that month → a gap
          color: p.brand,
          lineWidth: 2,
          connectNulls: true,
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, alpha(p.brand, 0.28)],
              [1, alpha(p.brand, 0)],
            ],
          },
          marker: { radius: 2.5, fillColor: p.surface, lineWidth: 2, lineColor: p.brand },
        },
      ],
    };
  });

  protected readonly flowEmpty = computed(() => !this.data()?.flow.links.length);

  protected readonly flowOptions = computed<Options>(() => {
    const p = this.palette();
    const links = (this.data()?.flow.links ?? [])
      .map((l) => ({
        from: l.from,
        to: l.from === 'clarification' && l.to === 'pending' ? 'resubmitted' : l.to,
        weight: l.count,
      }))
      .filter((l) => l.from !== l.to);
    const ids = [...new Set(links.flatMap((l) => [l.from, l.to]))];
    const nodeColor = (id: string) =>
      id === 'resubmitted' ? p.subtle : (p.status[id as PostStatus] ?? p.brand);
    return {
      ...commonOptions(p),
      series: [
        {
          type: 'sankey',
          name: 'Review flow',
          nodeWidth: 10,
          nodePadding: 8,
          linkOpacity: 0.35,
          data: links,
          nodes: ids.map((id) => ({ id, name: FLOW_LABEL[id] ?? id, color: nodeColor(id) })),
          dataLabels: {
            style: { color: p.fg, textOutline: 'none', fontWeight: '600', fontSize: '10px' },
            nodeFormat: '{point.name}',
          },
          tooltip: {
            nodeFormat: '{point.name}: <b>{point.sum}</b>',
            pointFormat: '{point.fromNode.name} → {point.toNode.name}: <b>{point.weight}</b>',
          },
        },
      ],
    };
  });

  protected readonly authorsOptions = computed<Options>(() => {
    const p = this.palette();
    const authors = this.data()?.authors.authors ?? [];
    const series: SeriesBarOptions[] = this.shownStatuses().map((s) => ({
      type: 'bar',
      name: POST_STATUS[s].label,
      color: p.status[s],
      data: authors.map((a) => a[s]),
    }));
    return {
      ...commonOptions(p),
      xAxis: {
        ...xAxisStyle(p),
        categories: authors.map((a) => a.name),
        labels: { style: { color: p.fg, fontWeight: '600', fontSize: '10.5px' } },
      },
      yAxis: {
        ...yAxisStyle(p),
        allowDecimals: false,
        stackLabels: {
          enabled: true,
          style: { color: p.muted, fontSize: '10.5px', textOutline: 'none' },
        },
      },
      tooltip: { ...commonOptions(p).tooltip, shared: true },
      plotOptions: {
        bar: {
          stacking: 'normal',
          borderWidth: 0,
          borderRadius: 2,
          pointPadding: 0.1,
          groupPadding: 0.06,
        },
      },
      series,
    };
  });

  protected readonly commentsOptions = computed<Options>(() => {
    const p = this.palette();
    const weeks = this.data()?.comments.perWeek ?? [];
    const x = (week: string) => {
      const [y, m, d] = week.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return {
      ...commonOptions(p),
      legend: {
        enabled: true,
        align: 'right',
        verticalAlign: 'top',
        floating: true,
        padding: 0,
        margin: 0,
        symbolRadius: 3,
        itemStyle: { color: p.muted, fontSize: '10.5px', fontWeight: '500' },
      },
      xAxis: {
        ...xAxisStyle(p),
        type: 'datetime',
        labels: { ...xAxisStyle(p).labels, format: '{value:%b}' },
      },
      yAxis: { ...yAxisStyle(p), allowDecimals: false },
      tooltip: { ...commonOptions(p).tooltip, shared: true, xDateFormat: 'Week of %e %b' },
      plotOptions: {
        areaspline: { marker: { enabled: false }, lineWidth: 1.75, fillOpacity: 0.12 },
      },
      series: [
        {
          type: 'areaspline',
          name: 'Comments',
          color: p.brand,
          data: weeks.map((w) => [x(w.week), w.comments]),
        },
        {
          type: 'areaspline',
          name: 'Replies',
          color: p.status.clarification,
          data: weeks.map((w) => [x(w.week), w.replies]),
        },
      ],
    };
  });
}
