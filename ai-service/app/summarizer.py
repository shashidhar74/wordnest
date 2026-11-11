"""
Extractive summarizer: picks the most important sentences of a post (no LLM, runs in milliseconds).

How it scores a sentence (all with TF-IDF on CHARACTER pieces of words, e.g. "comp", "ompo", "post",
so "composting" and "compost" count as related; whole words almost never repeat in a short post):
  1. Title relevance: similarity to the post's title (the strongest hint of what matters).
  2. Centrality: how much the sentence shares with the other sentences (the post's main thread;
     an off-topic aside shares little with the rest).
  3. A small bonus for the first sentences (posts usually open with their main point).
The top N sentences are returned in their ORIGINAL order, so the summary reads naturally.

Used by the backend as a fallback when Gemini is busy or down, so "Summarize" always works.
"""
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Sentence end: . ! ? followed by space/newline, or a line break (headings, list items)
_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_MIN_WORDS = 4            # ignore fragments like "Hi!" or a lone heading word
_W_TITLE = 1.0
_W_CENTRAL = 0.5
_W_LEAD = 0.05            # first-sentence bonus, fading over the next few


def split_sentences(text: str) -> list[str]:
    parts = (s.strip() for s in _SPLIT.split(text or ""))
    return [s for s in parts if len(s.split()) >= _MIN_WORDS]


def score_sentences(title: str, sentences: list[str]) -> np.ndarray:
    vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, lowercase=True)
    matrix = vectorizer.fit_transform([title or ""] + sentences)
    title_vec, sent_vecs = matrix[0], matrix[1:]

    to_title = cosine_similarity(sent_vecs, title_vec).ravel() if (title or "").strip() else 0.0

    pairwise = cosine_similarity(sent_vecs)
    np.fill_diagonal(pairwise, 0.0)
    centrality = pairwise.sum(axis=1) / max(len(sentences) - 1, 1)

    lead = np.exp(-np.arange(len(sentences)) / 2.0)
    return _W_TITLE * to_title + _W_CENTRAL * centrality + _W_LEAD * lead


def summarize(title: str, content: str, max_sentences: int = 3) -> str:
    sentences = split_sentences(content)
    if not sentences:
        # nothing sentence-like: return the start of the text as-is
        return (content or "").strip()[:300]
    if len(sentences) <= max_sentences:
        return " ".join(sentences)

    scores = score_sentences(title, sentences)
    top = sorted(np.argsort(-scores, kind="stable")[:max_sentences])
    return " ".join(sentences[i] for i in top)
