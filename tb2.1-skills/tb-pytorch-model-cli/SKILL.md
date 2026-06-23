---
name: tb-pytorch-model-cli
description: Build a C command-line tool `cli_tool` that loads neural network weights from a JSON file and runs inference on an MNIST image to predict the digit (0-9). Use this skill whenever the task involves C compilation, reading PyTorch model weights converted to JSON, implementing forward-pass layers (Linear, Conv2d, ReLU, etc.) in C, parsing PNG images, or producing a standalone binary that outputs a single predicted digit. Also trigger when the user references `cli_tool`, `weights.json`, `prediction.txt`, MNIST inference in C, or `/app` as the output directory.
---

# tb-pytorch-model-cli

Implement a standalone C binary (`cli_tool`) that loads a PyTorch model's
weights from `weights.json`, reads an MNIST PNG image, and prints the predicted
digit (0-9). This is one of the Terminal-Bench 2.1 task skills; the full task
lives at `tasks/pytorch-model-cli/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `pytorch-model-cli` Docker container
and needs to deliver `/app/cli_tool`, `/app/weights.json`, and `/app/prediction.txt`.
Do **not** use it for general PyTorch model export, generic C project builds, or
any task that does not specifically involve C-based MNIST inference with a
JSON weight file.

## Goal (one sentence)

Build a C binary that reads model weights from JSON, processes a PNG MNIST
image through the reconstructed network layers, and outputs only the predicted
digit (0-9).

## Required outputs

| File | Purpose |
|---|---|
| `/app/cli_tool` | Standalone executable binary that accepts `weights.json` and `image.png` as args. |
| `/app/weights.json` | Model weights extracted from the PyTorch checkpoint, in JSON format. |
| `/app/prediction.txt` | File containing only the predicted digit (0-9) for the provided test image. |

The verifier runs `./cli_tool weights.json image.png`, checks that the output is
a single digit string, and compares `prediction.txt` against expected output.

## Recommended workflow

### 1. Survey the environment and model (≈ 3 min)

- Check what tools are available: `gcc`, `python3`, `pip list`.
- Locate the PyTorch model checkpoint. It is likely in `/app/` as a `.pt` or
  `.pth` file, or weights are already provided as `.json`.
- Inspect the model architecture by loading the checkpoint in Python:
  ```python
  import torch
  ckpt = torch.load("/app/model.pt", map_location="cpu")
  for key, val in ckpt.items():
      print(key, val.shape)
  ```
  This tells you the layer types and dimensions you must replicate in C.

### 2. Extract weights to JSON (≈ 5 min)

Use a Python script to dump all weights to `/app/weights.json`:

```python
import json, torch
ckpt = torch.load("/app/model.pt", map_location="cpu")
weights = {k: v.tolist() for k, v in ckpt.items()}
with open("/app/weights.json", "w") as f:
    json.dump(weights, f)
```

### 3. Implement the C inference engine (≈ 20 min)

Reimplement each layer found in the model. Common MNIST architectures include:

- **Conv2d**: 2D convolution with stride and padding. Implement as nested loops
  over output channels, height, and width. For each output position, sum over
  input channels and kernel window.
- **Linear (Fully Connected)**: matrix-vector or matrix-matrix multiplication.
- **ReLU**: element-wise `max(0, x)`.
- **MaxPool2d**: 2x2 max pooling with stride 2.
- **Softmax** (optional for argmax): find the index with the highest logit.

Read the PNG image. You can either:
- Use `libpng` in C directly.
- Convert PNG to raw pixel bytes with Python and embed the values in C, then
  read the raw bytes in C.
- Use `stb_image.h` (single-header C library) for easy PNG loading.

The binary should:
```c
// ./cli_tool weights.json image.png → prints "0".."9" to stdout
```

### 4. Compile and test (≈ 5 min)

```bash
gcc -o /app/cli_tool /app/cli_tool.c -lm
./cli_tool /app/weights.json /app/image.png  # should print a digit
```

### 5. Write prediction.txt (≈ 2 min)

```bash
./cli_tool /app/weights.json /app/image.png > /app/prediction.txt
# or in C, fopen("/app/prediction.txt", "w") and fprintf the result
```

## Verifier checklist (must all pass)

- [ ] `/app/cli_tool` is a valid executable binary.
- [ ] `/app/weights.json` exists and contains model weights in JSON.
- [ ] `/app/prediction.txt` contains exactly one digit (0-9).
- [ ] `./cli_tool weights.json image.png` prints only the predicted digit.
- [ ] The prediction is correct for the MNIST test image(s).

## Common pitfalls

1. **JSON parsing in C is hard.** Parse `weights.json` in C using a library
   like `cJSON` or `json-c`, or pre-process the JSON into a custom binary
   format. Do not try to hand-roll a JSON parser — the nested arrays from
   `tolist()` are deeply nested and error-prone.
2. **Layer ordering mismatch.** The state dict keys tell you the order:
   `conv1.weight`, `conv1.bias`, `conv2.weight`, etc. Missing a bias or
   swapping layers silently produces garbage predictions.
3. **Image preprocessing.** MNIST images in PyTorch are typically normalized
   with `mean=0.1307, std=0.3081`. If you skip normalization, the model's
   output logits will be wrong. Apply the same preprocessing that the
   original training used.
4. **Integer vs. float arithmetic.** All weights are floats. If you use
   integer arithmetic anywhere in the forward pass, the accumulated error
   will push the argmax to the wrong class.
5. **Hard-coded file paths.** The verifier may test with different image
   files. Make `cli_tool` accept command-line arguments, not hard-coded paths.

## Reference pointers

- `cJSON` (https://github.com/DaveGamble/cJSON) — a single-file C JSON
  parser widely used for this type of task.
- `stb_image.h` (https://github.com/nothings/stb) — single-header image
  loading library supporting PNG.
- The file `tasks/pytorch-model-cli/solution/` contains the reference
  solution (use only after your own attempt).
- The verifier script at `tests/test_outputs.py` defines the scoring criteria.
