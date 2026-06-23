---
name: tb-mteb-retrieve
description: Perform semantic retrieval using the MTEB package (v1.36.8) with the bge-small-zh-v1.5 embedding model to find the document with the 5th highest cosine similarity to the query "terminal-bench" from /app/data.txt, and write the result to /app/result.txt. Use this skill whenever the task mentions MTEB retrieval, semantic search with embeddings, bge-small-zh-v1.5, cosine similarity ranking, the 5th most similar document, data.txt with one document per line, or writing the matching line to result.txt. Also trigger for the alexgshaw/mteb-retrieve:20260430 Docker image or references to computing embedding similarities with the MTEB package.
---

# tb-mteb-retrieve

Load the `bge-small-zh-v1.5` embedding model via the MTEB package (v1.36.8),
encode a set of documents from `/app/data.txt`, compute cosine similarities
against the query "terminal-bench", rank them, and write the 5th most similar
document (the full line) to `/app/result.txt`. This is a Terminal-Bench 2.1
medium data-science task; the full task lives at `tasks/mteb-retrieve/`.

## When this skill triggers

Use it when the user is dropped into the `mteb-retrieve` container and needs
to produce `/app/result.txt` with the correct document line. Do **not** use
it for general embedding tasks, training sentence transformers, or any
retrieval task that doesn't specify `bge-small-zh-v1.5` at the exact
revision `7999e1d3359715c523056ef9478215996d62a620`.

## Goal (one sentence)

Using MTEB v1.36.8 and `bge-small-zh-v1.5`, find the document in
`/app/data.txt` with the 5th highest cosine similarity to "terminal-bench"
and write that full line to `/app/result.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/result.txt` | Single line from `/app/data.txt` that is the 5th most similar to "terminal-bench" by cosine similarity using bge-small-zh-v1.5 embeddings. |

## Recommended workflow

### 1. Confirm the environment (≈ 2 min)

```bash
python3 -c "import mteb; print(mteb.__version__)"
# Should output 1.36.8
```

If not installed or wrong version:
```bash
pip install mteb==1.36.8
```

Check the data file:
```bash
wc -l /app/data.txt
head -5 /app/data.txt
```

### 2. Load the model via MTEB (≈ 5 min)

The task requires using the MTEB package to load and encode the model:

```python
import mteb

# MTEB provides model loading via SentenceTransformer wrapper
model = mteb.get_model("BAAI/bge-small-zh-v1.5", revision="7999e1d3359715c523056ef9478215996d62a620")
```

Alternatively, if `mteb.get_model` is not the right API, load the underlying
SentenceTransformer:

```python
from mteb.models import SentenceTransformerModel
# or directly
from sentence_transformers import SentenceTransformer

model = SentenceTransformer(
    "BAAI/bge-small-zh-v1.5",
    revision="7999e1d3359715c523056ef9478215996d62a620"
)
```

But per the instruction: "You must use the installed mteb package (version
1.36.8) to load and encode the model." So use the MTEB model loading API.

### 3. Encode documents and query (≈ 10 min)

```python
import numpy as np

# Read documents (one per line)
with open("/app/data.txt", "r", encoding="utf-8") as f:
    documents = [line.rstrip("\n") for line in f]

# Encode the query
query = "terminal-bench"
query_embedding = model.encode([query])[0]  # shape: (dim,)

# Encode all documents
doc_embeddings = model.encode(documents)  # shape: (N, dim)

# Compute cosine similarities
# Normalize embeddings first if the model doesn't output normalized vectors
query_norm = query_embedding / np.linalg.norm(query_embedding)
doc_norms = doc_embeddings / np.linalg.norm(doc_embeddings, axis=1, keepdims=True)
similarities = np.dot(doc_norms, query_norm)  # shape: (N,)

# Rank by similarity (descending)
ranked_indices = np.argsort(similarities)[::-1]

# Get the 5th highest (index 4, since 0-based: 1st=ranked_indices[0], 5th=ranked_indices[4])
fifth_most_similar_idx = ranked_indices[4]
result_line = documents[fifth_most_similar_idx]

print(f"5th most similar (cosine sim={similarities[fifth_most_similar_idx]:.6f}):")
print(result_line)
```

### 4. Write the result (≈ 2 min)

```bash
python3 -c "
# ... the above logic ...
with open('/app/result.txt', 'w', encoding='utf-8') as f:
    f.write(result_line)
"
```

Or from within the retrieval script:
```python
with open("/app/result.txt", "w", encoding="utf-8") as f:
    f.write(result_line)
```

Verify:
```bash
cat /app/result.txt
```

### 5. Double-check the ranking (≈ 3 min)

Ensure the 5th highest is correctly identified:
```python
# Print top 10 for sanity
for i, idx in enumerate(ranked_indices[:10]):
    print(f"Rank {i+1}: sim={similarities[idx]:.6f} | {documents[idx][:80]}")
```

Confirm:
- 0-based: index 4 is the 5th element (1st=0, 2nd=1, 3rd=2, 4th=3, **5th=4**).
- Ties in similarity: if multiple documents have identical cosine scores,
  the ordering may be ambiguous. Typically, you'd use the first occurrence
  in the original file as the tiebreaker.

## Verifier checklist (must all pass)

- [ ] `/app/result.txt` exists and contains exactly one line from
      `/app/data.txt`.
- [ ] The model used is `BAAI/bge-small-zh-v1.5` at revision
      `7999e1d3359715c523056ef9478215996d62a620`.
- [ ] The MTEB package (v1.36.8) is used for model loading and encoding.
- [ ] Cosine similarity is computed correctly (normalized dot product).
- [ ] The 5th highest similarity document is written (not 1st, not 6th).
- [ ] The output matches the verifier's expected line.

## Common pitfalls

1. **Off-by-one in ranking.** The 5th highest means index 4 in a 0-indexed
   sorted array (descending). Using index 5 gives the 6th highest. Always
   verify: print the top 10 and confirm the 5th matches your output.
2. **Not normalizing embeddings.** Some embedding models (including BGE)
   require L2 normalization before cosine similarity computation. If
   embeddings are not normalized, `dot product ≠ cosine similarity`. The
   MTEB model wrapper may or may not normalize automatically — check or
   force normalization.
3. **Using the wrong model revision.** The task specifies revision
   `7999e1d3359715c523056ef9478215996d62a620`. A different revision can
   produce different embeddings, changing similarity rankings and causing
   the wrong document to be selected. Always pass `revision=` when loading.
4. **Not using MTEB for model loading.** The instruction says "You must use
   the installed mteb package ... to load and encode the model." Using
   `sentence-transformers` directly instead of going through MTEB violates
   this requirement and may cause version/setup mismatches.
5. **Encoding with different pooling.** BGE models typically use mean
   pooling or CLS token. If the MTEB model wrapper sets this up differently
   from expected, similarity rankings change. Use the MTEB wrapper as-is
   rather than manually configuring the underlying transformer.

## Reference pointers

- BAAI/bge-small-zh-v1.5 on Hugging Face: https://huggingface.co/BAAI/bge-small-zh-v1.5
- MTEB package documentation: https://github.com/embeddings-benchmark/mteb
- The specific revision: `7999e1d3359715c523056ef9478215996d62a620`
- Inside the container: `/app/data.txt` has one document per line.
- Cosine similarity: `cos(a,b) = dot(a/||a||, b/||b||)`.
