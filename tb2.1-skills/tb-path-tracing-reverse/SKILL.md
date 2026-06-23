---
name: tb-path-tracing-reverse
description: Reverse-engineer a compiled binary (`/app/mystery`) into functionally identical C source code (`/app/mystery.c`) that produces identical output when compiled and run. Use this skill whenever the task mentions decompiling a program, reverse-engineering a binary to C source, recreating a mystery executable, producing `mystery.c` under 2KB gzipped, or observing input-output behavior to replicate behavior. Also trigger when the user references the `path-tracing-reverse` Docker container, mentions binary reverse engineering with `objdump`, `ghidra`, or `strace`, or asks to create a fully independent C program that does not invoke the original binary.
---

# tb-path-tracing-reverse

Decompile or behaviorally replicate a compiled mystery binary as a
standalone C program that compiles and runs identically. This is a
Terminal-Bench 2.1 software-engineering / reverse-engineering task; the
full task spec lives at `tasks/path-tracing-reverse/` in the repo.

## When this skill triggers

Use it when the user is dropped into the `path-tracing-reverse` Docker
container and needs to produce `/app/mystery.c` that, when compiled with
`gcc -static -o reversed mystery.c -lm && ./reversed`, behaves identically
to `/app/mystery`. The source must be under 2KB gzipped and must not shell
out to the original binary. Do **not** use it for writing wrappers,
disassemblers that produce assembly output, or reverse engineering with
the goal of producing documentation — the output must be compilable C.

## Goal (one sentence)

Produce `/app/mystery.c` (< 2KB gzipped) that compiles into a binary whose
execution behavior (output, exit code, side effects) is identical to
`/app/mystery`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/mystery.c` | C source code. Must compile with `gcc -static -o reversed mystery.c -lm`. Gzipped size < 2000 bytes. Must be fully independent. |
| (Implicit) Identical behavior to `/app/mystery` for any input. |

The verifier compiles `mystery.c`, runs both binaries on the same inputs,
and checks that outputs and exit codes match exactly.

## Recommended workflow

### 1. Characterize the mystery binary (≈ 5 min)

```bash
file /app/mystery              # identify binary type (ELF64, statically linked?)
ldd /app/mystery               # check shared library dependencies
strings /app/mystery            # find embedded strings, hints about format
strace /app/mystery             # observe system calls (file opens, writes)
```

Run the binary with sample inputs (if it takes arguments) and capture
output. Test edge cases: no arguments, large arguments, negative numbers.

### 2. Disassemble and analyze (≈ 15 min)

```bash
objdump -d /app/mystery          # full disassembly
objdump -t /app/mystery          # symbol table (may reveal function names)
nm /app/mystery                  # list symbols
readelf -a /app/mystery          # ELF structure details
```

Look for:
- The main computation loop or rendering pipeline.
- Constants (floating-point values, magic numbers).
- Algorithm structure: loops, branches, math operations.
- If the binary produces image output, identify the PPM writing routine.

### 3. Trace execution dynamically (≈ 5 min)

```bash
# Record system calls with arguments
strace -f -o /tmp/trace.log /app/mystery

# Use gdb for step-through
echo -e "run\nbt\ninfo registers\nquit" | gdb -batch -ex run -ex bt /app/mystery
```

Understanding what files the binary reads/writes and what system calls it
makes narrows down its purpose. If it's a path tracer, expect `write()` calls
with structured data (PPM header + pixel data).

### 4. Write the C reconstruction (≈ 20 min)

Key aspects:
- Match the output format byte-for-byte. If the binary writes a PPM image,
  replicate the exact header and pixel layout.
- If the binary computes a mathematical function (like a path tracer),
  replicate the algorithm. Watch for: ray-sphere intersection, Lambertian
  scattering, gamma correction, anti-aliasing.
- Ensure identical floating-point behavior. Use the same math operations
  in the same order. `-lm` is required for linking.
- The binary may use `srand()` with a fixed seed — find or try common seeds.

### 5. Iterate until output matches (≈ 15 min)

```bash
# Compare output
/app/mystery > /tmp/orig.txt 2>&1
gcc -static -o reversed mystery.c -lm && ./reversed > /tmp/repl.txt 2>&1
diff /tmp/orig.txt /tmp/repl.txt

# For binary output (PPM images):
diff <(xxd /tmp/orig.ppm) <(xxd /tmp/repl.ppm)

# Check gzip size
cat mystery.c | gzip | wc -c    # must be < 2000
```

If differences remain, check for: off-by-one in loops, different random
seed, missing gamma correction, wrong floating-point rounding mode.

## Verifier checklist

- [ ] `/app/mystery.c` exists.
- [ ] Compiles with `gcc -static -o reversed mystery.c -lm`.
- [ ] `./reversed` produces output identical to `./mystery` (byte-for-byte).
- [ ] Both programs have identical exit codes for equivalent inputs.
- [ ] Gzipped size of `mystery.c` is < 2000 bytes.
- [ ] `mystery.c` does not invoke `/app/mystery` (no `system()`, `exec*()`, etc.).
- [ ] `mystery.c` is fully independent (works in isolation).

## Common pitfalls

1. **Embedding data instead of computing it.** The 2KB gzip limit prevents
   large data tables. The solution must be algorithmic. Embedding the output
   as a base64-encoded blob will exceed the size limit and fail the verifier's
   independence test.
2. **Shelling out to the original binary.** Using `system("./mystery")` or
   `exec*` is explicitly forbidden. The verifier runs `reversed` in an
   environment where `/app/mystery` is absent. The C program must be
   self-contained.
3. **Off-by-one errors in loop bounds or array indices.** These produce
   subtly wrong output that is difficult to spot. Use `diff` on hex dumps
   to find the exact byte position of the first mismatch.
4. **Floating-point differences from different optimization levels.** The
   mystery binary was compiled with specific flags. Small differences in
   floating-point rounding (especially with `-ffast-math`) can cause
   byte-level mismatches. Match the compiler flags if possible; if not,
   use `double` consistently and avoid compiler-specific math intrinsics.
5. **Not testing edge cases.** The verifier may test with different inputs
   than those you observed. Make sure the algorithm generalizes — don't
   hard-code outputs for a single test case.

## Reference pointers

- `objdump`, `readelf`, `nm`, `strace`, `ltrace` man pages for binary analysis.
- Ghidra (NSA reverse engineering tool) for graphical decompilation if
  available in the container or accessible.
- Inside the task container, the verifier at `tests/test_outputs.py` is the
  ground truth for byte-exact comparison.
- Task spec: `tasks/path-tracing-reverse/instruction.md`.
