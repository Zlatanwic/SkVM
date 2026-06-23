---
name: tb-train-fasttext
description: Train a FastText text classification model on Yelp review data with accuracy and model size constraints. Use this skill when the task mentions training FastText, Yelp review classification, `/app/model.bin`, achieving >0.62 accuracy, keeping model under 150MB, or the `data/` folder with training data. Also trigger when the user references fastText hyperparameter tuning, `autotune`, or balancing model compression against accuracy.
---

# tb-train-fasttext

Train a fastText text classification model on Yelp review data that achieves
at least 0.62 accuracy on a held-out test set while keeping the final model
size under 150 MB. This is a Terminal-Bench 2.1 task; the full task lives at
`tasks/train-fasttext/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `train-fasttext` Docker container and
needs to produce `/app/model.bin` meeting both accuracy and size constraints.
Do **not** use it for general text classification with transformers or other
frameworks -- this is specifically about fastText.

## Goal (one sentence)

Train a compressed fastText classifier that exceeds 0.62 accuracy on a hidden
Yelp test set while keeping the serialized model under 150 MB.

## Required outputs

| File | Purpose |
|---|---|
| `/app/model.bin` | Trained fastText model file, < 150 MB on disk, with ≥ 0.62 accuracy on the hidden test set. |

## Recommended workflow

### 1. Survey the data (≈ 3 min)

- Check what's in the `data/` directory:
  ```bash
  ls -la data/
  head -20 data/train.txt  # If it's fastText format: __label__X text...
  wc -l data/train.txt
  ```
- FastText expects data in the format: `__label__<class> <text>` (one per line).
  Verify the label format and number of classes.
- Check for a validation file: `data/valid.txt` or `data/test.txt`.

### 2. Establish a baseline (≈ 5 min)

- Install fastText: `pip install fasttext` or build from source if needed.
- Train a quick baseline to see where you stand:
  ```bash
  fasttext supervised -input data/train.txt -output /tmp/baseline -epoch 5 -lr 0.5
  fasttext test /tmp/baseline.bin data/valid.txt
  ```
- Check the baseline accuracy and model file size:
  ```bash
  ls -la /tmp/baseline.bin
  ```
- This tells you how much optimization is needed.

### 3. Optimize for accuracy (≈ 10 min)

Key hyperparameters to tune:

| Parameter | Effect | Starting range |
|---|---|---|
| `-epoch` | More epochs improve accuracy up to a point | 10-50 |
| `-lr` | Learning rate | 0.1-1.0 |
| `-dim` | Word vector dimension | 100-300 |
| `-wordNgrams` | Max length of word n-grams | 1-3 |
| `-minCount` | Min word occurrences | 1-5 |
| `-bucket` | Number of buckets | 100000-2000000 |
| `-loss` | Loss function | `softmax` for multi-class, `ova` (one-vs-all) for many classes |

Iterate:
```bash
for epoch in 10 25 50; do
  for dim in 100 200; do
    fasttext supervised -input data/train.txt -output /tmp/model_e${epoch}_d${dim} \
      -epoch $epoch -dim $dim -lr 0.5 -wordNgrams 2
    fasttext test /tmp/model_e${epoch}_d${dim}.bin data/valid.txt
  done
done
```

If the data is large, also try `-autotune-validation data/valid.txt -autotune-duration 300`
for automatic hyperparameter search.

### 4. Compress the model (≈ 5 min)

If the model is over 150 MB, apply compression:

1. **Quantization**: fastText supports product quantization:
   ```bash
   fasttext quantize -output /app/model -input data/train.txt -qnorm -retrain -cutoff 50000
   ```
   This dramatically reduces model size (often 10x) with minimal accuracy loss.

2. **Reduce dimensionality**: Lower `-dim` (e.g., from 300 to 100) reduces the
   embedding table size proportionally.

3. **Prune vocabulary**: Higher `-minCount` removes rare words, shrinking the
   dictionary.

The quantized model is a `.ftz` file. The verifier expects `.bin` -- either
save the unquantized model if it's already < 150 MB, or test whether `model.bin`
refers to the quantized format (the `.ftz` can sometimes be renamed or the
verifier may accept either).

### 5. Final validation (≈ 3 min)

- Check model size: `ls -la /app/model.bin` (must be < 157286400 bytes).
- Run final accuracy check:
  ```bash
  fasttext test /app/model.bin data/valid.txt
  ```
- The P@1 (precision at 1) or recall should translate to > 0.62 accuracy.
- If using quantized model, test with `fasttext test` to confirm the `.ftz` file
  is loadable and accurate.

## Verifier checklist (must all pass)

- [ ] `/app/model.bin` exists and is a valid fastText model.
- [ ] Model file size < 150 MB (157,286,400 bytes).
- [ ] Accuracy on hidden test set >= 0.62.
- [ ] Model can be loaded and used for prediction with standard fastText tools.

## Common pitfalls

1. **Not checking the data format.** fastText expects `__label__<class_name> <text>`.
   If the Yelp data uses a different format (e.g., TSV with label column), you
   must preprocess it first. A fastText model trained on misformatted data will
   have near-zero accuracy.
2. **Overfitting to validation accuracy.** The hidden test set comes from the
   same distribution but may differ slightly. Leave some margin above 0.62 on
   your validation set (target 0.65+). Over-tuning hyperparameters on a small
   validation set can reduce generalization.
3. **Ignoring model size until the end.** Hyperparameters like `-dim 300` and
   `-bucket 2000000` can produce models well over 150 MB. Check file size early
   in your tuning loop so you know the feasible hyperparameter space.
4. **Not using quantization.** If the uncompressed model is over 150 MB,
   quantization (`fasttext quantize`) is usually essential. Test that the
   quantized model achieves sufficient accuracy before finalizing.
5. **Assuming `.ftz` and `.bin` are interchangeable.** Some fastText versions
   handle `.ftz` (quantized) files differently from `.bin` files. Confirm the
   verifier's expectation -- if it calls `fasttext.load_model("/app/model.bin")`,
   ensure the file at that path is loadable.

## Reference pointers

- fastText documentation: `https://fasttext.cc/docs/en/supervised-tutorial.html`
  and `https://fasttext.cc/docs/en/cheatsheet.html`.
- Quantization guide: `https://fasttext.cc/docs/en/quantization.html`.
- The `data/` directory in the container holds the training (and possibly
  validation) data. Inspect it first.
- `fasttext supervised --help` lists all hyperparameters.
- `fasttext quantize --help` lists quantization options.
