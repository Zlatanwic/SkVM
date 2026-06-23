---
name: tb-mteb-leaderboard
description: Research the Scandinavian MTEB (Massive Text Embedding Benchmark) leaderboard to find the best embedding model (highest Mean Task score) as of August 2025 that has results for ALL tasks, and write its name in organization/model_name format to /app/result.txt. Use this skill whenever the task mentions MTEB leaderboard, Scandinavian text embeddings, finding the best embedding model by Mean (Task), organization/model_name format, or writing to /app/result.txt. Also trigger for the alexgshaw/mteb-leaderboard:20260430 Docker image or references to querying the MTEB benchmark leaderboard programmatically or via web search.
---

# tb-mteb-leaderboard

Identify the best Scandinavian embedding model from the MTEB leaderboard
(as of August 2025 snapshot), considering only models with results for
every task, and write the winner's name in `organization/model_name` format
to `/app/result.txt`. This is a Terminal-Bench 2.1 medium data-science task;
the full task lives at `tasks/mteb-leaderboard/`.

## When this skill triggers

Use it when the user is dropped into the `mteb-leaderboard` container and
needs to produce a single-line `/app/result.txt` with the best model name.
Do **not** use it for running MTEB evaluations, training embedding models,
or general Hugging Face model searches — this is purely a leaderboard
research and data-filtering task.

## Goal (one sentence)

Determine the Scandinavian embedding model with the highest Mean (Task)
score on the MTEB leaderboard (August 2025) that has results for ALL tasks,
and write its full `org/model` name to `/app/result.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/result.txt` | Single line with the model name in `organization/model_name` format (e.g., `BAAI/bge-small-en-v1.5`). |

## Recommended workflow

### 1. Access the MTEB leaderboard (≈ 3 min)

The MTEB leaderboard is hosted on Hugging Face:
- Main MTEB leaderboard: https://huggingface.co/spaces/mteb/leaderboard
- Scandinavian subset: filter or navigate to the Scandinavian tab.
- The leaderboard might also be accessible programmatically via the
  `mteb` Python package or the Hugging Face Datasets API.

Check if the `mteb` package is installed in the container:
```bash
python3 -c "import mteb; print(mteb.__version__)"
```

If installed, it may offer leaderboard querying:
```python
from mteb import MTEB
# or mteb.get_leaderboard() / mteb.leaderboard
```

### 2. Find the Scandinavian leaderboard (≈ 5 min)

The MTEB leaderboard organizes results by language groups:
- The "Scandinavian" tab covers: Danish, Norwegian (Bokmal and Nynorsk),
  Swedish, Icelandic, and sometimes Faroese.
- Models listed here are evaluated on Scandinavian-language tasks:
  classification, clustering, pair classification, reranking, retrieval,
  STS (semantic textual similarity), summarization.

Key data points per model row:
- **Mean (Task)**: average score across all tasks the model was evaluated on.
- **Number of tasks**: how many of the Scandinavian benchmark tasks this
  model covers.

### 3. Filter candidates (≈ 5 min)

The task constraint: "Only consider models that have results for ALL tasks."

This means:
1. Identify how many total tasks are in the Scandinavian benchmark.
2. Filter to models whose task count equals the total.
3. Among those, find the one with the highest Mean (Task) score.

You may need to scrape the leaderboard HTML or use the MTEB API:

```python
# If using mteb package
import mteb
results = mteb.get_leaderboard(languages=["Scandinavian"], ...)

# Or if using web scraping
import requests
from bs4 import BeautifulSoup

# Or if the leaderboard data is in a structured JSON
import json, urllib.request
```

### 4. Write the result (≈ 2 min)

```bash
echo "org/model_name" > /app/result.txt
```

The format must be `organization/model_name` exactly. Example:
```
BAAI/bge-m3
intfloat/multilingual-e5-large
KBLab/sentence-bert-swedish
```

Verify:
```bash
cat /app/result.txt
```

### 5. Validate the choice (≈ 2 min)

Before submitting, confirm:
- The model exists on Hugging Face Hub.
- It has results for ALL Scandinavian tasks (not just a subset).
- Its Mean (Task) is the highest among fully-evaluated models.
- The score is from the August 2025 leaderboard snapshot (not a newer
  updated score that might differ).

## Verifier checklist (must all pass)

- [ ] `/app/result.txt` exists and is non-empty.
- [ ] The file contains a single model name in `organization/model_name` format.
- [ ] The model name references a real Hugging Face model.
- [ ] The model has the highest Mean (Task) among Scandinavian models that
      have results for ALL tasks, as of August 2025.

## Common pitfalls

1. **Selecting a model that is missing some tasks.** The task requires the
   model to have results for ALL tasks in the Scandinavian benchmark. A
   model with higher Mean (Task) but only 80% task coverage is invalid.
   Always sort by task completeness first, then by mean score.
2. **Using a non-Scandinavian leaderboard tab.** The English or multilingual
   leaderboard tab contains different models. Make sure you're looking at
   the Scandinavian-specific tab, not the overall MTEB leaderboard.
3. **Incorrect model name format.** The task specifies
   `organization/model_name` format. Using just `model_name` without the
   org, or a full URL, will fail the verifier. Regex for the expected
   format: `^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$`.
4. **Newer snapshot than August 2025.** The verifier checks against a
   specific leaderboard snapshot. If the Hugging Face leaderboard has been
   updated since August 2025, the top model may have changed. Use the
   `mteb` package pinned to the correct version or find archived
   leaderboard data.
5. **Trailing newline or whitespace.** The verifier reads the file
   literally. Extra spaces or newlines can cause a mismatch. Use
   `echo -n` or `printf` or `writeLines` to avoid trailing characters.

## Reference pointers

- MTEB leaderboard on Hugging Face Spaces: https://huggingface.co/spaces/mteb/leaderboard
- MTEB paper: Muennighoff et al. (2023), "MTEB: Massive Text Embedding Benchmark".
- MTEB GitHub: https://github.com/embeddings-benchmark/mteb
- The `mteb` Python package may provide programmatic leaderboard access
  via `mteb.get_leaderboard()` or the `MTEB` class.
- Inside the container: check for cached leaderboard data or the `mteb`
  package version that corresponds to the August 2025 snapshot.
