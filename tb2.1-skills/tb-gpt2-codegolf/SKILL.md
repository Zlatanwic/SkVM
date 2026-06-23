---
name: tb-gpt2-codegolf
description: Write a dependency-free C program under 5000 bytes that performs GPT-2 inference from a TensorFlow checkpoint using arg-max sampling. Use this skill whenever the task mentions GPT-2 inference in C, a size-constrained C program (<5000 bytes), reading TensorFlow .ckpt files directly, byte-pair encoding from a .bpe file, arg-max token sampling, or compiling with `gcc -O3 -lm` to produce `/app/a.out`. Also trigger when the user references `/app/gpt2.c`, the gpt2-124M.ckpt file, or generating 20 continuation tokens from a prompt string. Do NOT use this for general GPT-2 inference via Hugging Face transformers or Python-based sampling.
---

# tb-gpt2-codegolf

Write a dependency-free C program (`/app/gpt2.c`) that loads GPT-2-124M
weights from a TensorFlow checkpoint, tokenizes input using a BPE vocabulary,
and generates 20 tokens via arg-max sampling — all in under 5000 bytes of
source. This is one of the Terminal-Bench 2.1 task skills; the full task lives
at `tasks/gpt2-codegolf/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `gpt2-codegolf` Docker container
and needs to produce `/app/gpt2.c` that compiles with `gcc -O3 -lm` and
runs as `/app/a.out gpt2-124M.ckpt vocab.bpe "prompt"`. Do **not** use it
for general GPT-2 experiments, fine-tuning, or Python-based inference.

## Goal (one sentence)

Produce a self-contained C file under 5000 bytes that loads GPT-2-124M from
a raw TF checkpoint, encodes a prompt via BPE, runs the 12-layer transformer
forward pass, and arg-max samples the next 20 tokens without any external
libraries beyond libc and libm.

## Required outputs

| File | Purpose |
|---|---|
| `/app/gpt2.c` | Single C source file implementing full GPT-2-124M inference, strictly under 5000 bytes |
| `/app/a.out` | Compiled binary from `gcc -O3 -lm /app/gpt2.c -o /app/a.out` |

The verifier runs the binary with a hidden prompt and checks that the 20
generated tokens match GPT-2-124M arg-max output exactly.

## Recommended workflow

### 1. Understand the checkpoint format (≈ 10 min)

- The `.ckpt` file is a TensorFlow v1 checkpoint. It contains tensor name
  strings followed by shape and float32 data. You need to parse this
  binary format manually.
- Key tensors: `model/wte:0` (token embeddings), `model/wpe:0` (position
  embeddings), `model/h\d+/ln_\d+/.+` (layer norms, attention, MLP weights
  for each of 12 layers), `model/ln_f/.+` (final layer norm).
- Read `tasks/gpt2-codegolf/instruction.md` and any provided README or
  solution hints.

### 2. Understand the BPE vocabulary (≈ 5 min)

- The `.bpe` file is a standard GPT-2 BPE vocabulary. It maps bytes to
  merge rules and ultimately to token IDs.
- You need: (1) an encoder that converts a prompt string to a list of
  token IDs, (2) a decoder that maps token IDs back to UTF-8 strings for
  output.
- BPE encoding involves: converting the input to bytes, splitting into
  characters, iteratively applying merge rules ranked by frequency, and
  mapping the final byte sequences to token IDs.

### 3. Implement the transformer forward pass (≈ 20 min)

The GPT-2-124M architecture is:
- Token embedding + positional embedding (summed)
- 12 transformer blocks, each containing:
  - LayerNorm -> Multi-head self-attention (causal mask) -> residual add
  - LayerNorm -> MLP (GELU activation) -> residual add
- Final LayerNorm -> projection to vocabulary logits

Critical size-saving tactics:
- Use single-letter variable names throughout.
- Inline operations instead of defining helper functions.
- Use `#define` macros for repeated operations like matrix indexing:
  `#define R(i,j) ((i)*N+(j))`
- Avoid all unnecessary whitespace, comments, and line breaks.
- Fuse operations where possible (e.g., combine bias additions into
  matrix-vector multiplies).
- Hard-code the model dimensions: `n_vocab=50257`, `n_ctx=1024`,
  `n_embd=768`, `n_head=12`, `n_layer=12`.

### 4. Tighten to under 5000 bytes (≈ 15 min)

```bash
wc -c /app/gpt2.c
```

If over 5000 bytes, apply aggressive code golf:
- Remove all `#include` directives except the absolute minimum
  (`<stdio.h>`, `<stdlib.h>`, `<string.h>`, `<math.h>`).
- Replace `float` with implicit `double` if it saves bytes (but watch
  for correctness).
- Fold `malloc`/`free` pairs — allocate once, reuse.
- Collapse consecutive operations into compound expressions.
- Replace `if/else` chains with ternary operators.
- Use `for` loops without braces for single-statement bodies.

### 5. Compile and test (≈ 10 min)

```bash
gcc -O3 -lm /app/gpt2.c -o /app/a.out
/app/a.out gpt2-124M.ckpt vocab.bpe "Hello world"
```

Compare output against known GPT-2-124M arg-max output. If tokens diverge,
check:
- GELU approximation (exact vs. `0.5*x*(1+tanh(sqrt(2/pi)*(x+0.044715*x^3)))`)
- Causal attention mask correctness
- LayerNorm epsilon value (typically 1e-5)
- Weight matrix layout (TF checkpoints may store transposed)

## Verifier checklist (must all pass)

- [ ] `/app/gpt2.c` exists and is under 5000 bytes.
- [ ] File compiles successfully with `gcc -O3 -lm /app/gpt2.c -o /app/a.out`.
- [ ] Binary runs with arguments `gpt2-124M.ckpt vocab.bpe "<prompt>"` without crashing.
- [ ] Output is exactly 20 tokens matching GPT-2-124M arg-max sampling.

## Common pitfalls

1. **Exceeding 5000 bytes.** This is the most common failure mode. Even a
   well-written implementation often starts at 8-12 KB. You must aggressively
   code-golf: single-letter names, no whitespace, compound expressions,
   hard-coded dimensions, and no helper function overhead.
2. **Wrong checkpoint tensor names or shapes.** TF1 checkpoints use specific
   naming conventions. `model/h0/attn/c_attn/w:0` is the combined QKV weight
   for layer 0. Getting the shape wrong causes silent garbage output.
3. **BPE encoding bugs.** The GPT-2 BPE encoder must handle multi-byte UTF-8
   characters and apply merge rules in the correct order. A common mistake is
   applying merges to individual characters rather than byte sequences.
4. **GELU approximation mismatch.** TF uses the exact GELU
   (`x * 0.5 * (1 + erf(x/sqrt(2)))`), not the tanh approximation. Using
   `tanh` will produce slightly different activations that compound across
   12 layers and cause token divergence.
5. **Causal mask off-by-one.** Each position can attend to itself and all
   prior positions. A mask that blocks self-attention produces nonsense.

## Quick sanity test (run after compiling)

```bash
gcc -O3 -lm /app/gpt2.c -o /app/a.out
wc -c < /app/gpt2.c  # must be < 5000
/app/a.out gpt2-124M.ckpt vocab.bpe "The capital of France is" | head -c 200
# Should produce reasonable GPT-2 continuation
```

## Reference pointers

- GPT-2 paper: Radford et al. (2019), "Language Models are Unsupervised
  Multitask Learners"
- GPT-2 model card on Hugging Face: `gpt2` (124M variant)
- The TensorFlow checkpoint format is documented in the TensorFlow source:
  each tensor is stored as a length-prefixed name string followed by
  shape dimensions and float32 data.
- Andrej Karpathy's `llm.c` project implements a similar idea (C inference
  for GPT-2) and is a useful reference for the forward pass, but his code
  is far larger than 5KB — you must strip it to the absolute minimum.
- Inside the task container, the verifier script at the task root is the
  ground truth for scoring.
