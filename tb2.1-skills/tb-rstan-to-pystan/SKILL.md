---
name: tb-rstan-to-pystan
description: Convert an RStan Gaussian Process script to functionally equivalent PyStan 3.10.0 code. Use this skill when the task mentions converting RStan to PyStan, Gaussian Process posterior sampling, Stan model translation, producing `/app/pystan_analysis.py`, or saving posterior mean estimates to CSV files (`alpha_est.csv`, `sigma_est.csv`, `rho_est.csv`, `beta_est.csv`). Also trigger when the user references `/app/gp_rstan.R`, PyStan 3.10.0, `stan.build` with `random_seed=1`, or the constraint of not installing R or using cmdstanpy.
---

# tb-rstan-to-pystan

Convert an RStan Gaussian Process script (`/app/gp_rstan.R`) into a functionally
equivalent PyStan 3.10.0 Python script (`/app/pystan_analysis.py`) that produces
numerically matching posterior estimates. This is a Terminal-Bench 2.1 task; the
full task lives at `tasks/rstan-to-pystan/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `rstan-to-pystan` Docker container and
needs to: (1) install PyStan 3.10.0, (2) read and understand an RStan GP model,
(3) translate it to PyStan with `random_seed=1` in `stan.build`, and (4) emit
four CSV files with posterior means. Do **not** use it for general Stan/PyStan
tutorials or non-GP Stan model conversions.

## Goal (one sentence)

Produce a PyStan 3.10.0 script that replicates the RStan GP posterior sampling
exactly, given the same input data and hyperparameters.

## Required outputs

| File | Purpose |
|---|---|
| `/app/pystan_analysis.py` | Python script that loads data, builds the Stan model, samples, and saves results. Must use PyStan 3.10.0 with `random_seed=1`. |
| `/app/alpha_est.csv` | Posterior mean of alpha (single number). |
| `/app/sigma_est.csv` | Posterior mean of sigma (single number). |
| `/app/rho_est.csv` | Posterior means of rho vector (3 numbers, one per row). |
| `/app/beta_est.csv` | Posterior means of beta vector (3 numbers, one per row). |

## Recommended workflow

### 1. Install PyStan 3.10.0 (≈ 5 min)

- The container likely has Python; check with `python3 --version`.
- Install the exact version: `pip install pystan==3.10.0`.
- Verify: `python3 -c "import stan; print(stan.__version__)"`.
- If compilation issues arise, install build deps: `apt-get update && apt-get install -y build-essential`.

### 2. Study the R script (≈ 10 min)

- Read `/app/gp_rstan.R` carefully. Extract:
  - The Stan model code (inside a string or separate `.stan` file).
  - Data loading logic (`train_X.csv`, `train_y.csv`, `test_X.csv`, `meta_public.json`).
  - Hyperparameters: number of chains, iterations, warmup, thinning, priors.
  - Parameter names: `alpha`, `sigma`, `rho`, `beta`.
- Do **not** run the R script (it would fail -- R/RStan are not installed).
- Focus on the Stan `model {}` block: the GP covariance kernel, the likelihood,
  and the prior specifications.

### 3. Translate to PyStan (≈ 30 min)

- Use `stan.build()` with the Stan model code as a string or file reference.
- Key PyStan 3.x patterns:
  ```python
  import stan
  posterior = stan.build(program_code=stan_code, data=stan_data, random_seed=1)
  fit = posterior.sample(num_chains=..., num_warmup=..., num_samples=...)
  ```
- Map RStan's `sampling()` arguments to PyStan's `.sample()` parameters.
- Extract posterior means with `fit.to_frame()` or `fit['parameter_name']`.
- Save CSVs: `np.savetxt("/app/alpha_est.csv", [alpha_mean])` for scalars,
  and one-row-per-element for vectors.

### 4. Validate numerically (≈ 10 min)

- Run `python3 /app/pystan_analysis.py`.
- Check the CSV outputs exist and contain numeric values (no headers, no extra text).
- Spot-check: `alpha_est.csv` should have 1 line with a float; `rho_est.csv`
  should have 3 lines.
- Compare magnitudes against what the R script would produce (from the model
  priors and data scale).

### 5. Run the verifier (≈ 2 min)

The verifier checks that all four CSV files exist and that numerical values
match the reference within tolerance.

## Verifier checklist (must all pass)

- [ ] PyStan 3.10.0 is installed and importable.
- [ ] `/app/pystan_analysis.py` exists and runs without error.
- [ ] `stan.build` uses `random_seed=1`.
- [ ] The Stan model is functionally equivalent to the one in `gp_rstan.R`.
- [ ] `/app/alpha_est.csv` exists with a single numeric posterior mean.
- [ ] `/app/sigma_est.csv` exists with a single numeric posterior mean.
- [ ] `/app/rho_est.csv` exists with 3 numeric posterior means (one per row).
- [ ] `/app/beta_est.csv` exists with 3 numeric posterior means (one per row).

## Common pitfalls

1. **Using cmdstanpy instead of PyStan.** The task explicitly forbids `cmdstanr`
   and `cmdstanpy`. You must use PyStan 3.10.0. Installing `cmdstanpy` will fail
   the verifier even if the CSVs look correct.
2. **Forgetting `random_seed=1`.** The verifier compares against a reference that
   was sampled with seed 1. Any other seed (or no seed) produces different
   chains and a numerical mismatch.
3. **Mismatched hyperparameters.** The number of chains, warmup iterations, and
   total samples must match the R script's settings. Read the R script carefully;
   a single different hyperparameter can shift posterior means enough to fail.
4. **CSV formatting issues.** Each CSV must contain *only* numeric values -- no
   headers, no row labels, no extra whitespace. A trailing newline is fine; a
   header like "alpha" is not.
5. **Incomplete Stan model translation.** The GP covariance function (e.g.,
   squared-exponential kernel) must be identical. If the R script uses a special
   parametrization or non-centered form, replicate it exactly.

## Reference pointers

- PyStan 3.x documentation: `stan.build()` API and `.sample()` parameters.
- The R script at `/app/gp_rstan.R` is the sole source of truth for the model
  structure and hyperparameters.
- Input data: `/app/train_X.csv`, `/app/train_y.csv`, `/app/test_X.csv`,
  `/app/meta_public.json`.
- Inside the container, the verifier is the ground truth for score thresholds.
