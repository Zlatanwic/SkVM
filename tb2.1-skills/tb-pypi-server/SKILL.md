---
name: tb-pypi-server
description: Create a Python package called `vectorops` (v0.1.0) with a `dotproduct` function, build it, and serve it from a local PyPI server on port 8080 so `pip install --index-url http://localhost:8080/simple vectorops==0.1.0` works. Use this skill whenever the task involves Python packaging with `setuptools`/`build`, running a local PyPI index (pypiserver, devpi, or simple HTTP), exposing a pip-installable package over localhost, or producing a `vectorops` package with a `dotproduct` entry point.
---

# tb-pypi-server

Build the `vectorops` Python package so it is installable via a local PyPI server
listening on port 8080. This is one of the Terminal-Bench 2.1 task skills; the
full task lives at `tasks/pypi-server/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `pypi-server` Docker container and needs
to produce a locally-hosted pip-installable package. Do **not** use it for
uploading packages to the public PyPI index, general Python packaging questions,
or any task that does not specifically require a `vectorops` package served over
`localhost:8080`.

## Goal (one sentence)

Create the `vectorops` Python package (v0.1.0) with a `dotproduct` function,
build it into a wheel, and serve it from a local package index on port 8080 so
`pip install --index-url http://localhost:8080/simple vectorops==0.1.0` succeeds.

## Required outputs

| File | Purpose |
|---|---|
| `/app/vectorops/__init__.py` | Package source exposing `dotproduct` at the top level. |
| `/app/pyproject.toml` or `/app/setup.py` | Package metadata (name=`vectorops`, version=`0.1.0`). |
| `/app/dist/vectorops-0.1.0-py3-none-any.whl` (or `.tar.gz`) | Built distribution artifact. |
| Server running on port 8080 | Background process serving `/simple/vectorops/` so pip can resolve the package. |

The verifier executes `pip install --index-url http://localhost:8080/simple vectorops==0.1.0` and
checks that `dotproduct` works correctly.

## Recommended workflow

### 1. Create the package source (≈ 5 min)

Create the directory structure:

```
/app/vectorops/
    __init__.py
/app/pyproject.toml
```

The `__init__.py` must define `dotproduct` at module level:

```python
def dotproduct(a: list[float], b: list[float]) -> float:
    """Return the dot product of two equal-length lists of numbers."""
    if len(a) != len(b):
        raise ValueError("lists must have the same length")
    return sum(x * y for x, y in zip(a, b))
```

The `pyproject.toml` (preferred) or `setup.py` must declare `name = "vectorops"` and
`version = "0.1.0"`. A minimal `pyproject.toml`:

```toml
[build-system]
requires = ["setuptools>=64"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "vectorops"
version = "0.1.0"
```

Alternatively, a minimal `setup.py`:

```python
from setuptools import setup, find_packages
setup(name="vectorops", version="0.1.0", packages=find_packages())
```

### 2. Build the distribution (≈ 3 min)

```bash
cd /app
pip install build
python -m build
```

This produces artifacts in `/app/dist/`. Verify the wheel exists:

```bash
ls /app/dist/
# vectorops-0.1.0-py3-none-any.whl
```

### 3. Set up the local PyPI server (≈ 5 min)

You need a server that serves files under `/simple/` with PEP 503-compliant
pages. Several options work:

**Option A — `pypiserver` (recommended):**
```bash
pip install pypiserver
pypi-server run -p 8080 /app/dist &
```

**Option B — `devpi-server`:**
```bash
pip install devpi-server
devpi-init
devpi-server --port 8080 &
```

**Option C — Simple Python HTTP server with PEP 503 layout:**
If neither package is available, serve the PEP 503 simple index manually:
```bash
mkdir -p /app/simple/vectorops
cp /app/dist/vectorops-0.1.0-py3-none-any.whl /app/simple/vectorops/
# Create an HTML anchor page at /app/simple/vectorops/index.html
python -m http.server 8080 --directory /app &
```

Whatever server you use must return a PEP 503 page at
`http://localhost:8080/simple/vectorops/` that contains an anchor tag
pointing to the wheel file.

### 4. Verify the install works (≈ 2 min)

```bash
pip install --index-url http://localhost:8080/simple vectorops==0.1.0
python -c "from vectorops import dotproduct; assert 1 == dotproduct([1,1], [0,1]); print('OK')"
```

## Verifier checklist (must all pass)

- [ ] `vectorops` package is installable via `pip install --index-url http://localhost:8080/simple vectorops==0.1.0`.
- [ ] `from vectorops import dotproduct` works without error.
- [ ] `dotproduct([1, 1], [0, 1])` returns `1` (the dot product).
- [ ] Server is listening on port 8080 and responds to HTTP requests.
- [ ] The PEP 503 simple index page at `/simple/vectorops/` contains a valid anchor link.

## Common pitfalls

1. **Wrong package name or version.** The verifier requests `vectorops==0.1.0`
   literally. A mismatch in `pyproject.toml` name or version causes pip to fail.
2. **`dotproduct` not at top level of `__init__.py`.** The verifier does
   `from vectorops import dotproduct` — if `dotproduct` is in a submodule,
   the import fails. Export it from `__init__.py` directly.
3. **Server not PEP 503 compliant.** pip expects an HTML page at
   `/simple/vectorops/` with anchor tags linking to distribution files.
   A bare directory listing from `python -m http.server` may not work unless
   the directory structure is exactly right. Use `pypiserver` when possible.
4. **Wrong port or process died.** The server must be running on port 8080
   when the verifier executes. If you started it in the foreground, it will
   block. Use `&` to background it, or use `nohup`/`screen`/`tmux`.
5. **Package not built before serving.** Run `python -m build` before starting
   the server so the wheel is ready in `/app/dist/`.

## Reference pointers

- PEP 503 (Simple Repository API): specifies the HTML format pip expects.
- `pypiserver` documentation: the simplest way to run a local index.
- The verifier script at `tests/test_outputs.py` in the task directory is the
  ground truth for what gets scored.
