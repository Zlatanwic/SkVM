---
name: tb-prove-plus-comm
description: Complete an incomplete Coq proof of addition commutativity for natural numbers in `plus_comm.v` using inductive reasoning and Coq tactics. Use this skill whenever the task involves Coq formal verification, completing a partial proof, the `plus_comm.v` file, compiling with `coqc`, or producing a `.vo` artifact. Also trigger when the user needs to analyze an existing proof attempt, identify missing steps, fill in induction gaps, or produce a verifiable Coq theorem.
---

# tb-prove-plus-comm

Complete a partial Coq proof of the theorem `forall n m : nat, n + m = m + n` in
the file `plus_comm.v` so that `coqc` compiles it to `plus_comm.vo`. This is one
of the Terminal-Bench 2.1 task skills; the full task lives at
`tasks/prove-plus-comm/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `prove-plus-comm` Docker container and
needs to fix an incomplete Coq proof file. Do **not** use it for generic Coq
projects or proofs of other theorems — this is specific to completing an
existing skeletal induction proof of Peano-natural addition commutativity.

## Goal (one sentence)

Analyze and complete the broken induction proof in `plus_comm.v` so that `coqc`
successfully type-checks and compiles the theorem.

## Required outputs

| File | Purpose |
|---|---|
| `/app/plus_comm.v` | The completed Coq proof file with all missing steps filled in. |
| `/app/plus_comm.vo` | The compiled bytecode artifact produced by `coqc plus_comm.v`. |

The verifier checks that `plus_comm.vo` exists and was built from a correct proof.

## Recommended workflow

### 1. Survey the existing proof (≈ 2 min)

- Open `plus_comm.v` and read the current state of the proof. Identify where
  the induction hypothesis is introduced, where it is applied, and which
  subgoals remain open.
- Run `coqc plus_comm.v` to see the exact error message. The error location
  tells you exactly which hole needs filling.
- The proof of `n + 0 = n` (lemma `add_0_r`) is typically needed as a helper
  before tackling commutativity. Check whether it is present.

### 2. Plan the proof sketch (≈ 3 min)

The standard proof of addition commutativity in Coq proceeds in two stages:

1. **Right-zero lemma** (`add_0_r`): prove `forall n, n + 0 = n` by induction.
   - Base: `0 + 0 = 0` (by `simpl` or reflexivity of `+`).
   - Inductive step: assuming `S n + 0 = S n` (IH), show `S n + 0 = S n`.
     Requires rewriting with the definition of `+`.

2. **Right-successor lemma** (`add_succ_r`): prove `forall n m, n + S m = S (n + m)`.
   - Induction on `n`. Base case is trivial. Inductive step rewrites the
     successor.

3. **Commutativity** (`add_comm`): prove `forall n m, n + m = m + n`.
   - Induction on `n`, then use `add_0_r` and `add_succ_r` to rewrite.

### 3. Fill in the missing steps (≈ 15 min)

- Add `add_0_r` and `add_succ_r` lemmas if they are not already present.
- Use `induction` to break down each goal.
- Use `simpl`, `rewrite`, `reflexivity`, `apply`, and `intros` as needed.
- For commutativity itself:
  ```coq
  Theorem plus_comm : forall n m : nat, n + m = m + n.
  Proof.
    intros n m.
    induction n as [| n' IHn'].
    - simpl. rewrite <- plus_n_O. reflexivity.
    - simpl. rewrite IHn'. rewrite plus_n_Sm. reflexivity.
  Qed.
  ```
  (Adjust depending on the lemma names already in the file.)

### 4. Compile and verify (≈ 2 min)

```bash
coqc /app/plus_comm.v
ls -la /app/plus_comm.vo  # should exist and be non-empty
```

If `coqc` reports an error, read the error carefully — it identifies the exact
line and subgoal that failed. Rerun after each fix.

## Verifier checklist (must all pass)

- [ ] `/app/plus_comm.v` compiles without errors.
- [ ] `/app/plus_comm.vo` artifact exists and is non-empty.
- [ ] The proof of `plus_comm` is complete — no `Admitted.` or `Abort.` left in.

## Common pitfalls

1. **Missing helper lemmas.** The commutativity proof typically depends on
   `add_0_r` (`n + 0 = n`) and `add_succ_r` (`n + S m = S (n + m)`). If
   either is missing from the file, `rewrite` will fail with "no matching
   equation." Add them before tackling the main theorem.
2. **Mixing up induction variable order.** Induct on the wrong variable and
   you will get a goal that is unprovable from the IH. For `add_comm`, the
   natural choice is induction on `n` first, then handle `m` generically.
3. **Forgetting to `simpl` before rewriting.** The definition of `+` is
   recursive on the first argument, so `simpl` can expose the constructor
   structure needed for a `rewrite`.
4. **Leaving `Admitted.` or `Abort.` in the file.** The verifier rejects
   incomplete proofs. Every lemma and theorem must end with `Qed.` or `Defined.`.
5. **Using tactics not available in stock Coq.** The Docker image has a
   standard Coq installation. Avoid custom tactic libraries — use only the
   Prelude tactics (`intros`, `induction`, `simpl`, `rewrite`, `reflexivity`,
   `apply`, `destruct`).

## Reference pointers

- The Coq standard library's `Nat.add_comm` in `Coq.Arith.Plus` is the
  canonical implementation — study it for the lemma structure.
- The file `tasks/prove-plus-comm/solution/` in the repo contains reference
  solutions if you get genuinely stuck (use sparingly).
- `coqc --help` shows compilation flags if you need to debug version issues.
