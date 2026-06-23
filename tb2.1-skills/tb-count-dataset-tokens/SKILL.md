---
name: tb-count-dataset-tokens
description: Count the number of tokens in a specific domain slice of a HuggingFace dataset using the Qwen2.5-1.5B-Instruct tokenizer. Use this skill whenever the task mentions counting dataset tokens, loading a HuggingFace dataset by name, filtering by domain/split, applying a specific tokenizer (especially Qwen2.5 or other HuggingFace tokenizers), or writing a token count to `/app/answer.txt`. Also trigger when the user references `ryanmarten/OpenThoughts-1k-sample`, the "science" domain, or needs to compute token statistics for model training data. The skill covers: loading datasets via the HuggingFace `datasets` library, filtering rows by a metadata field, loading a specific tokenizer from the HuggingFace hub, tokenizing text fields, and summing token counts.
---

# tb-count-dataset-tokens

Count the total number of deepseek tokens in the "science" domain of a
HuggingFace dataset (`ryanmarten/OpenThoughts-1k-sample`) using the
`Qwen2.5-1.5B-Instruct` tokenizer, and write the integer count to
`/app/answer.txt`. This is a Terminal-Bench 2.1 task; the full task spec
lives at `tasks/count-dataset-tokens/`.

## When this skill triggers

Use it when the user is dropped into the `count-dataset-tokens` Docker
container and needs to filter a HuggingFace dataset, tokenize with a
specific model's tokenizer, and report a total token count. Do **not**
use it for generic token counting with tiktoken or other tokenizers — this
task is specifically about the HuggingFace `datasets` + `transformers`
pipeline with a named model tokenizer.

## Goal (one sentence)

Filter the `ryanmarten/OpenThoughts-1k-sample` dataset to the "science"
domain, tokenize with `Qwen2.5-1.5B-Instruct`, and write the total token
count as a plain integer to `/app/answer.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/answer.txt` | Single plain-text file containing the integer token count with no spaces, commas, or formatting (e.g., `1000000`). |

## Recommended workflow

### 1. Install dependencies (≈ 2 min)

The Docker image may have `datasets` and `transformers` pre-installed. Verify:
```bash
python3 -c "import datasets; import transformers; print('OK')"
```
If missing:
```bash
pip install datasets transformers
```

### 2. Read the dataset README (≈ 2 min)

The instruction says "The dataset README gives critical information on how to
use the dataset." Fetch it:
```python
from datasets import get_dataset_config_names, load_dataset
# Inspect available configs
print(get_dataset_config_names("ryanmarten/OpenThoughts-1k-sample"))
```

Or use the HuggingFace hub API to view the dataset card:
```bash
curl -s https://huggingface.co/datasets/ryanmarten/OpenThoughts-1k-sample/raw/main/README.md
```

### 3. Load and filter the dataset (≈ 5 min)

```python
from datasets import load_dataset

dataset = load_dataset("ryanmarten/OpenThoughts-1k-sample", split="train")
# Inspect the schema to find the domain column and text column
print(dataset.features)
print(dataset[0])

# Filter to "science" domain — the column name may be "domain" or similar
# Check the README / dataset structure first
science = dataset.filter(lambda x: x["domain"] == "science")
print(f"Science domain rows: {len(science)}")
```

### 4. Load the tokenizer (≈ 3 min)

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-1.5B-Instruct")
```

Note: You may need to authenticate with HuggingFace if the model is gated.
Check if `huggingface-cli login` is needed.

### 5. Tokenize and count (≈ 5 min)

```python
def count_tokens(example):
    # The field containing deepseek content — check dataset structure
    # Typically "deepseek" or "text" or "conversations"
    tokens = tokenizer.encode(example["deepseek"])
    return {"token_count": len(tokens)}

science_with_counts = science.map(count_tokens)
total = sum(science_with_counts["token_count"])

# Or batch-tokenize for speed:
# texts = science["deepseek"]
# all_tokens = tokenizer(texts)["input_ids"]
# total = sum(len(t) for t in all_tokens)

with open("/app/answer.txt", "w") as f:
    f.write(str(total))

print(f"Total tokens: {total}")
```

### 6. Verify output format (≈ 1 min)

```bash
cat /app/answer.txt
# Should be a plain integer: 1234567
python3 -c "
with open('/app/answer.txt') as f:
    content = f.read().strip()
assert content.isdigit(), 'Output must be a plain integer'
print(f'Token count: {content}')
"
```

## Verifier checklist (must all pass)

- [ ] `/app/answer.txt` exists and contains exactly one integer.
- [ ] No spaces, commas, or formatting characters in the answer.
- [ ] The count matches the verifier's expected value for the "science" domain
      of `ryanmarten/OpenThoughts-1k-sample` tokenized with `Qwen2.5-1.5B-Instruct`.
- [ ] Only "deepseek" content tokens are counted (the instruction specifies
      "deepseek tokens").
- [ ] The correct tokenizer was used (`Qwen2.5-1.5B-Instruct`, not `Qwen2.5-1.5B`
      or another variant).

## Common pitfalls

1. **Wrong tokenizer.** The spec says `Qwen2.5-1.5B-Instruct` specifically. Do
   not use `Qwen2.5-1.5B` (base model) or another size — the token counts
   will differ.
2. **Counting all tokens in all domains.** The task specifically asks for the
   "science domain" only. Filter before tokenizing.
3. **Tokenizing the wrong field.** The dataset may have multiple text columns.
   Re-read the instruction: "how many deepseek tokens" — the field is likely
   named `deepseek` or represents the model's output. Check the README and
   dataset structure.
4. **Formatting the answer.** The file must contain ONLY the integer, no
   newlines (or one trailing newline), no commas, no "tokens" suffix. Write
   with `f.write(str(total))`.
5. **Not reading the dataset README first.** The instruction explicitly says
   the README "gives critical information on how to use the dataset." Skipping
   this step may cause you to miss the correct field names or loading method.

## Quick sanity test

```python
from datasets import load_dataset
from transformers import AutoTokenizer

ds = load_dataset("ryanmarten/OpenThoughts-1k-sample", split="train")
print("Features:", ds.features)
print("Example:", ds[0])
tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-1.5B-Instruct")
# Tokenize a single example to verify field name and tokenizer output
sample = ds.filter(lambda x: x.get("domain") == "science")[0]
print("Token count sample:", len(tokenizer.encode(sample["deepseek"])))
```

## Reference pointers

- HuggingFace datasets docs: https://huggingface.co/docs/datasets/
- Qwen2.5 model card: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct
- HuggingFace transformers AutoTokenizer: https://huggingface.co/docs/transformers/main_classes/tokenizer
- Dataset on the hub: https://huggingface.co/datasets/ryanmarten/OpenThoughts-1k-sample
