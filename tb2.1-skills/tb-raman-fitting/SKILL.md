---
name: tb-raman-fitting
description: Fit Lorentzian (Cauchy) peaks to the G and 2D bands of a graphene Raman spectrum and extract peak parameters (x0, gamma, amplitude, offset) into `/app/results.json`. Use this skill whenever the task involves curve fitting with Lorentzian functions, Raman spectroscopy data analysis, scientific Python scripting with `scipy.optimize.curve_fit`, extracting peak parameters from spectral data, or producing a JSON results file with fitted coefficients. Also trigger when the user references graphene Raman, G peak, 2D peak, or `/app/results.json`.
---

# tb-raman-fitting

Fit Lorentzian peaks to the G and 2D bands of a graphene Raman spectrum and
write the fitted parameters to `/app/results.json`. This is one of the
Terminal-Bench 2.1 task skills; the full task lives at
`tasks/raman-fitting/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `raman-fitting` Docker container and
needs to perform peak fitting on Raman spectroscopy data. Do **not** use it for
generic curve fitting tasks, fitting with Gaussian or Voigt profiles unless the
task explicitly asks for Lorentzian fits on graphene Raman data, or any task
that does not produce a `/app/results.json` matching the specified schema.

## Goal (one sentence)

Fit Lorentzian functions to the G and 2D Raman peaks, extract center position
(x0), width (gamma), amplitude, and offset for each peak, and save the results
to `/app/results.json`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/results.json` | JSON file with G and 2D peak parameters: `x0`, `gamma`, `amplitude`, `offset`. |

The verifier reads `results.json` and checks that each parameter is within
expected tolerance of the reference fit.

## Recommended workflow

### 1. Survey the data (≈ 2 min)

Locate the Raman spectrum data file (likely a CSV or text file in `/app/` with
columns for Raman shift and intensity):

```bash
ls /app/
head -n 20 /app/raman_data.csv  # or .txt, .dat, etc.
```

Plot the data to identify the G peak (around 1580 cm^-1) and 2D peak (around
2700 cm^-1 for graphene):

```python
import matplotlib.pyplot as plt
import numpy as np

data = np.loadtxt("/app/raman_data.csv", delimiter=",", skiprows=1)
raman_shift = data[:, 0]
intensity = data[:, 1]

plt.plot(raman_shift, intensity)
plt.xlabel("Raman shift (cm^-1)")
plt.ylabel("Intensity")
plt.show()
```

### 2. Define the Lorentzian model (≈ 3 min)

A single Lorentzian (Cauchy) peak is:

```python
def lorentzian(x, x0, gamma, amplitude, offset):
    """Lorentzian peak function.
    
    Args:
        x: Raman shift values.
        x0: Peak center position.
        gamma: Half-width at half-maximum (HWHM).
        amplitude: Peak height above offset.
        offset: Baseline offset.
    """
    return offset + amplitude * (gamma**2) / ((x - x0)**2 + gamma**2)
```

For fitting two peaks simultaneously (G + 2D), use a combined model:

```python
def two_lorentzians(x, x0_G, gamma_G, amp_G, offset_G,
                       x0_2D, gamma_2D, amp_2D, offset_2D):
    return (lorentzian(x, x0_G, gamma_G, amp_G, offset_G) +
            lorentzian(x, x0_2D, gamma_2D, amp_2D, offset_2D))
```

Alternatively, fit each peak independently over a narrow window around its
expected position (simpler and often more robust).

### 3. Provide good initial guesses (≈ 2 min)

Lorentzian fitting is sensitive to initial parameters. Use domain knowledge:

| Parameter | G peak guess | 2D peak guess |
|---|---|---|
| `x0` | 1580 cm^-1 | 2700 cm^-1 |
| `gamma` | 10-20 | 20-40 |
| `amplitude` | max intensity in window minus baseline | same approach |
| `offset` | min intensity in window | same approach |

Find these from the data:

```python
# For G peak window
mask_G = (raman_shift > 1500) & (raman_shift < 1650)
x_G = raman_shift[mask_G]
y_G = intensity[mask_G]
p0_G = [1580, 15, y_G.max() - y_G.min(), y_G.min()]

# For 2D peak window
mask_2D = (raman_shift > 2600) & (raman_shift < 2800)
x_2D = raman_shift[mask_2D]
y_2D = intensity[mask_2D]
p0_2D = [2700, 30, y_2D.max() - y_2D.min(), y_2D.min()]
```

### 4. Run the fits (≈ 3 min)

```python
from scipy.optimize import curve_fit
import json

# Fit G peak
popt_G, pcov_G = curve_fit(lorentzian, x_G, y_G, p0=p0_G)
x0_G, gamma_G, amp_G, offset_G = popt_G

# Fit 2D peak
popt_2D, pcov_2D = curve_fit(lorentzian, x_2D, y_2D, p0=p0_2D)
x0_2D, gamma_2D, amp_2D, offset_2D = popt_2D

# Save results
results = {
    "G": {
        "x0": float(x0_G),
        "gamma": float(gamma_G),
        "amplitude": float(amp_G),
        "offset": float(offset_G)
    },
    "2D": {
        "x0": float(x0_2D),
        "gamma": float(gamma_2D),
        "amplitude": float(amp_2D),
        "offset": float(offset_2D)
    }
}

with open("/app/results.json", "w") as f:
    json.dump(results, f, indent=2)
```

### 5. Verify the fit quality (≈ 2 min)

```python
# Plot fits over data
plt.plot(x_G, y_G, 'b.', label="G peak data")
plt.plot(x_G, lorentzian(x_G, *popt_G), 'r-', label="G fit")
plt.plot(x_2D, y_2D, 'g.', label="2D peak data")
plt.plot(x_2D, lorentzian(x_2D, *popt_2D), 'orange', label="2D fit")
plt.legend()
plt.show()
```

Check that `pcov` is finite (no `inf` values) — if fitting failed, improve
initial guesses or constrain bounds with `curve_fit(..., bounds=(lower, upper))`.

## Verifier checklist (must all pass)

- [ ] `/app/results.json` exists and is valid JSON.
- [ ] Contains keys `"G"` and `"2D"`.
- [ ] Each peak has keys `"x0"`, `"gamma"`, `"amplitude"`, `"offset"`.
- [ ] All parameter values are finite floats.
- [ ] Parameters match the reference fit within tolerance (e.g., x0 within
      a few cm^-1 of the expected Raman shift).

## Common pitfalls

1. **Using Gaussian instead of Lorentzian.** Raman peaks in crystalline
   materials like graphene are Lorentzian (Cauchy), not Gaussian. If you fit
   a Gaussian, the peak shape will be wrong and the verifier will catch it.
   Use the Lorentzian formula: `offset + amplitude * gamma^2 / ((x - x0)^2 + gamma^2)`.
2. **Bad initial guesses causing `curve_fit` to diverge.** Lorentzian fitting
   is sensitive. If you see `RuntimeError: Optimal parameters not found`,
   tighten the fitting window to the region immediately around the peak,
   improve initial guesses, or add bounds.
3. **Fitting both peaks simultaneously with one function.** The G and 2D
   peaks are far apart (~1100 cm^-1 separation). Fitting them independently
   over separate narrow windows is more robust than a single 8-parameter fit.
4. **Not converting numpy types to native Python floats.** `json.dump` will
   fail on `numpy.float64` values. Always cast with `float()` before writing.
5. **Forgetting the baseline offset.** Raw Raman spectra often have a
   non-zero baseline. If you omit the `offset` parameter from the Lorentzian
   model, the fit will be biased and the amplitude/gamma will be wrong.

## Reference pointers

- `scipy.optimize.curve_fit` documentation: the standard tool for non-linear
  least-squares fitting in Python.
- Graphene Raman spectroscopy reference: Ferrari & Basko (2013), *Nature
  Nanotechnology* 8, 235-246 — describes the G and 2D peak signatures.
- The verifier script at `tests/test_outputs.py` in the task directory is the
  ground truth for what is scored.
