// Calls our own Python AI service (ai-service/, FastAPI on port 8000).
// Same idea as util/ai.js for Gemini: one place for the URL, timeout and error mapping.

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

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
            signal: AbortSignal.timeout(5000)   // the model answers in milliseconds; 5 s means it's stuck
        });
    } catch (err) {
        // service not started, crashed, or timed out
        console.log('ai-service unreachable:', err.message);
        throw serviceError(503, 'Chat is temporarily unavailable');
    }
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.log('ai-service error', response.status, body.detail);
        throw serviceError(503, 'Chat is temporarily unavailable');
    }
    const data = await response.json();
    return { intent: data.intent, confidence: data.confidence };
};
