---
name: tb-mcmc-sampling-stan
description: Implement hierarchical Bayesian MCMC sampling using RStan (v2.32.7), specifying a Beta-Binomial hierarchical model with a custom prior in Stan, running 4 chains of 100k iterations, and extracting posterior means for alpha and beta. Use this skill whenever the task mentions RStan, Stan, hierarchical Bayesian model, Beta-Binomial, improper prior (alpha+beta)^(-5/2), posterior mean estimation, data.csv with y/n columns, or generating posterior_alpha_mean.txt / posterior_beta_mean.txt files. Also trigger for the alexgshaw/mcmc-sampling-stan:20251031 Docker image or references to MCMC with Stan from R.
---

# tb-mcmc-sampling-stan

Build a hierarchical Beta-Binomial Bayesian model in Stan, call it from R via
RStan (v2.32.7), run 4 chains of 100,000 MCMC iterations each, and output
posterior means of `alpha` and `beta` to text files. This is a Terminal-Bench
2.1 hard data-science task; the full task lives at `tasks/mcmc-sampling-stan/`.

## When this skill triggers

Use it when the user is dropped into the `mcmc-sampling-stan` container and
needs to produce a working Stan model + R analysis script. Do **not** use it
for PyStan, CmdStanPy, generic MCMC (Metropolis-Hastings, Gibbs from scratch),
brms, or non-hierarchical models.

## Goal (one sentence)

Fit a hierarchical Beta-Binomial model `y_i ~ Binomial(n_i, theta_i)` with
`theta_i ~ Beta(alpha, beta)` and prior `p(alpha, beta) ∝ (alpha+beta)^{-5/2}`
using RStan, then extract and save posterior means of `alpha` and `beta`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/hierarchical_model.stan` | Stan model file implementing the hierarchical Beta-Binomial model with the specified prior. |
| `/app/analysis.R` | R script that loads data, calls `rstan::sampling()`, extracts posterior means, and writes output files. |
| `/app/posterior_alpha_mean.txt` | Single number: posterior mean of alpha. |
| `/app/posterior_beta_mean.txt` | Single number: posterior mean of beta. |

## Recommended workflow

### 1. Install RStan and dependencies (≈ 15 min)

The container has R. Install RStan v2.32.7 specifically:

```r
install.packages("rstan", version = "2.32.7", repos = "https://cloud.r-project.org")
```

RStan requires a C++ toolchain (Stan models are compiled to C++). The
container should have `g++` and `make`. Verify:
```bash
g++ --version
```

### 2. Understand the model mathematically (≈ 5 min)

**Likelihood**: `y_i | theta_i ~ Binomial(n_i, theta_i)`

**Prior on group-level probabilities**:
`theta_i | alpha, beta ~ Beta(alpha, beta)`

**Hyperprior**: `p(alpha, beta) ∝ (alpha + beta)^{-5/2}`

This is an improper prior (does not integrate to 1) but yields a proper
posterior in this model. In Stan, improper priors are implemented by
omitting the prior statement (which gives a flat prior) or by using the
`target +=` syntax with the log-density.

The log of the prior is: `log(p(alpha, beta)) = -2.5 * log(alpha + beta)`
(plus an arbitrary constant).

### 3. Write the Stan model (≈ 15 min)

```stan
// hierarchical_model.stan
data {
  int<lower=0> N;           // number of observations
  array[N] int<lower=0> y;  // successes
  array[N] int<lower=0> n;  // trials
}
parameters {
  real<lower=0> alpha;
  real<lower=0> beta;
  vector<lower=0, upper=1>[N] theta;
}
model {
  // Improper hyperprior: p(alpha, beta) ∝ (alpha+beta)^(-5/2)
  target += -2.5 * log(alpha + beta);

  // Group-level prior
  theta ~ beta(alpha, beta);

  // Likelihood
  y ~ binomial(n, theta);
}
```

Key implementation notes:
- Use `target +=` for the improper prior — it cannot be expressed as a
  built-in distribution.
- Both `alpha` and `beta` are constrained `<lower=0>`.
- `theta` is constrained `[0, 1]`.
- Re-parameterize if mixing is poor (e.g., use `log(alpha)` and `log(beta)`
  or work with `alpha/(alpha+beta)` and `(alpha+beta)`).

### 4. Write the R analysis script (≈ 15 min)

```r
# analysis.R
library(rstan)

# Load data
data <- read.csv("/app/data.csv")

# Prepare Stan data list
stan_data <- list(
  N = nrow(data),
  y = data$y,
  n = data$n
)

# Compile and sample
set.seed(1)
fit <- rstan::sampling(
  stan_model(file = "/app/hierarchical_model.stan"),
  data = stan_data,
  chains = 4,
  iter = 100000,
  warmup = 50000,           # half for warmup typically
  thin = 1,
  cores = 4,
  control = list(adapt_delta = 0.95, max_treedepth = 15)
)

# Extract posterior means
post <- rstan::extract(fit)
alpha_mean <- mean(post$alpha)
beta_mean <- mean(post$beta)

# Write outputs
writeLines(as.character(alpha_mean), "/app/posterior_alpha_mean.txt")
writeLines(as.character(beta_mean), "/app/posterior_beta_mean.txt")
```

Important: with 100k iterations, consider:
- `warmup = 50000` (leave 50k for sampling).
- `thin` to reduce memory if needed.
- `adapt_delta = 0.95` or higher to avoid divergences.
- Check convergence with `rstan::summary(fit)$summary[,"Rhat"]`.

### 5. Run and verify (≈ 10 min)

```bash
cd /app && Rscript analysis.R
```

Check outputs:
```bash
cat /app/posterior_alpha_mean.txt
cat /app/posterior_beta_mean.txt
```

Verify the model converged in the R console:
```r
library(rstan)
fit <- readRDS("fit.rds")  # if saved
print(fit, pars = c("alpha", "beta"))
# Check: Rhat < 1.01, n_eff > 1000
```

## Verifier checklist (must all pass)

- [ ] `/app/hierarchical_model.stan` exists and is a valid Stan model.
- [ ] `/app/analysis.R` exists and runs without error.
- [ ] `rstan::sampling()` is called with 4 chains and 100,000 iterations.
- [ ] Random seed is set to 1 for reproducibility.
- [ ] `/app/posterior_alpha_mean.txt` exists with a single numeric value.
- [ ] `/app/posterior_beta_mean.txt` exists with a single numeric value.
- [ ] Posterior means are within tolerance of the verifier's expected values.

## Common pitfalls

1. **Using a proper prior instead of the specified improper one.** The task
   requires `p(alpha, beta) ∝ (alpha+beta)^(-5/2)`, not `Gamma(0.001, 0.001)`
   or other diffuse proper priors. This changes the posterior, and the
   verifier checks against the correct posterior means.
2. **Too few warmup iterations.** With 100k total and only 1k warmup, the
   sampler won't converge. Use at least 25k–50k warmup so 50k+ samples
   contribute to the posterior estimate.
3. **Not checking Rhat for convergence.** High Rhat (> 1.05) means chains
   haven't mixed. Adjust `adapt_delta`, `max_treedepth`, or reparameterize
   (e.g., use `alpha_plus_beta = alpha + beta` and `alpha_ratio =
   alpha/(alpha+beta)`).
4. **Forgetting to set the seed.** The task requires `set.seed(1)`. Without
   it, posterior means vary across runs and may fail the verifier's
   tolerance bounds.
5. **Writing the wrong number to output files.** The verifier reads a single
   number from each `.txt` file. Extra whitespace, multiple numbers, or
   writing `alpha` into `beta`'s file will fail. Use `writeLines` with a
   single value.

## Reference pointers

- RStan documentation: https://mc-stan.org/rstan/
- Stan User's Guide, section on hierarchical models and improper priors.
- The data file is `/app/data.csv` with columns `y` (successes) and `n`
  (trials).
- Inside the container: test locally before relying on the verifier.
- The original model comes from Gelman et al. (2013), *Bayesian Data Analysis*,
  Chapter 5 (hierarchical models with exchangeable batch data).
