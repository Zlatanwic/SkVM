---
name: tb-sqlite-with-gcov
description: Compile SQLite from pre-vendored source with gcov instrumentation and make it available in the system PATH. Use this skill when the task mentions compiling SQLite, gcov instrumentation, `/app/sqlite`, `/app/vendor/sqlite-fossil-release.tar.gz`, or making the compiled `sqlite3` binary available in PATH. Also trigger when the user references C compilation with coverage flags, `--coverage`, `-fprofile-arcs -ftest-coverage`, or building from a source tarball.
---

# tb-sqlite-with-gcov

Compile SQLite from a pre-vendored source tarball with gcov instrumentation
flags and make the resulting `sqlite3` binary available in the system PATH.
This is a Terminal-Bench 2.1 task; the full task lives at
`tasks/sqlite-with-gcov/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `sqlite-with-gcov` Docker container
and needs to build an instrumented SQLite binary. Do **not** use it for
installing SQLite via `apt-get` or `brew`, or for compiling SQLite without
coverage instrumentation. The key differentiator is the gcov requirement.

## Goal (one sentence)

Produce an instrumented `sqlite3` binary from source with gcov flags enabled,
installed to a PATH-accessible location.

## Required outputs

| Output | Purpose |
|---|---|
| Instrumented `sqlite3` binary | A working SQLite CLI compiled with `--coverage` (gcc) or `-fprofile-arcs -ftest-coverage` flags, available in `PATH`. |
| Gcov notes files | The compilation should produce `.gcno` files for coverage instrumentation. |

## Recommended workflow

### 1. Extract the source (≈ 2 min)

- The source is at `/app/vendor/sqlite-fossil-release.tar.gz`. Do **not**
  download from the internet -- use the pre-vendored tarball.
  ```bash
  mkdir -p /app/sqlite_build
  cd /app/sqlite_build
  tar xzf /app/vendor/sqlite-fossil-release.tar.gz
  ```
- Find the source directory (likely `sqlite/` or `sqlite-fossil-release/`).
- Check for build instructions: `ls *.c`, `cat README*` or `cat Makefile`.

### 2. Configure with gcov flags (≈ 3 min)

- SQLite uses a single amalgamation C file (`sqlite3.c`) plus a shell file
  (`shell.c`) for the CLI.
- Compile with gcov instrumentation:
  ```bash
  cd sqlite*
  # For GCC:
  gcc -O0 --coverage -o sqlite3 sqlite3.c shell.c -lpthread -ldl -lm
  # Or with explicit flags:
  gcc -O0 -fprofile-arcs -ftest-coverage -g -o sqlite3 sqlite3.c shell.c -lpthread -ldl -lm
  ```
- `--coverage` is equivalent to `-fprofile-arcs -ftest-coverage -lgcov`.
- `-O0` ensures predictable coverage instrumentation (optimizations can skew
  coverage data).
- `-g` adds debug symbols (often expected alongside gcov).
- Link with `-lpthread`, `-ldl`, `-lm` as needed by SQLite.

### 3. Verify the binary (≈ 2 min)

```bash
./sqlite3 --version
./sqlite3 :memory: "SELECT sqlite_version();"
```
- Confirm the binary runs and executes SQL.
- Check that `.gcno` files were produced:
  ```bash
  ls *.gcno  # Should exist
  ```
- Verify gcov works:
  ```bash
  gcov sqlite3.c  # Should produce a .gcov file
  ```

### 4. Install to PATH (≈ 2 min)

- Copy or symlink the binary to a system location:
  ```bash
  cp sqlite3 /usr/local/bin/sqlite3
  # Or:
  ln -s $(pwd)/sqlite3 /usr/local/bin/sqlite3
  ```
- Test availability: `which sqlite3 && sqlite3 --version`.
- Or add to PATH: `export PATH=/app/sqlite:$PATH` (and persist in `.bashrc` or
  the build script).

### 5. Validate (≈ 2 min)

```bash
# Any user should be able to run sqlite3
sqlite3 :memory: "CREATE TABLE test(id INTEGER); INSERT INTO test VALUES (1); SELECT * FROM test;"

# Verify gcov files are accessible
python3 -c "
import subprocess
result = subprocess.run(['sqlite3', '--version'], capture_output=True, text=True)
print(result.stdout)
"
```

## Verifier checklist (must all pass)

- [ ] `sqlite3` binary is in the system PATH (runnable by any user).
- [ ] Binary was compiled from the vendored source at `/app/vendor/sqlite-fossil-release.tar.gz`.
- [ ] Binary is compiled with gcov instrumentation (`--coverage` or equivalent).
- [ ] `.gcno` files exist from the compilation.
- [ ] The binary functions correctly (can execute SQL queries).

## Common pitfalls

1. **Downloading source from the internet instead of using the vendored tarball.**
   The verifier checks that you used `/app/vendor/sqlite-fossil-release.tar.gz`.
   Fetching from sqlite.org wastes time and may pull a different version.
2. **Forgetting the linker flags.** SQLite needs `-lpthread -ldl -lm` on Linux.
   Without these, the compilation either fails at link time or produces a binary
   that crashes on certain operations.
3. **Using optimization flags that conflict with gcov.** `-O2` or `-O3` can
   inline, eliminate, or reorder code, making coverage data unreliable. Use
   `-O0` (or at most `-Og`) with gcov.
4. **Not placing the binary in PATH.** Compiling in a local directory and
   forgetting to install the binary to `/usr/local/bin/` (or another PATH entry)
   means the verifier cannot find `sqlite3`. Use `cp` or `ln -s` into a
   standard location.
5. **Missing `.gcno` files.** If the compilation does not produce `.gcno` files,
   gcov instrumentation was not correctly enabled. Check that the compiler
   supports `--coverage` (GCC) or use `-fprofile-arcs -ftest-coverage`
   explicitly.

## Reference pointers

- GCC gcov documentation: `--coverage` flag and the `gcov` tool.
- SQLite amalgamation build: the canonical way is `gcc -o sqlite3 sqlite3.c shell.c`.
- Vendored source: `/app/vendor/sqlite-fossil-release.tar.gz`.
- SQLite compilation flags reference: `https://www.sqlite.org/howtocompile.html`.
