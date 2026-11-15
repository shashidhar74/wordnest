// Demo data for WordNest: WIPES users, posts, comments and post_status_history, then fills them with
// 12 months of realistic activity so every dashboard chart has something to show.
//
//   node db/seed-demo.js --local --yes          local database (DB_* in .env)
//   node db/seed-demo.js --neon --yes           Neon (NEON_URL in .env), i.e. the LIVE site
//   node db/seed-demo.js --local --neon --yes   both, with the same data and passwords
//   add --keep-passwords                        keep the current logins (re-uses the existing password hashes)
//
// Besides random posts it adds fixed SCENARIOS, so every workflow path exists: drafts (new and old),
// pending (fresh, overdue, resubmitted), clarification (fresh, overdue), published (fast, after one and
// two send-backs), rejected (directly, after a send-back), closed (directly, after a send-back),
// summaries from Gemini / our summarizer / none, and a comment thread with replies, an edited comment
// and a deleted comment that still has a reply.
//
// Passwords are random on every run and only printed to the console: they are never written to a file,
// because this repo is public and the accounts may be live. Copy them when the script prints them.
// Dates are relative to "now", so the dashboard always shows the last 12 months filled.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const args = process.argv.slice(2);
const KEEP_PASSWORDS = args.includes('--keep-passwords');
const targets = ['--local', '--neon'].filter((a) => args.includes(a));
if (!args.includes('--yes') || targets.length === 0) {
    console.log('This DELETES all users, posts and comments. Run with --local and/or --neon, plus --yes.');
    process.exit(1);
}

// ---------------------------------------------------------------- deterministic randomness
// Seeded, so the posts/dates are the same every run (only the passwords change).
let seed = 20261115;
function rnd() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + rnd() * (b - a);
const pickOne = (list) => list[Math.floor(rnd() * list.length)];
const HOUR = 3600e3, DAY = 24 * HOUR;

// ---------------------------------------------------------------- people
const PEOPLE = [
    { name: 'Shashi', email: 'shashi@example.com', role: 'admin' },
    { name: 'Ananya Rao', email: 'ananya@example.com', role: 'admin' },
    { name: 'Priya Sharma', email: 'priya@example.com', role: 'creator' },
    { name: 'Arjun Menon', email: 'arjun@example.com', role: 'creator' },
    { name: 'Meera Nair', email: 'meera@example.com', role: 'creator' },
    { name: 'Rahul Verma', email: 'rahul@example.com', role: 'creator' },
    { name: 'Kavya Iyer', email: 'kavya@example.com', role: 'creator' },
    { name: 'Nikhil Joshi', email: 'nikhil@example.com', role: 'creator' },
    { name: 'Divya Reddy', email: 'divya@example.com', role: 'user' },
    { name: 'Karthik S', email: 'karthik@example.com', role: 'user' },
    { name: 'Sneha Patil', email: 'sneha@example.com', role: 'user' },
];
const users = PEOPLE.map((p, i) => ({ id: i + 1, ...p }));
const admins = users.filter((u) => u.role === 'admin');
const byEmail = (e) => users.find((u) => u.email === e);

// ---------------------------------------------------------------- posts (author, title, body)
const POSTS = [
    ['priya', 'Angular signals in plain words', 'Signals are values that tell Angular when they change. Instead of checking the whole page on every click, Angular now updates only the parts that read a changed signal. In this post I rebuild a small cart with signal(), computed() and effect(), and compare it with the old RxJS version. The signal version is shorter and easier to follow.'],
    ['arjun', 'A weekend in Hampi on a small budget', 'Hampi is best seen slowly, on a bicycle, between boulders and temple ruins. I spent two days there for under four thousand rupees, including the overnight bus from Bengaluru. The sunrise from Matanga hill was the highlight. Carry water, start early and skip the noon heat.'],
    ['meera', 'Filter coffee at home, the right way', 'Good filter coffee needs three things: fresh powder with a little chicory, a steel filter, and patience. Pack the powder loosely, pour boiling water, and wait twenty minutes for the decoction. Mix it with hot milk in a 1 to 3 ratio and froth it by pouring between the tumbler and the dabara.'],
    ['rahul', 'Postgres indexes explained with a library', 'An index is like the card catalogue of a library: without it you walk every shelf. I show how a B-tree index turns a slow sequential scan into a fast lookup, how to read EXPLAIN ANALYZE, and why an index on lower(email) is needed when you search case-insensitively. Indexes speed up reads but slow down writes, so add them where queries need them.'],
    ['kavya', 'Monsoon trek to Kudremukh', 'Kudremukh in July is green, wet and full of leeches. The trail is twenty kilometres there and back, with a steady climb through grasslands and shola forest. Book the forest permit in advance and start before seven. Good shoes and salt for the leeches matter more than fitness.'],
    ['nikhil', 'Learning NestJS after Express', 'NestJS felt heavy at first, with modules, decorators and dependency injection everywhere. After a week it made sense: it gives Express a structure that big teams agree on. Controllers stay thin, services hold logic, and guards replace hand-written auth middleware. If you know Angular, Nest will feel familiar.'],
    ['priya', 'Street food of VV Puram', 'Food Street in VV Puram comes alive after six in the evening. Start with akki rotti, move to the famous dosa stalls, and finish with a jalebi made in front of you. Go on a weekday to avoid the crowd. Most stalls take UPI, but carry some cash just in case.'],
    ['arjun', 'Home workouts with no equipment', 'You do not need a gym to stay fit. A twenty-minute routine of squats, push-ups, lunges and planks, done four times a week, builds real strength. Track your reps in a notebook and add a few each week. Consistency matters more than intensity.'],
    ['meera', 'Bonsai basics for beginners', 'Start with a hardy tree like ficus or jade, not a delicate juniper. Water when the top soil is dry, give it morning sun, and prune new shoots to keep the shape. Repot every two years in spring. Bonsai teaches patience: real results take years, not weeks.'],
    ['rahul', 'Python for absolute beginners', 'Python reads almost like English, which makes it a great first language. In this post we install Python, write a hello world, and build a small expense tracker with lists and dictionaries. By the end you will understand variables, loops and functions. Practise a little every day.'],
    ['kavya', 'Weekend baking: banana bread', 'Overripe bananas make the best banana bread. Mash three of them, mix with melted butter, sugar, one egg and flour, then bake at 175 degrees for fifty minutes. Add walnuts or chocolate chips if you like. Let it cool before slicing, or it will crumble.'],
    ['nikhil', 'Cricket statistics with SQL', 'I loaded ten years of IPL ball-by-ball data into Postgres and answered fun questions with SQL. Who has the best strike rate in death overs? Which venue favours chasing teams? Window functions and GROUP BY did most of the work. Data you care about is the best way to learn SQL.'],
    ['priya', 'A minimal desk setup that works', 'My desk has a laptop stand, an external keyboard, one monitor and a lamp. Nothing else. Raising the screen to eye level fixed my neck pain, and a warm lamp made evening work easier on the eyes. Spend on the chair first; everything else can be cheap.'],
    ['arjun', 'Reading list for 2026', 'This year I want to read twelve books, one a month, mixing fiction and non-fiction. The list includes a history of the Vijayanagara empire, two classic novels, a book on habits and one on software design. I will write a short note after each book here.'],
    ['meera', 'Tea gardens of Munnar', 'Munnar is a sea of tea bushes trimmed to waist height. Visit the tea museum to see how leaves become tea, then walk the estates in the early morning mist. Stay away from the main town and pick a homestay on the hills. The drive up from Kochi is beautiful.'],
    ['rahul', 'Upgrading to Express 5', 'Express 5 finally handles errors from async route handlers: a rejected promise goes straight to your error middleware. I upgraded a small API and removed most try/catch blocks. A few things changed, like path syntax and req.query being read-only. The upgrade took one afternoon.'],
    ['kavya', 'Clean code habits that stuck', 'Out of all the clean code advice, a few habits made the biggest difference for me: small functions with clear names, no magic numbers, early returns instead of deep nesting, and deleting dead code. Code is read far more often than it is written, so write for the reader.'],
    ['nikhil', 'Understanding JWT authentication', 'A JSON Web Token is a signed note that says who you are. The server signs it at login and checks the signature on every request, without a database lookup. The payload is only encoded, not encrypted, so never put secrets in it. Short expiry times limit the damage if a token leaks.'],
    ['priya', 'Making Tailwind work with dark mode', 'Instead of writing dark: variants everywhere, define colours as CSS variables and switch their values with a class on the html element. Components then use bg-surface or text-fg and work in both themes automatically. It keeps the markup clean and the palette in one place.'],
    ['arjun', 'Gokarna beaches in two days', 'Gokarna is quieter than Goa and has five beaches connected by cliff trails. Walk from Kudle to Om beach in the evening and catch the sunset at Half Moon. Stay in a beach shack and eat fish thali at the small cafes. Avoid the trek after dark.'],
    ['meera', 'Growing herbs on a balcony', 'Mint, basil, curry leaves and coriander grow well in small pots on a sunny balcony. Use well-draining soil, water in the morning, and pinch the tops to keep them bushy. Fresh herbs make a big difference in everyday cooking and cost almost nothing.'],
    ['rahul', 'Docker for web developers', 'Docker packages your app with everything it needs, so it runs the same on every machine. I containerise a Node API and a Postgres database with docker compose, then explain images, containers and volumes. No more "it works on my machine".'],
    ['kavya', 'Ragi mudde, a Karnataka staple', 'Ragi mudde is a ball of finger millet flour cooked in water, eaten with soppina saaru or chicken curry. It is filling, rich in calcium and easy to make once you learn the stirring. Swallow it, do not chew it, as the elders say.'],
    ['nikhil', 'Rate limiting an Express API', 'Rate limiting protects login and expensive routes from abuse. With express-rate-limit you set a window and a maximum, and the server answers 429 when a client goes over. Behind a proxy, remember to trust the proxy so the real client IP is used, or every user shares one limit.'],
    ['priya', 'Accessibility checks every page needs', 'Every page should work with a keyboard, have visible focus, use real buttons and labels, and keep text contrast readable. Five minutes with the tab key and a screen reader finds most problems. Accessible pages are better pages for everyone.'],
    ['arjun', 'Coorg coffee estate stay', 'A homestay in a Coorg coffee estate means waking up to birdsong and fresh coffee. Walk the plantation with the owner, learn how beans are picked and dried, and eat pandi curry for dinner. Visit in November when the coffee flowers bloom.'],
    ['meera', 'Simple sourdough starter', 'A sourdough starter is just flour and water left to ferment. Feed it equal weights every day for a week until it doubles within six hours. Keep it in the fridge between bakes and feed it weekly. Your first loaf will be dense; the fifth will be great.'],
    ['rahul', 'Writing good commit messages', 'A good commit message says what changed and why, in the imperative mood: "Add rate limit to login" not "added stuff". Keep the first line under seventy characters and explain the reason in the body. Your future self will thank you during debugging.'],
    ['kavya', 'Mysuru Dasara travel guide', 'Mysuru during Dasara is lit up every evening, and the palace glows with thousands of bulbs. See the Jamboo Savari procession on Vijayadashami, but find your spot early. Book hotels months ahead, and try Mysore pak from the original shop.'],
    ['nikhil', 'Testing Node APIs with Supertest', 'Supertest sends real HTTP requests to your Express app without starting a server. Combine it with Jest to check status codes, response bodies and error cases. Test the unhappy paths too: missing token, wrong role, invalid input. They catch the bugs users actually hit.'],
    ['priya', 'Designing a dashboard people read', 'A good dashboard answers one question per chart and puts the summary first. Use colour for meaning, not decoration: one colour per status, the same everywhere. Avoid pie charts with ten slices. If a number needs attention, make it look different.'],
    ['arjun', 'Cycling around Bengaluru lakes', 'Early Sunday mornings are perfect for cycling around Hebbal, Sankey and Ulsoor lakes. The roads are empty before seven, and the lakes are full of birds. Carry lights, a helmet and water. End the ride with idli and coffee at a darshini.'],
    ['meera', 'Millet recipes for busy weekdays', 'Millets cook as fast as rice and keep you full longer. Try foxtail millet upma for breakfast, little millet curd rice for lunch, and kodo millet pulao for dinner. Soak them for an hour before cooking for a softer texture.'],
    ['rahul', 'SQL window functions by example', 'Window functions calculate across rows without collapsing them. ROW_NUMBER gives the top three posts per author, RANK handles ties, and SUM OVER builds a running total. Once you understand PARTITION BY and ORDER BY inside OVER, many hard queries become simple.'],
    ['kavya', 'Photographing birds with a phone', 'You can take decent bird photos with a phone if you get close and use good light. Sit still near a feeder, shoot in the golden hour, and use burst mode. A cheap clip-on zoom lens helps. Patience beats equipment.'],
    ['nikhil', 'Deploying a full-stack app for free', 'Render, Neon and Cloudinary together can host a full-stack app for free. The static frontend, Node API and Python service run on Render, Postgres on Neon, and images on Cloudinary. The catch: free services sleep, so the first request after a break is slow.'],
    ['priya', 'Typing faster as a developer', 'Typing speed is not the bottleneck in programming, but fewer typos and less looking at the keyboard keep you in flow. Fifteen minutes a day of touch-typing practice for a month raised my speed from forty to seventy words per minute.'],
    ['arjun', 'Chikmagalur in the rain', 'Chikmagalur in the monsoon is misty and quiet. Drive up to Mullayanagiri if the road is open, visit the waterfalls in full flow, and stay in a coffee estate cottage. Pack a raincoat and expect slow roads.'],
    ['meera', 'Composting in an apartment', 'Kitchen waste can become rich compost even in a flat. Use a three-pot system with dry leaves or cocopeat, turn the mix every few days, and keep it moist but not wet. In about six weeks you get compost for your balcony plants.'],
    ['rahul', 'Why I moved to TypeScript', 'TypeScript catches mistakes before the code runs: a wrong property name, a missing null check, a function called with the wrong arguments. The editor becomes smarter too. Start by renaming files to .ts and fixing errors one by one; strict mode can come later.'],
    ['kavya', 'Udupi temple food trail', 'Udupi is the home of the masala dosa and the Krishna temple meal. Start at the temple for a simple lunch, then visit the old hotels near Car Street for dosa and goli baje. Do not leave without trying gadbad ice cream.'],
    ['nikhil', 'Threaded comments in Postgres', 'Comments with replies are a tree. Store a parent_id on each comment and fetch the thread with one query, or with a recursive CTE for deeper trees. Soft delete comments that have replies, so the conversation below them still makes sense.'],
];

const COMMENTS = [
    'This was really helpful, thank you!', 'Bookmarked. Exactly what I was looking for.', 'Great post, very clearly explained.',
    'I tried this last weekend and it worked well.', 'Could you write a follow-up on this?', 'Nice photos and tips, thanks for sharing.',
    'Short and to the point. Loved it.', 'I had the same problem, this fixed it.', 'Interesting, I never thought about it this way.',
    'Saving this for my next trip.', 'Do you have a recommendation for beginners?', 'Shared this with my team.',
];
const REPLIES = [
    'Thanks! Glad it helped.', 'Yes, a follow-up is coming soon.', 'Good question, I will add a section on that.',
    'Same here, it took me a while to figure out.', 'Thank you for reading!', 'Agreed, that tip saved me a lot of time.',
];
const SEND_BACK = ['Please add a cover image.', 'Can you add a short introduction?', 'Please check the facts in the second paragraph.', 'The title is too long, please shorten it.'];
const REJECT = ['Off-topic for this blog.', 'Too short to publish as a post.', 'Duplicate of an existing post.'];

// ---------------------------------------------------------------- build the timeline
const NOW = Date.now() - HOUR;         // nothing in the last hour, nothing in the future
const MONTH_WEIGHTS = [2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5];   // 12 months ago → this month: activity grows

// Which month (0 = 11 months ago … 11 = this month) each post is created in
const postMonths = [];
MONTH_WEIGHTS.forEach((w, m) => { for (let i = 0; i < w; i++) postMonths.push(m); });

const creators = Object.fromEntries(users.filter((u) => u.role === 'creator').map((u) => [u.email.split('@')[0], u]));
const posts = [], history = [], comments = [];

// Some authors write a lot more than others (11 + 9 + 7 + 6 + 5 + 4 = 42 posts), in a shuffled order
const AUTHOR_SHARE = { priya: 11, arjun: 9, meera: 7, rahul: 6, kavya: 5, nikhil: 4 };
const authorOrder = Object.entries(AUTHOR_SHARE).flatMap(([who, n]) => Array(n).fill(who));
for (let i = authorOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [authorOrder[i], authorOrder[j]] = [authorOrder[j], authorOrder[i]];
}

// Where posts older than 3 weeks end up: 9 published, 2 rejected, 2 closed, 1 draft in every 14
const OLDER_MIX = ['published', 'published', 'rejected', 'published', 'closed', 'published', 'published',
                   'draft', 'published', 'rejected', 'published', 'closed', 'published', 'published'];
let olderCount = 0;

POSTS.forEach(([, title, content], i) => {
    const author = creators[authorOrder[i]];
    const id = i + 1;
    const monthsAgo = 11 - postMonths[i];
    const monthStart = new Date(new Date(NOW).getFullYear(), new Date(NOW).getMonth() - monthsAgo, 1).getTime();
    const monthEnd = Math.min(NOW - 2 * HOUR, new Date(new Date(NOW).getFullYear(), new Date(NOW).getMonth() - monthsAgo + 1, 1).getTime());
    const created = between(monthStart, monthEnd);
    const ageDays = (NOW - created) / DAY;

    const events = [{ from: null, to: 'draft', by: author.id, at: created }];
    const add = (from, to, by, at, comment = null) => events.push({ from, to, by, at, comment });
    let status = 'draft', reviewedBy = null, reviewedAt = null, reviewComment = null;
    const fits = (t) => t < NOW;

    // Plan where this post ends up, depending on its age
    const r = rnd();
    let plan;
    if (ageDays < 6) plan = r < 0.35 ? 'draft' : 'pending';
    else if (ageDays < 21) plan = r < 0.1 ? 'draft' : r < 0.4 ? 'pending' : r < 0.55 ? 'clarification' : r < 0.9 ? 'published' : 'rejected';
    else plan = OLDER_MIX[olderCount++ % OLDER_MIX.length];   // fixed mix, so the totals always look realistic

    if (plan !== 'draft') {
        // Reviews got faster over the year: ~40 h a year ago, ~10 h now
        const reviewHours = () => (8 + monthsAgo * 2.8) * between(0.6, 1.4) * HOUR;
        const admin = () => pickOne(admins);
        let t = created + between(1, 18) * HOUR;                         // submit
        if (fits(t)) { add('draft', 'pending', author.id, t); status = 'pending'; }

        const wantsLoop = plan === 'clarification' || (plan !== 'pending' && rnd() < 0.2);
        if (status === 'pending' && plan !== 'pending' && wantsLoop) {
            const at = t + reviewHours(), by = admin(), c = pickOne(SEND_BACK);
            if (fits(at)) {
                add('pending', 'clarification', by.id, at, c);
                status = 'clarification'; reviewedBy = by.id; reviewedAt = at; reviewComment = c; t = at;
                const back = t + between(5, 30) * HOUR;                  // author fixes it and resubmits
                if (plan !== 'clarification' && fits(back)) { add('clarification', 'pending', author.id, back); status = 'pending'; t = back; }
            }
        }
        if (status === 'pending' && ['published', 'rejected', 'closed'].includes(plan)) {
            const at = t + reviewHours(), by = admin();
            const to = plan === 'rejected' ? 'rejected' : 'published';
            const c = to === 'rejected' ? pickOne(REJECT) : null;
            if (fits(at)) {
                add('pending', to, by.id, at, c);
                status = to; reviewedBy = by.id; reviewedAt = at; if (c) reviewComment = c; t = at;
                const closeAt = t + between(10, 60) * DAY;
                if (plan === 'closed' && fits(closeAt)) { add('published', 'closed', author.id, closeAt); status = 'closed'; }
            }
        }
    }

    const lastAt = events[events.length - 1].at;
    const post = {
        id, title, content, status, user_id: author.id, created_at: created, updated_on: lastAt,
        reviewed_by: reviewedBy, reviewed_at: reviewedAt, review_comment: reviewComment,
        summary: null, summary_source: null, summary_updated_at: null,
    };

    // Published posts: cached AI summaries (Gemini mostly, our own summarizer as fallback) and comments
    const publishedAt = events.find((e) => e.to === 'published')?.at;
    if (publishedAt) {
        const s = rnd();
        if (s < 0.75) {
            post.summary = content.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.');
            post.summary_source = s < 0.55 ? 'gemini' : 'extractive';
            post.summary_updated_at = Math.min(NOW, publishedAt + between(1, 72) * HOUR);
        }
        const readers = users.filter((u) => u.id !== author.id);
        const howMany = Math.floor(between(0, 3 + (11 - monthsAgo) * 0.4));
        for (let k = 0; k < howMany; k++) {
            const at = publishedAt + between(2, 40 * 24) * HOUR;
            if (!fits(at)) continue;
            const c = { id: comments.length + 1, post_id: id, user_id: pickOne(readers).id, parent_id: null,
                        content: pickOne(COMMENTS), created_at: at, deleted_at: null };
            comments.push(c);
            if (rnd() < 0.45) {                                          // the author (or a reader) replies
                const rAt = at + between(1, 72) * HOUR;
                if (fits(rAt)) {
                    comments.push({ id: comments.length + 1, post_id: id, user_id: rnd() < 0.7 ? author.id : pickOne(readers).id,
                                    parent_id: c.id, content: pickOne(REPLIES), created_at: rAt, deleted_at: null });
                    // Like the app: only a comment WITH replies is soft-deleted ("[deleted]"); others are removed
                    if (rnd() < 0.12) c.deleted_at = Math.min(NOW, rAt + between(1, 48) * HOUR);
                }
            }
        }
    }
    posts.push(post);
    events.forEach((e) => history.push({ post_id: id, ...e }));
});

// ---------------------------------------------------------------- fixed scenarios
// The random posts above make the charts look natural; these make sure EVERY workflow path and
// edge case exists, recent enough to show in the 3-month view as well.
// steps: [action, hours after the previous step, (admin 0 = Shashi / 1 = Ananya), (comment)]
//   submit / resubmit → pending (author) · sendBack → clarification · approve → published
//   reject → rejected · close → closed (author)
const SCENARIOS = [
    { who: 'nikhil', daysAgo: 1, title: 'Notes on Angular zoneless change detection', summary: null,
      content: 'Angular can now run without zone.js. Signals tell Angular exactly what changed, so it no longer has to guess after every event. These are my rough notes before I turn them into a proper post.',
      steps: [] },                                                             // draft, never submitted
    { who: 'kavya', daysAgo: 45, title: 'Half-written: my first marathon', summary: null,
      content: 'I started training for a full marathon in January. This draft has my training plan, what I ate and how my knees held up. I still need to add the race day story.',
      steps: [] },                                                             // old draft, forgotten
    { who: 'meera', daysAgo: 2, title: 'Five houseplants that survive low light', summary: null,
      content: 'Snake plant, ZZ plant, pothos, peace lily and cast iron plant all grow in rooms with little sun. Water them less than you think. Wipe the leaves once a month so they can breathe.',
      steps: [['submit', 3]] },                                                // pending, fresh
    { who: 'rahul', daysAgo: 13, title: 'Caching API responses with Redis', summary: null,
      content: 'Redis keeps hot data in memory so repeated requests skip the database. Cache the result with a short expiry, and clear it when the data changes. Measure before and after, because caching adds its own complexity.',
      steps: [['submit', 5]] },                                                // pending, waiting too long (red)
    { who: 'priya', daysAgo: 9, title: 'Writing alt text that helps', summary: null,
      content: 'Alt text describes an image for people who cannot see it. Say what the image shows and why it matters on this page, in one sentence. Skip "image of" and leave decorative images empty.',
      steps: [['submit', 2], ['sendBack', 20, 1, 'Please add two examples of good and bad alt text.'], ['resubmit', 30]] }, // pending again after a send-back
    { who: 'arjun', daysAgo: 4, title: 'Night trek to Skandagiri', summary: null,
      content: 'Skandagiri is famous for the sunrise above the clouds. The trek starts at three in the morning from the village at the base. Book through the forest department, carry a torch and dress warm.',
      steps: [['submit', 4], ['sendBack', 18, 0, 'Please add the booking link and the entry fee.']] },         // clarification, fresh
    { who: 'nikhil', daysAgo: 18, title: 'GraphQL vs REST for small teams', summary: null,
      content: 'GraphQL lets the client ask for exactly the fields it needs, but it adds a schema, resolvers and new caching problems. For one frontend and simple screens, REST is usually enough.',
      steps: [['submit', 6], ['sendBack', 30, 1, 'Can you add a small example query?']] },                  // clarification, author hasn't answered (red)
    { who: 'priya', daysAgo: 25, title: 'Dark mode colours that are easy on the eyes', summary: 'gemini', comments: 'thread',
      content: 'Pure black backgrounds with pure white text are tiring to read. Use a very dark blue-grey for the page, slightly lighter cards, and off-white text. Lower the saturation of accent colours so they do not glow.',
      steps: [['submit', 1], ['approve', 3, 0]] },                             // published fast, busy comment thread
    { who: 'meera', daysAgo: 35, title: 'Pickling lemons the traditional way', summary: 'extractive', comments: 'few',
      content: 'Lemon pickle needs sun, salt and time. Cut the lemons, rub them with salt and turmeric, and leave the jar in the sun for a week, shaking it daily. Then add chilli powder and hot oil.',
      steps: [['submit', 2], ['sendBack', 24, 1, 'Please mention how long the pickle keeps.'], ['resubmit', 20], ['approve', 10, 0]] }, // published after one loop
    { who: 'rahul', daysAgo: 50, title: 'Logging in Node.js the right way', summary: null, comments: 'none',
      content: 'console.log is fine on your laptop but not in production. Use a logger with levels, write JSON, and never log passwords or tokens. Add a request id so you can follow one request through the logs.',
      steps: [['submit', 3], ['sendBack', 30, 0, 'Please add an example with pino.'], ['resubmit', 12], ['sendBack', 20, 1, 'The example is missing the request id.'], ['resubmit', 8], ['approve', 6, 0]] }, // two loops, no comments, no summary
    { who: 'kavya', daysAgo: 28, title: 'My favourite phone wallpapers', summary: null,
      content: 'A list of wallpapers I like.',
      steps: [['submit', 2], ['reject', 26, 1, 'Too short to publish as a post.']] },                       // rejected straight away
    { who: 'arjun', daysAgo: 40, title: 'Top 10 trekking shoes (sponsored)', summary: null,
      content: 'Here are ten trekking shoes with links to buy them. Each one is great for every kind of trail.',
      steps: [['submit', 5], ['sendBack', 22, 0, 'Please explain why you chose these shoes.'], ['resubmit', 48], ['reject', 12, 1, 'Reads like an advert; off-topic for this blog.']] }, // rejected after a loop
    { who: 'priya', daysAgo: 70, title: 'Diwali sweets order list 2026', summary: 'gemini', comments: 'few',
      content: 'Our family Diwali sweets list: kaju katli, mysore pak, besan laddoo and jalebi, with the shops that make them best in Bengaluru. Order at least a week early.',
      steps: [['submit', 2], ['approve', 15, 1], ['close', 30 * 24]] },        // published, later closed by the author
    { who: 'meera', daysAgo: 60, title: 'Ganesh Chaturthi eco-friendly idols', summary: 'extractive',
      content: 'Clay idols without paint dissolve in a bucket at home, and the clay can go back into your garden. This post lists makers who sell natural clay idols and how to do the immersion at home.',
      steps: [['submit', 1], ['sendBack', 10, 0, 'Please add a photo or two.'], ['resubmit', 6], ['approve', 8, 1], ['close', 20 * 24]] }, // loop, published, closed
];

SCENARIOS.forEach((sc, k) => {
    const id = POSTS.length + k + 1;
    const author = creators[sc.who];
    const created = NOW - sc.daysAgo * DAY;
    const events = [{ from: null, to: 'draft', by: author.id, at: created }];
    let status = 'draft', t = created, reviewedBy = null, reviewedAt = null, reviewComment = null;
    for (const [action, hours, adminIndex, comment] of sc.steps) {
        t += hours * HOUR;
        const admin = admins[adminIndex ?? 0];
        const to = { submit: 'pending', resubmit: 'pending', sendBack: 'clarification', approve: 'published', reject: 'rejected', close: 'closed' }[action];
        const by = ['submit', 'resubmit', 'close'].includes(action) ? author.id : admin.id;
        events.push({ from: status, to, by, at: t, comment: comment ?? null });
        if (['sendBack', 'approve', 'reject'].includes(action)) {     // admin review: same columns the app fills
            reviewedBy = admin.id; reviewedAt = t; if (comment) reviewComment = comment;
        }
        status = to;
    }
    if (t >= NOW) throw new Error(`scenario "${sc.title}" ends in the future, shorten its steps`);

    const post = { id, title: sc.title, content: sc.content, status, user_id: author.id, created_at: created, updated_on: t,
                   reviewed_by: reviewedBy, reviewed_at: reviewedAt, review_comment: reviewComment,
                   summary: null, summary_source: null, summary_updated_at: null };
    const publishedAt = events.find((e) => e.to === 'published')?.at;
    if (publishedAt && sc.summary) {
        post.summary = sc.content.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.');
        post.summary_source = sc.summary;
        post.summary_updated_at = publishedAt + 2 * HOUR;
    }
    if (publishedAt && sc.comments === 'few') {
        comments.push({ id: comments.length + 1, post_id: id, user_id: byEmail('divya@example.com').id, parent_id: null,
                        content: 'Thanks, this was useful!', created_at: publishedAt + 20 * HOUR, deleted_at: null });
    }
    if (publishedAt && sc.comments === 'thread') {
        // Every comment case the UI has to handle, on one post
        const add = (user, parent, content, hoursAfterPublish, extra = {}) => {
            const c = { id: comments.length + 1, post_id: id, user_id: byEmail(user).id, parent_id: parent?.id ?? null,
                        content, created_at: publishedAt + hoursAfterPublish * HOUR, deleted_at: null, ...extra };
            comments.push(c);
            return c;
        };
        const q = add('karthik@example.com', null, 'Which background colour do you use exactly?', 5);
        add('priya@example.com', q, 'I use a dark blue-grey, around #111722.', 7);             // author replies
        add('sneha@example.com', q, 'Same here, much easier than pure black.', 9);              // a second reply
        const gone = add('divya@example.com', null, 'This comment was removed.', 12, { deleted_at: publishedAt + 30 * HOUR });
        add('meera@example.com', gone, 'Replying to a comment that was later deleted.', 14);   // reply under "[deleted]"
        add('arjun@example.com', null, 'Great tips. Edited: also works for mobile apps.', 20,
            { updated_at: publishedAt + 26 * HOUR });                                           // an edited comment
        add('ananya@example.com', null, 'Admin here: featuring this on the home page next week.', 30);
    }
    posts.push(post);
    events.forEach((e) => history.push({ post_id: id, ...e }));
});

comments.sort((a, b) => a.created_at - b.created_at);
// Re-number comments in time order, keeping parent links
const newId = new Map(comments.map((c, i) => [c.id, i + 1]));
comments.forEach((c) => { c.id = newId.get(c.id); c.parent_id = c.parent_id ? newId.get(c.parent_id) : null; });
history.sort((a, b) => a.at - b.at);

// ---------------------------------------------------------------- write
// timestamp WITHOUT time zone columns get UTC wall-clock text; timestamptz columns get ISO with Z.
const plain = (ms) => (ms == null ? null : new Date(ms).toISOString().replace('T', ' ').replace('Z', ''));
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

async function seedInto(label, client, newHashes) {
    await client.connect();
    try {
        // --keep-passwords: reuse each demo account's current password hash, so the logins don't change
        const hashed = { ...newHashes };
        if (KEEP_PASSWORDS) {
            const old = await client.query('SELECT email, password FROM users');
            old.rows.forEach((r) => { if (hashed[r.email]) hashed[r.email] = r.password; });
        }
        await client.query('BEGIN');
        await client.query('TRUNCATE post_status_history, comments, posts, users RESTART IDENTITY CASCADE');
        for (const u of users) {
            await client.query('INSERT INTO users (id, name, email, password, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
                [u.id, u.name, u.email, hashed[u.email], u.role, plain(NOW - 400 * DAY + u.id * DAY)]);
        }
        for (const p of posts) {
            await client.query(
                `INSERT INTO posts (id, title, content, status, author, img_url, user_id, created_at, updated_on,
                                    reviewed_by, reviewed_at, review_comment, summary, summary_source, summary_updated_at)
                 VALUES ($1,$2,$3,$4,'',NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [p.id, p.title, p.content, p.status, p.user_id, plain(p.created_at), iso(p.updated_on),
                 p.reviewed_by, plain(p.reviewed_at), p.review_comment, p.summary, p.summary_source, iso(p.summary_updated_at)]);
        }
        for (const c of comments) {
            await client.query('INSERT INTO comments (id, post_id, user_id, parent_id, content, created_at, updated_at, deleted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
                [c.id, c.post_id, c.user_id, c.parent_id, c.content, iso(c.created_at), iso(c.updated_at), iso(c.deleted_at)]);
        }
        for (const h of history) {
            await client.query('INSERT INTO post_status_history (post_id, from_status, to_status, changed_by, comment, changed_at) VALUES ($1,$2,$3,$4,$5,$6)',
                [h.post_id, h.from, h.to, h.by, h.comment ?? null, iso(h.at)]);
        }
        // explicit ids were used, so move the id counters past them
        for (const t of ['users', 'posts', 'comments']) {
            await client.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT MAX(id) FROM ${t}))`);
        }
        await client.query('COMMIT');
        const counts = await client.query(`SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM posts) p,
            (SELECT COUNT(*) FROM comments) c, (SELECT COUNT(*) FROM post_status_history) h`);
        const r = counts.rows[0];
        console.log(`${label}: ${r.u} users, ${r.p} posts, ${r.c} comments, ${r.h} history rows`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${label}: nothing changed (rolled back): ${err.message}`);
    } finally {
        await client.end();
    }
}

(async () => {
    // One random password per person, shared by both databases
    const passwords = Object.fromEntries(users.map((u) => [u.email, crypto.randomBytes(9).toString('base64url')]));
    const hashed = {};
    for (const u of users) hashed[u.email] = await bcrypt.hash(passwords[u.email], 12);

    if (targets.includes('--local')) {
        await seedInto('local', new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
                                              password: process.env.DB_PASSWORD, database: process.env.DB_NAME }), hashed);
    }
    if (targets.includes('--neon')) {
        const url = (process.env.NEON_URL || '').trim();
        if (!url) throw new Error('NEON_URL is missing in .env');
        await seedInto('neon', new Client({ connectionString: url, ssl: { rejectUnauthorized: true } }), hashed);
    }

    const summary = posts.reduce((s, p) => ({ ...s, [p.status]: (s[p.status] || 0) + 1 }), {});
    console.log('posts by status:', JSON.stringify(summary));
    if (KEEP_PASSWORDS) {
        console.log('\nPasswords unchanged for existing accounts (--keep-passwords).');
        return;
    }
    console.log('\nLOGINS (copy them now, they are not saved anywhere):');
    console.table(users.map((u) => ({ name: u.name, role: u.role, email: u.email, password: passwords[u.email] })));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
