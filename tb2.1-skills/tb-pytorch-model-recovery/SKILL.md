---
name: tb-pytorch-model-recovery
description: Reconstruct a PyTorch Transformer model architecture from a state dictionary (`weights.pt`), load pre-trained weights, compute MSE loss on a dataset, fine-tune only the output layer to reduce loss, and save the model as TorchScript (`model.pt`). Use this skill whenever the task involves reverse-engineering a PyTorch `state_dict`, inferring model architecture from weight tensor shapes, selective fine-tuning with frozen layers, computing MSE loss, or saving in TorchScript format. Also trigger when the user references `RecoveredModel`, `weights.pt`, `dataset.pt`, or `model.pt` in a model recovery context.
---

# tb-pytorch-model-recovery

Reconstruct a PyTorch model from its serialized state dictionary, then fine-tune
only the output layer to beat the original MSE loss. This is one of the
Terminal-Bench 2.1 task skills; the full task lives at
`tasks/pytorch-model-recovery/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `pytorch-model-recovery` Docker
container and needs to recover a model architecture, selectively fine-tune, and
save as TorchScript. Do **not** use it for generic PyTorch training loops,
full-model fine-tuning, or tasks where the architecture is known a priori.

## Goal (one sentence)

Reverse-engineer a Transformer model from its state dict, load weights, compute
baseline MSE, fine-tune only `output_layer` to improve performance, and export
the updated model as TorchScript at `/app/model.pt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/model.pt` | TorchScript model with updated output layer weights. |
| (Python script) | Code that defines `RecoveredModel`, loads weights, fine-tunes, and saves. |

The verifier checks that `model.pt` loads correctly, that only the `output_layer`
weights differ from the original `weights.pt`, and that the new MSE is lower.

## Recommended workflow

### 1. Inspect the state dict to infer architecture (≈ 5 min)

```python
import torch

sd = torch.load("/app/weights.pt", map_location="cpu")
for key, val in sd.items():
    print(f"{key:40s} shape={list(val.shape)}")
```

Look for telltale shapes:
- `nn.Linear`: `weight` shape `[out_features, in_features]`, `bias` shape `[out_features]`.
- `nn.Embedding`: `weight` shape `[vocab_size, embedding_dim]`.
- Transformer internal: `in_proj_weight`, `q_proj_weight`, `k_proj_weight`, `v_proj_weight`,
  `out_proj.weight`, `linear1.weight`, `linear2.weight`.
- LayerNorm: `weight` and `bias` shapes `[normalized_shape]`.
- The key named `output_layer.weight` identifies the final prediction head.

Count layers by looking for repeating patterns across keys.

### 2. Define the RecoveredModel class (≈ 10 min)

```python
import torch.nn as nn

class RecoveredModel(nn.Module):
    def __init__(self, vocab_size, d_model, nhead, num_layers, dim_feedforward, output_size):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=nhead, dim_feedforward=dim_feedforward,
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.output_layer = nn.Linear(d_model, output_size)

    def forward(self, x):
        x = self.embedding(x)
        x = self.transformer(x)
        x = x.mean(dim=1)  # or take last token, depending on architecture
        return self.output_layer(x)
```

The exact class must match the architecture implicit in the state dict.
Verify by loading weights:

```python
model = RecoveredModel(...)
model.load_state_dict(sd)  # Must succeed with no missing/unexpected keys.
```

### 3. Compute baseline MSE loss (≈ 3 min)

```python
data = torch.load("/app/dataset.pt")  # likely a tuple (inputs, targets)
inputs, targets = data
model.eval()
with torch.no_grad():
    preds = model(inputs)
    baseline_loss = nn.MSELoss()(preds, targets)
print(f"Baseline MSE: {baseline_loss}")
```

### 4. Fine-tune only the output layer (≈ 10 min)

```python
# Freeze all layers except output_layer
for name, param in model.named_parameters():
    param.requires_grad = (name.startswith("output_layer"))

optimizer = torch.optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-3)
loss_fn = nn.MSELoss()

model.train()
for epoch in range(num_epochs):  # 100-500 epochs typically
    optimizer.zero_grad()
    preds = model(inputs)
    loss = loss_fn(preds, targets)
    loss.backward()
    optimizer.step()
    if loss.item() < baseline_loss:
        # Early stop once we beat baseline
        break

# Verify
model.eval()
with torch.no_grad():
    new_preds = model(inputs)
    new_loss = loss_fn(new_preds, targets)
assert new_loss < baseline_loss, f"New loss {new_loss} not lower than baseline {baseline_loss}"
```

### 5. Export as TorchScript (≈ 3 min)

```python
scripted = torch.jit.script(model)
torch.jit.save(scripted, "/app/model.pt")

# Verify round-trip
loaded = torch.jit.load("/app/model.pt")
```

## Verifier checklist (must all pass)

- [ ] `/app/model.pt` exists and is a valid TorchScript file.
- [ ] Loading `model.pt` succeeds (no errors).
- [ ] `model.pt` can load the original weights from `/app/weights.pt`.
- [ ] Only the `output_layer` weights differ between the two state dicts.
- [ ] MSE loss with the updated output layer is strictly lower than with
      the original weights.
- [ ] `/app/weights.pt` has not been modified.

## Common pitfalls

1. **Wrong architecture guess.** If `load_state_dict` reports missing or
   unexpected keys, the model structure is wrong. Every key in the state dict
   must map to a parameter in the model. Use `strict=False` diagnostically,
   but fix the architecture — `strict=True` must pass for the verifier.
2. **Not freezing non-output layers.** If you forget to set `requires_grad=False`
   on the transformer/embedding layers, the optimizer will update all weights,
   violating the constraint that only `output_layer` changes.
3. **Overfitting to the dataset.** If you train for too many epochs, the
   output layer may memorize the dataset perfectly but produce weights that
   deviate too far from the original — the verifier may check the norm of
   the weight difference. Stop as soon as loss drops below baseline.
4. **Using the wrong forward pass.** The model may use a specific token
   aggregation (mean, last token, CLS token, first token). Inspect the
   state dict carefully for any classification head or pooling layer.
5. **Saving in wrong format.** The verifier expects `torch.jit.save()` output,
   not `torch.save(model.state_dict(), ...)`. TorchScript is a serialized
   computation graph — a plain state dict will fail to load with `torch.jit.load()`.

## Reference pointers

- PyTorch `torch.jit.script` and `torch.jit.save` documentation for TorchScript
  export.
- The original Transformer paper (Vaswani et al., 2017) for architecture details.
- The file `tasks/pytorch-model-recovery/solution/` contains a reference
  implementation.
