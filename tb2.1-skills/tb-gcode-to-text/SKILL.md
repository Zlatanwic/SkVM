---
name: tb-gcode-to-text
description: Decode text inscribed in a 3D printer G-code file by parsing movement commands, reconstructing the 2D geometry, and performing OCR to determine what text the print would produce. Use this skill whenever the task involves interpreting Prusa MK4s G-code, extracting text from toolpath movements, reverse-engineering what a 3D print would look like from its G-code, parsing G0/G1 extrusion commands to reconstruct printed geometry, producing `/app/out.txt` with the decoded text string, or working inside the `gcode-to-text` Docker container. Also trigger when the user needs to visualize G-code XY movements, rasterize toolpaths to an image, or identify text inscribed on an "existing object" via additive G-code instructions.
---

# tb-gcode-to-text

Parse a Prusa MK4s G-code file (`/app/text.gcode`) to extract the text that
would be printed onto an existing object, and write the decoded text to
`/app/out.txt`. This is one of the Terminal-Bench 2.1 task skills; the full
task lives at `tasks/gcode-to-text/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `gcode-to-text` Docker container and
needs to reverse-engineer what text a G-code file will print. Do **not** use
it for G-code generation, slicer configuration, or 3D printer troubleshooting
— this is specifically about going from machine instructions back to human
readable text that the print head traces.

## Goal (one sentence)

Parse the XY movement commands in the G-code file, render the toolpath
visually, and use OCR or geometric analysis to determine the text that the
printer will produce.

## Required outputs

| File | Purpose |
|---|---|
| `/app/out.txt` | The text string that the G-code would print, as a plain text file. |

The verifier checks that the content of `/app/out.txt` matches the expected
text that the G-code encodes.

## Recommended workflow

### 1. Understand G-code movement commands (≈ 5 min)

Key G-code commands for text extraction:
- `G0 X... Y... Z...` — rapid move (no extrusion, travel between letters)
- `G1 X... Y... Z... E...` — linear move with extrusion (drawing a line)
- `G92 E0` — reset extruder position
- `M...` — miscellaneous commands (ignore for text decoding)

The XY coordinates define the toolpath. For text printing, the print head
moves in the XY plane tracing each letter. Z typically stays constant during
text printing (or raises slightly for travel moves).

The G-code file contains:
1. **Setup section** — bed leveling, heating, priming (skip)
2. **Object printing** — the existing object (skip, but note Z height)
3. **Text printing** — XY moves at a specific Z height above the object,
   extruding plastic to form letters

### 2. Parse the G-code (≈ 10 min)

Write a parser to extract the text-layer moves:

```python
#!/usr/bin/env python3
"""Parse text.gcode and extract the XY toolpath for text printing."""

import re
import sys

def parse_gcode(filepath: str) -> list[tuple[float, float, bool]]:
    """Extract XY moves. Returns [(x, y, is_extruding), ...]."""
    moves = []
    current_z = 0.0
    z_for_text = None  # Will be determined heuristically

    with open(filepath) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(';'):
                continue

            # Track Z position
            z_match = re.search(r'Z([-\d.]+)', line)
            if z_match:
                current_z = float(z_match.group(1))

            # Only G0 and G1 have XY moves
            if not (line.startswith('G0 ') or line.startswith('G1 ')):
                continue

            # Extract coordinates
            x_match = re.search(r'X([-\d.]+)', line)
            y_match = re.search(r'Y([-\d.]+)', line)
            has_e = 'E' in line and not 'E0' in line  # Simplistic extrusion check

            if x_match and y_match:
                x = float(x_match.group(1))
                y = float(y_match.group(1))
                moves.append((x, y, has_e, current_z))

    return moves
```

### 3. Identify the text layer (≈ 5 min)

The text is printed at a specific height above the base object. Heuristics:

- Look for a Z height that is significantly higher than the initial layers
  (the object base).
- The text layer typically has many rapid XY moves with short extrusion
  segments (forming the strokes of letters).
- Between letters, there are travel moves (G0, no extrusion) with longer
  XY distances.

```python
# Find the most common Z during extrusion moves
from collections import Counter
z_values = [z for x, y, e, z in moves if e]
text_z = Counter(round(z, 2) for z in z_values).most_common(1)[0][0]

# Filter moves at the text Z level
text_moves = [(x, y, e) for x, y, e, z in moves if abs(z - text_z) < 0.01]
```

### 4. Render the toolpath (≈ 15 min)

Convert the XY moves to a 2D image:

```python
from PIL import Image, ImageDraw

# Find bounding box
xs = [x for x, y, e in text_moves]
ys = [y for x, y, e in text_moves]
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# Scale to image dimensions
scale = 10  # pixels per mm (adjust based on G-code units)
width = int((max_x - min_x) * scale) + 100
height = int((max_y - min_y) * scale) + 100

img = Image.new('RGB', (width, height), 'white')
draw = ImageDraw.Draw(img)

prev_x, prev_y = None, None
for x, y, extruding in text_moves:
    px = int((x - min_x) * scale) + 50
    py = int((y - min_y) * scale) + 50
    if prev_x is not None and extruding:
        draw.line([(prev_x, prev_y), (px, py)], fill='black', width=3)
    prev_x, prev_y = px, py

img.save('/tmp/text_toolpath.png')
```

### 5. OCR the rendered image (≈ 5 min)

```bash
tesseract /tmp/text_toolpath.png /tmp/ocr_result --psm 6
cat /tmp/ocr_result.txt
```

Or, if the text is simple enough, you might be able to recognize it by
analyzing the toolpath geometry directly — e.g., detecting the bounding boxes
and stroke patterns of individual letters, then matching against a stroke
template library.

For direct geometric recognition:

```python
# Alternative: segment letters by detecting gaps (travel moves without
# extrusion) and match each letter shape against known stroke patterns.
# This is harder but avoids OCR errors on low-resolution renders.
```

### 6. Write the output (≈ 2 min)

```bash
# Clean up OCR output (remove noise, normalize whitespace)
cat /tmp/ocr_result.txt | tr -d '\n' | sed 's/[^a-zA-Z0-9 ]//g' > /app/out.txt
cat /app/out.txt
```

## Verifier checklist (must all pass)

- [ ] `/app/out.txt` exists and is non-empty.
- [ ] The content matches the text encoded in the G-code.
- [ ] The output is a plain text file with no extra formatting.

## Common pitfalls

1. **Misidentifying the text Z height.** The G-code also contains the object's
   XY moves at lower Z levels. If you render all G0/G1 moves regardless of Z,
   you get a jumbled mess of the object outline + text. Filter to only the top
   (text) layer.
2. **Using the wrong coordinate system.** G-code coordinates are in millimeters
   by default for PrusaSlicer. The text may be quite small (a few mm per
   letter). If you don't scale sufficiently when rendering, the OCR image will
   be too low-resolution for Tesseract to read.
3. **Forgetting that G0 moves are travel (no extrusion).** If you draw all
   XY moves as black lines, the travel moves between letters create thin
   connecting lines that confuse OCR. Only draw G1 moves with E>0 (extrusion
   active), or draw travel moves in a different color.
4. **OCR failing on single-stroke fonts.** 3D-printed text often uses
   single-stroke or "stick" fonts where each letter is drawn as a single thin
   line (not filled outlines). Tesseract is trained on filled/anti-aliased
   text and may fail on thin stroke fonts. You may need to dilate the
   rendered lines (add thickness) before OCR, or use geometric letter
   recognition instead.
5. **Absolute vs. relative positioning.** G-code can use absolute (G90) or
   relative (G91) positioning. PrusaSlicer defaults to absolute. If the file
   uses relative mode, your parser must accumulate positions. Check for `G90`
   or `G91` near the top of the file.

## Quick sanity test (run after writing)

```bash
# Parse and count extrusion moves at the text layer
python3 -c "
import re
with open('/app/text.gcode') as f:
    content = f.read()
g1_moves = re.findall(r'G1.*E[1-9]', content)
print(f'Extrusion moves: {len(g1_moves)}')
"

# Render and OCR
python3 /app/parse_gcode.py
tesseract /tmp/text_toolpath.png stdout

# Final check
cat /app/out.txt
```

## Reference pointers

- G-code reference (RepRap wiki): https://reprap.org/wiki/G-code
- PrusaSlicer G-code specifics: Prusa uses Marlin-flavor G-code with standard
  G0/G1 for moves, M104/M109 for temperature, etc.
- The file `/app/text.gcode` is the ground truth — inspect its header comments
  (lines starting with `;`) for slicer settings, including whether it's
  absolute or relative positioning.
- Tesseract `--psm` modes: `--psm 6` (uniform block of text), `--psm 8`
  (single word), `--psm 10` (single character). Try multiple modes.
- If Tesseract is not installed in the container: `apt-get install -y
  tesseract-ocr`.
