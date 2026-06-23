---
name: tb-fix-ocaml-gc
description: Debug and fix a crash in the OCaml compiler's garbage collector C code caused by a run-length compression optimization in the major heap sweeper. Use this skill whenever the task involves fixing the OCaml runtime's garbage collector, debugging a bootstrapping compiler crash, analyzing C memory management bugs in `major_gc.c` or similar runtime files, reading `HACKING.adoc` for build instructions, running `make -C testsuite one DIR=tests/basic` to verify the fix, or working inside the `fix-ocaml-gc` Docker container. Also trigger when the user needs to debug segmentation faults during `ocamlc` self-compilation, understand OCaml's major heap sweep and mark-compact phases, or fix an off-by-one or premature-free bug in run-length-compressed free lists.
---

# tb-fix-ocaml-gc

Debug and fix a crash in the OCaml compiler's garbage collector that occurs
during bootstrapping (the compiler building itself), caused by a bug in
run-length compression of free space in the major heap. This is one of the
Terminal-Bench 2.1 task skills; the full task lives at
`tasks/fix-ocaml-gc/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `fix-ocaml-gc` Docker container and
needs to fix a GC crash that prevents the OCaml compiler from bootstrapping.
Do **not** use it for general OCaml compiler development or feature additions
— this is specifically about debugging a C-level runtime bug in the major heap
sweeper where a recent optimization (run-length encoding of free blocks)
introduced a crash.

## Goal (one sentence)

Find and fix the bug in the OCaml runtime's major heap sweeping code so that
the compiler successfully bootstraps and the basic test suite passes.

## Required outputs

| File | Purpose |
|---|---|
| Modified OCaml runtime C source | The bug fix in the GC sweeping code (likely `runtime/major_gc.c` or similar). |
| Successful `make` build | The compiler must build from source without crashing. |
| Passing `make -C testsuite one DIR=tests/basic` | The basic test suite must pass to confirm the fix is correct. |

The verifier compiles the fixed compiler, bootstraps it (compiler compiles
itself), and runs the basic testsuite. All must succeed.

## Recommended workflow

### 1. Understand the build system (≈ 10 min)

```bash
# Read build instructions
cat HACKING.adoc

# Typical OCaml build flow:
./configure
make world          # Build the compiler, libraries, and tools
# or:
make -j$(nproc)     # Parallel build

# If the compiler crashes during bootstrapping, you'll see a segfault
# or an OCaml-level exception during the second stage of make world.
```

Key build stages:
1. `make coldstart` — build a minimal bytecode compiler
2. `make ocamlc` — compile the native OCaml compiler with the bytecode one
3. The crash likely occurs when `ocamlc.opt` is compiling the standard library
   or itself — the GC runs during this compilation and hits the bug.

### 2. Reproduce the crash (≈ 5 min)

```bash
# Attempt to build and capture the crash
make world 2>&1 | tee build.log

# Look for the crash signature:
# - Segmentation fault (SIGSEGV)
# - Bus error (SIGBUS)
# - Assertion failure in the runtime
# - "Fatal error: exception ..." from the OCaml runtime

# Find the crashing binary
grep -E 'segfault|SIGSEGV|assertion|Fatal' build.log
```

If the crash is in the runtime:
- The stack trace (if available) will point to a specific C function in
  `runtime/`.
- Look for recent changes to sweeping/marking/compaction code.
- `gdb` or `lldb` can be used if the build environment has debugging symbols.

### 3. Locate the run-length compression code (≈ 15 min)

```bash
# Search for recent GC changes
cd runtime/
grep -n -i "run.length\|rle\|compress\|free.*list\|sweep\|major.*heap" *.c *.h

# Key files to inspect:
# - major_gc.c: Major heap GC logic (mark, sweep, compact)
# - freelist.c or freelist.h: Free list management
# - compact.c: Heap compaction
# - memory.c: Low-level memory operations
```

The bug is in the sweeping phase where free space in the major heap is
coalesced and run-length compressed. Common failure modes:

1. **Off-by-one in compressed free-block size calculation** — the run-length
   encoding says a block has `N` free words but actually has `N-1` or `N+1`,
   causing the allocator to overwrite live data later.
2. **Free-block header corruption** — the compression writes a header but the
   header format doesn't match what the allocator expects.
3. **Missing alignment** — compressed blocks don't maintain the required
   word alignment, causing misaligned access crashes.
4. **Double-free of the same block** — the compression accidentally includes
   a block that is already in the free list.
5. **Incorrect block coalescing** — adjacent free blocks are merged
   incorrectly, losing a word or duplicating a word.

### 4. Debug the crash (≈ 30 min)

```bash
# Build with debug symbols
./configure --enable-debug-runtime
make world

# If it crashes, get a backtrace
gdb --args ./ocamlc.opt ...
(gdb) run
(gdb) bt full

# Or enable OCaml runtime debugging
export OCAMLRUNPARAM="v=255"
```

Key debugging techniques:
- Add `fprintf(stderr, ...)` to the sweeping function to trace which blocks
  are being compressed, their sizes, and addresses.
- Compare the free list before and after the sweeping + compression phase.
- Look at the values the run-length encoder writes vs. what the allocator
  reads back — are they the same encoding?

Common specific bugs in run-length compression of free lists:

```c
// BUG EXAMPLE: The encoded length doesn't include the header word
// Allocation reads back: total = header.sz + header.rle_count * block_sz
// But the encoder wrote:  header.rle_count = actual / block_sz  (missing +1)
// Result: allocator gets 1 fewer block than expected

// Another BUG EXAMPLE: Off-by-one boundary condition
// The loop that compresses consecutive free blocks runs one iteration too many,
// consuming a block that is not actually free (it's a live object header).
```

### 5. Apply and test the fix (≈ 20 min)

- Make a minimal, focused edit to the C file.
- Rebuild: `make world` (or faster: `make -C runtime && make ocamlc`).
- Verify bootstrapping completes.
- Run the basic test suite:

```bash
make -C testsuite one DIR=tests/basic
```

If tests pass, the fix is likely correct. If not, re-examine the encoding
logic.

## Verifier checklist (must all pass)

- [ ] `make world` (or equivalent) completes without crash.
- [ ] The OCaml compiler successfully bootstraps (compiles itself).
- [ ] `make -C testsuite one DIR=tests/basic` passes all tests.
- [ ] Only the GC bug is fixed — no unrelated code changes.
- [ ] The fix does not break any other GC invariants (no memory leaks, no
      corruption of live data).

## Common pitfalls

1. **Not reading `HACKING.adoc` first.** The OCaml build system has specific
   conventions (configure flags, make targets, dependency handling). Skipping
   the build documentation leads to confusing build errors that aren't related
   to the GC bug.
2. **Fixing the symptom, not the root cause.** A segfault in the allocator
   might lead you to add a null check there. But the actual bug is that the
   sweep compressor wrote an incorrect free-block header earlier. Trace
   backward from the crash to the source of the bad data.
3. **Breaking the free-list invariant.** The OCaml GC has specific invariants:
   free blocks must be sorted by address, adjacent free blocks must be
   coalesced, all blocks must be properly aligned, headers must be valid.
   Violating any of these causes subtle crashes later, not necessarily at the
   point of the violation.
4. **Not running the test suite after fixing.** Even if the compiler
   bootstraps, edge cases in the GC might cause failures in compiled programs.
   The `tests/basic` suite exercises allocation patterns that stress the GC.
5. **Misunderstanding the run-length encoding format.** The compression
   format has a specific in-memory representation (likely a header word with a
   count field and a size field). Get the format wrong and the allocator reads
   garbage. Document the format from the code before making changes.

## Quick sanity test (run after fixing)

```bash
# Rebuild from clean (the real test)
make clean && make world

# Run basic tests
make -C testsuite one DIR=tests/basic

# Also check that OCaml programs that allocate heavily still work
echo 'let rec alloc n = if n = 0 then () else (ignore (Array.make 1000 0); alloc (n-1));; alloc 100000' | ./ocaml
```

## Reference pointers

- `HACKING.adoc` in the repository root — build instructions and conventions.
- The OCaml runtime source is in `runtime/` — key files are `major_gc.c`,
  `freelist.c`, `compact.c`, `memory.c`, and `gc.h`.
- The OCaml GC uses a generational design: minor heap (young generation) and
  major heap (old generation). The bug is in the major heap sweeper.
- Run-length encoding of free lists is a size optimization — instead of
  storing each free block separately, consecutive equally-sized free blocks
  are represented as (count, size) pairs.
- The `testsuite/` directory contains the OCaml test infrastructure; `make -C
  testsuite one DIR=tests/basic` runs the basic correctness tests.
