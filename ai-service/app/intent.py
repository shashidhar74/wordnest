"""
Intent classifier: loads the model trained in notebooks/intent.ipynb and predicts intents.

The model file is loaded ONCE (on the first request) and kept in memory. Loading it on every
request would be slow; loading at import would make tests and startup fail if the file is missing.
"""
from functools import lru_cache
from pathlib import Path

import joblib

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "intent_tfidf_lr.joblib"


class ModelNotReady(RuntimeError):
    """The model file doesn't exist yet: run notebooks/intent.ipynb first."""


@lru_cache(maxsize=1)
def _load():
    if not MODEL_PATH.exists():
        raise ModelNotReady(f"{MODEL_PATH.name} not found. Run notebooks/intent.ipynb to train it.")
    # The bundle saved in step 9 of the notebook: pipeline + threshold + labels + scores.
    return joblib.load(MODEL_PATH)


def predict(text: str) -> tuple[str, float]:
    """Returns (intent, confidence). Below the trained threshold → out_of_scope."""
    bundle = _load()
    pipeline = bundle["pipeline"]
    proba = pipeline.predict_proba([text])[0]
    best = int(proba.argmax())
    confidence = float(proba[best])
    intent = str(pipeline.classes_[best])
    if confidence < bundle.get("threshold", 0.0):
        intent = "out_of_scope"
    return intent, round(confidence, 3)


def model_info() -> dict:
    """Which model is loaded and how good it was on the test set (for /health and debugging)."""
    bundle = _load()
    return {
        "file": MODEL_PATH.name,
        "labels": bundle.get("labels"),
        "threshold": bundle.get("threshold"),
        "test_accuracy": bundle.get("test_accuracy"),
        "test_macro_f1": bundle.get("test_macro_f1"),
    }
