from fastapi.testclient import TestClient

from app.main import app
from app.summarizer import split_sentences, summarize

client = TestClient(app)

POST = """Composting turns kitchen scraps into rich soil for your garden.
It also keeps food waste out of landfills, where it would release methane.
My neighbour has a very loud dog that barks every single morning.
To start, mix green material like vegetable peels with brown material like dry leaves.
Keep the pile moist and turn it every week so air reaches the middle.
After two or three months the compost is dark, crumbly and ready to use.
I also bought a new bicycle last weekend and it is bright red."""


def test_picks_on_topic_sentences_in_original_order():
    result = summarize("Getting started with home composting", POST, 3)
    sentences = split_sentences(result)
    assert len(sentences) == 3
    assert "dog" not in result and "bicycle" not in result      # off-topic lines are skipped
    order = [POST.index(s) for s in sentences]
    assert order == sorted(order)                                # original order kept


def test_short_text_is_returned_whole():
    text = "Composting is great for gardens. Start with kitchen scraps today."
    assert summarize("Compost", text, 3) == text


def test_text_without_sentences_falls_back_to_its_start():
    assert summarize("x", "ok", 3) == "ok"


def test_endpoint():
    res = client.post("/summarize", json={"title": "Home composting", "content": POST})
    assert res.status_code == 200
    body = res.json()
    assert body["method"] == "extractive"
    assert len(split_sentences(body["summary"])) == 3


def test_endpoint_validation():
    assert client.post("/summarize", json={"title": "x", "content": ""}).status_code == 422
    assert client.post("/summarize", json={"content": "a b c d.", "max_sentences": 99}).status_code == 422
