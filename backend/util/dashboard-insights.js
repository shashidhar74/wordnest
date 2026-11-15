// A written summary of the dashboard: GET /analytics/insights and "summarize the dashboard" in the chat.
//
//   1. Collect the same numbers the dashboard charts show (models/stats.js) into one small "facts" object.
//   2. Ask Gemini to write a headline, key points and what needs attention (util/ai.js → dashboardInsights).
//   3. Gemini busy, down, or its answer not usable?  → our own rule-based summary from the same facts.
//   4. Keep the result for 10 minutes per period, so opening the dashboard again doesn't spend AI quota.
//
// Only counts go to the AI, never post titles or content, so it can't reveal posts a user may not see.

const stats = require('../models/stats');
const ai = require('./ai');

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();            // months → { result, at }

// '2026-06' → 'Jun 2026'
function monthName(month) {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

const average = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);

// ---- 1. the numbers ------------------------------------------------------------------------
async function gatherFacts(months) {
    const [statusCounts, overview, perMonth, reviewTime, authors, comments, summaries, flow] = await Promise.all([
        stats.statusCount(months),
        stats.overview(months),
        stats.getPostsPerMonth(months),
        stats.reviewTime(months),
        stats.topAuthors(months, 3),
        stats.commentActivity(months),
        stats.aiSummaries(months),
        stats.reviewFlow(months),
    ]);

    const created = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const decided = statusCounts.published + statusCounts.rejected;
    const monthTotals = perMonth.map((m) => ({
        month: monthName(m.month),
        posts: m.draft + m.pending + m.clarification + m.published + m.rejected + m.closed,
    }));
    const busiest = monthTotals.reduce((best, m) => (m.posts > best.posts ? m : best), monthTotals[0]);

    // Is reviewing getting faster? Compare the first and second half of the period.
    const reviewedMonths = reviewTime.perMonth.filter((m) => m.avgHours !== null);
    const half = Math.ceil(reviewedMonths.length / 2);
    const earlier = average(reviewedMonths.slice(0, half).map((m) => m.avgHours));
    const later = average(reviewedMonths.slice(half).map((m) => m.avgHours));

    const weeks = comments.perWeek;
    const sum = (list) => list.reduce((a, w) => a + w.comments + w.replies, 0);
    const link = (from, to) => flow.find((l) => l.from === from && l.to === to)?.count ?? 0;

    return {
        periodMonths: months,
        posts: {
            created,
            previousPeriod: overview.previousTotal,
            changePercent: overview.previousTotal ? Math.round(((created - overview.previousTotal) / overview.previousTotal) * 100) : null,
            byStatus: statusCounts,
            perMonth: monthTotals,
            busiestMonth: busiest && busiest.posts > 0 ? busiest : null,
        },
        approvalRatePercent: decided ? Math.round((statusCounts.published / decided) * 100) : null,
        waitingForReview: overview.waiting,               // { count, oldestDays }, not limited to the period
        review: {
            avgHours: reviewTime.overall.avgHours,
            targetHours: 24,
            reviews: reviewTime.overall.reviewed,
            earlierAvgHours: later !== null ? earlier : null,
            laterAvgHours: later,
            sentBackForClarification: link('pending', 'clarification'),
            resubmittedAfterClarification: link('clarification', 'pending'),
        },
        topAuthors: authors.map((a) => ({ name: a.name, posts: a.total, published: a.published, rejected: a.rejected })),
        comments: {
            comments: comments.totals.comments,
            replies: comments.totals.replies,
            last4Weeks: sum(weeks.slice(-4)),
            previous4Weeks: sum(weeks.slice(-8, -4)),
        },
        aiSummaries: summaries,                           // { published, gemini, extractive, none }
    };
}

// ---- 3. our own summary, from rules ------------------------------------------------------------
function fromRules(f) {
    const m = f.periodMonths;
    const s = f.posts.byStatus;

    let headline = `${f.posts.created} posts were created in the last ${m} months`;
    if (f.posts.changePercent !== null) {
        headline += f.posts.changePercent >= 0
            ? `, up ${f.posts.changePercent}% on the ${m} months before`
            : `, down ${-f.posts.changePercent}% on the ${m} months before`;
    }
    headline += '.';

    const points = [];
    points.push(`${s.published} published and ${s.rejected} rejected` +
        (f.approvalRatePercent !== null ? ` (approval rate ${f.approvalRatePercent}%)` : '') +
        `; ${s.closed} closed, ${s.draft} still drafts.`);
    if (f.review.avgHours !== null) {
        let line = `Reviews took ${f.review.avgHours} h on average over ${f.review.reviews} reviews (target ${f.review.targetHours} h)`;
        if (f.review.earlierAvgHours !== null && f.review.laterAvgHours !== null && f.review.earlierAvgHours !== f.review.laterAvgHours) {
            line += f.review.laterAvgHours < f.review.earlierAvgHours
                ? `, and got faster: ${f.review.earlierAvgHours} h → ${f.review.laterAvgHours} h`
                : `, and got slower: ${f.review.earlierAvgHours} h → ${f.review.laterAvgHours} h`;
        }
        points.push(line + '.');
    }
    if (f.posts.busiestMonth || f.topAuthors.length) {
        const parts = [];
        if (f.posts.busiestMonth) parts.push(`Busiest month: ${f.posts.busiestMonth.month} with ${f.posts.busiestMonth.posts} posts.`);
        if (f.topAuthors.length) parts.push(`Most active author: ${f.topAuthors[0].name} (${f.topAuthors[0].posts} posts).`);
        points.push(parts.join(' '));
    }
    const c = f.comments;
    if (c.comments + c.replies > 0) {
        points.push(`${c.comments} comments and ${c.replies} replies; ${c.last4Weeks} in the last 4 weeks ` +
            `against ${c.previous4Weeks} in the 4 weeks before.`);
    }
    if (f.aiSummaries.published) {
        const withSummary = f.aiSummaries.gemini + f.aiSummaries.extractive;
        points.push(`${Math.round((withSummary / f.aiSummaries.published) * 100)}% of published posts have an AI summary.`);
    }

    const attention = [];
    const w = f.waitingForReview;
    if (w.count > 0) {
        attention.push(`${w.count} posts are waiting for review; the oldest has waited ${w.oldestDays} days.` +
            (w.oldestDays > 7 ? ' Review the oldest first.' : ''));
    }
    if (f.review.avgHours !== null && f.review.avgHours > f.review.targetHours) {
        attention.push(`Average review time (${f.review.avgHours} h) is above the ${f.review.targetHours} h target.`);
    }
    if (f.aiSummaries.none > 0) {
        attention.push(`${f.aiSummaries.none} published posts have no summary yet.`);
    }
    return { headline, points, attention: attention.slice(0, 3) };
}

// ---- 2. Gemini's answer, checked before use ----------------------------------------------------
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const textList = (v, maxItems, maxLength) =>
    (Array.isArray(v) ? v.map((x) => text(x, maxLength)).filter(Boolean).slice(0, maxItems) : []);

function clean(raw) {
    const headline = text(raw && raw.headline, 200);
    const points = textList(raw && raw.points, 6, 300);
    const attention = textList(raw && raw.attention, 4, 300);
    if (!headline || points.length === 0) throw new Error('incomplete answer');
    return { headline, points, attention };
}

// ---- the one function callers use --------------------------------------------------------------
// returns { months, headline, points[], attention[], source: 'gemini' | 'rules', generatedAt, cached }
exports.getInsights = async (months, { refresh = false } = {}) => {
    const hit = cache.get(months);
    if (!refresh && hit && Date.now() - hit.at < CACHE_MS) {
        return { ...hit.result, cached: true };
    }

    const facts = await gatherFacts(months);
    let summary, source;
    try {
        summary = clean(await ai.dashboardInsights(facts));
        source = 'gemini';
    } catch (err) {
        console.log('Gemini dashboard summary failed, using rules:', err.message);
        summary = fromRules(facts);
        source = 'rules';
    }

    const result = { months, ...summary, source, generatedAt: new Date().toISOString() };
    cache.set(months, { result, at: Date.now() });
    return { ...result, cached: false };
};

// For the chat: the same summary as plain text
exports.asText = (insights) => {
    const lines = [insights.headline, '', ...insights.points.map((p) => `• ${p}`)];
    if (insights.attention.length) {
        lines.push('', 'Needs attention:', ...insights.attention.map((a) => `• ${a}`));
    }
    return lines.join('\n');
};

exports.fromRules = fromRules;          // exported for tests
exports.gatherFacts = gatherFacts;
