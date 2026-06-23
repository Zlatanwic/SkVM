---
name: tb-polyglot-rust-c
description: Create a single source file that is simultaneously valid Rust and C++ code, computing the k-th Fibonacci number when compiled and run as either language. Use this skill whenever the task mentions writing a polyglot for Rust and C++, producing `main.rs` under `/app/polyglot/`, computing Fibonacci numbers (f(0)=1, f(1)=1, f(2)=2) from a dual-language source, or compiling with both `rustc` and `g++ -x c++`. Also trigger when the user references the `polyglot-rust-c` Docker container, asks about Rust/C++ polyglot patterns, or mentions `rustc 1.75.0` and `g++ 13.2.0`.
---

# tb-polyglot-rust-c

Write a single file that is valid in both Rust and C++, computing the k-th
Fibonacci number correctly in each language. This is a Terminal-Bench 2.1
software-engineering task; the full task spec lives at `tasks/polyglot-rust-c/`
in the repo.

## When this skill triggers

Use it when the user is dropped into the `polyglot-rust-c` Docker container
and needs to produce `/app/polyglot/main.rs` that compiles and runs correctly
under both `rustc /app/polyglot/main.rs && /app/polyglot/main N` and
`g++ -x c++ /app/polyglot/main.rs -o /app/polyglot/cmain && /app/polyglot/cmain N`.
Do **not** use it for Python/C, JavaScript/Java, or other polyglot
combinations — this task targets the specific Rust/C++ pair with different
Fibonacci base cases than the C/Python variant.

## Goal (one sentence)

Deliver `/app/polyglot/main.rs` that prints the k-th Fibonacci number
(f(0)=1, f(1)=1, f(2)=2) to stdout when compiled and run as either Rust
(using `rustc`) or C++ (using `g++ -x c++`).

## Required outputs

| File | Purpose |
|---|---|
| `/app/polyglot/main.rs` | Single polyglot source file. Must produce identical output for any N when compiled with rustc or g++ -x c++. |

The verifier runs both compilation and execution paths with multiple values
of N and checks that outputs match the Fibonacci sequence exactly.

## Recommended workflow

### 1. Understand the Rust/C++ polyglot mechanism (≈ 5 min)

The Rust/C++ polyglot is fundamentally different from Python/C. Both Rust and
C++ are compiled languages with no interactive interpreter fallback. Key tricks:

- C++ preprocessor directives (`#define`, `#ifdef`) can gate blocks for
  each language.
- Rust uses `#[cfg(...)]` for conditional compilation but does not understand
  C preprocessor syntax. However, Rust's `cfg!` macro and attribute system
  can distinguish the compiler.
- The `.rs` extension is used by `rustc`; `g++ -x c++` forces C++ compilation
  regardless of extension.
- Common pattern: use `#ifdef __cplusplus` / `#else` / `#endif` to split the
  file, with Rust code hidden from C++ via preprocessor exclusion, and C++
  code hidden from Rust via comment syntax that Rust ignores.
- Rust treats `#` at the start of a line as a regular token (not a comment)
  unless inside a Rust attribute context.

### 2. Plan the preprocessor gating (≈ 5 min)

One effective approach relies on Rust's attribute syntax looking like C++
preprocessor directives:

```rust
// Strategy: embed C++ code in a Rust `#[cfg(not(any()))]` block (never compiled by Rust)
// and embed Rust code in a C++ `#ifdef __RUST__` block (never compiled by C++)
```

Or use the fact that `/* */` block comments work in both languages, combined
with `#if 0` (C++ preprocessor) and `/*` (both) for gating.

A more advanced approach: Rust macros can expand to C++ code, and C++
preprocessor macros can expand back. The classic Rust/C polyglot uses
`#![allow(unused)]` in Rust vs `#include <cstdio>` in C++, with each side's
syntax being invisible to the other.

### 3. Implement Fibonacci with correct base cases (≈ 10 min)

**Important:** The Fibonacci definition differs from the Python/C task:
- f(0)=1, f(1)=1, f(2)=2 (the variant starting with 1, 1)
- This is different from f(0)=0, f(1)=1

Both the Rust and C++ implementations must use this same definition.

C++ side:
```cpp
int fib(int n) {
    if (n <= 1) return 1;
    int a = 1, b = 1;
    for (int i = 2; i <= n; i++) { int t = a + b; a = b; b = t; }
    return b;
}
```

Rust side:
```rust
fn fib(n: i32) -> i32 {
    if n <= 1 { return 1; }
    let (mut a, mut b) = (1, 1);
    for _ in 2..=n { let t = a + b; a = b; b = t; }
    b
}
```

### 4. Resolve Rust-specific challenges (≈ 10 min)

- Rust is strict about unused imports, unused variables, and dead code.
  Use `#[allow(dead_code)]`, `#[allow(unused_imports)]`, or `let _ = ...`
  to suppress warnings that `rustc` treats as errors in some configurations.
- Rust's `main` function signature: `fn main() { ... }` with `std::env::args()`
  for argument parsing.
- C++ `main` signature: `int main(int argc, char **argv) { ... }`.
- Both need to parse the first argument as an integer. Rust uses
  `args().nth(1).unwrap().parse::<i32>().unwrap()`. C++ uses `atoi(argv[1])`.

### 5. Test both paths (≈ 5 min)

```bash
mkdir -p /app/polyglot

# Rust test
rustc /app/polyglot/main.rs -o /app/polyglot/main
/app/polyglot/main 5
# Expected: 8 (since f(0)=1, f(1)=1, f(2)=2, f(3)=3, f(4)=5, f(5)=8)

# C++ test
g++ -x c++ /app/polyglot/main.rs -o /app/polyglot/cmain
/app/polyglot/cmain 5
# Expected: 8

# Test several values
for n in 0 1 2 5 10 20; do
  rust_out=$(/app/polyglot/main $n)
  cpp_out=$(/app/polyglot/cmain $n)
  echo "n=$n rust=$rust_out cpp=$cpp_out"
done
```

Expected sequence: n=0→1, n=1→1, n=2→2, n=3→3, n=4→5, n=5→8, n=6→13, ...

## Verifier checklist

- [ ] `/app/polyglot/main.rs` exists.
- [ ] `rustc /app/polyglot/main.rs && /app/polyglot/main N` prints f(N) for all tested N.
- [ ] `g++ -x c++ /app/polyglot/main.rs -o /app/polyglot/cmain && /app/polyglot/cmain N` prints f(N) for all tested N.
- [ ] Rust and C++ outputs match for all tested N.
- [ ] f(0)=1, f(1)=1, f(2)=2, f(3)=3, f(4)=5, etc.

## Common pitfalls

1. **Using the wrong Fibonacci base case.** This task uses f(0)=1, f(1)=1
   (the 1,1,2,3,5... sequence). The Python/C polyglot task uses f(0)=0,
   f(1)=1. Mixing these up means all outputs will be wrong. Verify against
   the expected sequence in the instruction.
2. **Rust compilation errors from unused code.** When both Rust and C++
   code are in the same file, one side's code is unused by the other
   compiler. Rust in particular may emit errors for unused imports or
   dead code. Use `#[allow(dead_code)]` and `#[allow(unused_imports)]`
   to suppress these.
3. **Argument count handling.** Both Rust and C++ should handle the case
   where N is 0 (no arguments beyond the program name causes `args().nth(1)`
   to be `None`). Ensure the program doesn't panic on missing arguments.
4. **C++ preprocessor leaking into Rust.** If you use `#define` macros to
   bridge the languages, make sure Rust's tokenizer doesn't choke on them.
   Rust does not have a C preprocessor and treats `#` as the start of an
   attribute or a regular character, not a preprocessor directive.
5. **Type differences between languages.** Rust's `i32` and C++'s `int`
   are usually the same, but be careful with integer overflow on large N.
   Both languages use 32-bit signed integers by default; Fibonacci grows
   fast — values above 46 will overflow. The verifier likely tests modest N.

## Reference pointers

- The Rust Reference on attributes: `#[cfg(...)]`, `#[allow(...)]`.
- C++ preprocessor documentation: `#ifdef`, `#if 0`, `#define`.
- Rust 1.75.0 release notes for any edition-specific syntax.
- Inside the task container, the verifier at `tests/test_outputs.py` is the
  ground truth.
- Task spec: `tasks/polyglot-rust-c/instruction.md`.
