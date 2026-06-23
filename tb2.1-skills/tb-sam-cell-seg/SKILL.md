---
name: tb-sam-cell-seg
description: Use Facebook's distilled MobileSAM to convert rectangular cell masks to polyline contours in histopathology images. Use this skill when the task mentions Segment Anything Model, MobileSAM, histopathology cell segmentation, converting rectangular masks to polylines, non-overlapping masks, or writing `/app/convert_masks.py`. Also trigger when the user references `demo_rgb.png`, `demo_metadata.csv`, the `--weights_path`/`--output_path`/`--rgb_path`/`--csv_path` arguments, or the ChaoningZhang/MobileSAM GitHub repository.
---

# tb-sam-cell-seg

Build a MobileSAM-based Python script that converts all cell masks in a
histopathology metadata CSV from rectangles to precise polyline contours, with
no overlap between masks and exactly one contiguous mask per cell. This is a
Terminal-Bench 2.1 task; the full task lives at `tasks/sam-cell-seg/` in the
same repo.

## When this skill triggers

Use it when the user is dropped into the `sam-cell-seg` Docker container and
needs to write `/app/convert_masks.py` that uses MobileSAM (not the original
SAM) for mask refinement on CPU. Do **not** use it for general SAM usage,
interactive segmentation, or GPU-based SAM inference.

## Goal (one sentence)

Refine all masks in a metadata CSV using MobileSAM so every cell has a single
contiguous, non-overlapping polyline mask.

## Required outputs

| File | Purpose |
|---|---|
| `/app/convert_masks.py` | Python script using `argparse` with `--weights_path`, `--output_path`, `--rgb_path`, `--csv_path`. Runs MobileSAM on CPU to refine all masks. |
| `--output_path` CSV | Updated CSV matching the input format with new `xmin`, `xmax`, `ymin`, `ymax`, `coords_x`, `coords_y` columns -- all polylines, no rectangles. |

## Recommended workflow

### 1. Set up MobileSAM (≈ 10 min)

- Clone or download MobileSAM from `https://github.com/ChaoningZhang/MobileSAM`.
- Install dependencies: `pip install mobile_sam` or set up from the cloned repo.
  The environment guarantees `torch`, `torchvision`, `opencv-python`, `Pillow`,
  `numpy`, `pandas`, `tqdm`, and `mobile_sam` are available.
- Download the MobileSAM weights file (the `.pt` checkpoint). The verifier passes
  `--weights_path` at test time, so do not hardcode a weight path inside the script.
- **Do not modify MobileSAM source code** -- any edits to library internals will
  cause the verifier to fail.

### 2. Understand the input data (≈ 5 min)

- Load `/app/demo_rgb.png` to see the H&E stained histopathology image.
- Load `/app/demo_metadata.csv` with pandas.
- Key columns:
  - `xmin`, `xmax`, `ymin`, `ymax`: bounding box coordinates in pixels.
  - `coords_x`, `coords_y`: current mask coordinates (rectangles for some rows,
    polylines for others). These are stored as lists/strings.
- The goal: replace rectangular masks with MobileSAM-generated polylines.

### 3. Design the mask refinement pipeline (≈ 10 min)

For each row (each cell) in the metadata:
1. Crop the RGB image region around `[xmin:xmax, ymin:ymax]` with some padding
   to give MobileSAM context.
2. Use the existing `coords_x`/`coords_y` as a prompt for MobileSAM (point or
   box prompt -- the bounding box is a natural prompt).
3. Run MobileSAM's `predict()` or `set_image()` + prompt on CPU.
4. Extract the highest-confidence mask for this cell.
5. Convert the binary mask to a polyline contour (e.g., `cv2.findContours`).
6. Update `xmin`, `xmax`, `ymin`, `ymax`, `coords_x`, `coords_y` from the
   new contour's bounding box and points.

### 4. Enforce constraints (≈ 5 min)

- **No overlap**: After generating all masks, resolve overlaps. For each pixel
  claimed by multiple masks, assign it to the mask with the highest MobileSAM
  confidence score. Alternative: process masks in confidence order and exclude
  already-claimed pixels.
- **One contiguous mask per cell**: Run connected-component analysis on each
  mask; keep only the largest component. Discard any disconnected fragments.

### 5. Implement and save (≈ 15 min)

- Write `/app/convert_masks.py` using `argparse` for the four arguments.
- Output the updated DataFrame as CSV to `--output_path`.
- Test locally: `python /app/convert_masks.py --weights_path <weights.pt> --output_path /tmp/out.csv --rgb_path /app/demo_rgb.png --csv_path /app/demo_metadata.csv`.
- Verify the output CSV has the same columns and row count, with updated
  coordinate columns (polylines for every row, not rectangles).

## Verifier checklist (must all pass)

- [ ] `/app/convert_masks.py` exists with correct `argparse` interface.
- [ ] Script runs on CPU (no GPU assumed).
- [ ] Uses MobileSAM (not original SAM) without modifying MobileSAM source.
- [ ] All output masks are polylines (no bounding boxes in coords).
- [ ] No overlap between any two masks.
- [ ] Each cell has exactly one contiguous mask (no fragments).
- [ ] Output CSV matches input CSV format with updated coordinate columns.

## Common pitfalls

1. **Modifying MobileSAM source code.** The verifier checks that the installed
   `mobile_sam` package is unmodified. Any edits (even to fix import errors) are
   flagged. Work around issues by wrapping, not by editing library internals.
2. **Assuming GPU availability.** The task explicitly requires CPU-only execution.
   Set `device='cpu'` explicitly and never call `.cuda()`.
3. **Leaving rectangular masks in the output.** Every row must have polyline
   coordinates. If a mask cannot be refined (e.g., MobileSAM fails on a tiny
   cell), you must still convert the bounding box to a polyline (four-point
   polygon) rather than leaving the original `coords_x`/`coords_y` untouched.
4. **Overlapping masks.** MobileSAM predictions can bleed into neighboring cells.
   Always post-process with overlap resolution. The verifier checks pixel-level
   exclusivity.
5. **Hardcoding paths.** The script will be run with different `--weights_path`,
   `--rgb_path`, and `--csv_path` values at test time. Use argparse properly.

## Reference pointers

- MobileSAM GitHub: `https://github.com/ChaoningZhang/MobileSAM` -- the README
  includes CPU inference examples and API usage.
- OpenCV contour extraction: `cv2.findContours()` for binary-mask-to-polyline.
- The demo files at `/app/demo_rgb.png` and `/app/demo_metadata.csv` are your
  development dataset.
- Standard SAM prompt patterns (box prompt from `xmin,ymin,xmax,ymax`) apply to
  MobileSAM as well.
