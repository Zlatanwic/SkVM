---
name: tb-tune-mjcf
description: Optimize a MuJoCo XML model file to reduce simulation time by at least 40% while preserving physical accuracy. Use this skill when the task mentions tuning MJCF, MuJoCo simulation speedup, `/app/model_ref.xml`, `/app/model.xml`, `/app/eval.py`, achieving 60% or less of original simulation time, or maintaining physics correctness within `atol=1e-5`. Also trigger when the user references MuJoCo solver parameters, integrator settings, `noslip_iterative`, `cone`, `implicitfast`, or numerical tolerance constraints.
---

# tb-tune-mjcf

Tune the solver and integration parameters of a MuJoCo MJCF model file to achieve
a 40% speedup (simulate in 60% or less of the original time) while keeping the
final physics state identical within `atol=1e-5`. This is a Terminal-Bench 2.1
task; the full task lives at `tasks/tune-mjcf/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `tune-mjcf` Docker container and needs
to produce `/app/model.xml` (a tuned copy of `/app/model_ref.xml`). Do **not**
use it for general MuJoCo model creation, controller design, or RL environment
tuning -- this is specifically about solver/integrator parameter optimization
for simulation speed.

## Goal (one sentence)

Modify solver and integration parameters in the MJCF model so that a 2-second
simulation runs in <= 60% of the original wall time and produces the same final
state within `atol=1e-5`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/model.xml` | Tuned MJCF file (a modified copy of `/app/model_ref.xml`). Original `model_ref.xml` must remain unchanged. |

## Recommended workflow

### 1. Benchmark the original model (≈ 3 min)

- Run `/app/eval.py` on the reference model to get baseline timing and physics
  state:
  ```bash
  python3 /app/eval.py /app/model_ref.xml
  ```
  Note the wall time and final state.
- Alternatively, run a quick Python benchmark:
  ```python
  import mujoco, time
  model = mujoco.MjModel.from_xml_path('/app/model_ref.xml')
  data = mujoco.MjData(model)
  start = time.time()
  while data.time < 2.0:
      mujoco.mj_step(model, data)
  elapsed = time.time() - start
  print(f"Baseline time: {elapsed:.4f}s")
  ```

### 2. Understand what you can change (≈ 5 min)

The task says changing physical properties (mass, inertia, geometry, joint
properties, etc.) breaks correctness. You can ONLY tune solver/integrator
parameters. These include:

- **Integrator**: `Euler` (fastest), `RK4` (most accurate), `implicit`, `implicitfast`.
- **Solver**: `PGS` (default, fast), `CG` (conjugate gradient), `Newton`.
- **Iterations**: `iterations` (solver iterations), `ls_iterations` (line search).
- **Tolerance**: `tolerance` (convergence threshold, higher = faster but less accurate).
- **Cone solver**: `pyramidal` vs `elliptic` for contacts.
- **NOSLIP**: `noslip_iterations`, `noslip_tolerance` for friction cone constraints.
- **Timestep**: `option timestep="..."` -- larger timesteps mean fewer steps.

### 3. Copy and modify (≈ 10 min)

```bash
cp /app/model_ref.xml /app/model.xml
```

Edit `/app/model.xml` and modify the `option` and/or `size` sections:

```xml
<mujoco>
  <option timestep="0.005"        <!-- Larger timestep: fewer steps -->
          integrator="implicitfast" <!-- Fast implicit integration -->
          cone="elliptic"          <!-- Faster contact cone -->
          noslip_iterations="3"    <!-- Reduce from default 10-20 -->
          tolerance="1e-6"         <!-- Loosen convergence -->
          ls_iterations="30"       <!-- Reduce line-search iterations -->
  />
  <!-- ... rest of model unchanged ... -->
</mujoco>
```

Key trade-offs:
- Larger `timestep` = fewer simulation steps, but can cause instability. Try
  doubling from the original (e.g., 0.002 -> 0.004 or 0.005).
- `integrator="implicitfast"` is the fastest integrator; trade-off is energy
  conservation and accuracy.
- Fewer solver `iterations` = faster per-step but may not converge.
- `cone="elliptic"` is typically faster than `pyramidal`.

### 4. Iterate with validation (≈ 15 min)

```bash
# Run eval on tuned model
python3 /app/eval.py /app/model.xml
```

The `eval.py` script should report both timing and correctness. If it shows
NaN or Inf, the settings are too aggressive (likely the timestep is too large
or tolerance too loose). Back off and retry.

Aim for these targets:
- Wall time <= 60% of baseline
- Final state matches reference within `atol=1e-5`
- No NaN or Inf values anywhere

### 5. Confirm correctness (≈ 3 min)

- Run the correctness test specifically (if `eval.py` has a `--check` flag).
- Diff the tuned XML against the reference to confirm only solver/integrator
  parameters changed:
  ```bash
  diff /app/model_ref.xml /app/model.xml
  ```
  The only differences should be in `<option>` or `<size>` element attributes.

## Verifier checklist (must all pass)

- [ ] `/app/model.xml` exists (a copy of `/app/model_ref.xml` with modified solver/integrator params).
- [ ] `/app/model_ref.xml` is unchanged.
- [ ] Simulation time is <= 60% of the original time.
- [ ] Final physics state matches reference within `atol=1e-5`.
- [ ] No NaN or Inf values in the simulated state.
- [ ] Physical properties (masses, inertias, geometries, joints) are unchanged.

## Common pitfalls

1. **Changing physical properties.** Modifying mass, inertia, geometry, joint
   ranges, motor parameters, or damping coefficients will break the correctness
   test. The verifier compares the final state against the original physics --
   if the model itself is different, the state cannot match.
2. **Timestep too large.** Increasing the timestep beyond numerical stability
   limits causes NaN or Inf values. If you see these, halve the timestep and
   retry. The stability limit depends on the stiffest constraint in the model.
3. **Ignoring the correctness test.** A 90% speedup is useless if the final
   state diverges from the reference. Always validate with `atol=1e-5` after
   each change. The solver can converge to a different valid state if tolerance
   is too loose.
4. **Not copying all XML content.** When editing the MJCF, ensure you preserve
   all original elements exactly. Using automated XML tools that reorder
   attributes or strip comments could break parsing if the verifier is sensitive
   to the exact file structure.
5. **Focusing on only one parameter.** The best speedup usually comes from a
   combination: larger timestep + faster integrator + fewer iterations + looser
   tolerance. Tuning each independently gives marginal gains.

## Reference pointers

- MuJoCo documentation: `https://mujoco.readthedocs.io/en/stable/modeling.html`
  -- sections on `option` and `size` elements.
- MuJoCo computation overview: `https://mujoco.readthedocs.io/en/stable/computation.html`
  -- describes integrators, solvers, and their performance characteristics.
- `/app/eval.py` is the evaluation script; use it for iterative testing.
- `/app/model_ref.xml` is the reference model; never modify it.
