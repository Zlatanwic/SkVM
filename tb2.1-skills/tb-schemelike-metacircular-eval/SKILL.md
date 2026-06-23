---
name: tb-schemelike-metacircular-eval
description: Implement a metacircular evaluator in a Scheme-like language that can interpret itself. Use this skill when the task mentions metacircular evaluator, `eval.scm`, `interp.py`, self-interpretation, or Scheme/lisp interpretation. Also trigger when the user references reading a file path from STDIN, redirecting input to an interpreted program, or the three-level self-interpretation test (`eval.scm` interpreting `eval.scm` interpreting a test program).
---

# tb-schemelike-metacircular-eval

Write `eval.scm`, a metacircular evaluator for the Scheme-like language
implemented by `interp.py`, capable of interpreting any test program and
interpreting itself. This is a Terminal-Bench 2.1 task; the full task lives at
`tasks/schemelike-metacircular-eval/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `schemelike-metacircular-eval` Docker
container and needs to produce `/app/eval.scm` that passes self-interpretation
tests via `interp.py`. Do **not** use it for generic Scheme interpreter
implementation or writing interpreters in other languages.

## Goal (one sentence)

Write a Scheme program (`eval.scm`) that reads a file path from STDIN,
interprets the referenced `.scm` file with STDIN redirected to it, and can
interpret itself recursively.

## Required outputs

| File | Purpose |
|---|---|
| `/app/eval.scm` | A metacircular evaluator. Reads one line from STDIN (a file path), interprets that `.scm` file, and pipes remaining STDIN + STDOUT through it. Must interpret itself. |

## Recommended workflow

### 1. Understand `interp.py` (≈ 10 min)

- Read `/app/interp.py` thoroughly. It is the reference interpreter for the
  Scheme-like language. Understand:
  - What primitives are available (`+`, `-`, `*`, `/`, `car`, `cdr`, `cons`,
    `list`, `lambda`, `if`, `quote`, `define`, etc.).
  - How it reads programs (file argument + STDIN).
  - How it passes arguments and handles I/O.
- Run simple examples to confirm understanding:
  ```bash
  echo '(+ 7 8)' | python3 interp.py test/calculator.scm
  ```

### 2. Study the test programs (≈ 5 min)

- Explore `test/` directory to see what programs your evaluator must run.
- Run each test program directly through `interp.py` to understand expected
  behavior: `echo '<input>' | python3 interp.py test/<program>.scm`.
- Key insight: your `eval.scm` must handle the full language that these test
  programs use.

### 3. Design the evaluator (≈ 15 min)

A metacircular evaluator for a Scheme-like language needs these components:

1. **`eval`**: Takes an expression and an environment, returns the value.
   - Self-evaluating expressions (numbers, strings) return themselves.
   - Symbols are looked up in the environment.
   - `(quote ...)` returns the quoted datum literally.
   - `(if cond then else)` evaluates cond, then the appropriate branch.
   - `(lambda (params) body)` creates a closure capturing the current environment.
   - `(define name value)` adds a binding to the environment.
   - Function application: evaluate the operator and operands, apply the result.

2. **`apply`**: Takes a procedure and argument values.
   - Primitives (built-ins like `+`, `car`, `cons`) call the implementation directly.
   - Compound procedures (closures) evaluate the body in an extended environment.

3. **Environment model**: A list of frames, each frame being an association list
   of `(name . value)` pairs. `interp.py` likely provides `assoc` or similar.

### 4. Implement I/O routing (≈ 5 min)

- First line read from STDIN is the file path to interpret.
- `read` this line, then open the file and `read` its contents as a program.
- Remaining STDIN lines become the input of the interpreted program.
- The interpreted program's output goes to STDOUT.
- This is the core "meta" layer: `eval.scm` is an interpreter, not just a
  program that computes a result.

### 5. Test iteratively (≈ 20 min)

```bash
# Level 0: direct interpretation
echo '(+ 7 8)' | python3 interp.py test/calculator.scm

# Level 1: eval.scm interprets a test program
echo -e 'test/calculator.scm\n(+ 7 8)' | python3 interp.py eval.scm

# Level 2: eval.scm interprets eval.scm interpreting a test program
echo -e 'eval.scm\ntest/calculator.scm\n(+ 7 8)' | python3 interp.py eval.scm
```

All three must produce identical output. Add test cases from `test/` one by one.

## Verifier checklist (must all pass)

- [ ] `/app/eval.scm` exists and is syntactically valid for `interp.py`.
- [ ] Reads one file path from STDIN, interprets that file.
- [ ] Passes remaining STDIN to the interpreted program.
- [ ] Forwards STDOUT from the interpreted program.
- [ ] Correctly interprets every test program in `test/`.
- [ ] Can interpret itself (`eval.scm` interpreting `eval.scm`).

## Common pitfalls

1. **Not handling STDIN routing correctly.** Reading more than one line from
   STDIN for the file path, or not redirecting remaining input to the interpreted
   program, breaks the three-level test. The first `read-line` gets the file
   path; everything after belongs to the interpreted program.
2. **Missing language features.** If `eval.scm` does not implement `lambda`,
   `define`, recursion, or proper lexical scoping, it cannot interpret itself
   because it uses those features internally. Test with each primitive in
   isolation first.
3. **Incorrect apply for compound procedures.** When applying a user-defined
   function, you must extend the closure's environment with the actual argument
   values, not the current calling environment. This is the most common scoping
   bug in metacircular evaluators.
4. **Assuming the language has features it does not.** The Scheme-like language
   in `interp.py` may not have `set!`, `begin`, macros, `cond`, `let`, or other
   conveniences. Implement only what the test programs actually use.
5. **Stack overflow from non-tail-recursive eval.** The evaluator itself may be
   deeply recursive. If `interp.py` has recursion limits, use iterative patterns
   where possible or ensure tail calls in your eval loop.

## Reference pointers

- SICP Chapter 4.1 ("The Metacircular Evaluator") is the canonical
  reference for this pattern.
- `interp.py` is the ground truth for the language semantics; study it before
  writing a single line of Scheme.
- The test programs in `test/` define the required feature set -- your evaluator
  only needs what they use.
- Run `python3 interp.py` with no arguments to see usage / available primitives.
