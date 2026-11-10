import pytest
from fastapi.testclient import TestClient

from app import intent
from app.main import app

client = TestClient(app)

needs_model = pytest.mark.skipif(
    not intent.MODEL_PATH.exists(), reason="train the model first (notebooks/intent.ipynb)"
)


@needs_model
@pytest.mark.parametrize(
    "text, expected",
    [
        ("how do I upload an image", "site_help"),
        ("show me all posts", "find_posts"),
        ("how many posts are pending?", "post_report"),
        ("export my posts to excel", "post_report"),
        ("hi", "greeting"),
    ],
)
def test_clear_messages(text, expected):
    res = client.post("/intent", json={"text": text})
    assert res.status_code == 200
    body = res.json()
    assert body["intent"] == expected
    assert 0 <= body["confidence"] <= 1


@needs_model
def test_returns_a_known_label():
    labels = set(client.get("/intent/model").json()["labels"])
    res = client.post("/intent", json={"text": "something completely random"})
    assert res.json()["intent"] in labels


def test_empty_text_is_rejected():
    assert client.post("/intent", json={"text": ""}).status_code == 422


def test_too_long_text_is_rejected():
    assert client.post("/intent", json={"text": "x" * 501}).status_code == 422


def test_missing_body_is_rejected():
    assert client.post("/intent", json={}).status_code == 422
