const pool = require('../util/database');
const { visibleTo } = require('./post');   // who may see which posts (only used where titles are shown)

const PERIOD_START =`date_trunc('month', now()) - make_interval(months => $1 - 1)`;

exports.statusCount = async (months) => {
    const result = await pool.query(
        `SELECT status,COUNT(*)::int As count FROM posts WHERE created_at >= ${PERIOD_START} GROUP BY status`,[months]
    )
    const counts = { draft: 0, pending: 0, clarification: 0, published: 0, rejected: 0, closed: 0 };
    result.rows.forEach(row => {
        counts[row.status] = row.count;
    })
    return counts;
}

// Posts created per month, split by status. Every month of the period is included,
// even months with no posts (generate_series makes the months, LEFT JOIN keeps the empty ones).
// Returns [{ month: '2026-09', draft: 0, pending: 0, clarification: 0, published: 1, rejected: 0, closed: 1 }, ...]
exports.getPostsPerMonth = async (months) => {
    const result = await pool.query(
        `SELECT to_char(m.month, 'YYYY-MM') AS month,p.status, COUNT(p.id)::int AS count
        FROM generate_series(${PERIOD_START}, date_trunc('month', now()), '1 month') AS m(month)
        LEFT JOIN posts p ON date_trunc('month', p.created_at) = m.month
        GROUP BY m.month, p.status
        ORDER BY m.month`,[months]
    )
    // SQL gives one row per month AND status; the chart needs one object per month.
    const perMonth = [];
    result.rows.forEach(row => {
        let entry = perMonth[perMonth.length - 1];
        if (!entry || entry.month !== row.month) {          // rows are sorted by month, so a new month starts here
            entry = { month: row.month, draft: 0, pending: 0, clarification: 0, published: 0, rejected: 0, closed: 0 };
            perMonth.push(entry);
        }
        if (row.status) {                                    // null status = a month with no posts, keep its zeros
            entry[row.status] = row.count;
        }
    })
    return perMonth;
}

// Average hours from creating a post to its (latest) admin review, per month of the review.
// Approximation: created_at is when the draft was made (not when it was submitted), and
// reviewed_at only keeps the latest review. A status-history table would make it exact.
// Months with no reviews: avgHours null (a gap in the chart, not "0 hours"), reviewed 0.
// Returns { overall: { avgHours, reviewed }, perMonth: [{ month, avgHours, reviewed }, ...] }
exports.reviewTime = async (months) => {
    const result = await pool.query(
        `SELECT to_char(m.month, 'YYYY-MM') AS month,
                ROUND(AVG(EXTRACT(EPOCH FROM (p.reviewed_at - p.created_at)) / 3600)::numeric, 1)::float AS avg_hours,
                COUNT(p.id)::int AS reviewed
        FROM generate_series(${PERIOD_START}, date_trunc('month', now()), '1 month') AS m(month)
        LEFT JOIN posts p ON p.reviewed_at IS NOT NULL AND date_trunc('month', p.reviewed_at) = m.month
        GROUP BY m.month
        ORDER BY m.month`,[months]
    )
    const perMonth = result.rows.map(row => ({
        month: row.month,
        avgHours: row.avg_hours,
        reviewed: row.reviewed
    }));

    // Overall average, weighted by the number of reviews in each month
    // (an average of the monthly averages would be wrong when months have different counts).
    let totalHours = 0, totalReviewed = 0;
    perMonth.forEach(m => {
        if (m.reviewed > 0) {
            totalHours += m.avgHours * m.reviewed;
            totalReviewed += m.reviewed;
        }
    })
    const overall = {
        avgHours: totalReviewed ? Math.round(totalHours / totalReviewed * 10) / 10 : null,
        reviewed: totalReviewed
    };
    return { overall, perMonth };
}

// Extra numbers for the KPI tiles on /analytics/stats:
//   previousTotal → posts created in the period just before this one (for "▲ 12% vs previous")
//   waiting       → posts waiting for an admin right now (pending + clarification), whatever the period,
//                   and how many days the oldest one has been waiting
exports.overview = async (months) => {
    const result = await pool.query(
        `SELECT
            (SELECT COUNT(*)::int FROM posts
              WHERE created_at >= ${PERIOD_START} - make_interval(months => $1)
                AND created_at <  ${PERIOD_START}) AS previous_total,
            COUNT(*)::int AS waiting,
            FLOOR(EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 86400)::int AS oldest_days
         FROM posts
         WHERE status IN ('pending', 'clarification')`,[months]
    )
    const row = result.rows[0];
    return {
        previousTotal: row.previous_total,
        waiting: { count: row.waiting, oldestDays: row.oldest_days }   // oldestDays is null when nothing waits
    };
}

// Authors with the most posts created in the period, with a count per status (conditional aggregation).
// LEFT JOIN users: a post whose user was deleted still counts, as "Unknown".
exports.topAuthors = async (months, limit) => {
    const result = await pool.query(
        `SELECT p.user_id AS id,
                COALESCE(u.name, 'Unknown') AS name,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE p.status = 'draft')::int         AS draft,
                COUNT(*) FILTER (WHERE p.status = 'pending')::int       AS pending,
                COUNT(*) FILTER (WHERE p.status = 'clarification')::int AS clarification,
                COUNT(*) FILTER (WHERE p.status = 'published')::int     AS published,
                COUNT(*) FILTER (WHERE p.status = 'rejected')::int      AS rejected,
                COUNT(*) FILTER (WHERE p.status = 'closed')::int        AS closed
        FROM posts p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.created_at >= ${PERIOD_START}
        GROUP BY p.user_id, u.name
        ORDER BY total DESC, name
        LIMIT $2`,[months, limit]
    )
    return result.rows;
}

// New comments per week: top-level comments vs replies. Deleted comments are not counted.
// Every week of the period is included, even weeks with no comments (same generate_series trick).
exports.commentActivity = async (months) => {
    const result = await pool.query(
        `SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
                COUNT(c.id) FILTER (WHERE c.parent_id IS NULL)::int     AS comments,
                COUNT(c.id) FILTER (WHERE c.parent_id IS NOT NULL)::int AS replies
        FROM generate_series(date_trunc('week', ${PERIOD_START}), date_trunc('week', now()), '1 week') AS w(week)
        LEFT JOIN comments c ON c.deleted_at IS NULL AND date_trunc('week', c.created_at) = w.week
        GROUP BY w.week
        ORDER BY w.week`,[months]
    )
    const perWeek = result.rows;   // week = the Monday the week starts on
    const totals = perWeek.reduce((t, w) => ({ comments: t.comments + w.comments, replies: t.replies + w.replies }),
                                  { comments: 0, replies: 0 });
    return { totals, perWeek };
}

// Which engine wrote the cached summary of the published posts created in the period.
exports.aiSummaries = async (months) => {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS published,
                COUNT(*) FILTER (WHERE summary_source = 'gemini')::int     AS gemini,
                COUNT(*) FILTER (WHERE summary_source = 'extractive')::int AS extractive,
                COUNT(*) FILTER (WHERE summary IS NULL)::int               AS none
        FROM posts
        WHERE status = 'published' AND created_at >= ${PERIOD_START}`,[months]
    )
    return result.rows[0];
}

// Review flow (Sankey chart): how many times posts moved from one status to another in the period.
// Read from post_status_history; "created" rows (from_status NULL) are left out.
// Note: history before 2026-11-15 was reconstructed and is approximate (see db/changes).
exports.reviewFlow = async (months) => {
    const result = await pool.query(
        `SELECT from_status AS "from", to_status AS "to", COUNT(*)::int AS count
        FROM post_status_history
        WHERE from_status IS NOT NULL AND changed_at >= ${PERIOD_START}
        GROUP BY from_status, to_status
        ORDER BY count DESC`,[months]
    )
    return result.rows;
}

// Oldest posts with the given statuses (default: the ones waiting for an admin).
// Unlike the counts above, this shows titles, so it follows the normal visibility rule:
// users only see published posts and their own; admins see everything.
exports.oldestPosts = async (viewer, statuses, limit) => {
    const params = [statuses, limit];
    const visible = visibleTo(viewer, params);
    const result = await pool.query(
        `SELECT p.id, p.title, p.status, p.created_at,
                json_build_object('id', p.user_id, 'name', COALESCE(u.name, 'Unknown')) AS author,
                FLOOR(EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400)::int AS age_days
        FROM posts p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status = ANY($1) AND ${visible}
        ORDER BY p.created_at
        LIMIT $2`, params
    )
    return result.rows.map(({ age_days, ...post }) => ({ ...post, ageDays: age_days }));   // days since created
}