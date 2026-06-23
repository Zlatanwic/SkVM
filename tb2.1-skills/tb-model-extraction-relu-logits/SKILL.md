---
name: tb-model-extraction-relu-logits
description: Extract the hidden layer weight matrix A1 from a black-box one-layer ReLU neural network (f(x)=A2*ReLU(A1*x+b1)+b2) by querying forward(x) from forward.py and exploiting the ReLU activation pattern to recover A1 up to permutation and scaling. Use this skill whenever the task mentions model extraction, stealing neural network weights, ReLU network inversion, black-box model reverse engineering, forward.py query-based extraction, or producing stolen_A1.npy. Also trigger for the alexgshaw/model-extraction-relu-logits:20251031 Docker image or references to recovering hidden layer weights through critical point detection.
---

# tb-model-extraction-relu-logits

Recover the hidden-layer weight matrix `A1` of a one-layer ReLU network
`f(x) = A2·ReLU(A1·x + b1) + b2` by making black-box queries to
`forward(x)` and exploiting the fact that ReLU activation patterns reveal
the linear structure. This is a Terminal-Bench 2.1 hard mathematics task;
the full task lives at `tasks/model-extraction-relu-logits/`.

## When this skill triggers

Use it when the user is dropped into the `model-extraction-relu-logits`
container and needs to produce `/app/steal.py` that outputs `A1` to
`/app/stolen_A1.npy`. Do **not** use it for general model inversion,
multi-layer network extraction, gradient-based attacks, or other forms of
model stealing (membership inference, distillation, side-channel).

## Goal (one sentence)

Recover `A1` (up to permutation and scaling of rows) from black-box
queries to `forward(x)` by identifying input directions where ReLU neurons
switch activation states.

## Required outputs

| File | Purpose |
|---|---|
| `/app/steal.py` | Python script that queries `forward()` and computes `A1`, saving it to `/app/stolen_A1.npy`. |
| `/app/stolen_A1.npy` | NumPy array containing the recovered weight matrix `A1`, matching the true `A1` up to permutation and scaling. |

## Recommended workflow

### 1. Understand the network structure (≈ 5 min)

The target network is:
```
f(x) = A2 · ReLU(A1 · x + b1) + b2
```

Where:
- `x` is a 10-dimensional input vector.
- `A1` is an `h x 10` matrix (`h` = number of hidden neurons, unknown).
- `b1` is an `h`-dimensional bias vector.
- `A2` is a `1 x h` row vector.
- `b2` is a scalar.
- `f(x)` returns a single float.

Import and test the forward function:
```python
from forward import forward
import numpy as np

x = np.random.randn(10)
y = forward(x)
print(f"f({x}) = {y}")
```

### 2. The key insight: ReLU critical points (≈ 10 min)

For each hidden neuron `j`, its activation is:
```
a_j(x) = ReLU(A1[j, :] · x + b1[j])
```

This neuron switches from inactive (0) to active when:
```
A1[j, :] · x + b1[j] = 0
```

This is a hyperplane in the 10-dimensional input space. Near this
hyperplane, `f(x)` is piecewise linear but its **gradient changes** because
the neuron activates/deactivates.

The core extraction approach:

1. **Find "critical directions"** — directions `d` where `f(x + ε·d)`
   changes non-linearly at some ε. These correspond to neuron boundaries.
2. **For each neuron**, the row `A1[j, :]` is proportional to the
   **gradient change** across its activation boundary.
3. **Recover scaling** — the relative scaling between rows comes from the
   contribution of each neuron to `f(x)` when active.

### 3. Implement the extraction algorithm (≈ 25 min)

**Step A: Find activation boundaries by gradient changes.**

Sample many random directions and find where `f(x)` changes slope:

```python
def find_critical_point(x0, direction):
    """Binary search for a point where gradient changes."""
    # Evaluate f along direction x0 + t * direction
    # Find t where the second derivative is nonzero
    ...
```

**Step B: Estimate the gradient on each side.**

```python
def estimate_gradient(x):
    """Finite-difference gradient of f at x."""
    eps = 1e-5
    grad = np.zeros(10)
    for i in range(10):
        e = np.zeros(10); e[i] = eps
        grad[i] = (forward(x + e) - forward(x - e)) / (2 * eps)
    return grad
```

**Step C: Collect gradient differences.**

For each pair of points straddling a neuron boundary, compute:
```
Δgrad = grad(x_after) - grad(x_before)
```

Each `Δgrad` is proportional to a row of `A1` (up to sign, because
`A2[j]` can be positive or negative).

**Step D: Cluster and extract rows.**

Use PCA or clustering on the set of `Δgrad` vectors to identify the
`h` distinct row directions. Each cluster's mean direction is proportional
to one row of `A1`.

```python
from sklearn.decomposition import PCA
# Collect all Δgrad vectors
delta_grads = ...
pca = PCA(n_components=min(len(delta_grads), 50))
pca.fit(delta_grads)
# The number of nonzero principal components ≈ number of hidden neurons
```

**Step E: Reconstruct A1.**

```python
stolen_A1 = np.array(recovered_rows)  # shape (h, 10)
np.save("/app/stolen_A1.npy", stolen_A1)
```

### 4. Verify the extraction (≈ 5 min)

The verifier checks `stolen_A1` against the true `A1` up to:
- **Permutation**: rows may be in any order.
- **Scaling**: each row may be scaled by a nonzero constant (since
  `A2[j]` can absorb the inverse scaling).

```bash
python3 /app/steal.py
python3 -c "
import numpy as np
stolen = np.load('/app/stolen_A1.npy')
print(f'Recovered shape: {stolen.shape}')
print(f'Recovered A1:\n{stolen}')
"
```

## Verifier checklist (must all pass)

- [ ] `/app/steal.py` exists and runs without error.
- [ ] `/app/stolen_A1.npy` is created and contains a NumPy array.
- [ ] The recovered matrix has the correct shape (same number of rows as
      true `A1`, 10 columns).
- [ ] The recovered rows match the true `A1` rows up to permutation.
- [ ] Row scaling is within tolerance (each recovered row is proportional
      to exactly one true row).

## Common pitfalls

1. **Insufficient queries to find all neurons.** If you only query near
   the origin or a small region of input space, you won't see some neurons
   activate. Sample broadly — use random Gaussian inputs and explore along
   many random directions to discover all `h` hidden neurons.
2. **Gradient estimation noise.** Finite differences with too-large `eps`
   introduce bias; too-small `eps` amplifies numerical noise. Use central
   differences (`(f(x+eps) - f(x-eps)) / (2*eps)`) and test multiple
   `eps` values (1e-3, 1e-4, 1e-5, 1e-6).
3. **Not handling the bias term.** The activation boundary is
   `A1[j,:]·x + b1[j] = 0`, not `A1[j,:]·x = 0`. The bias `b1[j]` shifts
   the hyperplane. If you assume it passes through the origin, extracted
   gradient differences will be wrong. Search for boundaries at points
   across the full input space.
4. **Assuming all A2 entries are positive.** If `A2[j]` is negative, the
   gradient contribution when neuron `j` activates has the opposite sign
   of `A1[j,:]`. The extracted row direction will be `sign(A2[j]) *
   A1[j,:]`. This is fine (scaling ambiguity includes sign).
5. **Not saving as NumPy format.** The verifier expects `stolen_A1.npy`
   (NumPy `.npy` format), not `.txt`, `.csv`, or `.npz`. Use
   `np.save("/app/stolen_A1.npy", matrix)`.

## Reference pointers

- The original paper on ReLU network inversion from queries: Carlini et
  al. — the task is directly inspired by model extraction research.
- Key concept: for a piecewise-linear function (ReLU network), the
  gradient is constant within each linear region and changes at neuron
  activation boundaries. Each such change reveals one row of A1.
- Inside the container: study `forward.py` if it's readable; otherwise
  it's a compiled/locked module you can only query.
- `numpy.linalg.lstsq` or PCA can help separate the mixed gradient signals
  into individual neuron contributions.
