---
name: tb-hf-model-inference
description: Download a Hugging Face transformer model, create a Flask API that exposes a POST /sentiment endpoint for sentiment analysis, and run the service in the background. Use this skill whenever the task mentions downloading a Hugging Face model to a local cache directory, setting up a Flask sentiment analysis API, using "distilbert-base-uncased-finetuned-sst-2-english", serving on port 5000 at 0.0.0.0, returning JSON with sentiment/confidence fields, or running a model inference service in the background. Also trigger when the user references /app/model_cache/sentiment_model, the /sentiment endpoint, or the request/response schema with {"text": "..."} input and {"sentiment": "...", "confidence": {...}} output.
---

# tb-hf-model-inference

Download a pretrained Hugging Face sentiment analysis model to a local cache
directory, wrap it in a Flask API, and serve predictions on port 5000. This
is one of the Terminal-Bench 2.1 task skills; the full task lives at
`tasks/hf-model-inference/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `hf-model-inference` Docker container
and needs to deliver a running Flask service that answers POST requests to
`/sentiment` with positive/negative predictions and confidence scores. Do
**not** use it for general Hugging Face model exploration, training, or
non-Flask serving setups.

## Goal (one sentence)

Download `distilbert-base-uncased-finetuned-sst-2-english` to
`/app/model_cache/sentiment_model`, expose a Flask `POST /sentiment` endpoint
on `0.0.0.0:5000` that returns `{"sentiment": ..., "confidence": {}}`, and
keep the service running in the background.

## Required outputs

| File / Service | Purpose |
|---|---|
| `/app/model_cache/sentiment_model/` | Local directory containing the downloaded DistilBERT SST-2 model files |
| Flask app (any filename) | Python script that loads the model and serves predictions |
| Running process on `0.0.0.0:5000` | Background Flask service accepting POST requests at `/sentiment` |

The verifier sends POST requests with `{"text": "..."}` and validates that
the JSON response contains `sentiment` (string), `confidence.positive`
(float), and `confidence.negative` (float), with a 400 error response for
malformed input.

## Recommended workflow

### 1. Install dependencies (≈ 3 min)

```bash
pip install transformers torch flask --system
# Or verify they are already available in the Docker image
```

The model is `distilbert-base-uncased-finetuned-sst-2-english` — a
lightweight DistilBERT variant fine-tuned on the Stanford Sentiment
Treebank (SST-2) for binary sentiment classification.

### 2. Download the model (≈ 5 min)

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification

model_name = "distilbert-base-uncased-finetuned-sst-2-english"
cache_dir = "/app/model_cache/sentiment_model"

tokenizer = AutoTokenizer.from_pretrained(model_name, cache_dir=cache_dir)
model = AutoModelForSequenceClassification.from_pretrained(model_name, cache_dir=cache_dir)

# Save explicitly to the cache directory
tokenizer.save_pretrained(cache_dir)
model.save_pretrained(cache_dir)
```

Alternatively, use `huggingface_hub` CLI:
```bash
huggingface-cli download distilbert-base-uncased-finetuned-sst-2-english \
  --local-dir /app/model_cache/sentiment_model
```

### 3. Create the Flask API (≈ 10 min)

```python
# /app/app.py (or any filename)
from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

app = Flask(__name__)

MODEL_DIR = "/app/model_cache/sentiment_model"
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
model.eval()

@app.route('/sentiment', methods=['POST'])
def sentiment():
    data = request.get_json(silent=True)
    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' field in request body"}), 400

    text = data['text']
    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "Invalid 'text' field"}), 400

    inputs = tokenizer(text, return_tensors='pt', truncation=True, max_length=512)
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probs = torch.softmax(logits, dim=-1).squeeze().tolist()

    # SST-2 labels: 0 = NEGATIVE, 1 = POSITIVE
    neg_score = probs[0]
    pos_score = probs[1]
    label = "positive" if pos_score >= neg_score else "negative"

    return jsonify({
        "sentiment": label,
        "confidence": {
            "positive": round(pos_score, 6),
            "negative": round(neg_score, 6),
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

Key implementation details:
- The model must be loaded from the local cache directory, not downloaded
  at startup time (the verifier may check that the model exists locally).
- Use `torch.no_grad()` for inference — faster and lower memory.
- Truncate long inputs to 512 tokens (DistilBERT max length).
- Return HTTP 400 with `{"error": "..."}` for missing or invalid input.
- Confidence scores should sum to 1.0 and be floats between 0 and 1.

### 4. Run the service in the background (≈ 2 min)

```bash
nohup python3 /app/app.py > /app/flask.log 2>&1 &
```

Or use `&` with output redirection:
```bash
python3 /app/app.py &>/app/flask.log &
```

Verify it is running:
```bash
sleep 2
curl -X POST http://localhost:5000/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text": "I love this product!"}'
```

### 5. Smoke test (≈ 3 min)

```bash
# Positive sentiment
curl -s -X POST http://localhost:5000/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text": "This is absolutely wonderful!"}'

# Negative sentiment
curl -s -X POST http://localhost:5000/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text": "Terrible experience, I hate it."}'

# Error case
curl -s -X POST http://localhost:5000/sentiment \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected error response: `{"error": "..."}` with HTTP 400.

## Verifier checklist (must all pass)

- [ ] Model files exist at `/app/model_cache/sentiment_model/` (downloaded
  from Hugging Face, not trained from scratch).
- [ ] Flask service is running and listening on `0.0.0.0:5000`.
- [ ] `POST /sentiment` with `{"text": "some text"}` returns 200 with
  `{"sentiment": "positive"|"negative", "confidence": {"positive": ..., "negative": ...}}`.
- [ ] `POST /sentiment` with missing or invalid `text` returns 400 with
  `{"error": "..."}`.
- [ ] Confidence scores are valid floats between 0 and 1.

## Common pitfalls

1. **Model not saved to the correct local directory.** The task requires
   the model in `/app/model_cache/sentiment_model`. Using the default
   Hugging Face cache (`~/.cache/huggingface/`) will cause the verifier
   to fail. Use `save_pretrained()` explicitly or set `cache_dir`.
2. **Flask not bound to `0.0.0.0`.** The default `app.run()` binds to
   `127.0.0.1`, which is not accessible from outside the container for
   verification. Always pass `host='0.0.0.0'`.
3. **Service not running in the background.** Simply calling
   `python3 app.py` blocks the terminal. Use `nohup ... &` or `&` to
   background the process. Also ensure the process survives after the
   setup script exits.
4. **Wrong label mapping for SST-2.** The model outputs logits for two
   classes. Index 0 corresponds to NEGATIVE and index 1 to POSITIVE.
   Reversing these gives inverted predictions.
5. **Missing error handling for malformed JSON.** The verifier sends
   invalid requests and expects a 400 status code with a JSON error
   body. A generic 500 or an HTML error page will fail.

## Quick sanity test (run after starting the service)

```bash
# Test positive
curl -s -X POST http://localhost:5000/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text": "I love this"}' | python3 -m json.tool

# Test negative
curl -s -X POST http://localhost:5000/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text": "I hate this"}' | python3 -m json.tool

# Test error
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5000/sentiment \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 400
```

## Reference pointers

- Model on Hugging Face: `distilbert-base-uncased-finetuned-sst-2-english`
  (https://huggingface.co/distilbert-base-uncased-finetuned-sst-2-english)
- Hugging Face `transformers` pipeline for sentiment analysis is a quick
  sanity check, but the task expects raw model usage, not the high-level
  pipeline.
- Flask quickstart: https://flask.palletsprojects.com/en/stable/quickstart/
- Inside the task container, the verifier at the task root is the ground
  truth for what is scored.
