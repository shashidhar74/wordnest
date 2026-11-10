# ai-service

Our own AI models for the blog, served with FastAPI. The Express backend calls it;
the browser never does. CPU only (no NVIDIA GPU on the dev machine).

```
Angular (5000) ──► Express (3000) ──► ai-service (8000)
                        └── PostgreSQL ◄──┘
```

## Folder layout

| Path | What goes there |
|---|---|
| `app/main.py` | FastAPI app and endpoints |
| `app/` | One module per model, e.g. `summarizer.py`, `intent.py`, `search.py` |
| `notebooks/` | Experiments: try ideas here before moving them into `app/` |
| `data/raw/` | Downloaded datasets (not committed) |
| `data/` | Small hand-made data you do commit, e.g. `intents.csv` |
| `models/` | Trained models and the Hugging Face download cache (not committed) |
| `tests/` | pytest tests |

## Setup (already done once on this machine)

```powershell
cd "D:\My Folder\blog-app\ai-service"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu --no-cache-dir
pip install -r requirements.txt --no-cache-dir
copy .env.example .env      # then fill in the DB_* values
```

`--no-cache-dir` and `HF_HOME` keep large downloads off drive C: (little free space).

## Run

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

- http://localhost:8000/health → `{"status":"ok"}`
- http://localhost:8000/docs → interactive API page

Tests: `pytest`

## Deploy (e.g. Render web service)

| Setting | Value |
|---|---|
| Root directory | `ai-service` |
| Python version | `3.13` (from `.python-version`) |
| Build command | `pip install -r requirements-prod.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

- `requirements-prod.txt` has only what the service imports (~255 MB installed vs ~1.3 GB for the
  full dev set). Its versions are **pinned to the ones that trained the model**: update them together
  when you retrain.
- The model file `models/intent_tfidf_lr.joblib` is committed to git, so the server has it.
- No environment variables are needed. The backend points to this service with `AI_SERVICE_URL`.

## Roadmap

1. [x] Service skeleton + `/health`
2. [ ] `POST /summarize`: extractive (TF-IDF / TextRank), compare with Gemini
3. [ ] Embeddings (small sentence-transformer) + `POST /search` (NumPy cosine first, pgvector later)
4. [ ] Intent classifier: label 200–500 messages in `data/intents.csv`, TF-IDF + LR, then a small transformer
5. [ ] `POST /chat`: intent → search / summarize / FAQ / template reply
6. [ ] Evaluation: ROUGE, precision@k, F1 on a held-out set
7. [ ] Later: LoRA fine-tune on Kaggle/Colab GPU, tiny GPT from scratch for learning

## Before training anything

The blog has only 4 short posts. Add realistic posts or use a public dataset first.
