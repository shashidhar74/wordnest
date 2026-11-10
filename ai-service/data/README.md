# Datasets

## `intents.csv`: chatbot intent classifier (training data)

Columns: `text` (a chat message), `label` (one of the intents below). 60 examples per intent, 419 in total.

History:
- 2026-11-09: added "list all posts" rows to `find_posts`, then the `post_report` intent; the
  "how many posts…" rows moved from `find_posts` to `post_report` (counts are reports, not searches).
- 2026-11-10: grew every intent to ~60 rows (+200), aimed at the weak spots from error analysis:
  Hinglish create_post ("likh do", "bana do"), varied out_of_scope, casual greetings, "too long to read"
  summaries, report / reason / export wording. A leakage check dropped new rows with similarity ≥ 0.6
  to any test message (1 dropped).

| Label | Meaning | Example |
|---|---|---|
| `find_posts` | Wants to find or browse posts | "any posts about cooking?", "show me all posts" |
| `post_report` | Counts, status-wise reports, why a post was rejected / sent back | "how many posts are pending", "why was my post rejected" |
| `summarize_post` | Wants a short version of a post | "tl;dr of the latest post" |
| `create_post` | Wants the bot to write / create a post (optionally with an image) | "draft a post about my trip to manali with a photo" |
| `site_help` | How to use the blog (posting, workflow, account) | "how to submit my post for review" |
| `greeting` | Hello, thanks, bye, small talk | "good morning" |
| `out_of_scope` | Anything the blog bot can't do | "what's the weather tomorrow" |

**Variety on purpose:** short and long messages, typos ("shw me posts abt yoga"), Hinglish ("travel ke posts dikhao"),
casual and polite. Real users write like this.

**Tricky cases to watch** (good for error analysis):
- "how do I create a new post" is `site_help` (asks **how**), but "create a new post about travel in goa" is `create_post` (asks the bot **to do it**)
- "write my college essay" is `out_of_scope`, but "write a blog post on healthy breakfast ideas" is `create_post`
- "generate a picture of a cat for my wallpaper" is `out_of_scope`, but "generate a post on budgeting with a cover image" is `create_post`
- "write my college essay" is `out_of_scope`, but "how do i use write with AI" is `site_help`
- "posts by Asha" is `find_posts`: no topic word, only a name
- "tell me a joke" is `out_of_scope`, not `greeting`
- "who won the cricket match" is `out_of_scope`, but "koi post hai cricket ke baare mein" is `find_posts`

- "summarize the juntleman post" is `summarize_post`, but "why was the juntleman post rejected" is `post_report`
- "show me all posts" is `find_posts` (a list), but "how many posts are there" is `post_report` (a number)

## `intents_test.csv`: to write yourself

84 messages, 12 per intent. The first 72 were written by you. The 12 `post_report` rows (added 2026-11-10)
were written by Claude in a deliberately different style and checked for similarity < 0.6 to training rows,
but they're less independent than yours. Replace them with your own wording when you can.

Write 10–15 messages per intent **without looking at `intents.csv`**, ideally on another day or ask a friend.
Use it only for the final score. If the training data and test data come from the same person in the same
session, the test score looks better than the model really is.

## Rules
- Commit these files; they are part of the project (unlike `data/raw/`).
- When you add rows, keep the classes roughly balanced.
- A text that contains a comma must be in double quotes.
