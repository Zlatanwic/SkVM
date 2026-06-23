---
name: tb-reshard-c4-data
description: Create Python scripts for bidirectional C4 dataset resharding with file size and directory count constraints. Use this skill when the task mentions resharding C4 data, compress/decompress scripts, 30-file or 15MB limits, or bidirectional directory restructuring. Also trigger when the user references `/app/compress.py`, `/app/decompress.py`, the `c4_sample/` test directory, or needs to set up a `uv` venv with a `pyproject.toml` for dependency management.
---

# tb-reshard-c4-data

Build two Python scripts -- a compressor and a decompressor -- that bidirectionally
reshard a C4 dataset directory tree, enforcing a maximum of 30 files per directory
and 15 MB per file. This is a Terminal-Bench 2.1 task; the full task lives at
`tasks/reshard-c4-data/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `reshard-c4-data` Docker container and
needs to produce `/app/compress.py`, `/app/decompress.py`, and a `pyproject.toml`
with a working `uv` virtual environment. Do **not** use it for general-purpose
compression or archiving tasks (tar, zip, gzip) -- this is about shard-level
restructuring with directory/file-count limits and exact reversibility.

## Goal (one sentence)

Reshard a directory tree (`compress.py`) to satisfy per-directory file limits and
per-file size limits, and reconstruct the original tree exactly (`decompress.py`).

## Required outputs

| File | Purpose |
|---|---|
| `/app/compress.py` | Takes `<input_dir> <output_dir>`, reshards data: max 30 entries/dir, max 15 MB/file. Creates output dir if missing. |
| `/app/decompress.py` | Takes `<resharded_dir>`, reconstructs the original file tree in-place, matching names and content exactly. |
| `/app/pyproject.toml` | Declares all dependencies; `uv sync` and `uv run` must work without additional installs. Must specify a Python version (`requires-python`). |

## Recommended workflow

### 1. Survey the environment (≈ 2 min)

- Check that `uv` is available: `which uv`. If not, install it: `pip install uv`.
- Run `ls -la /app/c4_sample/` to understand the input data structure -- directory
  nesting depth, typical file sizes, file count distribution.
- Confirm the exact `sys.argv` contract: `compress.py` takes two positional args,
  `decompress.py` takes one.

### 2. Design the resharding scheme (≈ 5 min)

- **compress.py**: Walk the input directory. Flatten or re-pack files so that each
  output directory holds at most 30 items (files + subdirs). Each file must be
  at most 15 MB -- split oversized files as needed. Preserve enough metadata
  (original paths, split indices) for lossless reconstruction.
- **decompress.py**: Read the metadata embedded during compression (e.g., a
  manifest JSON, inline headers, or a sidecar index) and reassemble the original
  tree. Must produce byte-identical files in their original locations.
- Keep the scheme general: no hardcoded paths, no assumptions about specific file
  names beyond what the c4_sample shows.

### 3. Implement compress.py (≈ 10 min)

- Use `sys.argv[1]` and `sys.argv[2]` for input/output directories.
- `os.makedirs(output_dir, exist_ok=True)`.
- Walk input with `os.walk()` or `pathlib.Path.rglob("*")`.
- Split large files into numbered chunks (e.g., `filename.part000`).
- Distribute files/dirs across output subdirectories so none exceeds 30 entries.
- Emit a manifest (e.g., `_manifest.json`) recording the original path for every
  output shard.

### 4. Implement decompress.py (≈ 10 min)

- `sys.argv[1]` gives the resharded directory.
- Read the manifest, reconstruct the original directory tree.
- Merge split file chunks back into the original file.
- `os.makedirs()` for intermediate directories as needed.
- Verify by comparing `diff -r original_dir/ reconstructed_dir/`.

### 5. Set up uv project (≈ 3 min)

- Create `/app/pyproject.toml` with `[project]` name, `requires-python`, and
  `dependencies`. Keep deps minimal -- likely just stdlib plus any metadata lib
  (though most formats can be handled with `json` from stdlib).
- Run `uv sync` to create the lockfile.
- Verify: `uv run python /app/compress.py /app/c4_sample /app/out_test` and
  `uv run python /app/decompress.py /app/out_test`.

### 6. End-to-end test (≈ 5 min)

```bash
uv run python /app/compress.py /app/c4_sample /tmp/compressed
uv run python /app/decompress.py /tmp/compressed
diff -r /app/c4_sample/ /tmp/compressed/
# Should be identical
```

## Verifier checklist (must all pass)

- [ ] `/app/compress.py` exists and runs with two positional args.
- [ ] `/app/decompress.py` exists and runs with one positional arg.
- [ ] `/app/pyproject.toml` exists; `uv sync` succeeds and `uv run` needs no extra installs.
- [ ] Compression respects ≤ 30 entries per directory and ≤ 15 MB per file.
- [ ] Decompression reconstructs the original directory tree with byte-identical files.
- [ ] Scripts work on the hidden test slice, not just `c4_sample/`.

## Common pitfalls

1. **Forgetting to create the output directory.** `compress.py` must create the
   output directory if it does not exist. Use `os.makedirs(out_dir, exist_ok=True)`.
2. **Hardcoding paths or specific filenames.** The scripts must work generically
   on any similarly-structured slice. Do not reference `c4_sample/` inside the
   scripts or assume particular file names.
3. **Dropping metadata needed for reconstruction.** Without a manifest mapping
   output shards back to original paths, `decompress.py` cannot rebuild the tree.
   Embed a JSON manifest or use a deterministic naming scheme that encodes origin.
4. **Using `pip install` instead of `uv`.** The task explicitly requires a `uv`
   venv and `pyproject.toml`. `uv sync` must succeed inside `/app` without manual
   `pip` calls.
5. **Oversized files in compressed output.** Split files that exceed 15 MB before
   placing them in the output tree. The verifier checks the 15 MB per-file cap.

## Reference pointers

- The `c4_sample/` directory inside the container is the development dataset;
  examine its structure carefully.
- `uv` docs: `uv sync` and `uv run` usage patterns for script-based projects.
- Standard library tools are sufficient: `os`, `sys`, `json`, `pathlib`, `shutil`
  cover directory walking, file splitting, and JSON manifest creation.
