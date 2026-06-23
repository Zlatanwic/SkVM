---
name: tb-polyglot-c-py
description: Create a single source file that is simultaneously valid Python 3 and C code, computing the k-th Fibonacci number when executed as either language. Use this skill whenever the task mentions writing a polyglot, making one file run as both Python and C, producing `main.py.c` under `/app/polyglot/`, or computing Fibonacci numbers from a dual-language source. Also trigger when the user references the `polyglot-c-py` Docker container, asks about Python/C interop without FFI, or mentions executing as both `python3` and `gcc`.
---

# tb-polyglot-c-py

Write a single file that is valid in both Python 3 and C, computing the
k-th Fibonacci number correctly in each language. This is a Terminal-Bench 2.1
software-engineering task; the full task spec lives at `tasks/polyglot-c-py/`
in the repo.

## When this skill triggers

Use it when the user is dropped into the `polyglot-c-py` Docker container and
needs to produce `/app/polyglot/main.py.c` that runs correctly under both
`python3 /app/polyglot/main.py.c N` and
`gcc /app/polyglot/main.py.c -o /app/polyglot/cmain && /app/polyglot/cmain N`.
Do **not** use it for general polyglot challenges (Rust/C++, JavaScript/Python,
etc.) — this task is specifically the Python 3.12 / gcc 13.2 Fibonacci
polyglot.

## Goal (one sentence)

Deliver `/app/polyglot/main.py.c` that prints the k-th Fibonacci number
(f(0)=0, f(1)=1) to stdout when run as either `python3` or a compiled C
executable.

## Required outputs

| File | Purpose |
|---|---|
| `/app/polyglot/main.py.c` | Single polyglot source file. Must produce identical output for any N when run as Python 3 or compiled with gcc. |

The verifier runs both execution paths with multiple values of N and checks
that the outputs match the Fibonacci sequence exactly.

## Recommended workflow

### 1. Understand the polyglot mechanism (≈ 5 min)

A Python/C polyglot works by using the preprocessor and string/comment syntax
that is valid in both languages. Key tricks:

- C `#include` lines start with `#`, which Python treats as a comment.
- C block comments `/* ... */` are opaque to Python if placed strategically.
- Python triple-quoted strings `"""..."""` can wrap C code if the C side
  sees them in an `#if 0` block or a comment.
- The classic pattern:
  ```c
  #if 0
  """ Python code here """
  #endif
  /* C code here */
  ```

### 2. Plan the structure (≈ 5 min)

Common approach: use a C preprocessor conditional to hide Python code from
the C compiler, and use Python's comment handling to hide C code from the
Python interpreter.

One effective pattern:
```
# Python code (prefixed with # which Python sees as comment but C sees as preprocessor)
#define PYTHON_BLOCK """ ... Python code including the polyglot trick ... """
```

Or the reverse: start with Python, use `"""` to wrap C code as a string,
then at the end use `#if 0` / `#endif` to hide the C execution from Python.

### 3. Implement the Fibonacci function (≈ 10 min)

For Python: use a simple iterative or recursive Fibonacci implementation.
For C: use the same algorithm, compiled normally.

The critical part is the dual entry point:
- Python: the script is executed top-to-bottom, parsing `sys.argv`.
- C: `main(int argc, char **argv)` is the entry point, parsing `argv[1]`.

Both must:
1. Parse N from command line arguments.
2. Compute f(N) where f(0)=0, f(1)=1.
3. Print the result to stdout.

### 4. Resolve syntax conflicts (≈ 10 min)

Watch for:
- `//` comments: valid in C99+, but Python treats them differently.
  Better to use `/* */` blocks or `#if 0` gates.
- String literals: C requires `"`, Python allows `"` or `'`.
- The `N` parameter: Python's `sys.argv[1]` is a string; C's `argv[1]` is
  already a `char*`. Use `atoi()` in C, `int()` in Python.
- `print`: Python's `print()` vs C's `printf()`.

### 5. Test both paths (≈ 3 min)

```bash
mkdir -p /app/polyglot

# Python test
python3 /app/polyglot/main.py.c 10
# Expected: 55

# C test
gcc /app/polyglot/main.py.c -o /app/polyglot/cmain
/app/polyglot/cmain 10
# Expected: 55

# Test several values
for n in 0 1 2 5 10 20 30; do
  py=$(python3 /app/polyglot/main.py.c $n)
  c=$(/app/polyglot/cmain $n)
  echo "n=$n py=$py c=$c"
done
```

## Verifier checklist

- [ ] `/app/polyglot/main.py.c` exists.
- [ ] `python3 /app/polyglot/main.py.c N` prints f(N) for all tested N.
- [ ] `gcc /app/polyglot/main.py.c -o /app/polyglot/cmain && /app/polyglot/cmain N` prints f(N) for all tested N.
- [ ] Python and C outputs match for all tested N.
- [ ] f(0)=0, f(1)=1, f(2)=1, f(3)=2, f(4)=3, etc.

## Common pitfalls

1. **Fibonacci base case disagreement.** The spec says f(0)=0, f(1)=1.
   Some definitions use f(0)=1, f(1)=1. Make sure both the Python and C
   implementations agree and match the spec.
2. **Indentation conflicts between Python and C.** Python is
   whitespace-sensitive; C is not. Code that is valid Python (properly
   indented) may look strange to the C compiler inside `#if 0` blocks.
   Use `#if 0` / `#endif` to hide Python code from C, and Python's `#`
   comment or `"""..."`"` strings to hide C code from Python.
3. **`#include` on Python side.** Lines starting with `#` are comments
   in Python (as of Python 3). However, `#include <stdio.h>` on a line
   by itself is fine in Python — it's just a comment. But `#define` or
   `#if` followed by content that Python would try to parse can cause
   issues. Use `#if 0` blocks to isolate C-only preprocessor directives.
4. **Argument parsing differences.** Python's `sys.argv[1]` is 0-indexed
   (script name is `argv[0]`). C's `argv[1]` is also the first argument.
   Both agree on indexing, but Python's argument is a string that needs
   `int()`, while C's needs `atoi()`.
5. **One language works, the other crashes silently.** Test each path
   independently and check exit codes. A Python `SyntaxError` or a C
   compilation error on one path may go unnoticed if you only test the
   other path.

## Reference pointers

- Classic polyglot examples: the Python/C polyglot that prints "Hello World".
- Python 3.12 language reference for `#` comment behavior.
- gcc 13.2 documentation for C preprocessor conditionals.
- Inside the task container, the verifier at `tests/test_outputs.py` is the
  ground truth.
- Task spec: `tasks/polyglot-c-py/instruction.md`.
