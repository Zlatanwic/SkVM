---
name: tb-llm-inference-batching-scheduler
description: Implement a shape-aware batching scheduler for static-graph LLM inference that packs requests with arbitrary prompt and generation lengths into batches with aligned tensor shapes, minimizing cost, latency, and padding while staying under a maximum of 8 unique shapes. Use this skill whenever the task involves reading JSONL request files, assigning request IDs to batch IDs with shape specifications, optimizing batch packing under shape alignment constraints (multiples of 64 for seq_align), working with a cost model that factors in prefill/decode/overhead costs, or producing plan files that beat baseline thresholds. Also trigger when the user references /app/task_file/input_data/requests_bucket_*.jsonl, /app/task_file/output_data/plan_b*.jsonl, cost_model.py, baseline_packer.py, MAX_SHAPES=8, or the specific performance thresholds for cost, pad_ratio, P95 latency, and sequential timecost.
---

# tb-llm-inference-batching-scheduler

Design an optimal batch-packing strategy for static-graph LLM inference that
minimizes total cost, padding waste, and tail latency while respecting a cap
of 8 unique tensor shapes across all batches. This is one of the
Terminal-Bench 2.1 task skills; the full task lives at
`tasks/llm-inference-batching-scheduler/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `llm-inference-batching-scheduler`
Docker container and needs to produce optimized plan files at
`/app/task_file/output_data/plan_b1.jsonl` and `plan_b2.jsonl`. Do **not**
use it for general ML inference optimization, dynamic batching systems, or
any task that does not involve the specific shape-alignment constraints
(seq_align as multiple of 64, heads_align=32, hidden_align=4096) and the
MAX_SHAPES=8 limit.

## Goal (one sentence)

Pack all requests from two JSONL input files into batches with aligned tensor
shapes such that total cost, pad ratio, P95 latency, and sequential timecost
all fall below the specified thresholds, using at most 8 unique
(seq_align, heads_align, hidden_align) tuples.

## Required outputs

| File | Purpose |
|---|---|
| `/app/task_file/output_data/plan_b1.jsonl` | Batching plan for `requests_bucket_1.jsonl` — one JSON object per request with `request_id`, `batch_id`, and `shape` |
| `/app/task_file/output_data/plan_b2.jsonl` | Batching plan for `requests_bucket_2.jsonl` |

Each output line must be a JSON object:
```json
{"request_id": "r-000010", "batch_id": "b-0002", "shape": {"seq_align": 192, "heads_align": 32, "hidden_align": 4096}}
```

## Recommended workflow

### 1. Understand the problem domain (≈ 15 min)

Read the instruction carefully. The core problem:

- Static-graph LLM inference requires all tensors in a batch to have the
  same shape.
- `seq_align` is the padded sequence length, rounded up to the nearest
  multiple of 64: `seq_align = ceil(prompt_len / 64) * 64`.
- `heads_align` is always 32, `hidden_align` is always 4096.
- The shape is fully determined by the `seq_align` dimension.
- At most 8 distinct shapes across all batches (MAX_SHAPES=8).

**Performance targets:**

| Metric | Bucket 1 Threshold | Bucket 2 Threshold |
|---|---|---|
| Cost | < 3.0e11 | < 4.8e10 |
| Pad Ratio | < 0.055 | < 0.15 |
| P95 Latency (ms) | < 2.1e6 | < 2.1e5 |
| Sequential Timecost (ms) | < 2.7e8 | < 3.2e7 |

### 2. Explore the provided tools (≈ 10 min)

```bash
# Inspect input data
head -5 /app/task_file/input_data/requests_bucket_1.jsonl
head -5 /app/task_file/input_data/requests_bucket_2.jsonl
wc -l /app/task_file/input_data/requests_bucket_*.jsonl

# Understand the cost model
python3 -c "
import sys
sys.path.insert(0, '/app/task_file/scripts')
import cost_model
help(cost_model)
"

# Run the baseline
python3 /app/task_file/scripts/baseline_packer.py
```

Key cost model factors:
- **Prefill cost:** depends on `seq_align` (the aligned prompt dimension).
- **Decode cost:** depends on the maximum `gen_len` in the batch
  (`G_max`) and `seq_align`.
- **Per-batch overhead:** constant cost per batch, incentivizing fewer
  larger batches rather than many small ones.
- **Per-shape compilation cost:** each unique shape incurs a one-time
  compilation cost. The MAX_SHAPES=8 constraint limits this directly.

### 3. Develop the packing strategy (≈ 20 min)

This is a bin-packing / clustering problem:

1. **Compute the required seq_align for each request:**
   `seq_align = ((prompt_len + 63) // 64) * 64`

2. **Group requests by seq_align.** Requests with the same seq_align
   can share a shape without additional compilation cost.

3. **Within each seq_align group, form batches.**
   The cost model penalizes many small batches (overhead) and also
   penalizes high pad ratios. A good heuristic:
   - Put requests with similar `gen_len` values in the same batch to
     minimize the decode bound `G_max`.
   - Fill batches to balance between batch count and padding waste.

4. **Pick the best 8 seq_align values.** Since MAX_SHAPES=8, you must
   choose which seq_align values to use. This is the critical decision:
   - Rounding up small requests to a larger seq_align increases padding
     but reduces shape count.
   - Choose the seq_align cut points that minimize total cost.

5. **Optimization approach:**
   ```python
   import json
   from collections import defaultdict

   def generate_plan(input_path, output_path):
       requests = []
       with open(input_path) as f:
           for line in f:
               requests.append(json.loads(line.strip()))

       # Compute aligned seq length for each request
       for r in requests:
           r['seq_align'] = ((r['prompt_len'] + 63) // 64) * 64

       # Sort by seq_align, then by gen_len
       requests.sort(key=lambda r: (r['seq_align'], r['gen_len']))

       # Cluster into at most MAX_SHAPES distinct seq_align values
       # ... shape selection logic ...

       # Form batches within each shape
       # ... batch formation logic ...

       # Write output
       with open(output_path, 'w') as f:
           for r in requests:
               f.write(json.dumps({
                   'request_id': r['request_id'],
                   'batch_id': r['batch_id'],
                   'shape': {
                       'seq_align': r['seq_align'],
                       'heads_align': 32,
                       'hidden_align': 4096,
                   }
               }) + '\n')
   ```

### 4. Iterate with the cost model (≈ 15 min)

```bash
cd /app/task_file
python3 scripts/cost_model.py output_data/plan_b1.jsonl
python3 scripts/cost_model.py output_data/plan_b2.jsonl
```

Compare each run against the thresholds. Adjust your packing strategy
based on which metric is exceeding the threshold:
- **Cost too high:** Reduce batch count (fewer batches = less overhead)
  or reduce per-shape compilation cost (use fewer distinct shapes).
- **Pad ratio too high:** Requests are being rounded up too aggressively.
  Try using smaller seq_align values or avoid over-packing.
- **P95 latency too high:** A single large batch is dominating tail
  latency. Split the largest batch or redistribute requests.
- **Sequential timecost too high:** Similar to total cost — reduce
  overhead and compilation costs.

### 5. Validate the plan (≈ 5 min)

```bash
# Check all requests are accounted for
diff <(cat /app/task_file/input_data/requests_bucket_1.jsonl | python3 -c "
import sys, json
ids = sorted(json.loads(l)['request_id'] for l in sys.stdin)
print('\n'.join(ids))
") <(cat /app/task_file/output_data/plan_b1.jsonl | python3 -c "
import sys, json
ids = sorted(json.loads(l)['request_id'] for l in sys.stdin)
print('\n'.join(ids))
")

# Count unique shapes
cat /app/task_file/output_data/plan_b1.jsonl | python3 -c "
import sys, json
shapes = set()
for l in sys.stdin:
    s = json.loads(l)['shape']
    shapes.add((s['seq_align'], s['heads_align'], s['hidden_align']))
print(f'Unique shapes: {len(shapes)}')
assert len(shapes) <= 8
"
```

## Verifier checklist (must all pass)

- [ ] `/app/task_file/output_data/plan_b1.jsonl` and `plan_b2.jsonl` exist
  and are valid JSONL.
- [ ] Every request from the input files appears exactly once in the
  corresponding plan file (no missing, no duplicates).
- [ ] Each plan entry has `request_id`, `batch_id`, and `shape` with
  `seq_align`, `heads_align`, `hidden_align`.
- [ ] `seq_align` is a multiple of 64 and >= `ceil(prompt_len / 64) * 64`.
- [ ] `heads_align` is 32, `hidden_align` is 4096.
- [ ] All entries in the same batch have identical shapes.
- [ ] At most 8 unique shapes across both buckets (MAX_SHAPES=8).
- [ ] All four performance thresholds (cost, pad_ratio, P95 latency,
  sequential timecost) are met for both buckets.

## Common pitfalls

1. **Exceeding MAX_SHAPES=8.** Every distinct `seq_align` value you use
   counts as one shape. If input requests span many different prompt
   lengths, the naive approach of using one shape per distinct aligned
   length can easily exceed 8. You must **merge** multiple seq_align
   values into coarser buckets, accepting some padding increase to stay
   under the shape limit.
2. **Confusing seq_align rounding.** `seq_align = ceil(prompt_len / 64) * 64`,
   NOT `prompt_len` itself. A request with `prompt_len=100` needs
   `seq_align=128`, not 64. Under-padding produces incorrect results.
3. **Missing or duplicated request IDs.** The verifier checks that every
   input request appears exactly once. Off-by-one filtering or incorrect
   deduplication will cause this check to fail.
4. **Not using the cost model during development.** The cost model is
   provided for iterative development. Ignoring it and hoping the plan is
   good enough almost always fails — the thresholds are strict and the
   baseline is far worse than required. Run the cost model after every
   strategy change.
5. **Ignoring the decode bound (G_max) within batches.** Batches group
   requests together, but the decode phase is bounded by the maximum
   `gen_len` in the batch. Placing a request with `gen_len=10000` in the
   same batch as one with `gen_len=10` forces the short request to wait
   for the long decode. Sort by `gen_len` within each shape group.

## Quick sanity test (run after generating plans)

```bash
cd /app/task_file

# 1. Row counts match
echo "Input B1: $(wc -l < input_data/requests_bucket_1.jsonl)"
echo "Plan B1:  $(wc -l < output_data/plan_b1.jsonl)"

# 2. Shape count
python3 -c "
import json
shapes = set()
for fn in ['output_data/plan_b1.jsonl', 'output_data/plan_b2.jsonl']:
    with open(fn) as f:
        for line in f:
            s = json.loads(line)['shape']
            shapes.add((s['seq_align'], s['heads_align'], s['hidden_align']))
print(f'Unique shapes: {len(shapes)} (must be <= 8)')
assert len(shapes) <= 8, f'Too many shapes: {len(shapes)}'
print('Shape count OK')
"

# 3. Cost model evaluation
python3 scripts/cost_model.py output_data/plan_b1.jsonl
python3 scripts/cost_model.py output_data/plan_b2.jsonl
```

## Reference pointers

- The cost model source at `/app/task_file/scripts/cost_model.py` is the
  authoritative definition of how plans are scored. Read it.
- The baseline at `/app/task_file/scripts/baseline_packer.py` shows a
  naive approach — your plan must be substantially better.
- This is a variant of the NP-hard bin-packing problem. Greedy heuristics
  (sort by size, pack into fewest bins) work well in practice.
- Key insight: the 8-shape limit means you are choosing a quantization of
  the seq_align dimension. Think of it as a clustering problem.
- Inside the task container, the verifier is the ground truth for scoring.
