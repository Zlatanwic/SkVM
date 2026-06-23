---
name: tb-adaptive-rejection-sampler
description: Implement the Adaptive Rejection Sampling (ARS) algorithm in R per Gilks & Wild (1992). Use this skill whenever the task mentions adaptive rejection sampling, log-concave densities, hull-based sampling, Gilks 1992, sampling from an arbitrary (unnormalized) density function, or producing a `ars()` R function with a paired `test()` function that emits "TEST_NAME: PASS/FAIL" lines. Also trigger when the user references /app/ars.R, the test_outputs.py verifier, or asks to generate normal_samples.txt / exponential_samples.txt. The skill covers: installing R, designing modular auxiliary functions (hull, starting points, squeeze test, sampling step), validating inputs, detecting non-log-concavity on the fly, writing stochastic-aware unit tests, and emitting the artifact files the verifier expects.
---

# tb-adaptive-rejection-sampler

Build an R implementation of the Adaptive Rejection Sampling algorithm from
Gilks, W. R., & Wild, P. (1992). *JRSS-C*, 41(2), 337–348. This is one of three
Terminal-Bench 2.1 task skills; the full task lives at
`tasks/adaptive-rejection-sampler/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `adaptive-rejection-sampler` Docker
container and needs to deliver a working `/app/ars.R` plus the verifier's
expected sample files. Do **not** use it for generic MCMC samplers
(Metropolis-Hastings, HMC, NUTS) — ARS is a specific accept-reject scheme
that maintains piecewise-linear hulls over `log f`.

## Goal (one sentence)

Sample `n` i.i.d. points from a user-supplied log-concave density `f` over a
bounded or half-bounded domain, using adaptive envelope + squeeze hulls that
update after every accepted point.

## Required outputs

| File | Purpose |
|---|---|
| `/app/ars.R` | Main implementation. Must define `ars(density_function, domain, n)` and a `test()` function. |
| `/app/normal_samples.txt` | At least one sample file from `dnorm` (mean 0, sd 1 by default). One line per sample. |
| `/app/exponential_samples.txt` | Optional but recommended second file from `dexp` (rate 1). |

The verifier (`tests/test_outputs.py`) checks eight things — see "Verifier
checklist" below. Skipping any one of them turns the run red.

## Recommended workflow

### 1. Survey before coding (≈ 2 min)

- Run `which R || R --version`; if missing, install with
  `apt-get update && apt-get install -y r-base` (Ubuntu 24.04 base image).
- Open `tasks/adaptive-rejection-sampler/README.md` and `instruction.md` to
  confirm exact filename, function signature, and output format. Re-read
  the verifier script at `tests/test_outputs.py` to see which behaviors are
  scored.
- Skim `tasks/adaptive-rejection-sampler/solution/solve.sh` only after
  you've planned — never as a first move.

### 2. Sketch the algorithm on paper (≈ 3 min)

ARS depends on a small set of primitives; commit them to memory before
writing any code:

1. **Hull construction** — for the current abscissae `T_k = {x_1, …, x_k}`,
   compute `z_j = h(x_j) = log f(x_j)`, then build piecewise-linear upper
   hull `u_k(x)` and lower hull `l_k(x)` by joining tangents at consecutive
   `z_j`. (If `f` is log-concave, the tangent lines give valid bounds.)
2. **Integrate the upper hull** to get `Z_k = ∫ exp(u_k(x)) dx` analytically
   over each linear segment — this is a log-sum-exp-friendly calculation.
3. **Sample candidate** `x*` by drawing `s ∈ (0, Z_k)` and inverting the
   piecewise CDF of `exp(u_k)`.
4. **Squeeze test** — draw `w ~ U(0,1)`. If `w ≤ exp(l_k(x*) - u_k(x*))`,
   accept immediately (no density evaluation).
5. **Rejection test** — if `w ≤ exp(h(x*) - u_k(x*))`, accept and add `x*` to
   `T_k`. Otherwise reject and update hulls with `x*` rejected.
6. **Log-concavity check** — if at any point `h''(x) > 0` between two
   abscissae, the density is non-log-concave. Per task spec, throw an
   informative error rather than silently producing wrong samples.

### 3. Code modularly (≈ 30 min)

Decompose into named helpers. The verifier scores "≥ 3 functions defined" —
aim for 5–7 to leave headroom and keep the design clean:

```r
# /app/ars.R

# Core primitives
.check_inputs       <- function(n, domain) { ... }     # validation
.is_log_concave_at  <- function(f, x1, x2) { ... }     # second-deriv probe
.build_hull         <- function(xs, h_xs) { ... }      # returns u(x) and l(x)
.integrate_upper    <- function(hull) { ... }           # closed-form Z_k
.sample_candidate   <- function(hull) { ... }
.squeeze_test       <- function(x_star, hull, f_log) { ... }
.rejection_test     <- function(x_star, hull, f_log) { ... }

# Public API
ars <- function(density_function, domain, n = 100) { ... }

# Formal test harness
test <- function() {
  # Run small batches against dnorm, dexp, etc.
  # Print lines like:  "normal_basic: PASS  mean=0.05 sd=1.02  (n=500)"
  # Use ks.test / chi-square for shape check, not just sample mean.
}
```

A few hard-won details:

- **Vectorize the density call.** The user passes a function that already
  handles vectors; never wrap in a per-element loop.
- **Sanitize domain.** Accept `c(-Inf, Inf)`, `c(0, Inf)`, or `c(a, b)`.
  Reject anything where `domain[1] >= domain[2]`.
- **Negative `n` or non-integer `n` → stop with `stop("n must be a positive integer")`.**
- **Cap the iteration.** If a candidate keeps getting rejected (e.g., user
  passed a non-log-concave function), bail out after a sane number of
  attempts with a clear error — never loop forever.

### 4. Generate sample files (≈ 5 min)

```r
set.seed(42)
ns <- ars(dnorm, c(-Inf, Inf), n = 1000)
writeLines(as.character(ns), "/app/normal_samples.txt")

es <- ars(dexp, c(0, Inf), n = 1000)
writeLines(as.character(es), "/app/exponential_samples.txt")
```

The verifier only needs one file to exist, but emitting both is cheap
insurance and signals quality.

### 5. Run the verifier (≈ 2 min)

```bash
cd /app && python tests/test_outputs.py
```

If anything fails, read the failure message first — the verifier's error
strings name the missing piece ("no 'test' function", "no error handling",
"expected ≥ 3 functions", "non-log-concave density was not rejected").

## Verifier checklist (must all pass)

- [ ] `ars.R` exists at `/app/ars.R`.
- [ ] `ars()` and `test()` are both defined and exported.
- [ ] `ars()` validates inputs (negative `n`, invalid domain).
- [ ] `ars()` raises an error when handed a non-log-concave density
      (e.g., `function(x) dnorm(x, log = TRUE) + 0.5 * x^2`).
- [ ] At least three top-level functions are defined (modularity signal).
- [ ] `test()` prints lines containing `PASS` and `FAIL` plus mean/sd stats.
- [ ] At least one of `/app/normal_samples.txt` or
      `/app/exponential_samples.txt` exists and contains samples whose
      empirical mean and sd match the target distribution within tolerance.

## Common pitfalls

1. **Forgetting the log-concavity check.** The algorithm assumes log-concave
   `f`; if you skip the check, the hull may fail to envelope the true
   density and you'll silently produce garbage samples. The verifier
   specifically tests for rejection of a non-log-concave input.
2. **Returning raw `dnorm` calls in `ars()`.** The function must *call* the
   user-supplied `density_function`, not hard-code a distribution.
3. **Stochastic test = flaky test.** A `test()` that simply checks
   `mean(samples) ≈ 0` is a coin-flip at small `n`. Use a Kolmogorov-Smirnov
   test (e.g., `ks.test(samples, "pnorm")`) with a reasonable `n` (≥ 500)
   and a loose significance level (e.g., 0.001).
4. **One-line `test()`.** The verifier looks for the strings "PASS" and
   "FAIL" plus mean/sd. Make your output look like
   `"normal_ks: PASS  ks_stat=0.04  p=0.62  (n=1000)"`.
5. **No sample file.** Even if `ars()` works, the verifier fails if neither
   `normal_samples.txt` nor `exponential_samples.txt` is on disk.

## Quick sanity test (run after writing)

```r
source("/app/ars.R")
test()                # should print PASS lines
x <- ars(dnorm, c(-Inf, Inf), 500)
ks.test(x, "pnorm")   # p-value should be > 0.01
```

## Reference pointers

- Original paper: Gilks & Wild (1992), *JRSS-C* 41(2), 337–348.
- The `ars` R package on CRAN implements the same algorithm; reading its
  source is a good way to learn the trickier pieces (e.g., starting-point
  selection when the density is not symmetric).
- Inside the task container, `tests/test_outputs.py` is the ground truth
  for what is scored.
