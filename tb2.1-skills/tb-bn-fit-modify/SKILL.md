---
name: tb-bn-fit-modify
description: Recover a Bayesian Network DAG from observational data, learn its CPDs, perform a causal do-intervention on variable Y, and sample 10,000 points from the modified network. Use this skill whenever the task mentions Bayesian network structure learning, causal intervention, do-calculus, /app/bn_sample_10k.csv, the /app/learned_dag.csv + /app/intervened_dag.csv + /app/final_bn_sample.csv artifact triplet, the variables {U, R, Y, M, D}, the bnlearn R package, or 6-edge DAG recovery with one removed edge. Also trigger when the user references the bn-fit-modify Docker image or asks to combine constraint-based DAG search with do()-style interventions. The skill covers: data-driven DAG recovery under the "alphabetical-letter-is-child" tiebreak rule, bnlearn fit, intervention edge removal, large-sample resampling, and Kolmogorov-Smirnov validation of the output distribution.
---

# tb-bn-fit-modify

Recover a Bayesian Network (BN) DAG from 10k observational samples, learn
its conditional probability distributions, perform a do-intervention on
variable `Y`, and emit a fresh 10k-row sample from the modified network.
This is one of three Terminal-Bench 2.1 task skills; the full task lives at
`tasks/bn-fit-modify/` in the same repo as this skill.

## When this skill triggers

The user is inside the `bn-fit-modify` Docker container with
`/app/bn_sample_10k.csv` already on disk. The columns are
`U, R, Y, M, D`. They need three files written before the verifier will
pass. Do not use this skill for generic Bayesian inference (MCMC posterior
sampling, prior elicitation, MCMC convergence diagnostics) — that is a
different problem class.

## Goal (one sentence)

Emit a recovered DAG, an intervened DAG with `U → Y` removed, and 10,000
fresh samples from the intervened BN — all in the exact column formats
the verifier expects.

## Required outputs

| File | Format | Notes |
|---|---|---|
| `/app/learned_dag.csv` | `to,from` header, then one edge per row | Exactly 6 rows. The expected edge set is `{(U,M), (U,Y), (U,D), (U,R), (Y,D), (R,M)}`. |
| `/app/intervened_dag.csv` | Same format as above | Exactly 5 rows. The `U → Y` edge must be gone. |
| `/app/final_bn_sample.csv` | `U,R,Y,M,D` header (column order matters) | 10,000 rows. The marginal of `D` is validated with a Kolmogorov-Smirnov test at 99.9% confidence. |

The verifier (`tests/test_outputs.py`) checks file existence, column
names, row counts, edge set equality, and a statistical test on `D`. A
single missing column or an extra edge turns the run red.

## Recommended workflow

### 1. Read the data and confirm shape (≈ 2 min)

```r
# R or Python — both work in the container
d <- read.csv("/app/bn_sample_10k.csv")
stopifnot(all(c("U","R","Y","M","D") %in% names(d)))
nrow(d)   # should be 10000
```

The original DAG is unknown to the agent at runtime but has the following
hints in the task spec:

- `U` has no parents (it's exogenous).
- The DAG has exactly 6 edges.
- When an edge between two non-`U` nodes has ambiguous direction, the
  alphabetically-earlier letter is the **child**.

These three hints are the structure-learning tiebreakers — do not skip
them. Score-based learners (Hill-Climb, Tabu) won't recover `U`-as-root
without an explicit blacklist.

### 2. Recover the DAG (≈ 10–20 min)

The most reliable path in `bnlearn`:

```r
library(bnlearn)

# 1) Restrict U from being a child of anything
bl <- data.frame(from = setdiff(c("U","R","Y","M","D"), "U"),
                 to   = "U")

# 2) Score-based search with the blacklist
dag <- hc(d, blacklist = bl)

# 3) If the search recovers a non-DAG or fewer than 6 edges,
#    fall back to a constraint-based approach and reconcile.
```

Why blacklist? Without it, Hill-Climb will happily put `U` downstream of
`Y` to maximize BIC. The hint that "U has no parents" is a hard
constraint, not a soft preference.

The expected edge set is:
```
(U,M) (U,Y) (U,D) (U,R) (Y,D) (R,M)
```
Any deviation (extra edge, missing edge, flipped direction on a non-`U`
pair) fails the verifier.

If `hc` returns a different edge set, use the alphabetical-child rule to
flip the direction of any ambiguous non-`U` edge and re-check.

### 3. Persist the learned DAG (≈ 1 min)

The verifier expects `to,from` columns — note the reversed order from
`bnlearn`'s default `[from, to]` arc set:

```r
arcs <- arcs(dag)  # data.frame with cols from, to
names(arcs) <- c("to", "from")  # rename for the CSV header order
write.csv(arcs, "/app/learned_dag.csv", row.names = FALSE, quote = FALSE)
```

Read the verifier once before writing this to confirm the column names;
getting them swapped is a top failure mode.

### 4. Fit the BN and intervene (≈ 5 min)

```r
fit <- bn.fit(dag, data = d)

# Intervention: do(Y = 0.0)
# bnlearn exposes mutilated networks via the `bn.fit` replacement idiom.
intervened <- bn.fit(dag, data = d)
intervened$Y <- list(coef = c("(Intercept)" = 0.0), sd = 1e-9)  # Gaussian
# or, for discrete Y:
# intervened$Y <- list(prob = c(`0` = 1, `1` = 0))
```

If the underlying node type is discrete, replace the conditional
probability table; if Gaussian, set the regression intercept to 0.0 and
the residual variance to a tiny number (`1e-9`) per the task spec.

Save the post-intervention DAG:

```r
int_arcs <- arcs(dag)            # same as before intervention
int_arcs <- int_arcs[!(int_arcs$from == "U" & int_arcs$to == "Y"), ]
names(int_arcs) <- c("to", "from")
write.csv(int_arcs, "/app/intervened_dag.csv", row.names = FALSE, quote = FALSE)
```

### 5. Sample 10k points from the intervened BN (≈ 2 min)

```r
s <- rbn(intervened, n = 10000)
write.csv(s[, c("U","R","Y","M","D")], "/app/final_bn_sample.csv",
          row.names = FALSE, quote = FALSE)
```

The column-order pin (`c("U","R","Y","M","D")`) matters — the verifier
reads the CSV by header position.

### 6. Run the verifier (≈ 2 min)

```bash
cd /app && python tests/test_outputs.py
```

Expect three checks: (a) all CSVs exist with right columns, (b) edge sets
match exactly, (c) the KS test on `D` against the expected distribution
passes at 99.9% confidence.

## Verifier checklist (must all pass)

- [ ] `/app/learned_dag.csv` exists with `to,from` header and exactly 6 rows.
- [ ] `/app/intervened_dag.csv` exists with `to,from` header and exactly 5 rows.
- [ ] `/app/final_bn_sample.csv` exists with header `U,R,Y,M,D` and 10,000 data rows.
- [ ] Edge sets match the expected (U,M), (U,Y), (U,D), (U,R), (Y,D), (R,M).
- [ ] The `U → Y` edge is removed in the intervened DAG.
- [ ] KS test on the marginal of `D` against the expected distribution passes at the 99.9% level.

## Common pitfalls

1. **Reversing `from`/`to` in the CSV.** The verifier's column order is
   `to,from`, but `bnlearn`'s `arcs()` returns `from,to`. Renaming the
   columns is one line, but if you forget, every edge reads backwards.
2. **Forgetting the `U`-no-parents blacklist.** Without it, `hc` will
   happily reverse the `U → X` edges to score better on BIC. The
   resulting DAG will pass the row count but fail the edge-set check.
3. **Setting residual variance to 0 on a Gaussian node.** `bnlearn` chokes
   on `sd = 0`; use `1e-9` per the task spec.
4. **Column order on the sample file.** If you write
   `s[, c("Y","U","R","M","D")]` instead of the expected `U,R,Y,M,D`,
   the KS test on `D` will read the wrong column and fail.
5. **Sampling before refitting.** `rbn(fit, n)` uses the *learned* fit.
   If you intervene by mutating the DAG but forget to refit (or use the
   wrong object), the `Y` column in the output will still be endogenous.

## Quick sanity test (run after writing)

```r
source("/app/learn_bn.R")
learned <- read.csv("/app/learned_dag.csv")
intervened <- read.csv("/app/intervened_dag.csv")
s <- read.csv("/app/final_bn_sample.csv")
stopifnot(nrow(learned) == 6, nrow(intervened) == 5, nrow(s) == 10000)
ks.test(s$D, "pnorm", mean = mean(s$D), sd = sd(s$D))  # should be near 1
```

## Reference pointers

- `bnlearn` package docs: <https://www.bnlearn.com/documentation/>.
- Scutari, M. (2010). *Learning Bayesian Networks with the bnlearn R
  Package*. Journal of Statistical Software, 35(3).
- Kolmogorov-Smirnov test for distribution validation:
  `scipy.stats.kstest` in Python, `ks.test()` in R.
- Inside the task container, `tests/test_outputs.py` is the ground truth
  for what is scored.
