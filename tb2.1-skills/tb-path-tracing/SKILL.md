---
name: tb-path-tracing
description: Write a C program that reverse-engineers a reference image (`/app/image.ppm`) by implementing a path-tracing renderer, producing `reconstructed.ppm` with >= 0.99 normalized L2 similarity. Use this skill whenever the task mentions writing `image.c` to algorithmically reproduce a PPM image, path tracing, ray tracing, reconstructing an image without reading the reference file, or keeping the C source under 2KB compressed. Also trigger when the user references the `path-tracing` Docker container, the gcc compilation command `gcc -static -o image image.c -lm`, or normalized L2 similarity thresholds.
---

# tb-path-tracing

Write a compact C program that renders an image via path tracing to match a
reference PPM file with high perceptual and numerical fidelity, without
reading the reference file during rendering. This is a Terminal-Bench 2.1
software-engineering task; the full task spec lives at `tasks/path-tracing/` in
the repo.

## When this skill triggers

Use it when the user is dropped into the `path-tracing` Docker container and
needs to produce `image.c` that compiles with
`gcc -static -o image image.c -lm` and writes `reconstructed.ppm` matching
`/app/image.ppm` at >= 0.99 normalized L2 similarity. The source must be
algorithmic (under 2KB compressed) and must not read the reference image.
Do **not** use it for general image processing, file-format conversion, or
embedded-asset programs — this is about inferring scene geometry, lighting,
and materials from pixels alone.

## Goal (one sentence)

Write `image.c` (< 2KB gzipped) that programmatically generates
`reconstructed.ppm` matching the reference `/app/image.ppm` at >= 0.99
normalized L2 similarity, without reading the reference file.

## Required outputs

| File | Purpose |
|---|---|
| `image.c` | C source file implementing the renderer. Must compile with `gcc -static -o image image.c -lm`. Gzipped size must be < 2000 bytes. Must not `#include` custom headers. |
| `reconstructed.ppm` | Output PPM image produced by `./image`. Must match `/app/image.ppm` with >= 0.99 normalized L2 similarity. |

The verifier compiles `image.c`, runs `./image`, checks that `reconstructed.ppm`
exists in PPM format, and computes normalized L2 similarity against the
reference.

## Recommended workflow

### 1. Analyze the reference image (≈ 5 min)

- Read the PPM header of `/app/image.ppm` to get dimensions:
  ```bash
  head -3 /app/image.ppm
  ```
  PPM format: `P6\nWIDTH HEIGHT\nMAXVAL\n` followed by binary RGB data.
- View the image using a tool or convert to PNG for inspection:
  ```bash
  convert /app/image.ppm /tmp/reference.png
  ```
- Count the resolution and note visual features: how many objects, what
  lighting model, any patterns (checkerboard, spheres, flat surfaces).

### 2. Infer the scene and rendering algorithm (≈ 10 min)

- Look for path-tracing signatures: soft shadows (area lights), color bleeding
  (diffuse interreflection), depth-of-field (thin lens), anti-aliasing
  (super-sampling), or caustics.
- Determine scene elements: spheres, planes, materials (Lambertian, metallic,
  dielectric), light sources (point, area, environment).
- The reference image was "rendered programmatically" — the same scene
  configuration was used to generate both the reference and the expected
  output. You need to guess or reverse-engineer that configuration.

### 3. Write the renderer (≈ 20 min)

Key constraints:
- Total uncompressed source must produce < 2KB gzipped → code golf
  techniques (single-letter variables, minimal whitespace, merged loops).
- No reading `image.ppm` at runtime.
- Output goes to `reconstructed.ppm` in the current working directory.
- Link with `-lm` for math functions (`sqrt`, `sin`, `cos`, `pow`, etc.).

PPM output function:
```c
#include <stdio.h>
#include <math.h>

// Write PPM header, then render loop, then write binary pixels
int main() {
    int w = W, h = H;
    FILE *f = fopen("reconstructed.ppm", "wb");
    fprintf(f, "P6\n%d %d\n255\n", w, h);
    // path trace each pixel
    // fwrite(pixel_data, 1, w*h*3, f);
    fclose(f);
}
```

### 4. Match the reference numerically (≈ 15 min)

- Use small test renders (lower resolution) to iterate faster.
- Compare against reference using the verifier or a manual L2 calculation.
- Normalized L2 similarity >= 0.99 means pixel values must be very close.
- Float precision: use `double` for accumulation, clamp to [0,255] at output.
- Deterministic seed: use `srand(0)` or a fixed seed so the output is
  reproducible.

### 5. Compress-check and finalize (≈ 5 min)

```bash
cat image.c | gzip | wc -c    # must be < 2000
gcc -static -o image image.c -lm && ./image
```

If over the size limit, minify: remove comments, shorten variable names,
inline helper functions, remove unnecessary `#include`s.

## Verifier checklist

- [ ] `image.c` exists and compiles with `gcc -static -o image image.c -lm`.
- [ ] `./image` produces `reconstructed.ppm` in the current directory.
- [ ] `reconstructed.ppm` is a valid PPM (P6) file with correct header.
- [ ] Normalized L2 similarity between `reconstructed.ppm` and `/app/image.ppm` >= 0.99.
- [ ] Gzipped size of `image.c` is < 2000 bytes.
- [ ] `image.c` does not read `/app/image.ppm` at runtime.
- [ ] No custom `#include`-d `.h` or `.c` files beyond standard system headers.

## Common pitfalls

1. **Size limit exceeded.** The 2KB gzip limit is strict. Every comment,
   long variable name, and whitespace character counts. Start with a compact
   coding style and test `cat image.c | gzip | wc -c` early and often.
   The limit applies to the *compressed* source, so gzip's dictionary
   compression rewards repeated patterns and penalizes unique strings.
2. **Not matching the PPM format exactly.** The verifier expects binary PPM
   format (`P6`), not ASCII (`P3`). Writing `P3` with text RGB values will
   produce a valid PPM but with different byte layout and likely fail the
   L2 comparison.
3. **Uninitialized random seed or floating-point nondeterminism.** If the
   path tracer uses random sampling, fix `srand(0)` so the output is
   deterministic. Without it, the similarity check may fail across runs.
4. **Gamma correction mismatch.** If the reference was rendered with sRGB
   gamma, and you output linear light values, the L2 distance will be large.
   Apply `pow(x, 1/2.2)` before writing to the PPM if needed.
5. **Incorrect image dimensions.** If your renderer assumes a different
   resolution than the reference, the pixel count will differ and L2
   similarity cannot be computed. Always read the reference PPM header first
   to get the exact dimensions.

## Reference pointers

- PPM format specification: `man ppm` or netpbm documentation.
- Peter Shirley's "Ray Tracing in One Weekend" series for path-tracing
  implementation patterns.
- Inside the task container, the verifier at `tests/test_outputs.py` computes
  the normalized L2 similarity and enforces the size limit.
- Task spec: `tasks/path-tracing/instruction.md`.
