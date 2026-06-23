---
name: tb-distribution-search
description: Find a probability distribution over a 150,000-token vocabulary that satisfies exact dual KL divergence constraints (both forward and backward KL = 10.0, tolerance 0.001) using numerical optimization. Use this skill whenever the task mentions finding a distribution with constrained KL divergence, both forward KL(P||U) and backward KL(U||P) values, numerical optimization of probability distributions, or saving results as a `.npy` file. Also trigger when the user references `/app/dist.npy`, vocabulary size 150,000, KL divergence tolerance 0.001, or needs to solve a distribution-matching problem with dual KL constraints. The skill covers: formulating the optimization problem, using scipy.optimize or numerical methods to solve for the distribution, ensuring the output is a valid probability simplex, and saving the result in NumPy format.
---

# tb-distribution-search

Find a probability distribution `P` over 150,000 tokens such that both
`KL(P||U) = 10.0` and `KL(U||P) = 10.0` (within tolerance 0.001), where `U`
is the uniform distribution, and save it to `/app/dist.npy`. This is a
Terminal-Bench 2.1 task; the full task spec lives at
`tasks/distribution-search/`.

## When this skill triggers

Use it when the user is dropped into the `distribution-search` Docker container
and needs to numerically solve for a probability distribution satisfying
specific dual KL divergence constraints. Do **not** use it for generic
KL-divergence calculations, training LLM confidence models, or measuring
distribution similarity — this is specifically about finding a distribution
that hits two exact KL values, not computing KL for a known distribution.

## Goal (one sentence)

Find a probability vector `P` of size 150,000 satisfying `KL(P||U) = 10.0`
and `KL(U||P) = 10.0` within 0.001 tolerance, and save it as a NumPy array
to `/app/dist.npy`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/dist.npy` | NumPy array of shape `(150000,)` representing the probability distribution `P`. Must sum to 1 and satisfy both KL constraints. |

## Recommended workflow

### 1. Understand the problem (≈ 5 min)

Given vocabulary size `V = 150000`, uniform distribution `U(i) = 1/V`:

- **Forward KL:** `KL(P||U) = Σ P(i) * log(P(i) / U(i)) = Σ P(i) * log(P(i)) + log(V)`
- **Backward KL:** `KL(U||P) = Σ U(i) * log(U(i) / P(i)) = -log(V) - (1/V) * Σ log(P(i))`

Both must equal 10.0 with tolerance 0.001.

Key observations:
- Forward KL is the entropy difference: `KL(P||U) = log(V) - H(P)` where `H(P)
  = -Σ P(i) * log(P(i))`.
- Backward KL involves the sum of log probabilities.
- Both constraints together significantly restrict the shape of `P`. The
  distribution likely has some entries with very high probability (sparse
  peak) and others near-uniform.

### 2. Parametrize the distribution (≈ 5 min)

A distribution over 150,000 entries cannot be solved by brute-force
optimization of every entry. Use a parametric form:

**Option A: Two-component mixture.** Let `P` be a mixture of a peaked
distribution and a near-uniform background:
```python
P(i) = (1 - alpha) * uniform(i) + alpha * peaked(i)
```
Where `peaked(i)` concentrates mass on a small subset.

**Option B: Exponential family.** Parametrize `P` via logits:
```python
P(i) = exp(logit_i) / Σ exp(logit_j)
```
Then use optimization on the logits.

**Option C: Power-law / Zipfian distribution.** Since both KLs are equal,
a specific power-law decay may satisfy the constraints.

### 3. Formulate as optimization (≈ 10 min)

```python
import numpy as np
from scipy.optimize import minimize

V = 150000
U = np.full(V, 1.0 / V)

def kl_forward(P):
    # KL(P||U), avoid log(0)
    mask = P > 0
    return np.sum(P[mask] * np.log(P[mask] / U[mask]))

def kl_backward(P):
    # KL(U||P), avoid log(0)
    mask = P > 0
    # KL(U||P) = Σ U(i) * log(U(i) / P(i))
    return np.sum(U[mask] * np.log(U[mask] / P[mask]))

def loss(params):
    # Reconstruct P from params (e.g., softmax of logits)
    P = softmax(params)
    fwd = kl_forward(P)
    bwd = kl_backward(P)
    return (fwd - 10.0)**2 + (bwd - 10.0)**2

# Initial guess
init = np.random.randn(V) * 0.01
result = minimize(loss, init, method='L-BFGS-B', options={'maxiter': 10000})
P = softmax(result.x)
```

### 4. Alternative: analytical approach (≈ 10 min)

For equal forward and backward KL, the distribution may satisfy:
```
log(P(i) / U(i)) = c  for most i
```
where `c` is a constant related to the KL value. This implies `P(i)` is
proportional to `U(i) * exp(c)` for most entries, with a few outliers.

Consider a two-value distribution:
- A fraction `f` of entries have probability `p_high`.
- The remaining `1-f` entries have probability `p_low`.
- Constraints: `f * V * p_high + (1-f) * V * p_low = 1`.

### 5. Verify and save (≈ 5 min)

```python
# Check constraints
P = ...  # your solution
assert abs(P.sum() - 1.0) < 1e-10, "Must sum to 1"
assert np.all(P >= 0), "All probabilities must be non-negative"

fwd = kl_forward(P)
bwd = kl_backward(P)
print(f"Forward KL: {fwd:.6f} (target: 10.0, error: {abs(fwd-10.0):.6f})")
print(f"Backward KL: {bwd:.6f} (target: 10.0, error: {abs(bwd-10.0):.6f})")

assert abs(fwd - 10.0) <= 0.001, f"Forward KL out of tolerance"
assert abs(bwd - 10.0) <= 0.001, f"Backward KL out of tolerance"

# Save
np.save("/app/dist.npy", P)

# Verify load
loaded = np.load("/app/dist.npy")
assert loaded.shape == (150000,)
assert abs(loaded.sum() - 1.0) < 1e-10
```

### 6. Run the verifier (≈ 2 min)

```bash
cd /app && python3 -c "
import numpy as np
P = np.load('dist.npy')
assert P.shape == (150000,)
assert abs(P.sum() - 1.0) < 1e-10

# Compute KLs
U = np.full(150000, 1.0/150000)
mask = P > 0
fwd = np.sum(P[mask] * np.log(P[mask] / U[mask]))
bwd = np.sum(U[mask] * np.log(U[mask] / P[mask]))
print(f'Forward KL: {fwd:.6f}')
print(f'Backward KL: {bwd:.6f}')
assert abs(fwd - 10.0) <= 0.001
assert abs(bwd - 10.0) <= 0.001
print('PASS')
"
```

## Verifier checklist (must all pass)

- [ ] `/app/dist.npy` exists and is a valid NumPy file.
- [ ] Array shape is `(150000,)`.
- [ ] All entries are non-negative and sum to 1 (within floating-point tolerance).
- [ ] Forward KL `KL(P||U)` is 10.0 within 0.001 tolerance.
- [ ] Backward KL `KL(U||P)` is 10.0 within 0.001 tolerance.
- [ ] `U` is the uniform distribution: `1/150000` for each entry.

## Common pitfalls

1. **Not satisfying both constraints simultaneously.** It's easy to hit one KL
   value but not the other. The dual constraint is the core difficulty — both
   must be satisfied at once.
2. **Numerical instability with log(0).** Zero-probability entries cause
   `log(0) = -inf`. In backward KL, `U(i) * log(U(i)/P(i))` when `P(i)=0` is
   infinite — so all entries in `P` must be strictly positive.
3. **Optimization getting stuck in local minima.** The loss landscape for this
   problem can be tricky. Try multiple initializations, different optimizers,
   or an analytical approach first.
4. **Shape or dtype mismatch.** The output must be a 1-dimensional NumPy array
   of shape `(150000,)` with float dtype. Not `(1, 150000)` or `(150000, 1)`.
5. **Rounding error on the probability sum.** After optimization, always
   renormalize: `P = P / P.sum()` to ensure exact unit sum.

## Quick sanity test

```python
import numpy as np

P = np.load("/app/dist.npy")
V = 150000
U = np.full(V, 1.0 / V)

# Basic checks
assert P.shape == (V,)
assert P.min() > 0, "All probabilities must be > 0 for backward KL"
assert abs(P.sum() - 1.0) < 1e-10

# KL checks
fwd = np.sum(P * np.log(P / U))
bwd = np.sum(U * np.log(U / P))
assert abs(fwd - 10.0) <= 0.001
assert abs(bwd - 10.0) <= 0.001
print("All checks passed")
```

## Reference pointers

- KL divergence: https://en.wikipedia.org/wiki/Kullback-Leibler_divergence
- SciPy optimization: https://docs.scipy.org/doc/scipy/reference/optimize.html
- NumPy save/load: https://numpy.org/doc/stable/reference/generated/numpy.save.html
- Note: the verifier timeout is 3600 seconds — the optimization may take time.
  Focus on getting a solution, not necessarily the fastest algorithm.
