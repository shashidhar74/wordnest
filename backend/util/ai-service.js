// Calls our own Python AI service (ai-service/, FastAPI on port 8000).
// Same idea as util/ai.js for Gemini: one place for the URL, timeout and error mapping.

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// The model itself answers in milliseconds, but on Render's free plan the service SLEEPS after
// 15 min idle and needs ~30–50 s to wake. Render holds the request while it wakes, so we wait
// long enough for that instead of failing the first chat message after a quiet period.
const TIMEOUT_MS = 60000;

// creates an error that the app's error handler can send as JSON
const serviceError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// POST /intent → { intent, confidence }
exports.classify = async (text) => {
    let response;
    try {
        response = await fetch(`${AI_SERVICE_URL}/intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (err) {
        // service not running, crashed, or still not awake after TIMEOUT_MS
        console.log('ai-service unreachable:', err.message);
        throw serviceError(503, 'The chat assistant is starting up. Please try again in a few seconds.');
    }
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.log('ai-service error', response.status, body.detail);
        throw serviceError(503, 'Chat is temporarily unavailable');
    }
    const data = await response.json();
    return { intent: data.intent, confidence: data.confidence };
};

// POST /summarize → our own extractive summary (no LLM). Used when Gemini is busy or down.
exports.summarize = async (title, content) => {
    let response;
    try {
        response = await fetch(`${AI_SERVICE_URL}/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content: content.slice(0, 50000), max_sentences: 3 }),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (err) {
        console.log('ai-service unreachable (summarize):', err.message);
        throw serviceError(503, 'AI service is temporarily unavailable');
    }
    if (!response.ok) {
        console.log('ai-service summarize error', response.status);
        throw serviceError(503, 'AI service is temporarily unavailable');
    }
    const data = await response.json();
    return data.summary;
};

// Wake the AI service in the background (called once when the backend starts).
// When someone opens the site, the backend wakes up first; pinging the AI service right away lets
// both wake in parallel, so it's usually ready by the time the first chat message is sent.
// Never throws: a failed ping is only logged.
exports.warmUp = () => {
    fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
        .then((res) => console.log(`ai-service warm-up: ${res.status}`))
        .catch((err) => console.log('ai-service warm-up failed:', err.message));
};
