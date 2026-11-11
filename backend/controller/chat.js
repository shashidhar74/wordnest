// POST /chat — the blog chatbot.
// 1. our own model (ai-service) says WHAT the user wants (the intent)
// 2. this file decides HOW to answer, using the database and Gemini
// Contract: docs/openapi.yaml → /chat. Every query filters by role (req.userId / req.userRole from the JWT).

const { validationResult } = require('express-validator');
const pool = require('../util/database');
const { getSummary } = require('../util/summary');
const ai = require('../util/ai');                  // Gemini: writes post drafts
const aiService = require('../util/ai-service');

const STATUS_LABEL = {
    draft: 'Draft', pending: 'Pending', clarification: 'Clarification',
    published: 'Published', rejected: 'Rejected', closed: 'Closed'
};

exports.chat = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ message: 'Invalid message', errors: errors.array() });
    }
    const message = req.body.message.trim();
    const context = req.body.context || {};
    const awaiting = context.awaiting;
    const draft = context.draft || {};           // what the post flow has collected so far
    const user = { id: req.userId, role: req.userRole };

    try {
        // The bot asked a question → this message is the answer, no intent model needed.
        if (awaiting === 'post_for_summary') {
            return res.json(await summarize(user, { query: cleanText(message), confidence: 1 }));
        }
        if (awaiting === 'post_topic') {
            return res.json(await createPost(user, { topic: cleanTopic(message), tone: toneIn(message) }, 1));
        }
        if (awaiting === 'post_tone') {
            return res.json(await createPost(user, { topic: draft.topic, tone: toneIn(message) || 'informative' }, 1));
        }

        const { intent, confidence } = await aiService.classify(message);
        const base = { intent, confidence };

        switch (intent) {
            case 'find_posts':
                return res.json({ ...base, ...(await findPosts(message)) });
            case 'summarize_post':
                return res.json(await summarize(user, {
                    query: extractTitle(message),
                    latest: ORDINAL.test(message),
                    confidence
                }));
            case 'create_post':
                return res.json(await createPost(user, { topic: extractTopic(message), tone: toneIn(message) }, confidence));
            case 'post_report':
                return res.json({ ...base, ...(await report(user, message)) });
            case 'site_help':
                return res.json({ ...base, reply: siteHelp(message) });
            case 'greeting':
                return res.json({ ...base, reply: greeting(message) });
            default:
                return res.json({
                    ...base,
                    reply: 'Sorry, I can only help with this blog: finding, summarizing and writing posts, and post reports.'
                });
        }
    } catch (err) {
        // ai-service / Gemini errors already carry a statusCode (503, 429 ...); anything else is a 500
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    }
};

// POST /chat/warm: start waking the AI service and answer immediately (see routes/chat.js).
// At most one ping per minute, however many people open the app.
let lastWarm = 0;
exports.warm = (req, res) => {
    const now = Date.now();
    if (now - lastWarm > 60000) {
        lastWarm = now;
        aiService.warmUp();   // never throws; logs the result
    }
    res.status(202).json({ message: 'Waking the assistant' });
};

// ---- find_posts ----------------------------------------------------------------------

// Published posts only. With a topic: title or content match. Without: count + latest 5.
async function findPosts(message) {
    const topic = extractTopic(message);
    const params = [];
    let where = `status = 'published'`;
    if (topic) {
        params.push(`%${topic}%`);
        where += ` AND (title ILIKE $1 OR content ILIKE $1)`;
    }
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM posts WHERE ${where}`, params);
    const total = count.rows[0].total;
    const list = await pool.query(`SELECT id, title FROM posts WHERE ${where} ORDER BY id DESC LIMIT 5`, params);
    const posts = list.rows;
    const plural = total === 1 ? 'post' : 'posts';
    const more = total > posts.length ? ` Here are the latest ${posts.length}:` : ' Here they are:';

    let reply;
    if (topic) {
        reply = total
            ? `I found ${total} published ${plural} about "${topic}".${more}`
            : `I couldn't find any published posts about "${topic}". Try another word?`;
    } else {
        reply = total
            ? `There ${total === 1 ? 'is' : 'are'} ${total} published ${plural}.${more}`
            : 'There are no published posts yet.';
    }
    return { reply, posts };
}

// ---- summarize_post -------------------------------------------------------------------

const ORDINAL = /\b(1st|first|latest|newest|last|recent|top)\b/i;

// Which posts a user may summarize: published ones, their own, or any (admin).
function visibleToReader(user, params) {
    if (user.role === 'admin') return 'TRUE';
    params.push(user.id);
    return `(status = 'published' OR user_id = $${params.length})`;
}

async function summarize(user, { query, latest, confidence }) {
    const base = { intent: 'summarize_post', confidence };
    const params = [];
    let where = visibleToReader(user, params);
    if (query && !latest) {
        params.push(`%${query}%`);
        where += ` AND title ILIKE $${params.length}`;
    }

    let post = null;
    if (latest || query) {
        const found = await pool.query(
            `SELECT id, title, content, summary, summary_source FROM posts WHERE ${where} ORDER BY id DESC LIMIT 1`, params
        );
        post = found.rows[0] || null;
    }

    if (!post) {
        // Not clear which post → ask, and offer the latest published posts as buttons.
        const latestPosts = await pool.query(
            `SELECT id, title FROM posts WHERE status = 'published' ORDER BY id DESC LIMIT 5`
        );
        const notFound = query && !latest ? `I couldn't find a post called "${query}". ` : '';
        return {
            ...base,
            reply: `${notFound}Which post should I summarize? Click one, or type its title.`,
            posts: latestPosts.rows,
            postsAction: 'summarize',
            awaiting: 'post_for_summary'
        };
    }

    // saved summary, or Gemini, or our own summarizer when Gemini is busy (util/summary.js)
    const { summary } = await getSummary(post);
    return {
        ...base,
        reply: `Summary of "${post.title}":\n\n${summary}`,
        posts: [{ id: post.id, title: post.title }],
        postsAction: 'open'
    };
}

// ---- create_post -----------------------------------------------------------------------

// A short conversation that collects what's missing, then writes the post with Gemini:
//   no topic → ask "What should it be about?"   (awaiting: post_topic)
//   no tone  → ask "Which tone?" + tone chips    (awaiting: post_tone, draft: { topic })
//   both     → Gemini draft → preview in the chat (draft: { topic, tone, title, content })
// Nothing is saved here: the chat panel saves the draft with POST /feed/posts (image required),
// after the creator confirms. The frontend sends `draft` back as context.draft between steps.

const TONES = ['informative', 'casual', 'formal', 'funny'];

async function createPost(user, { topic, tone }, confidence) {
    const base = { intent: 'create_post', confidence };
    if (user.role !== 'creator') {
        return { ...base, reply: 'Only creators can write posts. Ask an admin to make you a creator.' };
    }
    if (!topic) {
        return {
            ...base,
            reply: 'Sure! What should the post be about?',
            awaiting: 'post_topic'
        };
    }
    if (!tone) {
        return {
            ...base,
            reply: `A post about "${topic}". Which tone should it have?`,
            awaiting: 'post_tone',
            draft: { topic },
            suggestions: TONES.map(capitalize)
        };
    }

    try {
        const post = await ai.generatePost(topic, tone, '');   // Gemini → { title, content }
        return {
            ...base,
            reply: `Here's a ${tone} draft about "${topic}". Add a cover image and save it as a draft, or open it in the editor to change it first.`,
            draft: { topic, tone, title: post.title, content: post.content }
        };
    } catch (err) {
        // Gemini busy / quota used up: don't fail the chat, offer the editor instead
        console.log('Chat post draft failed:', err.message);
        return {
            ...base,
            reply: "I couldn't write the draft right now (the AI writer is busy). Try again in a minute, or open the editor and write it there.",
            draft: { topic },
            action: { type: 'open_editor', topic }
        };
    }
}

// "write a funny post about…" → 'funny'. Also understands a few synonyms.
function toneIn(message) {
    const text = message.toLowerCase();
    const synonyms = { professional: 'formal', serious: 'formal', humorous: 'funny', fun: 'funny', relaxed: 'casual', informal: 'casual', educational: 'informative' };
    const word = text.match(/\b(informative|casual|formal|funny|professional|serious|humorous|fun|relaxed|informal|educational)\b/);
    if (!word) return undefined;
    return TONES.includes(word[1]) ? word[1] : synonyms[word[1]];
}

// The answer to "What should the post be about?" — the whole message, minus filler words
function cleanTopic(message) {
    const topic = cleanText(
        message.replace(/^(it'?s |write |a post |about |on |regarding )+/i, '')
               .replace(/\b(in an? )?(informative|casual|formal|funny|professional|humorous) (tone|style|way)\b/i, '')
    );
    return topic.length >= 3 ? topic.slice(0, 200) : undefined;
}

function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

// ---- post_report -----------------------------------------------------------------------
// Role rules, enforced in SQL:
//   user    → published only, no review comments
//   creator → their own posts (WHERE user_id = me)
//   admin   → all posts

function reportScope(user, params) {
    if (user.role === 'admin') return { where: 'TRUE', scope: 'all posts' };
    if (user.role === 'creator') {
        params.push(user.id);
        return { where: `user_id = $${params.length}`, scope: 'your posts' };
    }
    return { where: `status = 'published'`, scope: 'published posts' };
}

async function report(user, message) {
    const canReview = user.role === 'admin' || user.role === 'creator';
    const wantsFile = /\b(download|export|csv|excel|spreadsheet)\b/i.test(message);
    const asksWhy = /\b(why|reasons?|feedback|reviewer|review comments?|say|said|kyu|kyon)\b/i.test(message);

    // "Download the list with status" → rows for a CSV (the browser builds the file)
    if (wantsFile) {
        const params = [];
        const { where, scope } = reportScope(user, params);
        const result = await pool.query(
            `SELECT id, title, status, created_at, updated_on, review_comment
             FROM posts WHERE ${where} ORDER BY id DESC LIMIT 1000`, params
        );
        if (!result.rows.length) {
            return { reply: `There are no ${scope} to download yet.` };
        }
        const columns = ['ID', 'Title', 'Status', 'Created', 'Updated'];
        if (canReview) columns.push('Review comment');
        const rows = result.rows.map(r => {
            const row = [r.id, r.title, STATUS_LABEL[r.status] || r.status, isoDate(r.created_at), isoDate(r.updated_on)];
            if (canReview) row.push(r.review_comment || '');
            return row;
        });
        return {
            reply: `Here's the list of ${scope} with their status (${rows.length}). Click to download:`,
            download: { filename: `posts-${isoDate(new Date())}.csv`, columns, rows }
        };
    }

    // "Why was X rejected?" → the admin's review_comment
    if (asksWhy) {
        if (!canReview) {
            return { reply: "Only the post's author or an admin can see review comments." };
        }
        const params = [];
        const { where } = reportScope(user, params);
        let sql = `SELECT id, title, status, review_comment, reviewed_at FROM posts
                   WHERE ${where} AND status IN ('rejected', 'clarification')`;
        const title = extractReasonTitle(message);
        if (title) {
            params.push(`%${title}%`);
            sql += ` AND title ILIKE $${params.length}`;
        }
        sql += ' ORDER BY reviewed_at DESC NULLS LAST LIMIT 5';
        const result = await pool.query(sql, params);
        const whose = user.role === 'admin' ? '' : 'your ';

        if (!result.rows.length) {
            return {
                reply: title
                    ? `I couldn't find ${whose}rejected or sent-back post matching "${title}".`
                    : `None of ${whose || 'the '}posts are rejected or waiting for clarification.`
            };
        }
        const lines = result.rows.map(r => {
            const what = r.status === 'rejected' ? 'Rejected' : 'Sent back for clarification';
            const when = r.reviewed_at ? ` on ${isoDate(r.reviewed_at)}` : '';
            const reason = (r.review_comment || '').trim() || '(no comment entered)';
            return `• "${r.title}": ${what}${when}.\n  Reason: ${reason}`;
        });
        return {
            reply: `Here's what the reviewer said:\n\n${lines.join('\n\n')}`,
            posts: result.rows.map(r => ({ id: r.id, title: r.title }))
        };
    }

    // Status-wise counts
    const params = [];
    const { where, scope } = reportScope(user, params);
    const result = await pool.query(
        `SELECT status, COUNT(*)::int AS count FROM posts WHERE ${where} GROUP BY status`, params
    );
    const byStatus = Object.fromEntries(result.rows.map(r => [r.status, r.count]));
    const stats = Object.keys(STATUS_LABEL)
        .filter(s => byStatus[s])
        .map(s => ({ label: STATUS_LABEL[s], status: s, count: byStatus[s] }));
    const total = stats.reduce((sum, row) => sum + row.count, 0);

    if (!total) {
        return { reply: user.role === 'creator' ? "You don't have any posts yet." : `There are no ${scope} yet.` };
    }
    stats.push({ label: 'Total', count: total });
    let reply = `Status report for ${scope}:`;
    if (!canReview) {
        reply = `There ${total === 1 ? 'is' : 'are'} ${total} published ${total === 1 ? 'post' : 'posts'}. ` +
            'Draft, pending and rejected counts are only visible to their authors and admins.';
    }
    return { reply, stats };
}

// ---- site_help: short FAQ (first matching rule wins) -----------------------------------

const FAQ = [
    [/\b(image|photo|picture|png|jpe?g|gif|upload|format|file type|size|mb)\b/i,
        'Images must be PNG or JPG, up to 2 MB. A new post needs an image; when editing you can keep the old one.'],
    [/\b(clarification|sent back|send back)\b/i,
        'Clarification means an admin sent your post back with a comment. Edit it, then click Submit again. ' +
        'Ask me "why was my post sent back?" to see the comment.'],
    [/\b(reject|rejected)\b/i,
        'A rejected post can\'t be resubmitted. You can delete it and write a new one. Ask me "why was my post rejected?" for the reason.'],
    [/\b(submit|review|approv\w*|pending|publish\w*)\b/i,
        'Save your post as a draft, then click Submit. It becomes Pending until an admin approves it (Published), ' +
        'rejects it, or sends it back for clarification.'],
    [/\b(edit|change|update|title)\b/i,
        'You can edit your own posts while they are Draft or Clarification. Titles and content need at least 5 characters.'],
    [/\b(delete|remove)\b/i,
        'Creators can delete their own Draft or Rejected posts. Admins can delete any post.'],
    [/\b(close|closed)\b/i,
        'Closed posts were published and then closed by their author or an admin. No further changes are possible.'],
    [/\b(password|login|log in|sign ?in|sign ?up|logout|log out|sign out|session|expired|account|locked|profile)\b/i,
        'Sessions last 1 hour, so sign in again if yours expires. Password reset and profile changes aren\'t available yet; please contact an admin.'],
    [/\b(role|roles|creator|admin|writer|user)\b/i,
        'Roles: users read published posts, creators write and submit posts, admins review, approve, reject and close them.'],
    [/\b(ai|summari[sz]e|write with)\b/i,
        'In the editor, "Write with AI" drafts a title and content from a topic. "Summarize with AI" appears on every post.'],
    [/\b(error|500|stuck|not working|nahi ho raha)\b/i,
        'Sorry about that! Try again in a minute, and check the image is PNG/JPG under 2 MB. If it keeps happening, tell an admin.'],
];

function siteHelp(message) {
    const hit = FAQ.find(([pattern]) => pattern.test(message));
    return hit ? hit[1] :
        'Creators write posts and submit them for review; an admin approves, rejects or sends them back. ' +
        'Ask me about images, statuses, editing or roles.';
}

function greeting(message) {
    if (/\b(thanks?|thank you|thx|shukriya|dhanyavaad|appreciate)\b/i.test(message)) {
        return "You're welcome! Anything else I can help with?";
    }
    if (/\b(bye|goodbye|see (ya|you)|later|ttyl|alvida|good night|gn)\b/i.test(message)) {
        return 'Bye! Come back any time.';
    }
    return 'Hi! I can find posts, summarize a post, help you write one, give a status report, or answer questions about the blog.';
}

// ---- small text helpers (rule-based slot filling; a trained model can replace them later) ----

// "posts about cooking?" → "cooking"; "posts on the blog" → undefined (a place, not a topic)
function extractTopic(message) {
    const match = message.match(/\b(?:about|on|abt|regarding)\s+(.+)/i);
    if (!match) return undefined;
    const topic = match[1]
        .replace(/\b(with|and add|using|please|pls)\b.*$/i, '')
        .replace(/[?.!]+$/, '')
        .trim();
    if (!topic || /^(the|this|your|our)\s+(blog|site|website)$/i.test(topic)) return undefined;
    return topic.length >= 3 ? topic.slice(0, 100) : undefined;
}

// "summarize 'Why We Sleep Better'" / "tldr of the juntleman post" → the title part
function extractTitle(message) {
    const quoted = message.match(/["'“‘]([^"'”’]{3,})["'”’]/);
    if (quoted) return quoted[1].trim();
    const rest = message
        .replace(/^(please\s+|pls\s+|can you\s+)/i, '')
        .replace(/\b(summari[sz]e|summary( of)?|tl;?dr( of)?|sum up|gist( of)?|recap( of)?|key points( of| from)?)\b/gi, '')
        .replace(/\b(the|this|that|a|me|for|of|post|article|blog|called|titled|named|please|pls)\b/gi, '')
        .replace(ORDINAL, '');
    const title = cleanText(rest);
    return title.length >= 3 ? title : undefined;
}

// "why was the juntleman post rejected" → "juntleman"; "why was my post rejected" → undefined
function extractReasonTitle(message) {
    const quoted = message.match(/["'“‘]([^"'”’]{3,})["'”’]/);
    if (quoted) return quoted[1].trim();
    const rest = message.replace(
        /\b(why|was|were|is|are|did|does|has|have|my|our|i|the|a|any|all|this|that|these|posts?|articles?|blogs?|rejected|reject|rejection|sent|send|back|in|clarification|reason|reasons|for|what|which|admin|reviewer|say|said|about|feedback|give|gave|got|get|of|hua|kyu|kyon|kiya|mera|mere|ka|ki|ko|to|me|show)\b/gi,
        ''
    );
    const title = cleanText(rest);
    return title.length >= 3 ? title : undefined;
}

function cleanText(text) {
    return text.replace(/[?.!,:;]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function isoDate(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : '';
}
