"""
Blog AI service — called by the Express backend (backend/util/ai-service.js), never by the browser.

Run (from blog-app/):   npm run dev:ai
Or (from ai-service/, with the venv active):
    uvicorn app.main:app --reload --port 8000

Then open http://localhost:8000/docs for the interactive API page.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app import intent

# reads ai-service/.env (HF_HOME, DB_* …) before any model library loads, whatever the cwd is
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load the model at startup, so the first chat message isn't slow (or timed out by Express)."""
    try:
        intent.predict("warm up")
        print("intent model loaded:", intent.MODEL_PATH.name)
    except intent.ModelNotReady as err:
        print("WARNING:", err)   # the service still starts; /intent answers 503 until the model exists
    yield


app = FastAPI(title="Blog AI service", version="0.2.0", lifespan=lifespan)


@app.get("/health")
def health():
    """Lets Express (and you) check the service is up."""
    return {"status": "ok"}


# ---- POST /intent --------------------------------------------------------------

class IntentRequest(BaseModel):
    """Pydantic validates the body (like express-validator): 422 if text is missing or too long."""
    text: str = Field(min_length=1, max_length=500, examples=["any posts about cooking?"])


class IntentResponse(BaseModel):
    intent: str = Field(examples=["find_posts"])
    confidence: float = Field(ge=0, le=1, examples=[0.41], description="Top probability from the model")


@app.post("/intent", response_model=IntentResponse)
def classify(body: IntentRequest):
    """Which of the 7 intents a chat message is (model: models/intent_tfidf_lr.joblib)."""
    try:
        name, confidence = intent.predict(body.text.strip())
    except intent.ModelNotReady as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    return IntentResponse(intent=name, confidence=confidence)


@app.get("/intent/model")
def intent_model():
    """Which model is loaded and its test scores."""
    try:
        return intent.model_info()
    except intent.ModelNotReady as err:
        raise HTTPException(status_code=503, detail=str(err)) from err


# Next endpoints (see README.md → Roadmap):
#   POST /summarize   { "title": str, "content": str }  -> { "summary": str }
#   POST /search      { "query": str, "k": int }        -> { "results": [...] }
