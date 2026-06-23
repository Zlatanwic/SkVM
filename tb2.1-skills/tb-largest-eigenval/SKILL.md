---
name: tb-largest-eigenval
description: Optimize the computation of the dominant eigenvalue and eigenvector for small real square matrices (up to 10x10), beating numpy's default algorithm in wall-clock time while maintaining mathematical correctness. Use this skill whenever the task involves implementing `find_dominant_eigenvalue_and_eigenvector` in `/app/eigen.py`, optimizing numerical linear algebra routines, benchmarking against `/app/eval.py` reference, or beating numpy on eigenvalue computation for small matrices. Also trigger when the user references power iteration, Rayleigh quotient, eigenvalue speed optimization, complex eigenpairs from non-symmetric matrices, or the constraint that the entry point must be a Python function but the implementation can use any language.
---

# tb-largest-eigenval

Implement a faster-than-numpy dominant eigenvalue solver for small real
square matrices (up to 10x10) with a Python entry point that may offload
computation to optimized native code. This is one of the Terminal-Bench 2.1
task skills; the full task lives at `tasks/largest-eigenval/` in the same
repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `largest-eigenval` Docker container
and needs to make `/app/eigen.py`'s `find_dominant_eigenvalue_and_eigenvector`
faster than the numpy reference in `/app/eval.py`. Do **not** use it for
general eigenvalue education, symmetric-only eigenproblems, or cases where
the dominant eigenvalue is not the one with the largest magnitude.

## Goal (one sentence)

Implement `find_dominant_eigenvalue_and_eigenvector(A)` in `/app/eigen.py`
that computes the eigenvalue with largest magnitude and its corresponding
eigenvector for real square matrices (up to 10x10, possibly non-symmetric),
runs faster than numpy's default method (median time across multiple tests),
and satisfies `np.allclose(A @ eigenvec, eigenval * eigenvec)`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/eigen.py` | Python module containing `find_dominant_eigenvalue_and_eigenvector(A)` |

The verifier loads this function, feeds it matrices of varying sizes up to
10x10, and compares the median per-call time against the numpy reference.
Results must be numerically correct and consistently faster.

## Recommended workflow

### 1. Survey the baseline (≈ 5 min)

```bash
cd /app
python3 eval.py  # Runs the reference numpy solver and prints timing
```

Read `/app/eval.py` to understand:
- What numpy function serves as the baseline (`np.linalg.eig` or similar).
- How timing is measured (probably `timeit` with multiple runs).
- The matrix size distribution and properties (real, non-symmetric, up to 10x10).
- The tolerance for `np.allclose`.

Inspect the current stub:
```bash
cat /app/eigen.py
```

### 2. Choose an algorithm (≈ 10 min)

For small matrices (up to 10x10), the dominant eigenvalue can be found
efficiently with:

**Option A: Power iteration (simplest)**
- Start with a random vector `v`.
- Repeatedly compute `v = A @ v` and normalize.
- Converges to the dominant eigenvector; eigenvalue via Rayleigh quotient:
  `lambda = (v^T @ A @ v) / (v^T @ v)`.
- Works for real matrices but may fail if the dominant eigenvalue is
  complex or if there are multiple eigenvalues of equal magnitude.
- Simple Python implementation may not beat numpy due to Python loop
  overhead.

**Option B: Power iteration in C/C++/Rust via ctypes/cffi/Python C API**
- Write the core iteration loop in a compiled language.
- Compile to a shared library (`.so`).
- Call from Python via `ctypes` or `cffi`.
- Far lower per-iteration overhead than pure Python.
- Still faces convergence issues for complex eigenvalues.

**Option C: Arnoldi iteration or Krylov subspace methods**
- More robust than power iteration for non-symmetric matrices.
- Can handle complex eigenvalues naturally.
- Harder to implement compactly.

**Option D: LAPACK via scipy or direct ctypes**
- `scipy.linalg.eig` with `subset_by_index` to compute only the largest
  eigenvalue.
- Or directly call LAPACK's `dgeev` (real non-symmetric) via `ctypes`.
- For 10x10 matrices, LAPACK's O(n^3) is negligible — the overhead of
  numpy's Python-layer dispatch may dominate.

**Recommended approach for the task:**
For 10x10 matrices, numpy's `np.linalg.eig` already calls optimized LAPACK.
The speed difference likely comes from avoiding Python overhead and
computing only the dominant eigenvalue rather than all n eigenvalues.

Try:
1. Call `scipy.linalg.eig` with `left=False, right=True` and extract
   only the largest eigenvalue by magnitude.
2. If scipy is not available, use `numpy.linalg.eig` and post-process
   to find the dominant one — but this computes all eigenvalues (unnecessary).
3. For maximum speed: pre-compile a small C function that does power
   iteration and call it via `ctypes`.

### 3. Implement power iteration in C with Python binding (≈ 20 min)

```c
// /tmp/power_iter.c
#include <math.h>
#include <stdlib.h>
#include <string.h>

void power_iteration(double* A, int n, double* eigenvec,
                     double* eigenval_real, double* eigenval_imag) {
    // Allocate work vectors
    double* v = (double*)malloc(2 * n * sizeof(double));  // complex vector
    double* Av = (double*)malloc(2 * n * sizeof(double));
    // ... power iteration with complex handling ...
    free(v);
    free(Av);
}
```

```bash
gcc -O3 -shared -fPIC -o /tmp/libpower.so /tmp/power_iter.c -lm
```

Then in Python:
```python
# /app/eigen.py
import ctypes
import numpy as np
import os

_lib = ctypes.CDLL('/tmp/libpower.so')
_lib.power_iteration.argtypes = [
    ctypes.POINTER(ctypes.c_double),  # A (n x n row-major)
    ctypes.c_int,                      # n
    ctypes.POINTER(ctypes.c_double),  # eigenvec (2n complex)
    ctypes.POINTER(ctypes.c_double),  # eigenval real part
    ctypes.POINTER(ctypes.c_double),  # eigenval imag part
]

def find_dominant_eigenvalue_and_eigenvector(A: np.ndarray):
    A = np.asarray(A, dtype=np.float64)
    n = A.shape[0]
    # Call compiled power iteration
    eigenvec = np.zeros(2 * n, dtype=np.float64)
    eigenval_real = np.zeros(1, dtype=np.float64)
    eigenval_imag = np.zeros(1, dtype=np.float64)
    _lib.power_iteration(
        A.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
        n,
        eigenvec.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
        eigenval_real.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
        eigenval_imag.ctypes.data_as(ctypes.POINTER(ctypes.c_double)),
    )
    return eigenval_real[0] + 1j * eigenval_imag[0], eigenvec.view(np.complex128)
```

### 4. Benchmark against eval.py (≈ 10 min)

```bash
python3 /app/eval.py
```

If your implementation is slower:
- Check that your C code is compiled with `-O3 -march=native`.
- Avoid Python loops entirely — every iteration must happen in native code.
- For 10x10, power iteration typically converges in 10-30 iterations.
  More than 50 suggests a poor initial vector or degenerate matrix.
- Use `np.linalg.norm` instead of manual norm computation.

If your implementation fails `allclose`:
- Check convergence tolerance. Power iteration needs enough iterations.
- For non-symmetric matrices, use a complex eigenvector representation.
- Verify that you are finding the eigenvalue with the **largest magnitude**
  (absolute value), not the largest real part.

### 5. Handle edge cases (≈ 5 min)

- **Complex eigenvalues:** Non-symmetric real matrices can have complex
  eigenvalues. Your implementation must handle this and return a complex
  eigenpair.
- **Multiple dominant eigenvalues:** If two eigenvalues have the same
  magnitude (e.g., +5 and -5), power iteration may not converge cleanly.
  A robust implementation should detect this and fall back to numpy.
- **Zero matrix:** `A = [[0,0],[0,0]]` — all eigenvalues are 0. Should
  return 0 as eigenvalue and any vector as eigenvector.
- **Identity matrix:** All eigenvalues are 1. Any vector is an eigenvector.

## Verifier checklist (must all pass)

- [ ] `/app/eigen.py` exists and defines `find_dominant_eigenvalue_and_eigenvector`.
- [ ] Function accepts a square numpy array of `np.float64` entries.
- [ ] Function returns `(eigenvalue, eigenvector)` where eigenvalue is a
  complex number and eigenvector is a complex numpy array.
- [ ] `np.allclose(A @ eigenvec, eigenval * eigenvec)` is True for all
  test matrices.
- [ ] Median per-call time is strictly less than the numpy reference
  median time (measured over multiple runs).

## Common pitfalls

1. **Computing the wrong eigenvalue.** The task asks for the eigenvalue
   with the **largest magnitude** (absolute value), not the largest real
   part. For matrix `[[-5, 0], [0, 2]]`, the dominant eigenvalue by
   magnitude is -5 (magnitude 5), not 2. Always compare `abs(eigenvalue)`.
2. **Pure Python loops killing performance.** A 10x10 matrix-vector
   multiply in pure Python (with nested loops) is ~100x slower than numpy
   or C. If your implementation uses Python-level iteration, it will NOT
   beat numpy. All inner loops must be in numpy/C/Fortran.
3. **Not handling complex eigenpairs.** Non-symmetric real matrices can
   yield complex eigenvalues. If your power iteration uses real vectors
   only, it will fail on matrices with complex dominant eigenvalues. Use
   complex arithmetic in the iteration or detect and handle the complex
   case.
4. **Power iteration slow convergence.** If the ratio
   `|lambda_2|/|lambda_1|` is close to 1, power iteration converges
   very slowly. For random 10x10 matrices, this ratio is typically
   reasonable, but edge-case matrices may need many iterations or a
   fallback.
5. **Not installing the compiled library.** If you use C/Rust via ctypes,
   the `.so` file must exist at runtime. Ensure the compilation step
   succeeds and the library path is correct. Test with `ldd` or
   `ctypes.CDLL()` error handling.

## Quick sanity test (run after implementing)

```python
import numpy as np
from eigen import find_dominant_eigenvalue_and_eigenvector

# Test 1: Simple 2x2
A = np.array([[1., 2.], [3., 4.]])
val, vec = find_dominant_eigenvalue_and_eigenvector(A)
assert np.allclose(A @ vec, val * vec), "Eigenpair equation failed"
print(f"2x2: eigenvalue = {val:.4f}")

# Test 2: Non-symmetric (complex possible)
A2 = np.array([[0., -1.], [1., 0.]])
val2, vec2 = find_dominant_eigenvalue_and_eigenvector(A2)
assert np.allclose(A2 @ vec2, val2 * vec2), "Complex eigenpair failed"
print(f"Complex: eigenvalue = {val2:.4f}")

# Test 3: 10x10 random
rng = np.random.default_rng(42)
A3 = rng.standard_normal((10, 10))
val3, vec3 = find_dominant_eigenvalue_and_eigenvector(A3)
assert np.allclose(A3 @ vec3, val3 * vec3), "10x10 eigenpair failed"
print(f"10x10: eigenvalue = {val3:.4f}")
```

## Reference pointers

- Power iteration: https://en.wikipedia.org/wiki/Power_iteration
- Rayleigh quotient iteration (faster convergence):
  https://en.wikipedia.org/wiki/Rayleigh_quotient_iteration
- Arnoldi iteration (more robust for non-symmetric):
  https://en.wikipedia.org/wiki/Arnoldi_iteration
- LAPACK `dgeev` for real non-symmetric eigenproblems:
  https://netlib.org/lapack/explore-html/d9/d8e/group__double_g_eeigen.html
- `numpy.linalg.eig` documentation: it computes ALL eigenvalues, which is
  wasteful when you only need the dominant one.
- Inside the task container, `/app/eval.py` is the ground truth for timing
  measurement and `/app/eigen.py` is the entry point you must complete.
