---
name: tb-build-cython-ext
description: Build and install the pyknotid Python package from source, compiling its Cython extensions (chelpers, ccomplexity, cinvariants) while fixing NumPy 2.x compatibility issues. Use this skill whenever the task mentions building Cython extensions from source, NumPy API deprecation fixes, compiling pyknotid, fixing `numpy.ndarray` vs `np.ndarray` errors, resolving `NPY_ARRAY_WRITEABLE` or `py.PyRectangle_Type.tp_name` compilation errors, or producing a working `/app/pyknotid` install that passes the knot-theory import-and-compute smoke test. The skill covers: cloning the 0.5.3 tag, diagnosing Cython/NumPy incompatibilities, patching `.pyx` and `.pxd` files, running `setup.py build_ext --inplace`, installing into the global Python environment, and running the package test suite to confirm correctness.
---

# tb-build-cython-ext

Build and install pyknotid (v0.5.3) from source, fixing NumPy 2.3.0 compatibility
errors in its Cython extensions so the package's chelpers, ccomplexity, and
cinvariants modules import and run correctly.

## When this skill triggers

Use it when the user is dropped into the `build-cython-ext` Docker container and
needs to compile pyknotid's Cython extensions against a NumPy >= 2.0 environment.
Do **not** use it for generic `pip install` tasks or other Cython packages -- this
is specifically about pyknotid's three C-extension modules and the API breakage
introduced by NumPy 2.x.

## Goal (one sentence)

Clone pyknotid at tag 0.5.3, fix all NumPy 2.x compilation errors in the Cython
source, and produce a working installation where `pyknotid.spacecurves.chelpers`,
`ccomplexity`, and `pyknotid.cinvariants` import and pass the core test suite.

## Required outputs

| File | Purpose |
|---|---|
| `/app/pyknotid/` | Cloned repository at tag 0.5.3 with patched Cython sources. |
| Compiled `.so` / `.pyd` files | The three extension modules (chelpers, ccomplexity, cinvariants) built and importable. |
| Smoke-test pass | Running the knot-theory snippet from README.md produces no errors. |
| Test suite pass | `pytest` (or equivalent) passes on everything except `test_random_curves.py` and `test_catalogue.py`. |

## Recommended workflow

### 1. Survey the environment (≈ 2 min)

- Check Python version: `python3 --version` and `pip --version`.
- Check NumPy version: `python3 -c "import numpy; print(numpy.__version__)"` (expect 2.3.0).
- Verify Cython is available: `python3 -m cython --version`. Install if missing.
- Confirm a C compiler exists: `gcc --version` or `cc --version`.

### 2. Clone the source (≈ 1 min)

```bash
git clone --depth 1 --branch 0.5.3 https://github.com/SPOCKnots/pyknotid.git /app/pyknotid
cd /app/pyknotid
```

### 3. Diagnose compilation errors (≈ 10 min)

Attempt a build to see what breaks:
```bash
python3 setup.py build_ext --inplace
```

Expected NumPy 2.x errors include:
- `numpy.ndarray` removed in favour of `np.ndarray` in `.pxd` files.
- `NPY_ARRAY_WRITEABLE` flag renamed or removed.
- `py.PyRectangle_Type.tp_name` or other deprecated C-API references.
- `npy_intp` / `npy_int` type changes.

Grep for the problematic patterns:
```bash
grep -rn "numpy\.ndarray" /app/pyknotid/pyknotid/ --include="*.pxd" --include="*.pyx"
grep -rn "NPY_ARRAY_WRITEABLE" /app/pyknotid/ --include="*.pyx"
grep -rn "tp_name" /app/pyknotid/ --include="*.c" --include="*.pyx"
```

### 4. Patch the source (≈ 15 min)

Common fixes:
- In `.pxd` files, replace `cimport numpy` declarations with `np.ndarray` references.
- In `.pyx` files, replace deprecated NPY flags with their NumPy 2.x equivalents
  (e.g., `NPY_ARRAY_WRITEABLE` may become a bit-flag check on the array).
- Regenerate C files from `.pyx` with `cython` if the `.c` files are stale:
  ```bash
  cython pyknotid/spacecurves/chelpers.pyx
  cython pyknotid/spacecurves/ccomplexity.pyx
  cython pyknotid/cinvariants.pyx
  ```
- If `setup.py` references `numpy.get_include()`, confirm it finds the NumPy 2 headers.

### 5. Build and install (≈ 5 min)

```bash
cd /app/pyknotid
python3 setup.py build_ext --inplace
python3 setup.py install
# or: pip install -e .
```

### 6. Verify with the smoke test (≈ 2 min)

Run the README snippet:
```bash
python3 -c "
import pyknotid
from pyknotid.spacecurves import chelpers, ccomplexity
from pyknotid import cinvariants
import pyknotid.make as mk
import pyknotid.spacecurves as sp

k = sp.Knot(mk.three_twist(num_points=100))
out = k.alexander_polynomial(-1)
print(out)
"
```

### 7. Run the test suite (≈ 5 min)

```bash
cd /app/pyknotid
python3 -m pytest tests/ --ignore=tests/test_random_curves.py --ignore=tests/test_catalogue.py
```

All tests except the intentionally excluded files should pass.

## Verifier checklist

- [ ] `/app/pyknotid/` exists and contains the patched source tree.
- [ ] The three Cython extension modules (chelpers, ccomplexity, cinvariants) compile without errors.
- [ ] `import pyknotid` and its submodules succeed in the global Python environment.
- [ ] The README smoke-test snippet runs without errors and produces output.
- [ ] The test suite passes on all non-excluded test files.

## Common pitfalls

1. **Stale `.c` files after editing `.pyx`.** If you only edit the `.pyx` files
   but don't regenerate the `.c` with `cython`, the compiler uses the old C code.
   Always re-cythonize after `.pyx` edits or delete the `.c` files so `setup.py`
   regenerates them.
2. **Pip-installing from PyPI instead of building from source.** The task
   explicitly requires building from the cloned source at tag 0.5.3. Installing
   the PyPI wheel defeats the purpose and fails the verifier.
3. **Overlooking `numpy.get_include()` path.** NumPy 2.x installs headers in a
   different location; if `setup.py` uses a hard-coded path, compilation will
   fail with missing `numpy/arrayobject.h`. Always use `numpy.get_include()`.
4. **Not checking the original package structure.** The task says not to change
   the original package structure -- only fix compatibility issues. Don't
   reorganize directories or rename modules.
5. **Skipping the test suite.** Even if imports work, broken logic in the
   extensions (e.g., incorrect array indexing after a patch) will only surface
   when tests run. Always run the test suite before declaring success.

## Reference pointers

- The pyknotid repository: https://github.com/SPOCKnots/pyknotid (tag 0.5.3).
- NumPy 2.0 migration guide: https://numpy.org/devdocs/numpy_2_0_migration_guide.html
- Cython documentation on using NumPy: https://cython.readthedocs.io/en/latest/src/tutorial/numpy.html
- Inside the task container, the verifier script at `tests/` checks the compiled
  extensions and runs the smoke test.
