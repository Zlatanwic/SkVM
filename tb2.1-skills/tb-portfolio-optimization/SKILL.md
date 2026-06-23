---
name: tb-portfolio-optimization
description: Implement a high-performance C extension for Python that computes portfolio risk (sqrt(x^T * S * x)) and return (x^T * r) faster than a pure-Python baseline. Use this skill whenever the task mentions optimizing portfolio calculations, writing a C extension with `setup.py build_ext --inplace`, filling in `portfolio_optimized.c` and `portfolio_optimized.py` skeleton files, achieving >= 1.2x speedup on 5000+ assets, or matching the Python baseline output within 1e-10 tolerance. Also trigger when the user references the `portfolio-optimization` Docker container, asks about BLAS/LAPACK-based optimization, or mentions covariance matrix multiplication for up to 8000 assets.
---

# tb-portfolio-optimization

Accelerate portfolio risk and return calculations by implementing a C extension
that outperforms a pure-Python nested-loop baseline while maintaining exact
numerical agreement. This is a Terminal-Bench 2.1 optimization task; the full
task spec lives at `tasks/portfolio-optimization/` in the repo.

## When this skill triggers

Use it when the user is dropped into the `portfolio-optimization` Docker
container and needs to fill in the TODO markers in `portfolio_optimized.c` and
`portfolio_optimized.py` to produce a C extension that beats the baseline by at
least 1.2x on portfolios with 5000+ assets and handles up to 8000 assets. Do
**not** use it for general C extension tutorials, GPU acceleration, or
portfolio theory discussions — this task is specifically about filling in
skeleton files to pass the `benchmark.py` verifier.

## Goal (one sentence)

Complete `portfolio_optimized.c` and `portfolio_optimized.py` to build a C
extension that computes `sqrt(x^T * S * x)` and `x^T * r` at least 1.2x faster
than the Python baseline on 5000+ assets while matching results within 1e-10.

## Required outputs

| File | Purpose |
|---|---|
| `portfolio_optimized.c` | C implementation of portfolio risk and return. Filled in at TODO markers. |
| `portfolio_optimized.py` | Python wrapper / C extension interface. Filled in at TODO markers. |
| (Built artifact) | Compiled `.so` or `.pyd` extension produced by `python3 setup.py build_ext --inplace`. |

The verifier runs `python3 benchmark.py`, which compares the C extension's
output to the Python baseline and measures wall-clock speedup.

## Recommended workflow

### 1. Survey the skeleton files (≈ 5 min)

- Read `portfolio_baseline.py` to understand the reference implementation.
  It uses nested loops to compute:
  - Portfolio risk: `sqrt(sum_i sum_j w_i * S_ij * w_j)` where S is the
    covariance matrix and w is the weights vector.
  - Portfolio return: `sum_i w_i * r_i` (dot product of weights and returns).
- Read `portfolio_optimized.c` and identify all TODO markers.
- Read `portfolio_optimized.py` and identify all TODO markers.
- Read `setup.py` to understand the build process and compiler flags.
- Read `benchmark.py` to see how the verifier tests correctness and speed.

### 2. Understand the math (≈ 3 min)

For N assets:
- **Covariance matrix S**: N x N symmetric matrix.
- **Weights vector w**: length N.
- **Expected returns r**: length N.
- **Portfolio risk**: `sqrt(w^T * S * w)` — a quadratic form.
- **Portfolio return**: `w @ r` — a dot product.

The Python baseline uses O(N^2) nested loops. A C extension can use:
- Loop-level optimizations (cache-friendly memory access).
- BLAS calls if available (`cblas_dgemv` for the matrix-vector product).
- Multi-threading (OpenMP) if the environment supports it.
- Vectorization (SIMD) via compiler flags.

### 3. Implement the C core (≈ 15 min)

In `portfolio_optimized.c`, fill in the functions:

```c
// Portfolio return: dot product of weights and returns
double portfolio_return(const double *weights, const double *returns, int n) {
    double result = 0.0;
    for (int i = 0; i < n; i++) {
        result += weights[i] * returns[i];
    }
    return result;
}

// Portfolio risk: sqrt(w^T * S * w)
double portfolio_risk(const double *weights, const double *cov_matrix, int n) {
    // First compute y = S * w (matrix-vector product)
    double *y = (double *)calloc(n, sizeof(double));
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            y[i] += cov_matrix[i * n + j] * weights[j];
        }
    }
    // Then compute w^T * y (dot product)
    double result = 0.0;
    for (int i = 0; i < n; i++) {
        result += weights[i] * y[i];
    }
    free(y);
    return sqrt(result);
}
```

Key optimizations for the 1.2x speedup:
- Exploit symmetry of the covariance matrix (only compute lower triangle).
- Use `-O3 -march=native -ffast-math` compiler flags in `setup.py`.
- Consider BLAS: `cblas_dsymv` for symmetric matrix-vector multiply.
- Use `restrict` keyword to hint no pointer aliasing.

### 4. Complete the Python wrapper (≈ 5 min)

In `portfolio_optimized.py`, fill in the TODO markers:
- Use `ctypes` or `cffi` to load the compiled shared library.
- Define the Python-callable functions that wrap the C functions.
- Handle array conversion (Python lists/tuples to C arrays).
- Match the function signatures expected by `benchmark.py`.

### 5. Build and test (≈ 5 min)

```bash
python3 setup.py build_ext --inplace
python3 benchmark.py
```

If the benchmark fails:
- Check numerical agreement: the tolerance is `1e-10`. Floating-point
  differences from loop reordering may accumulate. Use `double` throughout.
- Check speedup: if below 1.2x, profile with `-O3`, enable BLAS, or
  add OpenMP pragmas for the matrix multiplication loop.
- Ensure the extension handles up to 8000 assets without memory errors
  (O(N^2) covariance matrix at N=8000 is ~512 MB for `double`).

## Verifier checklist

- [ ] `portfolio_optimized.c` has all TODOs filled (compiles cleanly).
- [ ] `portfolio_optimized.py` has all TODOs filled (loads extension correctly).
- [ ] `python3 setup.py build_ext --inplace` succeeds.
- [ ] `python3 benchmark.py` reports results within 1e-10 of baseline.
- [ ] Speedup is >= 1.2x on portfolios with 5000 or more assets.
- [ ] Extension handles portfolios up to 8000 assets without crashing.

## Common pitfalls

1. **Numerical disagreement from different summation order.** Floating-point
   addition is not associative. If the C code loops in a different order than
   Python, the accumulated result may differ slightly. For 1e-10 tolerance
   at N=8000, this can be an issue. Use `double` (not `float`), and consider
   Kahan summation or matching Python's row-major loop order exactly.
2. **Memory allocation for large matrices.** The covariance matrix for N=8000
   has 64 million entries, consuming ~512 MB as `double`. Stack allocation
   will overflow. Use `malloc`/`calloc` on the heap, and `free` when done.
   Check for allocation failures.
3. **Forgetting to exploit symmetry.** The covariance matrix is symmetric
   (S[i][j] == S[j][i]). Computing only the lower triangle and counting the
   diagonal once can nearly halve the operations. This is often enough to
   reach the 1.2x speedup target.
4. **Compiler optimization flags not set.** The baseline `setup.py` may use
   default flags. Adding `extra_compile_args=['-O3', '-march=native']` or
   linking against BLAS (`libraries=['blas', 'lapack']`) can provide the
   necessary speedup. Check what `setup.py` already specifies.
5. **Extension module import failure.** After `build_ext --inplace`, the
   `.so` file may not be in Python's path. The Python wrapper should handle
   this with an appropriate `ctypes.CDLL()` call using the correct relative
   path, or `setup.py` should be configured to place the output in the
   expected location.

## Reference pointers

- NumPy/SciPy C API documentation for array access patterns.
- BLAS Level 2 `dsymv` (symmetric matrix-vector) and `dgemv` (general).
- Python `ctypes` documentation for loading shared libraries.
- Inside the task container, `benchmark.py` is the ground truth for
  correctness and performance scoring.
- Task spec: `tasks/portfolio-optimization/instruction.md`.
