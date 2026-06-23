---
name: tb-merge-diff-arc-agi-task
description: Fetch two git bundles, create branches branch1 and branch2 from them, merge branch2 into branch1 resolving all conflicts, and implement an algo.py map function that generalizes from input-output examples in examples.json. Use this skill whenever the task mentions git bundle fetching, bundle1.bundle/bundle2.bundle, branch merging, conflict resolution, ARC-AGI pattern generalization, algo.py with a map function, or examples.json defining input-output pairs. Also trigger for the alexgshaw/merge-diff-arc-agi-task:20251031 Docker image or references to inferring a transformation function from examples.
---

# tb-merge-diff-arc-agi-task

Fetch two git bundles into a repository, merge their branches with conflict
resolution, and implement a generalizable `map()` function that transforms
2D integer arrays according to patterns in `/app/examples.json`. This is a
Terminal-Bench 2.1 medium debugging task; the full task lives at
`tasks/merge-diff-arc-agi-task/`.

## When this skill triggers

Use it when the user is dropped into the `merge-diff-arc-agi-task` container
and needs to produce `/app/repo/algo.py` with a correct `map()` function. Do
**not** use it for general git merging, generic ARC tasks (this has a specific
pattern from the bundle data), or non-git-based merge scenarios.

## Goal (one sentence)

Reconstruct two branches from git bundles, merge them resolving all conflicts,
and implement a `map()` function that reproduces the transformation in
`/app/examples.json` and generalizes to hidden test inputs.

## Required outputs

| File | Purpose |
|---|---|
| `/app/repo/` (git repo) | Initialized git repository with `branch1` and `branch2` fetched from bundles. |
| `/app/repo/algo.py` | Python file containing a `map()` function that takes a 2D list of ints and returns a 2D list of ints. |

## Recommended workflow

### 1. Initialize and fetch the bundles (≈ 5 min)

```bash
mkdir -p /app/repo
cd /app/repo
git init
```

Fetch the first bundle:
```bash
git fetch /app/bundle1.bundle HEAD:branch1
```

If `HEAD` is ambiguous (common with bundles), list the bundle refs:
```bash
git bundle list-heads /app/bundle1.bundle
# Shows something like: abc1234... refs/heads/main
git fetch /app/bundle1.bundle refs/heads/main:branch1
```

Repeat for bundle2:
```bash
git bundle list-heads /app/bundle2.bundle
git fetch /app/bundle2.bundle <correct-ref>:branch2
```

Verify both branches exist:
```bash
git branch
# Should show branch1 and branch2
```

### 2. Merge the branches (≈ 5 min)

```bash
# Use branch1 as the base
git checkout branch1
git merge branch2
```

If there are conflicts, resolve them manually:
```bash
git status         # see conflicted files
# Edit conflicted files to produce consistent content
git add <resolved-files>
git commit -m "Merge branch2 into branch1"
```

The merged result must contain `/app/repo/algo.py`.

### 3. Understand the transformation pattern (≈ 10 min)

Read `/app/examples.json`:
```bash
cat /app/examples.json
```

This file contains input-output pairs showing what `map()` must do. It is
an ARC-AGI-style task: infer the rule from examples and implement it exactly.

Look at each pair:
- What changes between input and output?
- Is it a grid operation (rotation, reflection, flood fill, color swap,
  object movement, counting)?
- Are there multiple transformation rules combined?

Test hypotheses quickly:
```python
import json
with open("/app/examples.json") as f:
    examples = json.load(f)

for ex in examples:
    inp = ex["input"]
    out = ex["output"]
    # Test your hypothesis manually
    # e.g., print(your_function(inp) == out)
```

### 4. Implement algo.py (≈ 15 min)

```python
# /app/repo/algo.py

def map(input_grid: list[list[int]]) -> list[list[int]]:
    """
    Transform a 2D grid of integers according to the pattern
    inferred from /app/examples.json.
    """
    # Implement the inferred transformation rule
    ...
    return output_grid
```

Key requirements:
- The function MUST be named `map` (lowercase).
- It takes a list of lists of integers.
- It returns a list of lists of integers.
- It must work for ALL examples in `/app/examples.json`.
- It must generalize to hidden test inputs (same pattern, different data).

### 5. Verify against examples (≈ 5 min)

```bash
cd /app/repo
python3 -c "
import json
from algo import map

with open('/app/examples.json') as f:
    examples = json.load(f)

for i, ex in enumerate(examples):
    result = map(ex['input'])
    expected = ex['output']
    if result == expected:
        print(f'Example {i}: PASS')
    else:
        print(f'Example {i}: FAIL')
        print(f'  Expected: {expected}')
        print(f'  Got:      {result}')
"
```

All examples must pass before the verifier will accept the solution.

## Verifier checklist (must all pass)

- [ ] `/app/repo/` is an initialized git repository.
- [ ] `branch1` exists, fetched from `bundle1.bundle`.
- [ ] `branch2` exists, fetched from `bundle2.bundle`.
- [ ] `branch2` is merged into `branch1` (merge commit present).
- [ ] `/app/repo/algo.py` exists in the merged result.
- [ ] `algo.py` defines a `map()` function with the correct signature.
- [ ] `map()` produces correct outputs for all examples in `/app/examples.json`.
- [ ] `map()` produces correct outputs for hidden test inputs.

## Common pitfalls

1. **Fetching from HEAD when it is ambiguous.** Git bundles can have multiple
   refs. `HEAD` may not exist or may be ambiguous. Always run `git bundle
   list-heads` first and use the exact ref shown (e.g., `refs/heads/main`).
2. **Leaving merge conflicts unresolved.** If `git merge branch2` produces
   conflicts and you don't resolve them all, the merge commit is incomplete
   and `algo.py` may contain conflict markers (`<<<<<<<`, `=======`,
   `>>>>>>>`) that break the Python parser.
3. **Overfitting to the examples.** ARC-AGI tasks test generalization. If
   `map()` works on the training examples but fails on hidden test inputs,
   the pattern wasn't fully generalized. Look for the minimal description
   of the transformation rule, not a lookup table.
4. **Wrong function name or signature.** The verifier imports `algo.map`.
   If the function is named `Map`, `solve`, or `transform`, or if it doesn't
   accept exactly one argument, the import fails. The function must be named
   `map` (lowercase).
5. **Type mismatches.** Input is `list[list[int]]`, output must also be
   `list[list[int]]`. If the function returns NumPy arrays, tuples, or
   modifies the input in place, the verifier's comparison may fail.

## Reference pointers

- `git bundle` documentation: https://git-scm.com/docs/git-bundle
- ARC-AGI prize: https://arcprize.org/ — understanding the task format.
- Inside the container: `/app/examples.json` is the only ground truth for
  the transformation. Study ALL example pairs carefully before coding.
- Test your `map()` with edge cases: empty grid, single cell, maximum
  integer values, irregular grid sizes.
